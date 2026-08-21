from __future__ import annotations

import hashlib
import json
import re
import stat
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO


BACKUP_FORMAT = "codebear-backup"
BACKUP_FORMAT_VERSION = 1
MANIFEST_NAME = "manifest.json"
DICTIONARY_DATA_NAME = "dictionary-data.json"
RELATION_DATA_NAME = "relation-data.json"
MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 4 * 1024 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 50_000
MAX_MANIFEST_BYTES = 8 * 1024 * 1024
MAX_DICTIONARY_BYTES = 64 * 1024 * 1024
MAX_RELATION_BYTES = 64 * 1024 * 1024
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
WINDOWS_INVALID_SEGMENT = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}
INTERNAL_BACKUP_NAMES = {".码熊回收站", ".码熊备份"}


class BackupFormatError(ValueError):
    def __init__(self, message: str, *, code: str = "invalid_backup") -> None:
        super().__init__(message)
        self.code = code


def _safe_archive_path(value: object, *, label: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        raise BackupFormatError(f"{label}不合法")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise BackupFormatError(f"{label}越过了备份边界")
    return path.as_posix()


def _safe_relative_path(value: object, *, allow_empty: bool = False) -> str:
    if value == "" and allow_empty:
        return ""
    normalized = _safe_archive_path(value, label="节点路径")
    if len(normalized) > 1000:
        raise BackupFormatError("节点路径过长")
    for part in PurePosixPath(normalized).parts:
        if (
            len(part) > 255
            or WINDOWS_INVALID_SEGMENT.search(part)
            or part.endswith((".", " "))
            or part.split(".", 1)[0].upper() in WINDOWS_RESERVED_NAMES
            or part in INTERNAL_BACKUP_NAMES
        ):
            raise BackupFormatError("节点路径包含跨平台备份不支持的名称")
    return normalized


def _is_symlink(info: zipfile.ZipInfo) -> bool:
    mode = info.external_attr >> 16
    return bool(mode and stat.S_ISLNK(mode))


def _hash_stream(stream: BinaryIO) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        size += len(chunk)
        if size > MAX_UNCOMPRESSED_BYTES:
            raise BackupFormatError("备份内容超过允许大小", code="backup_too_large")
        digest.update(chunk)
    return digest.hexdigest(), size


def _hash_file(path: Path) -> tuple[str, int]:
    with path.open("rb") as stream:
        return _hash_stream(stream)


def create_backup_archive(
    destination: Path,
    projects: list[dict[str, Any]],
    *,
    app_version: str,
    dictionary_payload: dict[str, Any] | None = None,
    relation_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    manifest_projects: list[dict[str, Any]] = []
    total_bytes = 0
    pdm_count = 0
    folder_count = 0

    with zipfile.ZipFile(
        destination,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
        allowZip64=True,
    ) as archive:
        for project_index, project in enumerate(projects):
            manifest_entries: list[dict[str, Any]] = []
            for entry in project["entries"]:
                relative_path = _safe_relative_path(entry["path"])
                if entry["type"] == "folder":
                    manifest_entries.append({"type": "folder", "path": relative_path})
                    folder_count += 1
                    if 1 + folder_count + pdm_count > MAX_ARCHIVE_MEMBERS:
                        raise BackupFormatError("待导出的节点数量超过限制", code="backup_too_large")
                    continue

                source = Path(entry["source_path"])
                if not source.is_file() or source.suffix.casefold() != ".pdm":
                    raise BackupFormatError(f"待导出的 PDM 不存在：{relative_path}")
                archive_path = f"content/{project_index}/{relative_path}"
                before = source.stat()
                sha256, size = _hash_file(source)
                archive.write(source, archive_path)
                after = source.stat()
                if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
                    raise BackupFormatError(f"导出过程中 PDM 发生变化：{relative_path}", code="source_changed")
                manifest_entries.append(
                    {
                        "type": "pdm",
                        "path": relative_path,
                        "archive_path": archive_path,
                        "size": size,
                        "sha256": sha256,
                    }
                )
                total_bytes += size
                pdm_count += 1
                if total_bytes > MAX_UNCOMPRESSED_BYTES:
                    raise BackupFormatError("待导出的 PDM 总量超过 4 GB 限制", code="backup_too_large")
                if 1 + folder_count + pdm_count > MAX_ARCHIVE_MEMBERS:
                    raise BackupFormatError("待导出的节点数量超过限制", code="backup_too_large")

            manifest_projects.append(
                {
                    "key": str(project["key"]),
                    "name": str(project["name"]),
                    "entries": manifest_entries,
                }
            )

        dictionary_meta: dict[str, Any] | None = None
        if dictionary_payload is not None:
            dictionary_bytes = json.dumps(dictionary_payload, ensure_ascii=False, indent=2).encode("utf-8")
            if len(dictionary_bytes) > MAX_DICTIONARY_BYTES:
                raise BackupFormatError("字典备份内容超过 64 MB 限制", code="backup_too_large")
            dictionary_meta = {
                "archive_path": DICTIONARY_DATA_NAME,
                "size": len(dictionary_bytes),
                "sha256": hashlib.sha256(dictionary_bytes).hexdigest(),
                "dictionary_count": len(dictionary_payload.get("dictionaries", [])),
                "binding_count": len(dictionary_payload.get("bindings", [])),
            }
            archive.writestr(DICTIONARY_DATA_NAME, dictionary_bytes)

        relation_meta: dict[str, Any] | None = None
        if relation_payload is not None:
            relation_bytes = json.dumps(relation_payload, ensure_ascii=False, indent=2).encode("utf-8")
            if len(relation_bytes) > MAX_RELATION_BYTES:
                raise BackupFormatError("关系备份内容超过 64 MB 限制", code="backup_too_large")
            relation_meta = {
                "archive_path": RELATION_DATA_NAME,
                "size": len(relation_bytes),
                "sha256": hashlib.sha256(relation_bytes).hexdigest(),
                "relation_count": len(relation_payload.get("relations", [])),
            }
            archive.writestr(RELATION_DATA_NAME, relation_bytes)

        manifest = {
            "format": BACKUP_FORMAT,
            "format_version": BACKUP_FORMAT_VERSION,
            "app_version": app_version,
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "projects": manifest_projects,
            "stats": {
                "project_count": len(manifest_projects),
                "folder_count": folder_count,
                "pdm_count": pdm_count,
                "total_bytes": total_bytes,
                "dictionary_count": int(dictionary_meta["dictionary_count"]) if dictionary_meta else 0,
                "binding_count": int(dictionary_meta["binding_count"]) if dictionary_meta else 0,
                "relation_count": int(relation_meta["relation_count"]) if relation_meta else 0,
            },
        }
        if dictionary_meta is not None:
            manifest["dictionary_data"] = dictionary_meta
        if relation_meta is not None:
            manifest["relation_data"] = relation_meta
        archive.writestr(
            MANIFEST_NAME,
            json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
        )

    if destination.stat().st_size > MAX_ARCHIVE_BYTES:
        destination.unlink(missing_ok=True)
        raise BackupFormatError("备份包超过 2 GB 限制", code="backup_too_large")
    return manifest


def inspect_backup_archive(path: Path) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise BackupFormatError("备份包不存在或超过 2 GB 限制", code="backup_too_large")
    if not zipfile.is_zipfile(path):
        raise BackupFormatError("文件不是有效的码熊备份包")

    with zipfile.ZipFile(path, mode="r") as archive:
        infos = archive.infolist()
        if not infos or len(infos) > MAX_ARCHIVE_MEMBERS:
            raise BackupFormatError("备份包文件数量异常")

        info_by_name: dict[str, zipfile.ZipInfo] = {}
        folded_names: set[str] = set()
        total_uncompressed = 0
        for info in infos:
            safe_name = _safe_archive_path(info.filename, label="压缩包路径")
            folded = safe_name.casefold()
            if folded in folded_names:
                raise BackupFormatError("备份包包含重复路径")
            folded_names.add(folded)
            if info.flag_bits & 0x1:
                raise BackupFormatError("不支持加密备份包")
            if _is_symlink(info):
                raise BackupFormatError("备份包不能包含符号链接")
            if info.is_dir():
                raise BackupFormatError("备份包包含未登记的目录项")
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
                raise BackupFormatError("备份内容超过 4 GB 限制", code="backup_too_large")
            info_by_name[safe_name] = info

        manifest_info = info_by_name.get(MANIFEST_NAME)
        if manifest_info is None or manifest_info.file_size > MAX_MANIFEST_BYTES:
            raise BackupFormatError("备份清单缺失或异常")
        try:
            manifest = json.loads(archive.read(manifest_info).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise BackupFormatError("备份清单无法读取") from exc

        if not isinstance(manifest, dict) or manifest.get("format") != BACKUP_FORMAT:
            raise BackupFormatError("文件不是码熊备份包")
        version = manifest.get("format_version")
        if not isinstance(version, int) or version < 1:
            raise BackupFormatError("备份格式版本无效")
        if version > BACKUP_FORMAT_VERSION:
            raise BackupFormatError(
                "该备份由更高版本码熊生成，请升级程序后再导入",
                code="backup_version_newer",
            )

        raw_projects = manifest.get("projects")
        if not isinstance(raw_projects, list) or not raw_projects:
            raise BackupFormatError("备份中没有项目")

        normalized_projects: list[dict[str, Any]] = []
        project_keys: set[str] = set()
        referenced_members = {MANIFEST_NAME}
        project_count = 0
        folder_count = 0
        pdm_count = 0
        total_bytes = 0

        for raw_project in raw_projects:
            if not isinstance(raw_project, dict):
                raise BackupFormatError("项目清单格式错误")
            key = raw_project.get("key")
            name = raw_project.get("name")
            entries = raw_project.get("entries")
            if not isinstance(key, str) or not key or len(key) > 200:
                raise BackupFormatError("项目标识无效")
            if key.casefold() in project_keys:
                raise BackupFormatError("备份包含重复项目标识")
            project_keys.add(key.casefold())
            if not isinstance(name, str) or not name.strip() or len(name) > 160:
                raise BackupFormatError("项目名称无效")
            if not isinstance(entries, list):
                raise BackupFormatError("项目节点清单无效")

            normalized_entries: list[dict[str, Any]] = []
            entry_paths: set[str] = set()
            for raw_entry in entries:
                if not isinstance(raw_entry, dict) or raw_entry.get("type") not in {"folder", "pdm"}:
                    raise BackupFormatError("备份节点格式错误")
                entry_type = str(raw_entry["type"])
                relative_path = _safe_relative_path(raw_entry.get("path"))
                folded_path = relative_path.casefold()
                if folded_path in entry_paths:
                    raise BackupFormatError("项目中包含重复节点路径")
                entry_paths.add(folded_path)
                if entry_type == "folder":
                    normalized_entries.append({"type": "folder", "path": relative_path})
                    folder_count += 1
                    continue

                if PurePosixPath(relative_path).suffix.casefold() != ".pdm":
                    raise BackupFormatError("备份节点不是 PDM 文件")
                archive_path = _safe_archive_path(raw_entry.get("archive_path"), label="PDM 归档路径")
                size = raw_entry.get("size")
                sha256 = raw_entry.get("sha256")
                if not isinstance(size, int) or size < 0:
                    raise BackupFormatError("PDM 文件大小无效")
                if not isinstance(sha256, str) or not SHA256_PATTERN.fullmatch(sha256):
                    raise BackupFormatError("PDM 校验值无效")
                info = info_by_name.get(archive_path)
                if info is None or info.file_size != size:
                    raise BackupFormatError("PDM 文件缺失或大小不一致")
                if archive_path in referenced_members:
                    raise BackupFormatError("多个节点引用了同一个 PDM 文件")
                referenced_members.add(archive_path)
                with archive.open(info, mode="r") as stream:
                    actual_sha256, actual_size = _hash_stream(stream)
                if actual_size != size or actual_sha256 != sha256:
                    raise BackupFormatError("PDM 文件校验失败", code="backup_checksum_failed")
                normalized_entries.append(
                    {
                        "type": "pdm",
                        "path": relative_path,
                        "archive_path": archive_path,
                        "size": size,
                        "sha256": sha256,
                    }
                )
                pdm_count += 1
                total_bytes += size

            normalized_projects.append({"key": key, "name": name.strip(), "entries": normalized_entries})
            project_count += 1

        dictionary_data = manifest.get("dictionary_data")
        dictionary_count = 0
        binding_count = 0
        normalized_dictionary_meta: dict[str, Any] | None = None
        if dictionary_data is not None:
            if not isinstance(dictionary_data, dict):
                raise BackupFormatError("字典备份清单格式错误")
            archive_path = _safe_archive_path(dictionary_data.get("archive_path"), label="字典归档路径")
            size = dictionary_data.get("size")
            sha256 = dictionary_data.get("sha256")
            dictionary_count = dictionary_data.get("dictionary_count", 0)
            binding_count = dictionary_data.get("binding_count", 0)
            if (
                not isinstance(size, int)
                or size < 0
                or size > MAX_DICTIONARY_BYTES
                or not isinstance(sha256, str)
                or not SHA256_PATTERN.fullmatch(sha256)
                or not isinstance(dictionary_count, int)
                or dictionary_count < 0
                or not isinstance(binding_count, int)
                or binding_count < 0
            ):
                raise BackupFormatError("字典备份清单格式错误")
            info = info_by_name.get(archive_path)
            if info is None or info.file_size != size:
                raise BackupFormatError("字典备份内容缺失或大小不一致")
            payload_bytes = archive.read(info)
            if hashlib.sha256(payload_bytes).hexdigest() != sha256:
                raise BackupFormatError("字典备份内容校验失败", code="backup_checksum_failed")
            try:
                payload = json.loads(payload_bytes.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise BackupFormatError("字典备份内容无法读取") from exc
            if not isinstance(payload, dict) or payload.get("version") != 1:
                raise BackupFormatError("字典备份内容格式无效")
            if not isinstance(payload.get("dictionaries"), list) or not isinstance(payload.get("bindings"), list):
                raise BackupFormatError("字典备份内容格式无效")
            if len(payload["dictionaries"]) != dictionary_count or len(payload["bindings"]) != binding_count:
                raise BackupFormatError("字典备份统计不一致")
            referenced_members.add(archive_path)
            normalized_dictionary_meta = {
                "archive_path": archive_path,
                "size": size,
                "sha256": sha256,
                "dictionary_count": dictionary_count,
                "binding_count": binding_count,
            }

        relation_data = manifest.get("relation_data")
        relation_count = 0
        normalized_relation_meta: dict[str, Any] | None = None
        if relation_data is not None:
            if not isinstance(relation_data, dict):
                raise BackupFormatError("关系备份清单格式错误")
            archive_path = _safe_archive_path(relation_data.get("archive_path"), label="关系归档路径")
            size = relation_data.get("size")
            sha256 = relation_data.get("sha256")
            relation_count = relation_data.get("relation_count", 0)
            if (
                not isinstance(size, int)
                or size < 0
                or size > MAX_RELATION_BYTES
                or not isinstance(sha256, str)
                or not SHA256_PATTERN.fullmatch(sha256)
                or not isinstance(relation_count, int)
                or relation_count < 0
            ):
                raise BackupFormatError("关系备份清单格式错误")
            info = info_by_name.get(archive_path)
            if info is None or info.file_size != size:
                raise BackupFormatError("关系备份内容缺失或大小不一致")
            payload_bytes = archive.read(info)
            if hashlib.sha256(payload_bytes).hexdigest() != sha256:
                raise BackupFormatError("关系备份内容校验失败", code="backup_checksum_failed")
            try:
                payload = json.loads(payload_bytes.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise BackupFormatError("关系备份内容无法读取") from exc
            if not isinstance(payload, dict) or payload.get("version") != 1:
                raise BackupFormatError("关系备份内容格式无效")
            if not isinstance(payload.get("relations"), list):
                raise BackupFormatError("关系备份内容格式无效")
            if len(payload["relations"]) != relation_count:
                raise BackupFormatError("关系备份统计不一致")
            referenced_members.add(archive_path)
            normalized_relation_meta = {
                "archive_path": archive_path,
                "size": size,
                "sha256": sha256,
                "relation_count": relation_count,
            }

        if set(info_by_name) != referenced_members:
            raise BackupFormatError("备份包包含未登记的文件")

        result = {
            "format": BACKUP_FORMAT,
            "format_version": version,
            "app_version": str(manifest.get("app_version") or ""),
            "created_at": str(manifest.get("created_at") or ""),
            "projects": normalized_projects,
            "stats": {
                "project_count": project_count,
                "folder_count": folder_count,
                "pdm_count": pdm_count,
                "total_bytes": total_bytes,
                "dictionary_count": dictionary_count,
                "binding_count": binding_count,
                "relation_count": relation_count,
            },
        }
        if normalized_dictionary_meta is not None:
            result["dictionary_data"] = normalized_dictionary_meta
        if normalized_relation_meta is not None:
            result["relation_data"] = normalized_relation_meta
        return result


def extract_dictionary_payload(path: Path) -> dict[str, Any] | None:
    manifest = inspect_backup_archive(path)
    metadata = manifest.get("dictionary_data")
    if not isinstance(metadata, dict):
        return None
    with zipfile.ZipFile(path, mode="r") as archive:
        raw = archive.read(str(metadata["archive_path"]))
    payload = json.loads(raw.decode("utf-8"))
    return payload if isinstance(payload, dict) else None


def extract_relation_payload(path: Path) -> dict[str, Any] | None:
    manifest = inspect_backup_archive(path)
    metadata = manifest.get("relation_data")
    if not isinstance(metadata, dict):
        return None
    with zipfile.ZipFile(path, mode="r") as archive:
        raw = archive.read(str(metadata["archive_path"]))
    payload = json.loads(raw.decode("utf-8"))
    return payload if isinstance(payload, dict) else None


def extract_backup_entry(
    archive: zipfile.ZipFile,
    entry: dict[str, Any],
    destination: Path,
) -> None:
    archive_path = _safe_archive_path(entry.get("archive_path"), label="PDM 归档路径")
    try:
        info = archive.getinfo(archive_path)
    except KeyError as exc:
        raise BackupFormatError("备份中的 PDM 文件已丢失") from exc
    destination.parent.mkdir(parents=True, exist_ok=True)
    with archive.open(info, mode="r") as source, destination.open("wb") as target:
        digest = hashlib.sha256()
        size = 0
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            size += len(chunk)
            if size > MAX_UNCOMPRESSED_BYTES:
                raise BackupFormatError("PDM 文件超过允许大小", code="backup_too_large")
            digest.update(chunk)
            target.write(chunk)
    if size != entry["size"] or digest.hexdigest() != entry["sha256"]:
        destination.unlink(missing_ok=True)
        raise BackupFormatError("PDM 文件校验失败", code="backup_checksum_failed")
