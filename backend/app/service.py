from __future__ import annotations

import json
import logging
import os
import re
import shutil
import sqlite3
import tempfile
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from threading import RLock
from typing import Any, Callable, Iterable

from lxml import etree

from .backup import BackupFormatError, create_backup_archive, extract_backup_entry, inspect_backup_archive
from .config import APP_VERSION, INTERNAL_DIR_NAMES, SettingsStore
from .database import Database
from .ddl import ddl_options as build_ddl_options
from .ddl import generate_ddl as render_ddl
from .pdm import ParsedPdm, file_sha256, parse_pdm, update_pdm_dictionary


logger = logging.getLogger("backend.app.service")

# 索引语义版本：_index_parsed 写入 pdm_files.index_version。
# 修改表/字段/关系的索引方式时必须递增，强制刷新才会对旧版本行做全量重建。
INDEX_VERSION = "2"


WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}
INVALID_NAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


class ServiceError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        code: str = "service_error",
        data: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.data = data


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def validate_name(name: str, *, kind: str = "节点") -> str:
    cleaned = name.strip()
    if not cleaned:
        raise ServiceError(422, f"{kind}名称不能为空", code="invalid_name")
    if cleaned in {".", ".."} or INVALID_NAME.search(cleaned):
        raise ServiceError(422, f"{kind}名称包含 Windows 不允许的字符", code="invalid_name")
    if cleaned.endswith((".", " ")):
        raise ServiceError(422, f"{kind}名称不能以点或空格结尾", code="invalid_name")
    if cleaned.split(".", 1)[0].upper() in WINDOWS_RESERVED_NAMES:
        raise ServiceError(422, f"{kind}名称是 Windows 保留名称", code="invalid_name")
    if cleaned in INTERNAL_DIR_NAMES:
        raise ServiceError(422, f"{kind}名称为码熊内部保留名称", code="invalid_name")
    return cleaned


def normalize_relative_path(value: str | None) -> str:
    raw = (value or "").replace("\\", "/").strip("/")
    if not raw or raw == ".":
        return ""
    path = PurePosixPath(raw)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ServiceError(422, "节点路径不合法", code="invalid_path")
    return path.as_posix()


def resolve_relative(root: Path, relative_path: str | None) -> Path:
    relative = normalize_relative_path(relative_path)
    target = (root / Path(*PurePosixPath(relative).parts)).resolve() if relative else root.resolve()
    resolved_root = root.resolve()
    if target != resolved_root and not target.is_relative_to(resolved_root):
        raise ServiceError(422, "节点路径越过了项目边界", code="invalid_path")
    return target


def _like_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _fts_phrase(value: str) -> str:
    return f'"{value.replace(chr(34), chr(34) * 2)}"'


def _add_parent_folders(relative_path: str, folders: set[str]) -> None:
    parent = PurePosixPath(relative_path).parent
    parents: list[str] = []
    while parent.as_posix() not in {"", "."}:
        parents.append(parent.as_posix())
        parent = parent.parent
    folders.update(reversed(parents))


def _unique_import_destination(target: Path) -> Path:
    stem = target.stem
    suffix = target.suffix
    candidate = target.with_name(f"{stem} (导入){suffix}")
    index = 2
    while candidate.exists():
        candidate = target.with_name(f"{stem} (导入 {index}){suffix}")
        index += 1
    return candidate


class WorkspaceService:
    def __init__(self, database: Database, settings: SettingsStore):
        self.database = database
        self.settings = settings
        self._write_lock = RLock()

    @property
    def workspace_root(self) -> Path:
        return Path(self.settings.read()["workspace_root"]).resolve()

    def get_settings(self) -> dict[str, str]:
        return self.settings.read()

    def set_workspace(self, workspace_root: str) -> dict[str, str]:
        with self.database.connect() as connection:
            project_count = int(connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0])
        if project_count:
            raise ServiceError(
                409,
                "已有项目时不能直接切换工作区，请先移除项目或继续使用当前工作区",
                code="workspace_not_empty",
            )
        try:
            return self.settings.update_workspace(workspace_root)
        except (OSError, ValueError) as exc:
            raise ServiceError(422, f"无法使用该工作区：{exc}", code="invalid_workspace") from exc

    def list_projects(self) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT p.*,
                       COUNT(DISTINCT pf.id) AS pdm_count,
                       COALESCE(SUM(pf.table_count), 0) AS table_count,
                       COALESCE(SUM(pf.field_count), 0) AS field_count
                FROM projects p
                LEFT JOIN pdm_files pf ON pf.project_id = p.id
                GROUP BY p.id
                ORDER BY p.name COLLATE NOCASE
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def get_project(self, project_id: str, connection: sqlite3.Connection | None = None) -> dict[str, Any]:
        owns_connection = connection is None
        conn = connection or self.database.connect()
        try:
            row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
            if row is None:
                raise ServiceError(404, "项目不存在", code="project_not_found")
            return dict(row)
        finally:
            if owns_connection:
                conn.close()

    def create_project(self, name: str) -> dict[str, Any]:
        project_name = validate_name(name, kind="项目")
        project_root = (self.workspace_root / project_name).resolve()
        if project_root.exists():
            raise ServiceError(409, "工作区中已存在同名项目文件夹", code="project_exists")
        project_id = str(uuid.uuid4())
        now = utc_now()
        try:
            project_root.mkdir(parents=True, exist_ok=False)
            with self.database.transaction() as connection:
                connection.execute(
                    "INSERT INTO projects(id, name, root_path, created_at, updated_at) VALUES(?, ?, ?, ?, ?)",
                    (project_id, project_name, str(project_root), now, now),
                )
        except sqlite3.IntegrityError as exc:
            if project_root.exists():
                project_root.rmdir()
            raise ServiceError(409, "项目名称已存在", code="project_exists") from exc
        except Exception:
            if project_root.exists():
                try:
                    project_root.rmdir()
                except OSError:
                    pass
            raise
        return self.get_project(project_id)

    def rename_project(self, project_id: str, name: str) -> dict[str, Any]:
        new_name = validate_name(name, kind="项目")
        project = self.get_project(project_id)
        old_root = Path(project["root_path"])
        new_root = old_root.parent / new_name
        if new_root.exists() and new_root.resolve() != old_root.resolve():
            raise ServiceError(409, "同名项目文件夹已存在", code="project_exists")
        with self._write_lock:
            old_root.rename(new_root)
            try:
                with self.database.transaction() as connection:
                    connection.execute(
                        "UPDATE projects SET name = ?, root_path = ?, updated_at = ? WHERE id = ?",
                        (new_name, str(new_root.resolve()), utc_now(), project_id),
                    )
            except Exception:
                new_root.rename(old_root)
                raise
        return self.get_project(project_id)

    def project_tree(self, project_id: str) -> dict[str, Any]:
        project = self.get_project(project_id)
        root = Path(project["root_path"])
        root.mkdir(parents=True, exist_ok=True)
        with self.database.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM pdm_files WHERE project_id = ?",
                (project_id,),
            ).fetchall()
        indexed = {str(row["relative_path"]).casefold(): dict(row) for row in rows}

        def walk(directory: Path, relative: str) -> list[dict[str, Any]]:
            try:
                entries = list(directory.iterdir())
            except OSError:
                return []
            entries.sort(key=lambda item: (not item.is_dir(), item.name.casefold()))
            nodes: list[dict[str, Any]] = []
            for entry in entries:
                if entry.name in INTERNAL_DIR_NAMES or entry.name.startswith(".码熊"):
                    continue
                child_relative = f"{relative}/{entry.name}" if relative else entry.name
                child_relative = PurePosixPath(child_relative).as_posix()
                if entry.is_dir():
                    children = walk(entry, child_relative)
                    nodes.append(
                        {
                            "id": f"folder:{project_id}:{child_relative}",
                            "project_id": project_id,
                            "type": "folder",
                            "name": entry.name,
                            "relative_path": child_relative,
                            "pdm_count": sum(
                                1 if child["type"] == "pdm" else int(child.get("pdm_count", 0))
                                for child in children
                            ),
                            "children": children,
                        }
                    )
                elif entry.suffix.casefold() == ".pdm":
                    pdm = indexed.get(child_relative.casefold())
                    try:
                        file_size = entry.stat().st_size
                    except OSError:
                        file_size = 0
                    nodes.append(
                        {
                            "id": f"pdm:{pdm['id'] if pdm else project_id + ':' + child_relative}",
                            "project_id": project_id,
                            "pdm_id": pdm["id"] if pdm else None,
                            "type": "pdm",
                            "name": entry.name,
                            "relative_path": child_relative,
                            "table_count": int(pdm["table_count"]) if pdm else 0,
                            "field_count": int(pdm["field_count"]) if pdm else 0,
                            "file_size": file_size,
                            "parse_error": pdm["parse_error"] if pdm else "尚未建立索引",
                        }
                    )
            return nodes

        children = walk(root, "")
        return {
            "id": f"project:{project_id}",
            "project_id": project_id,
            "type": "project",
            "name": project["name"],
            "relative_path": "",
            "pdm_count": sum(
                1 if child["type"] == "pdm" else int(child.get("pdm_count", 0)) for child in children
            ),
            "children": children,
        }

    @property
    def backup_staging_root(self) -> Path:
        root = self.settings.paths.app_data / "staging" / "backups"
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _cleanup_staged_backups(self) -> None:
        cutoff = time.time() - 24 * 60 * 60
        for candidate in self.backup_staging_root.glob("*.cbbak"):
            try:
                if candidate.stat().st_mtime < cutoff:
                    candidate.unlink()
            except OSError:
                pass

    def _staged_backup_path(self, token: str) -> Path:
        try:
            normalized = str(uuid.UUID(token))
        except (ValueError, AttributeError) as exc:
            raise ServiceError(422, "备份临时标识无效", code="invalid_backup_token") from exc
        path = self.backup_staging_root / f"{normalized}.cbbak"
        if not path.is_file():
            raise ServiceError(410, "备份预览已过期，请重新选择文件", code="backup_expired")
        return path

    def _walk_export_directory(
        self,
        root: Path,
        directory: Path,
        folders: set[str],
        pdms: dict[str, Path],
    ) -> None:
        resolved_root = root.resolve()
        for current, directory_names, file_names in os.walk(directory, followlinks=False):
            current_path = Path(current)
            allowed_directories: list[str] = []
            for name in directory_names:
                candidate = current_path / name
                if name in INTERNAL_DIR_NAMES or name.startswith(".码熊") or candidate.is_symlink():
                    continue
                try:
                    if not candidate.resolve().is_relative_to(resolved_root):
                        continue
                except OSError:
                    continue
                allowed_directories.append(name)
                relative = candidate.relative_to(resolved_root).as_posix()
                folders.add(relative)
                _add_parent_folders(relative, folders)
            directory_names[:] = allowed_directories

            for name in file_names:
                candidate = current_path / name
                if candidate.is_symlink() or candidate.suffix.casefold() != ".pdm":
                    continue
                try:
                    if not candidate.resolve().is_relative_to(resolved_root):
                        continue
                except OSError:
                    continue
                relative = candidate.relative_to(resolved_root).as_posix()
                pdms[relative.casefold()] = candidate
                _add_parent_folders(relative, folders)

    def _collect_export_entries(
        self,
        root: Path,
        selections: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], bool]:
        resolved_root = root.resolve()
        folders: set[str] = set()
        pdms: dict[str, Path] = {}
        project_selected = False

        for selection in selections:
            node_type = str(selection.get("type", ""))
            relative = normalize_relative_path(str(selection.get("relative_path", "")))
            if node_type == "project":
                if relative:
                    raise ServiceError(422, "项目节点路径必须为空", code="invalid_backup_selection")
                project_selected = True
                self._walk_export_directory(resolved_root, resolved_root, folders, pdms)
            elif node_type == "folder":
                target = resolve_relative(resolved_root, relative)
                if not relative or not target.is_dir() or target.is_symlink():
                    raise ServiceError(422, "待导出的文件夹不存在", code="invalid_backup_selection")
                folders.add(relative)
                _add_parent_folders(relative, folders)
                self._walk_export_directory(resolved_root, target, folders, pdms)
            elif node_type == "pdm":
                target = resolve_relative(resolved_root, relative)
                if not target.is_file() or target.is_symlink() or target.suffix.casefold() != ".pdm":
                    raise ServiceError(422, "待导出的 PDM 不存在", code="invalid_backup_selection")
                pdms[relative.casefold()] = target
                _add_parent_folders(relative, folders)
            else:
                raise ServiceError(422, "备份节点类型无效", code="invalid_backup_selection")

        entries: list[dict[str, Any]] = [
            {"type": "folder", "path": relative}
            for relative in sorted(folders, key=lambda value: (value.count("/"), value.casefold()))
        ]
        entries.extend(
            {
                "type": "pdm",
                "path": path.relative_to(resolved_root).as_posix(),
                "source_path": path,
            }
            for path in sorted(pdms.values(), key=lambda value: value.relative_to(resolved_root).as_posix().casefold())
        )
        return entries, project_selected

    def export_backup(
        self,
        selections: list[dict[str, Any]],
        *,
        dictionary_payload: dict[str, Any] | None = None,
        relation_payload: dict[str, Any] | None = None,
    ) -> tuple[Path, str]:
        if not selections:
            raise ServiceError(422, "请至少选择一个待导出节点", code="empty_backup_selection")
        if len(selections) > 50_000:
            raise ServiceError(422, "选择的节点过多", code="backup_selection_too_large")

        grouped: dict[str, list[dict[str, Any]]] = {}
        for selection in selections:
            project_id = str(selection.get("project_id", ""))
            if not project_id:
                raise ServiceError(422, "备份节点缺少项目信息", code="invalid_backup_selection")
            grouped.setdefault(project_id, []).append(selection)

        projects: list[dict[str, Any]] = []
        for project_id, project_selections in grouped.items():
            project = self.get_project(project_id)
            entries, project_selected = self._collect_export_entries(
                Path(project["root_path"]),
                project_selections,
            )
            if not entries and not project_selected:
                continue
            projects.append(
                {
                    "key": project_id,
                    "name": project["name"],
                    "entries": entries,
                }
            )
        if not projects:
            raise ServiceError(422, "选择范围中没有可导出的节点", code="empty_backup_selection")

        self._cleanup_staged_backups()
        archive_path = self.backup_staging_root / f"export-{uuid.uuid4()}.cbbak"
        file_name = f"CodeBear-Backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.cbbak"
        try:
            create_backup_archive(
                archive_path,
                projects,
                app_version=APP_VERSION,
                dictionary_payload=dictionary_payload,
                relation_payload=relation_payload,
            )
        except BackupFormatError as exc:
            archive_path.unlink(missing_ok=True)
            raise ServiceError(422, str(exc), code=exc.code) from exc
        except OSError as exc:
            archive_path.unlink(missing_ok=True)
            logger.exception("创建备份包失败")
            raise ServiceError(500, "无法创建备份包，请查看服务日志", code="backup_export_failed") from exc
        return archive_path, file_name

    def _inspection_payload(
        self,
        manifest: dict[str, Any],
        *,
        token: str,
        file_name: str,
        source_type: str,
    ) -> dict[str, Any]:
        return {
            "token": token,
            "file_name": file_name,
            "source_type": source_type,
            **manifest,
        }

    def stage_backup_file(self, staged_file: Path, original_name: str) -> dict[str, Any]:
        if Path(original_name).suffix.casefold() != ".cbbak":
            raise ServiceError(422, "请选择 .cbbak 码熊备份包", code="invalid_backup")
        self._cleanup_staged_backups()
        token = str(uuid.uuid4())
        target = self.backup_staging_root / f"{token}.cbbak"
        try:
            shutil.copy2(staged_file, target)
            manifest = inspect_backup_archive(target)
        except BackupFormatError as exc:
            target.unlink(missing_ok=True)
            raise ServiceError(422, str(exc), code=exc.code) from exc
        except OSError as exc:
            target.unlink(missing_ok=True)
            logger.exception("读取备份包失败")
            raise ServiceError(422, "无法读取备份包，请确认文件完整且可读", code="invalid_backup") from exc
        return self._inspection_payload(
            manifest,
            token=token,
            file_name=Path(original_name).name,
            source_type="archive",
        )

    def stage_legacy_data(self, data_path: str) -> dict[str, Any]:
        source_data = Path(data_path).expanduser().resolve()
        if not source_data.is_dir():
            raise ServiceError(404, "旧版 data 目录不存在", code="legacy_data_not_found")
        if source_data == self.settings.paths.app_data.resolve():
            raise ServiceError(422, "请选择旧版码熊的 data 目录", code="legacy_data_is_current")

        workspace = source_data / "workspace"
        settings_path = source_data / "settings.json"
        if not workspace.is_dir() and settings_path.is_file():
            try:
                payload = json.loads(settings_path.read_text(encoding="utf-8"))
                configured = Path(str(payload.get("workspace_root", ""))).expanduser().resolve()
                if configured.is_dir():
                    workspace = configured
            except (OSError, ValueError, json.JSONDecodeError):
                pass
        if not workspace.is_dir():
            raise ServiceError(422, "旧版 data 中找不到工作区", code="legacy_workspace_not_found")

        projects: list[dict[str, Any]] = []
        for index, project_root in enumerate(sorted(workspace.iterdir(), key=lambda item: item.name.casefold())):
            if (
                not project_root.is_dir()
                or project_root.is_symlink()
                or project_root.name in INTERNAL_DIR_NAMES
                or project_root.name.startswith(".码熊")
            ):
                continue
            project_name = validate_name(project_root.name, kind="项目")
            entries, _ = self._collect_export_entries(
                project_root,
                [{"type": "project", "relative_path": ""}],
            )
            projects.append(
                {
                    "key": f"legacy-{index}-{uuid.uuid5(uuid.NAMESPACE_URL, str(project_root))}",
                    "name": project_name,
                    "entries": entries,
                }
            )
        if not projects:
            raise ServiceError(422, "旧版工作区中没有可迁移项目", code="legacy_workspace_empty")

        source_version = "legacy"
        version_file = source_data.parent / "版本信息.txt"
        if version_file.is_file():
            try:
                match = re.search(r"^版本：\s*(.+)$", version_file.read_text(encoding="utf-8"), re.MULTILINE)
                if match:
                    source_version = match.group(1).strip()
            except OSError:
                pass

        self._cleanup_staged_backups()
        token = str(uuid.uuid4())
        target = self.backup_staging_root / f"{token}.cbbak"
        try:
            create_backup_archive(target, projects, app_version=source_version)
            manifest = inspect_backup_archive(target)
        except BackupFormatError as exc:
            target.unlink(missing_ok=True)
            raise ServiceError(422, str(exc), code=exc.code) from exc
        except OSError as exc:
            target.unlink(missing_ok=True)
            logger.exception("读取旧版数据失败")
            raise ServiceError(500, "无法读取旧版数据，请查看服务日志", code="legacy_migration_failed") from exc
        return self._inspection_payload(
            manifest,
            token=token,
            file_name=f"旧版数据-{source_data.parent.name}",
            source_type="legacy",
        )

    def discard_staged_backup(self, token: str) -> None:
        self._staged_backup_path(token).unlink(missing_ok=True)

    def _select_backup_projects(
        self,
        manifest: dict[str, Any],
        selections: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not selections:
            raise ServiceError(422, "请至少选择一个待导入节点", code="empty_backup_selection")
        projects_by_key = {str(project["key"]): project for project in manifest["projects"]}
        grouped: dict[str, list[dict[str, Any]]] = {}
        for selection in selections:
            project_key = str(selection.get("project_key", ""))
            if project_key not in projects_by_key:
                raise ServiceError(422, "选择包含不存在的备份项目", code="invalid_backup_selection")
            grouped.setdefault(project_key, []).append(selection)

        selected_projects: list[dict[str, Any]] = []
        for project_key, project_selections in grouped.items():
            project = projects_by_key[project_key]
            entries_by_key = {
                (str(entry["type"]), str(entry["path"]).casefold()): entry
                for entry in project["entries"]
            }
            selected_entries: dict[tuple[str, str], dict[str, Any]] = {}
            project_selected = False
            for selection in project_selections:
                node_type = str(selection.get("type", ""))
                relative = normalize_relative_path(str(selection.get("relative_path", "")))
                if node_type == "project":
                    if relative:
                        raise ServiceError(422, "备份项目节点路径无效", code="invalid_backup_selection")
                    project_selected = True
                    selected_entries.update(entries_by_key)
                elif node_type == "folder":
                    folder_key = ("folder", relative.casefold())
                    if folder_key not in entries_by_key:
                        raise ServiceError(422, "选择的备份文件夹不存在", code="invalid_backup_selection")
                    prefix = f"{relative.casefold()}/"
                    for key, entry in entries_by_key.items():
                        if key == folder_key or key[1].startswith(prefix):
                            selected_entries[key] = entry
                elif node_type == "pdm":
                    key = ("pdm", relative.casefold())
                    if key not in entries_by_key:
                        raise ServiceError(422, "选择的备份 PDM 不存在", code="invalid_backup_selection")
                    selected_entries[key] = entries_by_key[key]
                else:
                    raise ServiceError(422, "备份节点类型无效", code="invalid_backup_selection")

            if selected_entries or project_selected:
                selected_projects.append(
                    {
                        "key": project["key"],
                        "name": validate_name(str(project["name"]), kind="项目"),
                        "entries": list(selected_entries.values()),
                    }
                )
        if not selected_projects:
            raise ServiceError(422, "选择范围中没有可导入节点", code="empty_backup_selection")
        return selected_projects

    def _create_import_directories(
        self,
        root: Path,
        directory: Path,
        created_directories: list[Path],
        *,
        track: bool,
    ) -> None:
        missing: list[Path] = []
        cursor = directory
        while cursor != root and not cursor.exists():
            missing.append(cursor)
            cursor = cursor.parent
        if cursor.exists() and not cursor.is_dir():
            raise ServiceError(409, "导入路径与现有文件冲突", code="backup_import_conflict")
        for candidate in reversed(missing):
            candidate.mkdir()
            if track:
                created_directories.append(candidate)

    def import_backup(
        self,
        token: str,
        selections: list[dict[str, Any]],
        conflict_policy: str,
    ) -> dict[str, Any]:
        if conflict_policy not in {"skip", "rename", "overwrite"}:
            raise ServiceError(422, "导入冲突策略无效", code="invalid_conflict_policy")
        archive_path = self._staged_backup_path(token)
        try:
            manifest = inspect_backup_archive(archive_path)
        except BackupFormatError as exc:
            raise ServiceError(422, str(exc), code=exc.code) from exc
        selected_projects = self._select_backup_projects(manifest, selections)

        existing_projects = {str(project["name"]).casefold(): project for project in self.list_projects()}
        created_projects: list[dict[str, Any]] = []
        affected_projects: dict[str, dict[str, Any]] = {}
        created_files: list[Path] = []
        created_directories: list[Path] = []
        overwritten_files: list[tuple[Path, Path]] = []
        imported_items: list[dict[str, str]] = []
        skipped_items: list[dict[str, str]] = []
        renamed_items: list[dict[str, str]] = []
        index_candidates: list[tuple[str, str, Path]] = []
        parse_errors: list[dict[str, str]] = []
        project_mapping: dict[str, str] = {}

        rollback_parent = self.settings.paths.app_data / "staging"
        rollback_parent.mkdir(parents=True, exist_ok=True)

        with self._write_lock, tempfile.TemporaryDirectory(prefix="backup-import-", dir=rollback_parent) as rollback_name:
            rollback_root = Path(rollback_name)
            try:
                with zipfile.ZipFile(archive_path, mode="r") as archive:
                    for source_project in selected_projects:
                        project = existing_projects.get(str(source_project["name"]).casefold())
                        is_new_project = project is None
                        if project is None:
                            project = self.create_project(str(source_project["name"]))
                            created_projects.append(project)
                            existing_projects[str(project["name"]).casefold()] = project
                        project_id = str(project["id"])
                        project_mapping[str(source_project["key"])] = project_id
                        affected_projects[project_id] = project
                        root = Path(project["root_path"]).resolve()

                        folder_entries = [entry for entry in source_project["entries"] if entry["type"] == "folder"]
                        folder_entries.sort(key=lambda entry: (str(entry["path"]).count("/"), str(entry["path"]).casefold()))
                        for entry in folder_entries:
                            target_folder = resolve_relative(root, str(entry["path"]))
                            if target_folder.exists() and not target_folder.is_dir():
                                raise ServiceError(409, f"导入文件夹与现有文件冲突：{entry['path']}", code="backup_import_conflict")
                            self._create_import_directories(
                                root,
                                target_folder,
                                created_directories,
                                track=not is_new_project,
                            )

                        for entry in (entry for entry in source_project["entries"] if entry["type"] == "pdm"):
                            original_relative = str(entry["path"])
                            target = resolve_relative(root, original_relative)
                            self._create_import_directories(
                                root,
                                target.parent,
                                created_directories,
                                track=not is_new_project,
                            )
                            existed = target.exists()
                            if existed and target.is_dir():
                                raise ServiceError(409, f"导入 PDM 与现有文件夹冲突：{original_relative}", code="backup_import_conflict")
                            if existed and conflict_policy == "skip":
                                skipped_items.append({"project": str(project["name"]), "relative_path": original_relative})
                                continue
                            if existed and conflict_policy == "rename":
                                renamed_target = _unique_import_destination(target)
                                renamed_items.append(
                                    {
                                        "project": str(project["name"]),
                                        "source_path": original_relative,
                                        "relative_path": renamed_target.relative_to(root).as_posix(),
                                    }
                                )
                                target = renamed_target
                                existed = False

                            temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
                            try:
                                extract_backup_entry(archive, entry, temporary)
                                if existed:
                                    rollback_copy = rollback_root / f"overwrite-{len(overwritten_files)}.pdm"
                                    shutil.copy2(target, rollback_copy)
                                    overwritten_files.append((target, rollback_copy))
                                    self._backup_existing(project, target, "备份包导入覆盖")
                                os.replace(temporary, target)
                            finally:
                                temporary.unlink(missing_ok=True)
                            if not existed:
                                created_files.append(target)
                            imported_relative = target.relative_to(root).as_posix()
                            imported_items.append(
                                {
                                    "project": str(project["name"]),
                                    "relative_path": imported_relative,
                                }
                            )
                            index_candidates.append((project_id, imported_relative, target))

                if index_candidates:
                    with self.database.transaction() as connection:
                        existing_pdm_ids = {
                            str(row["id"])
                            for project_id, relative_path, _ in index_candidates
                            if (row := connection.execute(
                                "SELECT id FROM pdm_files WHERE project_id = ? AND relative_path = ?",
                                (project_id, relative_path),
                            ).fetchone()) is not None
                        }
                        with self.database.defer_fts_updates(connection, existing_pdm_ids) as updated_pdm_ids:
                            for project_id, relative_path, absolute_path in index_candidates:
                                try:
                                    parsed = parse_pdm(absolute_path)
                                    pdm_id = self._index_parsed(
                                        connection,
                                        project_id,
                                        relative_path,
                                        absolute_path,
                                        parsed,
                                    )
                                except (etree.XMLSyntaxError, OSError, ValueError) as exc:
                                    error_message = str(exc)
                                    pdm_id = self._index_parse_error(
                                        connection,
                                        project_id,
                                        relative_path,
                                        absolute_path,
                                        error_message,
                                    )
                                    logger.warning("备份导入 PDM 解析失败 %s: %s", relative_path, exc)
                                    parse_errors.append(
                                        {
                                            "relative_path": relative_path,
                                            "status": "error",
                                            "error": "PDM 解析失败",
                                        }
                                    )
                                updated_pdm_ids.add(pdm_id)
            except Exception as exc:
                for created_file in reversed(created_files):
                    try:
                        created_file.unlink(missing_ok=True)
                    except OSError:
                        pass
                for target, rollback_copy in reversed(overwritten_files):
                    try:
                        shutil.copy2(rollback_copy, target)
                    except OSError:
                        pass
                new_project_ids = {str(project["id"]) for project in created_projects}
                for project in reversed(created_projects):
                    root = Path(project["root_path"]).resolve()
                    try:
                        with self.database.transaction() as connection:
                            connection.execute("DELETE FROM projects WHERE id = ?", (project["id"],))
                        if root.is_relative_to(self.workspace_root) and root != self.workspace_root:
                            shutil.rmtree(root, ignore_errors=True)
                    except Exception:
                        pass
                for directory in reversed(created_directories):
                    try:
                        directory.rmdir()
                    except OSError:
                        pass
                for project_id in affected_projects:
                    if project_id in new_project_ids:
                        continue
                    try:
                        self.refresh_project(project_id, force=True)
                    except Exception:
                        pass
                if isinstance(exc, ServiceError):
                    raise
                if isinstance(exc, BackupFormatError):
                    raise ServiceError(422, str(exc), code=exc.code) from exc
                logger.exception("导入备份失败")
                raise ServiceError(500, "导入备份失败，请查看服务日志", code="backup_import_failed") from exc

        return {
            "projects": [
                {"id": project_id, "name": project["name"]}
                for project_id, project in affected_projects.items()
            ],
            "imported": imported_items,
            "skipped": skipped_items,
            "renamed": renamed_items,
            "parse_errors": parse_errors,
            "project_mapping": project_mapping,
        }

    def create_folder(self, project_id: str, parent_path: str, name: str) -> dict[str, Any]:
        project = self.get_project(project_id)
        folder_name = validate_name(name, kind="文件夹")
        parent = resolve_relative(Path(project["root_path"]), parent_path)
        if not parent.is_dir():
            raise ServiceError(404, "父文件夹不存在", code="parent_not_found")
        target = parent / folder_name
        if target.exists():
            raise ServiceError(409, "同名节点已存在", code="node_exists")
        target.mkdir()
        relative = target.relative_to(Path(project["root_path"]).resolve()).as_posix()
        return {"type": "folder", "name": folder_name, "relative_path": relative}

    @staticmethod
    def _delete_pdm_rows(connection: sqlite3.Connection, pdm_id: str) -> None:
        """按子表→父表顺序显式删除该 PDM 的表/字段行。

        依赖外键级联会让 SQLite 对每个被删行做逐行子表扫描，
        大 PDM(上万字段)单次删除可达 10 秒以上；显式批量删除可降至毫秒级。
        """
        connection.execute(
            """
            DELETE FROM table_relations
            WHERE source_table_id IN (SELECT id FROM model_tables WHERE pdm_id = ?)
               OR target_table_id IN (SELECT id FROM model_tables WHERE pdm_id = ?)
            """,
            (pdm_id, pdm_id),
        )
        connection.execute(
            """
            DELETE FROM dictionary_field_bindings
            WHERE field_id IN (
                SELECT mf.id FROM model_fields mf
                JOIN model_tables mt ON mt.id = mf.table_id
                WHERE mt.pdm_id = ?
            )
            """,
            (pdm_id,),
        )
        connection.execute(
            "DELETE FROM model_fields WHERE table_id IN (SELECT id FROM model_tables WHERE pdm_id = ?)",
            (pdm_id,),
        )
        connection.execute("DELETE FROM model_tables WHERE pdm_id = ?", (pdm_id,))

    @staticmethod
    def _snapshot_manual_relations(connection: sqlite3.Connection, pdm_id: str) -> list[sqlite3.Row]:
        return connection.execute(
            """
            SELECT tr.id, tr.name, tr.cardinality, tr.note, tr.created_at,
                   st.xml_id AS source_table_xml, sf.xml_id AS source_field_xml,
                   tt.xml_id AS target_table_xml, tf.xml_id AS target_field_xml
            FROM table_relations tr
            JOIN model_tables st ON st.id = tr.source_table_id
            JOIN model_fields sf ON sf.id = tr.source_field_id
            JOIN model_tables tt ON tt.id = tr.target_table_id
            JOIN model_fields tf ON tf.id = tr.target_field_id
            WHERE tr.source_type = 'manual' AND (st.pdm_id = ? OR tt.pdm_id = ?)
            """,
            (pdm_id, pdm_id),
        ).fetchall()

    def _index_parsed(
        self,
        connection: sqlite3.Connection,
        project_id: str,
        relative_path: str,
        absolute_path: Path,
        parsed: ParsedPdm,
        pdm_id: str | None = None,
    ) -> str:
        existing = connection.execute(
            "SELECT id FROM pdm_files WHERE project_id = ? AND relative_path = ?",
            (project_id, relative_path),
        ).fetchone()
        resolved_pdm_id = str(existing["id"]) if existing else (pdm_id or str(uuid.uuid4()))
        # 表/字段行会删除重建：先快照该 PDM 相关的手工关系与字典字段绑定，重建后恢复
        manual_relations = self._snapshot_manual_relations(connection, resolved_pdm_id)
        binding_rows = connection.execute(
            """
            SELECT db.field_id, db.dictionary_id, db.created_at
            FROM dictionary_field_bindings db
            JOIN model_fields mf ON mf.id = db.field_id
            JOIN model_tables mt ON mt.id = mf.table_id
            WHERE mt.pdm_id = ?
            """,
            (resolved_pdm_id,),
        ).fetchall()
        stat = absolute_path.stat()
        connection.execute(
            """
            INSERT INTO pdm_files(
                id, project_id, relative_path, file_name, source_hash, file_size, mtime_ns,
                model_name, pd_version, target_db, table_count, field_count, parsed_at,
                parse_error, index_version
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
            ON CONFLICT(id) DO UPDATE SET
                project_id = excluded.project_id,
                relative_path = excluded.relative_path,
                file_name = excluded.file_name,
                source_hash = excluded.source_hash,
                file_size = excluded.file_size,
                mtime_ns = excluded.mtime_ns,
                model_name = excluded.model_name,
                pd_version = excluded.pd_version,
                target_db = excluded.target_db,
                table_count = excluded.table_count,
                field_count = excluded.field_count,
                parsed_at = excluded.parsed_at,
                parse_error = NULL,
                index_version = excluded.index_version
            """,
            (
                resolved_pdm_id,
                project_id,
                relative_path,
                absolute_path.name,
                parsed.source_hash,
                stat.st_size,
                stat.st_mtime_ns,
                parsed.model_name,
                parsed.pd_version,
                parsed.target_db,
                len(parsed.tables),
                parsed.field_count,
                utc_now(),
                INDEX_VERSION,
            ),
        )
        self._delete_pdm_rows(connection, resolved_pdm_id)
        table_rows: list[tuple[Any, ...]] = []
        field_rows: list[tuple[Any, ...]] = []
        for table in parsed.tables:
            table_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"maxiong:{resolved_pdm_id}:table:{table.xml_id}"))
            table_rows.append(
                (
                    table_id,
                    resolved_pdm_id,
                    table.xml_id,
                    table.ordinal,
                    table.name,
                    table.code,
                    table.comment,
                    len(table.fields),
                    "table",
                )
            )
            field_rows.extend(
                (
                    (
                        str(uuid.uuid5(uuid.NAMESPACE_URL, f"maxiong:{resolved_pdm_id}:field:{field.xml_id}")),
                        table_id,
                        field.xml_id,
                        field.ordinal,
                        field.name,
                        field.code,
                        field.data_type,
                        field.length,
                        1 if field.nullable else 0,
                        field.default_value,
                        field.comment,
                        1 if field.is_primary_key else 0,
                    )
                    for field in table.fields
                )
            )
        # 视图：与表同库存储（kind=view），字段只读
        for view in parsed.views:
            view_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"maxiong:{resolved_pdm_id}:view:{view.xml_id}"))
            table_rows.append(
                (
                    view_id,
                    resolved_pdm_id,
                    view.xml_id,
                    len(parsed.tables) + view.ordinal,
                    view.name,
                    view.code,
                    view.comment,
                    len(view.fields),
                    "view",
                )
            )
            field_rows.extend(
                (
                    (
                        str(uuid.uuid5(uuid.NAMESPACE_URL, f"maxiong:{resolved_pdm_id}:viewfield:{field.xml_id}")),
                        view_id,
                        field.xml_id,
                        field.ordinal,
                        field.name,
                        field.code,
                        field.data_type,
                        field.length,
                        1 if field.nullable else 0,
                        field.default_value,
                        field.comment,
                        0,
                    )
                    for field in view.fields
                )
            )
        connection.executemany(
            """
            INSERT INTO model_tables(id, pdm_id, xml_id, ordinal, name, code, comment, field_count, kind)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            table_rows,
        )
        connection.executemany(
            """
            INSERT INTO model_fields(
                id, table_id, xml_id, ordinal, name, code, data_type, length,
                nullable, default_value, comment, is_primary_key
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            field_rows,
        )
        self._rebuild_table_relations(connection, resolved_pdm_id, parsed, manual_relations)
        # 恢复字典字段绑定（字段 id 确定，仅保留本次解析仍存在的字段）
        valid_field_ids = {str(row[0]) for row in field_rows}
        restore_bindings = [
            (str(row["field_id"]), str(row["dictionary_id"]), str(row["created_at"]))
            for row in binding_rows
            if str(row["field_id"]) in valid_field_ids
        ]
        if restore_bindings:
            connection.executemany(
                """
                INSERT OR IGNORE INTO dictionary_field_bindings(field_id, dictionary_id, created_at)
                VALUES(?, ?, ?)
                """,
                restore_bindings,
            )
        return resolved_pdm_id

    @staticmethod
    def _rebuild_table_relations(
        connection: sqlite3.Connection,
        pdm_id: str,
        parsed: ParsedPdm,
        manual_relations: list[sqlite3.Row],
    ) -> None:
        """重建该 PDM 的自动关系，并恢复快照的手工关系。"""
        table_id_by_xml = {
            str(row["xml_id"]): str(row["id"])
            for row in connection.execute(
                "SELECT id, xml_id FROM model_tables WHERE pdm_id = ?", (pdm_id,)
            ).fetchall()
        }
        field_id_by_xml = {
            str(row["xml_id"]): str(row["id"])
            for row in connection.execute(
                """
                SELECT mf.id, mf.xml_id
                FROM model_fields mf
                JOIN model_tables mt ON mt.id = mf.table_id
                WHERE mt.pdm_id = ?
                """,
                (pdm_id,),
            ).fetchall()
        }
        now = utc_now()
        connection.execute(
            """
            DELETE FROM table_relations
            WHERE source_type = 'auto' AND (
                source_table_id IN (SELECT id FROM model_tables WHERE pdm_id = ?)
                OR target_table_id IN (SELECT id FROM model_tables WHERE pdm_id = ?)
            )
            """,
            (pdm_id, pdm_id),
        )
        auto_rows: list[tuple[Any, ...]] = []
        seen_keys: set[tuple[str, str, str, str]] = set()
        for reference in parsed.references:
            source_table_id = table_id_by_xml.get(reference.child_table_xml_id)
            target_table_id = table_id_by_xml.get(reference.parent_table_xml_id)
            if not source_table_id or not target_table_id:
                continue
            name = reference.code or "FK"
            note = reference.name if reference.code else ""
            for join in reference.joins:
                source_field_id = field_id_by_xml.get(join.child_column_xml_id)
                target_field_id = field_id_by_xml.get(join.parent_column_xml_id)
                if not source_field_id or not target_field_id:
                    continue
                key = (source_table_id, source_field_id, target_table_id, target_field_id)
                if key in seen_keys:
                    # 部分 PDM 里同一对字段会在多个 Reference 中重复出现，去重保留第一条
                    continue
                seen_keys.add(key)
                auto_rows.append(
                    (
                        str(uuid.uuid4()),
                        source_table_id,
                        source_field_id,
                        target_table_id,
                        target_field_id,
                        name,
                        reference.cardinality,
                        note,
                        "auto",
                        now,
                        now,
                    )
                )
        connection.executemany(
            """
            INSERT OR IGNORE INTO table_relations(
                id, source_table_id, source_field_id, target_table_id, target_field_id,
                name, cardinality, note, source_type, created_at, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            auto_rows,
        )
        manual_rows: list[tuple[Any, ...]] = []
        for row in manual_relations:
            source_table_id = table_id_by_xml.get(str(row["source_table_xml"]))
            source_field_id = field_id_by_xml.get(str(row["source_field_xml"]))
            target_table_id = table_id_by_xml.get(str(row["target_table_xml"]))
            target_field_id = field_id_by_xml.get(str(row["target_field_xml"]))
            if not all((source_table_id, source_field_id, target_table_id, target_field_id)):
                continue
            manual_rows.append(
                (
                    str(row["id"]),
                    source_table_id,
                    source_field_id,
                    target_table_id,
                    target_field_id,
                    str(row["name"]),
                    str(row["cardinality"]),
                    str(row["note"]),
                    "manual",
                    str(row["created_at"]),
                    utc_now(),
                )
            )
        connection.executemany(
            """
            INSERT OR IGNORE INTO table_relations(
                id, source_table_id, source_field_id, target_table_id, target_field_id,
                name, cardinality, note, source_type, created_at, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            manual_rows,
        )

    @staticmethod
    def _update_saved_table_index(
        connection: sqlite3.Connection,
        detail: dict[str, Any],
        absolute_path: Path,
        parsed: ParsedPdm,
    ) -> None:
        table_id = str(detail["id"])
        pdm_id = str(detail["pdm_id"])
        table_xml_id = str(detail["xml_id"])
        parsed_table = next(
            (candidate for candidate in parsed.tables if candidate.xml_id == table_xml_id),
            None,
        )
        if parsed_table is None:
            raise ServiceError(
                422,
                "保存校验失败：找不到刚刚修改的数据表",
                code="validation_failed",
            )

        indexed_fields = {
            str(field["xml_id"]): field
            for field in detail["fields"]
        }
        parsed_fields = {field.xml_id: field for field in parsed_table.fields}
        if set(indexed_fields) != set(parsed_fields):
            raise ServiceError(
                422,
                "保存校验失败：当前表的字段集合发生了意外变化",
                code="validation_failed",
            )

        stat = absolute_path.stat()
        updated_pdm = connection.execute(
            """
            UPDATE pdm_files
            SET source_hash = ?, file_size = ?, mtime_ns = ?,
                model_name = ?, pd_version = ?, target_db = ?,
                table_count = ?, field_count = ?, parsed_at = ?, parse_error = NULL
            WHERE id = ?
            """,
            (
                parsed.source_hash,
                stat.st_size,
                stat.st_mtime_ns,
                parsed.model_name,
                parsed.pd_version,
                parsed.target_db,
                len(parsed.tables),
                parsed.field_count,
                utc_now(),
                pdm_id,
            ),
        )
        if updated_pdm.rowcount != 1:
            raise ServiceError(409, "PDM 索引已变化，请刷新后再保存", code="pdm_changed")

        current_table = (
            int(detail["ordinal"]),
            str(detail["name"]),
            str(detail["code"]),
            str(detail["comment"]),
            int(detail["field_count"]),
        )
        saved_table = (
            parsed_table.ordinal,
            parsed_table.name,
            parsed_table.code,
            parsed_table.comment,
            len(parsed_table.fields),
        )
        if saved_table != current_table:
            updated_table = connection.execute(
                """
                UPDATE model_tables
                SET ordinal = ?, name = ?, code = ?, comment = ?, field_count = ?
                WHERE id = ? AND pdm_id = ? AND xml_id = ?
                """,
                (*saved_table, table_id, pdm_id, table_xml_id),
            )
            if updated_table.rowcount != 1:
                raise ServiceError(409, "数据表索引已变化，请刷新后再保存", code="table_changed")

        field_updates: list[tuple[Any, ...]] = []
        for parsed_field in parsed_table.fields:
            indexed_field = indexed_fields[parsed_field.xml_id]
            current_field = (
                int(indexed_field["ordinal"]),
                str(indexed_field["name"]),
                str(indexed_field["code"]),
                str(indexed_field["data_type"]),
                str(indexed_field["length"]),
                1 if bool(indexed_field["nullable"]) else 0,
                str(indexed_field["default_value"]),
                str(indexed_field["comment"]),
                1 if bool(indexed_field["is_primary_key"]) else 0,
            )
            saved_field = (
                parsed_field.ordinal,
                parsed_field.name,
                parsed_field.code,
                parsed_field.data_type,
                parsed_field.length,
                1 if parsed_field.nullable else 0,
                parsed_field.default_value,
                parsed_field.comment,
                1 if parsed_field.is_primary_key else 0,
            )
            if saved_field != current_field:
                field_updates.append(
                    (
                        *saved_field,
                        str(indexed_field["id"]),
                        table_id,
                        parsed_field.xml_id,
                    )
                )

        if field_updates:
            updated_fields = connection.executemany(
                """
                UPDATE model_fields
                SET ordinal = ?, name = ?, code = ?, data_type = ?, length = ?,
                    nullable = ?, default_value = ?, comment = ?, is_primary_key = ?
                WHERE id = ? AND table_id = ? AND xml_id = ?
                """,
                field_updates,
            )
            if updated_fields.rowcount != len(field_updates):
                raise ServiceError(409, "字段索引已变化，请刷新后再保存", code="field_changed")

    def _index_parse_error(
        self,
        connection: sqlite3.Connection,
        project_id: str,
        relative_path: str,
        absolute_path: Path,
        error_message: str,
    ) -> str:
        row = connection.execute(
            "SELECT id FROM pdm_files WHERE project_id = ? AND relative_path = ?",
            (project_id, relative_path),
        ).fetchone()
        pdm_id = str(row["id"]) if row else str(uuid.uuid4())
        stat = absolute_path.stat()
        connection.execute(
            """
            INSERT INTO pdm_files(
                id, project_id, relative_path, file_name, source_hash, file_size, mtime_ns,
                table_count, field_count, parsed_at, parse_error, index_version
            ) VALUES(?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                file_size = excluded.file_size,
                mtime_ns = excluded.mtime_ns,
                parsed_at = excluded.parsed_at,
                parse_error = excluded.parse_error,
                table_count = 0,
                field_count = 0,
                index_version = excluded.index_version
            """,
            (
                pdm_id,
                project_id,
                relative_path,
                absolute_path.name,
                file_sha256(absolute_path),
                stat.st_size,
                stat.st_mtime_ns,
                utc_now(),
                error_message[:2000],
                INDEX_VERSION,
            ),
        )
        self._delete_pdm_rows(connection, pdm_id)
        return pdm_id

    def _can_skip_reindex(self, existing: sqlite3.Row, parsed: ParsedPdm) -> bool:
        """强制刷新时，内容与索引语义都没变且行完整的 PDM 可跳过重建。"""
        if existing["parse_error"]:
            return False
        if str(existing["index_version"]) != INDEX_VERSION:
            return False
        if str(existing["source_hash"]) != parsed.source_hash:
            return False
        with self.database.connect() as connection:
            count = connection.execute(
                "SELECT COUNT(*) FROM model_tables WHERE pdm_id = ?",
                (str(existing["id"]),),
            ).fetchone()[0]
        return int(count) == len(parsed.tables) + len(parsed.views)

    def _touch_skipped_pdm(self, existing_id: str, absolute: Path, parsed: ParsedPdm) -> None:
        """跳过重建时仍刷新解析时间与表关系，保证关系数据与 PDM 内容同步。"""
        stat = absolute.stat()
        with self.database.transaction() as connection:
            connection.execute(
                """
                UPDATE pdm_files
                SET parsed_at = ?, file_size = ?, mtime_ns = ?, parse_error = NULL
                WHERE id = ?
                """,
                (utc_now(), stat.st_size, stat.st_mtime_ns, existing_id),
            )
            manual_relations = self._snapshot_manual_relations(connection, existing_id)
            self._rebuild_table_relations(connection, existing_id, parsed, manual_relations)

    def index_file(self, project_id: str, relative_path: str, *, force: bool = False) -> dict[str, Any]:
        project = self.get_project(project_id)
        relative = normalize_relative_path(relative_path)
        absolute = resolve_relative(Path(project["root_path"]), relative)
        if not absolute.is_file() or absolute.suffix.casefold() != ".pdm":
            raise ServiceError(404, "PDM 文件不存在", code="pdm_not_found")
        stat = absolute.stat()
        with self.database.connect() as connection:
            existing = connection.execute(
                "SELECT * FROM pdm_files WHERE project_id = ? AND relative_path = ?",
                (project_id, relative),
            ).fetchone()
        if (
            existing is not None
            and not force
            and int(existing["file_size"]) == stat.st_size
            and int(existing["mtime_ns"]) == stat.st_mtime_ns
            and not existing["parse_error"]
        ):
            return {"relative_path": relative, "status": "unchanged", "pdm_id": existing["id"]}
        try:
            parsed = parse_pdm(absolute)
        except (etree.XMLSyntaxError, OSError, ValueError) as exc:  # type: ignore[name-defined]
            error_message = str(exc)
            with self.database.transaction() as connection:
                self._index_parse_error(connection, project_id, relative, absolute, error_message)
            logger.warning("PDM 解析失败 %s: %s", relative, exc)
            return {"relative_path": relative, "status": "error", "error": "PDM 解析失败"}
        return self._index_parsed_or_skip(project_id, relative, absolute, parsed, existing, force)

    def _index_parsed_or_skip(
        self,
        project_id: str,
        relative: str,
        absolute: Path,
        parsed: ParsedPdm,
        existing: sqlite3.Row | None,
        force: bool,
    ) -> dict[str, Any]:
        if force and existing is not None and self._can_skip_reindex(existing, parsed):
            self._touch_skipped_pdm(str(existing["id"]), absolute, parsed)
            return {"relative_path": relative, "status": "skipped", "pdm_id": str(existing["id"])}
        with self.database.transaction() as connection:
            existing_pdm_ids = {str(existing["id"])} if existing is not None else set()
            with self.database.defer_fts_updates(connection, existing_pdm_ids) as updated_pdm_ids:
                pdm_id = self._index_parsed(connection, project_id, relative, absolute, parsed)
                updated_pdm_ids.add(pdm_id)
        return {
            "relative_path": relative,
            "status": "indexed",
            "pdm_id": pdm_id,
            "table_count": len(parsed.tables),
            "field_count": parsed.field_count,
        }

    def refresh_project(
        self,
        project_id: str,
        *,
        force: bool = False,
        progress: Callable[[int, int, str], None] | None = None,
    ) -> dict[str, Any]:
        project = self.get_project(project_id)
        root = Path(project["root_path"])
        root.mkdir(parents=True, exist_ok=True)
        discovered: list[Path] = []
        for path in root.rglob("*"):
            if any(part in INTERNAL_DIR_NAMES or part.startswith(".码熊") for part in path.relative_to(root).parts):
                continue
            if path.is_file() and path.suffix.casefold() == ".pdm":
                discovered.append(path)
        discovered.sort(key=lambda p: p.as_posix().casefold())
        total = len(discovered)

        with self.database.connect() as connection:
            existing_map = {
                str(row["relative_path"]): row
                for row in connection.execute(
                    "SELECT * FROM pdm_files WHERE project_id = ?", (project_id,)
                ).fetchall()
            }

        def report(processed: int, current_file: str) -> None:
            if progress is not None:
                progress(processed, total, current_file)

        # 立即上报总数，前端可在解析阶段就显示 0/total 进度
        report(0, "")

        results: list[dict[str, Any]] = []
        to_process: list[tuple[Path, sqlite3.Row | None]] = []
        processed = 0
        for path in discovered:
            relative = path.relative_to(root).as_posix()
            stat = path.stat()
            existing = existing_map.get(relative)
            if (
                existing is not None
                and not force
                and int(existing["file_size"]) == stat.st_size
                and int(existing["mtime_ns"]) == stat.st_mtime_ns
                and not existing["parse_error"]
            ):
                results.append({"relative_path": relative, "status": "unchanged", "pdm_id": str(existing["id"])})
                processed += 1
                report(processed, relative)
                continue
            to_process.append((path, existing))

        if to_process:
            def parse_one(item: tuple[Path, sqlite3.Row | None]) -> ParsedPdm | Exception:
                path, _existing = item
                try:
                    return parse_pdm(path)
                except (etree.XMLSyntaxError, OSError, ValueError) as exc:
                    return exc

            workers = max(1, min(8, os.cpu_count() or 4))
            with ThreadPoolExecutor(max_workers=workers) as pool:
                parsed_list = list(pool.map(parse_one, to_process))
            parsed_by_path = {path: parsed for (path, _existing), parsed in zip(to_process, parsed_list)}
            for path, existing in to_process:
                relative = path.relative_to(root).as_posix()
                parsed = parsed_by_path[path]
                if isinstance(parsed, Exception):
                    with self.database.transaction() as connection:
                        self._index_parse_error(connection, project_id, relative, path, str(parsed))
                    logger.warning("PDM 解析失败 %s: %s", relative, parsed)
                    results.append({"relative_path": relative, "status": "error", "error": "PDM 解析失败"})
                else:
                    results.append(self._index_parsed_or_skip(project_id, relative, path, parsed, existing, force))
                processed += 1
                report(processed, relative)

        with self.database.transaction() as connection:
            rows = connection.execute(
                "SELECT id, relative_path FROM pdm_files WHERE project_id = ?",
                (project_id,),
            ).fetchall()
            discovered_folded = {path.relative_to(root).as_posix().casefold() for path in discovered}
            for row in rows:
                if str(row["relative_path"]).casefold() not in discovered_folded:
                    self._delete_pdm_rows(connection, str(row["id"]))
                    connection.execute("DELETE FROM pdm_files WHERE id = ?", (row["id"],))
        return {
            "project_id": project_id,
            "indexed": sum(1 for result in results if result["status"] == "indexed"),
            "unchanged": sum(1 for result in results if result["status"] == "unchanged"),
            "skipped": sum(1 for result in results if result["status"] == "skipped"),
            "errors": [result for result in results if result["status"] == "error"],
            "pdm_count": total,
        }

    def _backup_existing(self, project: dict[str, Any], source: Path, category: str) -> Path:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        relative = source.relative_to(Path(project["root_path"]).resolve())
        backup_root = self.workspace_root / ".码熊备份" / str(project["name"]) / category
        backup = backup_root / relative.parent / f"{source.stem}.{stamp}{source.suffix}"
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, backup)
        return backup

    def import_staged_files(
        self,
        project_id: str,
        parent_path: str,
        staged_files: Iterable[tuple[str, Path]],
        *,
        overwrite: bool,
    ) -> dict[str, Any]:
        project = self.get_project(project_id)
        root = Path(project["root_path"]).resolve()
        parent = resolve_relative(root, parent_path)
        if not parent.is_dir():
            raise ServiceError(404, "导入目标文件夹不存在", code="parent_not_found")
        prepared: list[tuple[str, Path, Path]] = []
        for original_name, staged in staged_files:
            file_name = validate_name(Path(original_name).name, kind="PDM 文件")
            if Path(file_name).suffix.casefold() != ".pdm":
                raise ServiceError(422, f"{file_name} 不是 .pdm 文件", code="invalid_pdm")
            prepared.append((file_name, staged, parent / file_name))
        conflicts = [target.name for _, _, target in prepared if target.exists()]
        if conflicts and not overwrite:
            raise ServiceError(
                409,
                "目标文件夹中存在同名 PDM",
                code="import_conflict",
                data={"conflicts": conflicts},
            )
        imported: list[dict[str, Any]] = []
        errors: list[dict[str, str]] = []
        with self._write_lock:
            for file_name, staged, target in prepared:
                try:
                    parsed = parse_pdm(staged)
                    if not parsed.tables:
                        raise ValueError("文件中未找到 PowerDesigner 数据表")
                    if target.exists():
                        self._backup_existing(project, target, "导入覆盖")
                    sibling_temp = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
                    shutil.copy2(staged, sibling_temp)
                    os.replace(sibling_temp, target)
                    relative = target.relative_to(root).as_posix()
                    with self.database.transaction() as connection:
                        existing_row = connection.execute(
                            "SELECT id FROM pdm_files WHERE project_id = ? AND relative_path = ?",
                            (project_id, relative),
                        ).fetchone()
                        existing_pdm_ids = {str(existing_row["id"])} if existing_row is not None else set()
                        with self.database.defer_fts_updates(connection, existing_pdm_ids) as updated_pdm_ids:
                            pdm_id = self._index_parsed(connection, project_id, relative, target, parsed)
                            updated_pdm_ids.add(pdm_id)
                    imported.append(
                        {
                            "name": file_name,
                            "relative_path": relative,
                            "pdm_id": pdm_id,
                            "table_count": len(parsed.tables),
                            "field_count": parsed.field_count,
                        }
                    )
                except Exception as exc:
                    if isinstance(exc, (etree.XMLSyntaxError, ValueError)):
                        message = "PDM 解析失败"
                        logger.warning("导入 PDM 解析失败 %s: %s", file_name, exc)
                    else:
                        message = "导入失败"
                        logger.exception("导入 PDM 失败 %s", file_name)
                    errors.append({"name": file_name, "error": message})
        return {"imported": imported, "errors": errors}

    def rename_node(self, project_id: str, relative_path: str, name: str) -> dict[str, Any]:
        project = self.get_project(project_id)
        root = Path(project["root_path"]).resolve()
        relative = normalize_relative_path(relative_path)
        if not relative:
            return self.rename_project(project_id, name)
        source = resolve_relative(root, relative)
        if not source.exists():
            raise ServiceError(404, "节点不存在", code="node_not_found")
        new_name = validate_name(name)
        if source.is_file() and source.suffix.casefold() == ".pdm" and Path(new_name).suffix.casefold() != ".pdm":
            new_name += ".pdm"
        target = source.parent / new_name
        if target.exists() and target.resolve() != source.resolve():
            raise ServiceError(409, "同名节点已存在", code="node_exists")
        old_relative = relative
        new_relative = target.relative_to(root).as_posix()
        with self._write_lock:
            source.rename(target)
            try:
                self._update_index_paths(project_id, old_relative, new_relative, source.is_dir())
            except Exception:
                target.rename(source)
                raise
        return {"relative_path": new_relative, "name": target.name}

    def move_node(self, project_id: str, relative_path: str, target_parent_path: str) -> dict[str, Any]:
        project = self.get_project(project_id)
        root = Path(project["root_path"]).resolve()
        relative = normalize_relative_path(relative_path)
        if not relative:
            raise ServiceError(422, "项目根节点不能移动", code="invalid_move")
        source = resolve_relative(root, relative)
        parent = resolve_relative(root, target_parent_path)
        if not source.exists() or not parent.is_dir():
            raise ServiceError(404, "源节点或目标文件夹不存在", code="node_not_found")
        if parent == source or parent.is_relative_to(source):
            raise ServiceError(422, "文件夹不能移动到自身内部", code="invalid_move")
        target = parent / source.name
        if target.exists():
            raise ServiceError(409, "目标文件夹中已有同名节点", code="node_exists")
        new_relative = target.relative_to(root).as_posix()
        is_directory = source.is_dir()
        with self._write_lock:
            shutil.move(str(source), str(target))
            try:
                self._update_index_paths(project_id, relative, new_relative, is_directory)
            except Exception:
                shutil.move(str(target), str(source))
                raise
        return {"relative_path": new_relative, "name": target.name}

    def _update_index_paths(self, project_id: str, old_path: str, new_path: str, is_directory: bool) -> None:
        with self.database.transaction() as connection:
            if not is_directory:
                connection.execute(
                    "UPDATE pdm_files SET relative_path = ?, file_name = ? WHERE project_id = ? AND relative_path = ?",
                    (new_path, PurePosixPath(new_path).name, project_id, old_path),
                )
                return
            rows = connection.execute(
                "SELECT id, relative_path FROM pdm_files WHERE project_id = ?",
                (project_id,),
            ).fetchall()
            prefix = f"{old_path}/"
            for row in rows:
                current = str(row["relative_path"])
                if current.startswith(prefix):
                    updated = f"{new_path}/{current[len(prefix):]}"
                    connection.execute(
                        "UPDATE pdm_files SET relative_path = ?, file_name = ? WHERE id = ?",
                        (updated, PurePosixPath(updated).name, row["id"]),
                    )

    def trash_node(self, project_id: str, relative_path: str) -> dict[str, Any]:
        project = self.get_project(project_id)
        root = Path(project["root_path"]).resolve()
        relative = normalize_relative_path(relative_path)
        trash_id = str(uuid.uuid4())
        trash_container = self.workspace_root / ".码熊回收站" / trash_id
        trash_container.mkdir(parents=True, exist_ok=False)
        if not relative:
            source = root
            kind = "project"
            original_location = str(root)
        else:
            source = resolve_relative(root, relative)
            kind = "folder" if source.is_dir() else "pdm"
            original_location = relative
        if not source.exists():
            trash_container.rmdir()
            raise ServiceError(404, "节点不存在", code="node_not_found")
        target = trash_container / source.name
        with self._write_lock:
            shutil.move(str(source), str(target))
            try:
                with self.database.transaction() as connection:
                    connection.execute(
                        """
                        INSERT INTO trash(
                            id, original_project_id, project_name, original_relative_path,
                            trash_path, kind, name, deleted_at
                        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            trash_id,
                            project_id,
                            project["name"],
                            original_location,
                            str(target),
                            kind,
                            source.name,
                            utc_now(),
                        ),
                    )
                    if kind == "project":
                        connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
                    elif kind == "pdm":
                        pdm_rows = connection.execute(
                            "SELECT id FROM pdm_files WHERE project_id = ? AND relative_path = ?",
                            (project_id, relative),
                        ).fetchall()
                        for pdm_row in pdm_rows:
                            self._delete_pdm_rows(connection, str(pdm_row["id"]))
                        connection.execute(
                            "DELETE FROM pdm_files WHERE project_id = ? AND relative_path = ?",
                            (project_id, relative),
                        )
                    else:
                        prefix = f"{_like_escape(relative)}/%"
                        pdm_rows = connection.execute(
                            "SELECT id FROM pdm_files WHERE project_id = ? AND relative_path LIKE ? ESCAPE '\\'",
                            (project_id, prefix),
                        ).fetchall()
                        for pdm_row in pdm_rows:
                            self._delete_pdm_rows(connection, str(pdm_row["id"]))
                        connection.execute(
                            "DELETE FROM pdm_files WHERE project_id = ? AND relative_path LIKE ? ESCAPE '\\'",
                            (project_id, prefix),
                        )
            except Exception:
                shutil.move(str(target), str(source))
                trash_container.rmdir()
                raise
        return {"trash_id": trash_id, "kind": kind, "name": source.name}

    def list_trash(self) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            rows = connection.execute("SELECT * FROM trash ORDER BY deleted_at DESC").fetchall()
        return [dict(row) for row in rows]

    def restore_trash(self, trash_id: str) -> dict[str, Any]:
        with self.database.connect() as connection:
            row = connection.execute("SELECT * FROM trash WHERE id = ?", (trash_id,)).fetchone()
        if row is None:
            raise ServiceError(404, "回收站项目不存在", code="trash_not_found")
        item = dict(row)
        source = Path(item["trash_path"])
        if not source.exists():
            raise ServiceError(410, "回收站文件已丢失", code="trash_missing")
        project_id = str(item["original_project_id"])
        if item["kind"] == "project":
            target = Path(item["original_relative_path"])
            if target.exists():
                raise ServiceError(409, "原位置已有同名项目", code="restore_conflict")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))
            now = utc_now()
            try:
                with self.database.transaction() as connection:
                    connection.execute(
                        "INSERT INTO projects(id, name, root_path, created_at, updated_at) VALUES(?, ?, ?, ?, ?)",
                        (project_id, item["project_name"], str(target.resolve()), now, now),
                    )
                    connection.execute("DELETE FROM trash WHERE id = ?", (trash_id,))
            except Exception:
                shutil.move(str(target), str(source))
                raise
        else:
            project = self.get_project(project_id)
            target = resolve_relative(Path(project["root_path"]), item["original_relative_path"])
            if target.exists():
                raise ServiceError(409, "原位置已有同名节点", code="restore_conflict")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))
            with self.database.transaction() as connection:
                connection.execute("DELETE FROM trash WHERE id = ?", (trash_id,))
        try:
            source.parent.rmdir()
        except OSError:
            pass
        refresh = self.refresh_project(project_id, force=True)
        return {"restored": item["name"], "project_id": project_id, "refresh": refresh}

    def search_tables(
        self,
        *,
        project_id: str | None,
        scope_type: str,
        scope_path: str,
        mode: str,
        query: str,
        all_nodes: bool,
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        where: list[str] = []
        params: list[Any] = []
        if not all_nodes:
            if not project_id:
                return {
                    "items": [],
                    "total": 0,
                    "field_total": 0,
                    "pdm_total": 0,
                    "limit": limit,
                    "offset": offset,
                }
            where.append("p.id = ?")
            params.append(project_id)
            relative = normalize_relative_path(scope_path)
            if scope_type == "pdm" and relative:
                where.append("pf.relative_path = ?")
                params.append(relative)
            elif scope_type == "folder" and relative:
                where.append("pf.relative_path LIKE ? ESCAPE '\\'")
                params.append(f"{_like_escape(relative)}/%")
        needle = query.strip()
        use_fts = self.database.fts_available and len(needle) >= 3
        if needle:
            if use_fts:
                if mode == "field":
                    where.append(
                        """
                        t.id IN (
                            SELECT mf.table_id
                            FROM model_fields_fts
                            JOIN model_fields mf ON mf.rowid = model_fields_fts.rowid
                            WHERE model_fields_fts MATCH ?
                        )
                        """
                    )
                else:
                    where.append(
                        "t.rowid IN (SELECT rowid FROM model_tables_fts WHERE model_tables_fts MATCH ?)"
                    )
                params.append(_fts_phrase(needle))
            else:
                like = f"%{_like_escape(needle)}%"
                if mode == "field":
                    where.append(
                        """
                        EXISTS (
                            SELECT 1 FROM model_fields mf
                            WHERE mf.table_id = t.id
                              AND (mf.code LIKE ? ESCAPE '\\' COLLATE NOCASE
                                   OR mf.name LIKE ? ESCAPE '\\' COLLATE NOCASE
                                   OR mf.comment LIKE ? ESCAPE '\\' COLLATE NOCASE)
                        )
                        """
                    )
                    params.extend([like, like, like])
                else:
                    where.append(
                        "(t.code LIKE ? ESCAPE '\\' COLLATE NOCASE OR t.name LIKE ? ESCAPE '\\' COLLATE NOCASE OR t.comment LIKE ? ESCAPE '\\' COLLATE NOCASE)"
                    )
                    params.extend([like, like, like])
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        base = f"""
            FROM model_tables t
            JOIN pdm_files pf ON pf.id = t.pdm_id
            JOIN projects p ON p.id = pf.project_id
            {clause}
        """
        try:
            with self.database.connect() as connection:
                stats = connection.execute(
                    f"""
                    SELECT COUNT(*) AS total,
                           COALESCE(SUM(t.field_count), 0) AS field_total,
                           COUNT(DISTINCT pf.id) AS pdm_total
                    {base}
                    """,
                    params,
                ).fetchone()
                rows = connection.execute(
                    f"""
                    SELECT t.id, t.name, t.code, t.comment, t.field_count, t.kind,
                           p.id AS project_id, p.name AS project_name,
                           pf.id AS pdm_id, pf.relative_path, pf.source_hash
                    {base}
                    ORDER BY p.name COLLATE NOCASE, pf.relative_path COLLATE NOCASE, t.ordinal
                    LIMIT ? OFFSET ?
                    """,
                    [*params, limit, offset],
                ).fetchall()
        except sqlite3.OperationalError:
            if not use_fts:
                raise
            self.database.fts_available = False
            return self.search_tables(
                project_id=project_id,
                scope_type=scope_type,
                scope_path=scope_path,
                mode=mode,
                query=query,
                all_nodes=all_nodes,
                limit=limit,
                offset=offset,
            )
        return {
            "items": [dict(row) for row in rows],
            "total": int(stats["total"]),
            "field_total": int(stats["field_total"]),
            "pdm_total": int(stats["pdm_total"]),
            "limit": limit,
            "offset": offset,
        }

    def table_detail(self, table_id: str) -> dict[str, Any]:
        with self.database.connect() as connection:
            table = connection.execute(
                """
                SELECT t.*, pf.id AS pdm_id, pf.relative_path, pf.source_hash,
                       pf.pd_version, pf.target_db, p.id AS project_id,
                       p.name AS project_name
                FROM model_tables t
                JOIN pdm_files pf ON pf.id = t.pdm_id
                JOIN projects p ON p.id = pf.project_id
                WHERE t.id = ?
                """,
                (table_id,),
            ).fetchone()
            if table is None:
                raise ServiceError(404, "数据表不存在或索引已更新", code="table_not_found")
            fields = connection.execute(
                "SELECT * FROM model_fields WHERE table_id = ? ORDER BY ordinal",
                (table_id,),
            ).fetchall()
        result = dict(table)
        result["fields"] = [
            {
                **dict(field),
                "nullable": bool(field["nullable"]),
                "is_primary_key": bool(field["is_primary_key"]),
            }
            for field in fields
        ]
        return result

    # ---- 表关系 ----

    @staticmethod
    def _relation_row(connection: sqlite3.Connection, relation_id: str) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT tr.*,
                   st.code AS source_table_code, st.name AS source_table_name,
                   sf.code AS source_field_code, sf.name AS source_field_name,
                   tt.code AS target_table_code, tt.name AS target_table_name,
                   tf.code AS target_field_code, tf.name AS target_field_name
            FROM table_relations tr
            JOIN model_tables st ON st.id = tr.source_table_id
            JOIN model_fields sf ON sf.id = tr.source_field_id
            JOIN model_tables tt ON tt.id = tr.target_table_id
            JOIN model_fields tf ON tf.id = tr.target_field_id
            WHERE tr.id = ?
            """,
            (relation_id,),
        ).fetchone()

    @staticmethod
    def _relation_payload(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "name": str(row["name"]),
            "cardinality": str(row["cardinality"]),
            "note": str(row["note"]),
            "source_type": str(row["source_type"]),
            "source_table": {
                "id": str(row["source_table_id"]),
                "name": str(row["source_table_name"]),
                "code": str(row["source_table_code"]),
            },
            "source_field": {
                "id": str(row["source_field_id"]),
                "name": str(row["source_field_name"]),
                "code": str(row["source_field_code"]),
            },
            "target_table": {
                "id": str(row["target_table_id"]),
                "name": str(row["target_table_name"]),
                "code": str(row["target_table_code"]),
            },
            "target_field": {
                "id": str(row["target_field_id"]),
                "name": str(row["target_field_name"]),
                "code": str(row["target_field_code"]),
            },
            "created_at": str(row["created_at"]),
            "updated_at": str(row["updated_at"]),
        }

    def list_table_relations(self, table_id: str) -> dict[str, Any]:
        with self.database.connect() as connection:
            current = connection.execute("SELECT pdm_id FROM model_tables WHERE id = ?", (table_id,)).fetchone()
            if current is None:
                raise ServiceError(404, "数据表不存在或索引已更新", code="table_not_found")
            pdm_id = str(current["pdm_id"])
            incoming = connection.execute(
                "SELECT id FROM table_relations WHERE target_table_id = ? ORDER BY source_type, name COLLATE NOCASE",
                (table_id,),
            ).fetchall()
            outgoing = connection.execute(
                "SELECT id FROM table_relations WHERE source_table_id = ? ORDER BY source_type, name COLLATE NOCASE",
                (table_id,),
            ).fetchall()
            incoming_rows = [self._relation_payload(row) for relation in incoming if (row := self._relation_row(connection, str(relation["id"]))) is not None]
            outgoing_rows = [self._relation_payload(row) for relation in outgoing if (row := self._relation_row(connection, str(relation["id"]))) is not None]
            option_tables = connection.execute(
                "SELECT id, name, code FROM model_tables WHERE pdm_id = ? AND kind = 'table' ORDER BY ordinal",
                (pdm_id,),
            ).fetchall()
            option_fields = connection.execute(
                """
                SELECT mf.id, mf.table_id, mf.code, mf.name
                FROM model_fields mf
                JOIN model_tables mt ON mt.id = mf.table_id
                WHERE mt.pdm_id = ? ORDER BY mt.ordinal, mf.ordinal
                """,
                (pdm_id,),
            ).fetchall()
            fields_by_table: dict[str, list[dict[str, str]]] = {}
            for field in option_fields:
                fields_by_table.setdefault(str(field["table_id"]), []).append(
                    {"id": str(field["id"]), "code": str(field["code"]), "name": str(field["name"])}
                )
            options = [
                {
                    "id": str(table["id"]),
                    "name": str(table["name"]),
                    "code": str(table["code"]),
                    "fields": fields_by_table.get(str(table["id"]), []),
                }
                for table in option_tables
            ]
        return {"incoming": incoming_rows, "outgoing": outgoing_rows, "options": options}

    def create_relation(
        self,
        *,
        source_table_id: str,
        source_field_id: str,
        target_table_id: str,
        target_field_id: str,
        name: str,
        cardinality: str,
        note: str,
    ) -> dict[str, Any]:
        cleaned_name = name.strip()
        if not cleaned_name or len(cleaned_name) > 200:
            raise ServiceError(422, "关系名称不能为空且不超过 200 个字符", code="invalid_relation")
        if len(cardinality) > 20:
            raise ServiceError(422, "基数格式无效", code="invalid_relation")
        relation_id = str(uuid.uuid4())
        now = utc_now()
        with self._write_lock, self.database.transaction() as connection:
            for table_id, label in ((source_table_id, "源表"), (target_table_id, "目标表")):
                if connection.execute("SELECT 1 FROM model_tables WHERE id = ?", (table_id,)).fetchone() is None:
                    raise ServiceError(404, f"{label}不存在或索引已更新", code="table_not_found")
            for field_id, table_id, label in (
                (source_field_id, source_table_id, "源字段"),
                (target_field_id, target_table_id, "目标字段"),
            ):
                if connection.execute(
                    "SELECT 1 FROM model_fields WHERE id = ? AND table_id = ?",
                    (field_id, table_id),
                ).fetchone() is None:
                    raise ServiceError(422, f"{label}不属于所选表", code="invalid_relation")
            if connection.execute(
                """
                SELECT 1 FROM table_relations
                WHERE source_table_id = ? AND source_field_id = ? AND target_table_id = ? AND target_field_id = ?
                """,
                (source_table_id, source_field_id, target_table_id, target_field_id),
            ).fetchone() is not None:
                raise ServiceError(409, "同一对「源表.字段 → 目标表.字段」已存在", code="relation_exists")
            connection.execute(
                """
                INSERT INTO table_relations(
                    id, source_table_id, source_field_id, target_table_id, target_field_id,
                    name, cardinality, note, source_type, created_at, updated_at
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
                """,
                (relation_id, source_table_id, source_field_id, target_table_id, target_field_id, cleaned_name, cardinality.strip(), note.strip(), now, now),
            )
            row = self._relation_row(connection, relation_id)
        return self._relation_payload(row)

    def update_relation(
        self,
        relation_id: str,
        *,
        name: str,
        cardinality: str,
        note: str,
    ) -> dict[str, Any]:
        cleaned_name = name.strip()
        if not cleaned_name or len(cleaned_name) > 200:
            raise ServiceError(422, "关系名称不能为空且不超过 200 个字符", code="invalid_relation")
        if len(cardinality) > 20:
            raise ServiceError(422, "基数格式无效", code="invalid_relation")
        with self._write_lock, self.database.transaction() as connection:
            row = self._relation_row(connection, relation_id)
            if row is None:
                raise ServiceError(404, "关系不存在", code="relation_not_found")
            if row["source_type"] != "manual":
                raise ServiceError(422, "自动解析的关系不可编辑，可删除后手工重建", code="relation_readonly")
            connection.execute(
                """
                UPDATE table_relations SET name = ?, cardinality = ?, note = ?, updated_at = ?
                WHERE id = ?
                """,
                (cleaned_name, cardinality.strip(), note.strip(), utc_now(), relation_id),
            )
            row = self._relation_row(connection, relation_id)
        return self._relation_payload(row)

    def delete_relation(self, relation_id: str) -> dict[str, bool]:
        with self._write_lock, self.database.transaction() as connection:
            row = self._relation_row(connection, relation_id)
            if row is None:
                raise ServiceError(404, "关系不存在", code="relation_not_found")
            if row["source_type"] != "manual":
                raise ServiceError(422, "自动解析的关系不可删除，重新解析 PDM 时自动同步", code="relation_readonly")
            connection.execute("DELETE FROM table_relations WHERE id = ?", (relation_id,))
        return {"deleted": True}

    @staticmethod
    def _endpoint_in_selection(project_id: str, pdm_path: str, selections: list[dict[str, Any]]) -> bool:
        for item in selections:
            if str(item.get("project_id")) != project_id:
                continue
            node_type = item.get("type")
            relative = str(item.get("relative_path") or "")
            if node_type == "project":
                return True
            if node_type == "pdm" and pdm_path.casefold() == relative.casefold():
                return True
            if node_type == "folder" and (
                pdm_path.casefold() == relative.casefold()
                or pdm_path.casefold().startswith(f"{relative.casefold()}/")
            ):
                return True
        return False

    def export_relation_payload(self, selections: list[dict[str, Any]]) -> dict[str, Any]:
        """导出手工关系（引用方与被引用方都在选择范围内）。"""
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT tr.*,
                       sp.relative_path AS source_pdm_path, sp.project_id AS source_project_id,
                       st.xml_id AS source_table_xml, sf.xml_id AS source_field_xml,
                       tp.relative_path AS target_pdm_path, tp.project_id AS target_project_id,
                       tt.xml_id AS target_table_xml, tf.xml_id AS target_field_xml
                FROM table_relations tr
                JOIN model_tables st ON st.id = tr.source_table_id
                JOIN model_fields sf ON sf.id = tr.source_field_id
                JOIN pdm_files sp ON sp.id = st.pdm_id
                JOIN model_tables tt ON tt.id = tr.target_table_id
                JOIN model_fields tf ON tf.id = tr.target_field_id
                JOIN pdm_files tp ON tp.id = tt.pdm_id
                WHERE tr.source_type = 'manual'
                ORDER BY tr.name COLLATE NOCASE
                """,
            ).fetchall()
        relations: list[dict[str, Any]] = []
        for row in rows:
            source_in = self._endpoint_in_selection(str(row["source_project_id"]), str(row["source_pdm_path"]), selections)
            target_in = self._endpoint_in_selection(str(row["target_project_id"]), str(row["target_pdm_path"]), selections)
            if not (source_in and target_in):
                continue
            relations.append(
                {
                    "name": str(row["name"]),
                    "cardinality": str(row["cardinality"]),
                    "note": str(row["note"]),
                    "source_project_key": str(row["source_project_id"]),
                    "source_pdm_path": str(row["source_pdm_path"]),
                    "source_table_xml": str(row["source_table_xml"]),
                    "source_field_xml": str(row["source_field_xml"]),
                    "target_project_key": str(row["target_project_id"]),
                    "target_pdm_path": str(row["target_pdm_path"]),
                    "target_table_xml": str(row["target_table_xml"]),
                    "target_field_xml": str(row["target_field_xml"]),
                }
            )
        return {"version": 1, "relations": relations}

    def import_relation_payload(
        self,
        payload: dict[str, Any],
        project_mapping: dict[str, str],
    ) -> dict[str, int]:
        relations = payload.get("relations")
        if payload.get("version") != 1 or not isinstance(relations, list):
            raise ServiceError(422, "关系备份内容格式无效", code="invalid_backup")
        if len(relations) > 100_000:
            raise ServiceError(422, "关系备份内容数量异常", code="invalid_backup")
        imported = 0
        with self._write_lock, self.database.transaction() as connection:
            for raw in relations:
                if not isinstance(raw, dict):
                    raise ServiceError(422, "关系备份内容格式无效", code="invalid_backup")

                def resolve_field(project_key: str, pdm_path: str, table_xml: str, field_xml: str):
                    project_id = project_mapping.get(project_key, project_key) if project_key else ""
                    return connection.execute(
                        """
                        SELECT mf.id, mf.table_id
                        FROM model_fields mf
                        JOIN model_tables mt ON mt.id = mf.table_id
                        JOIN pdm_files pf ON pf.id = mt.pdm_id
                        WHERE pf.project_id = ? AND pf.relative_path = ? AND mt.xml_id = ? AND mf.xml_id = ?
                        """,
                        (project_id, str(pdm_path), str(table_xml), str(field_xml)),
                    ).fetchone()

                source = resolve_field(
                    str(raw.get("source_project_key", "")),
                    raw.get("source_pdm_path", ""),
                    raw.get("source_table_xml", ""),
                    raw.get("source_field_xml", ""),
                )
                target = resolve_field(
                    str(raw.get("target_project_key", "")),
                    raw.get("target_pdm_path", ""),
                    raw.get("target_table_xml", ""),
                    raw.get("target_field_xml", ""),
                )
                if source is None or target is None:
                    continue
                name = str(raw.get("name", "")).strip()[:200] or "FK"
                now = utc_now()
                connection.execute(
                    """
                    INSERT OR IGNORE INTO table_relations(
                        id, source_table_id, source_field_id, target_table_id, target_field_id,
                        name, cardinality, note, source_type, created_at, updated_at
                    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        str(source["table_id"]),
                        str(source["id"]),
                        str(target["table_id"]),
                        str(target["id"]),
                        name,
                        str(raw.get("cardinality", ""))[:20],
                        str(raw.get("note", ""))[:1000],
                        now,
                        now,
                    ),
                )
                imported += 1
        return {"relation_count": imported}

    def ddl_options(self) -> dict[str, Any]:
        return build_ddl_options()

    def ddl_catalog(
        self,
        project_id: str,
        *,
        include_tables: bool = True,
        pdm_ids: list[str] | None = None,
        query: str = "",
    ) -> dict[str, Any]:
        project = self.get_project(project_id)
        normalized_pdm_ids = list(
            dict.fromkeys(str(pdm_id).strip() for pdm_id in (pdm_ids or []) if str(pdm_id).strip())
        )
        normalized_query = query.strip()
        with self.database.connect() as connection:
            pdm_conditions = ["pf.project_id = ?"]
            pdm_parameters: list[Any] = [project_id]
            if normalized_pdm_ids:
                placeholders = ",".join("?" for _ in normalized_pdm_ids)
                pdm_conditions.append(f"pf.id IN ({placeholders})")
                pdm_parameters.extend(normalized_pdm_ids)
            pdm_rows = connection.execute(
                f"""
                SELECT pf.id, pf.relative_path, pf.file_name, pf.model_name,
                       pf.pd_version, pf.target_db, pf.table_count, pf.field_count,
                       pf.parse_error
                FROM pdm_files pf
                WHERE {' AND '.join(pdm_conditions)}
                ORDER BY pf.relative_path COLLATE NOCASE
                """,
                pdm_parameters,
            ).fetchall()

            table_rows: list[Any] = []
            if include_tables and pdm_rows:
                table_conditions = ["pf.project_id = ?", "t.kind = 'table'"]
                table_parameters: list[Any] = [project_id]
                if normalized_pdm_ids:
                    placeholders = ",".join("?" for _ in normalized_pdm_ids)
                    table_conditions.append(f"pf.id IN ({placeholders})")
                    table_parameters.extend(normalized_pdm_ids)
                if normalized_query:
                    escaped_query = (
                        normalized_query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                    )
                    pattern = f"%{escaped_query}%"
                    table_conditions.append(
                        """(
                            pf.file_name LIKE ? ESCAPE '\\'
                            OR pf.model_name LIKE ? ESCAPE '\\'
                            OR pf.relative_path LIKE ? ESCAPE '\\'
                            OR t.name LIKE ? ESCAPE '\\'
                            OR t.code LIKE ? ESCAPE '\\'
                            OR t.comment LIKE ? ESCAPE '\\'
                        )"""
                    )
                    table_parameters.extend([pattern] * 6)
                table_rows = connection.execute(
                    f"""
                SELECT t.id, t.pdm_id, t.ordinal, t.name, t.code, t.comment,
                       t.field_count, pf.relative_path, pf.source_hash
                FROM model_tables t
                JOIN pdm_files pf ON pf.id = t.pdm_id
                WHERE {' AND '.join(table_conditions)}
                ORDER BY pf.relative_path COLLATE NOCASE, t.ordinal
                """,
                    table_parameters,
                ).fetchall()
        tables_by_pdm: dict[str, list[dict[str, Any]]] = {}
        for row in table_rows:
            item = dict(row)
            tables_by_pdm.setdefault(str(item["pdm_id"]), []).append(item)
        groups = []
        for row in pdm_rows:
            item = dict(row)
            item["tables"] = tables_by_pdm.get(str(item["id"]), [])
            item["tables_loaded"] = include_tables
            if normalized_query and not item["tables"]:
                continue
            groups.append(item)
        if include_tables:
            table_count = sum(len(group["tables"]) for group in groups)
            field_count = sum(
                int(table["field_count"])
                for group in groups
                for table in group["tables"]
            )
        else:
            table_count = sum(int(group["table_count"]) for group in groups)
            field_count = sum(int(group["field_count"]) for group in groups)
        return {
            "project_id": project_id,
            "project_name": str(project["name"]),
            "groups": groups,
            "table_count": table_count,
            "field_count": field_count,
        }

    def generate_ddl(self, table_ids: list[str], config: dict[str, Any]) -> dict[str, Any]:
        ordered_ids = list(dict.fromkeys(str(table_id) for table_id in table_ids if str(table_id).strip()))
        if not ordered_ids:
            raise ServiceError(422, "请至少选择一张数据表", code="ddl_empty_selection")
        if len(ordered_ids) > 5000:
            raise ServiceError(422, "单次最多生成 5000 张表", code="ddl_selection_too_large")

        with self.database.connect() as connection:
            view_ids = {
                str(row["id"])
                for row in connection.execute(
                    f"SELECT id FROM model_tables WHERE kind = 'view' AND id IN ({','.join('?' for _ in ordered_ids)})",
                    ordered_ids,
                ).fetchall()
            }
        if view_ids:
            raise ServiceError(
                422,
                f"视图不可用于生成建表脚本（{len(view_ids)} 个）",
                code="ddl_view_not_supported",
            )

        table_map: dict[str, dict[str, Any]] = {}
        fields_by_table: dict[str, list[dict[str, Any]]] = {}
        with self.database.connect() as connection:
            for start in range(0, len(ordered_ids), 800):
                chunk = ordered_ids[start : start + 800]
                placeholders = ",".join("?" for _ in chunk)
                rows = connection.execute(
                    f"""
                    SELECT t.*, pf.id AS pdm_id, pf.relative_path, pf.source_hash,
                           pf.pd_version, pf.target_db, p.id AS project_id,
                           p.name AS project_name
                    FROM model_tables t
                    JOIN pdm_files pf ON pf.id = t.pdm_id
                    JOIN projects p ON p.id = pf.project_id
                    WHERE t.id IN ({placeholders})
                    """,
                    chunk,
                ).fetchall()
                table_map.update({str(row["id"]): dict(row) for row in rows})
                field_rows = connection.execute(
                    f"""
                    SELECT mf.*
                    FROM model_fields mf
                    WHERE mf.table_id IN ({placeholders})
                    ORDER BY mf.table_id, mf.ordinal
                    """,
                    chunk,
                ).fetchall()
                for field_row in field_rows:
                    field = dict(field_row)
                    field["nullable"] = bool(field["nullable"])
                    field["is_primary_key"] = bool(field["is_primary_key"])
                    fields_by_table.setdefault(str(field["table_id"]), []).append(field)

        missing = [table_id for table_id in ordered_ids if table_id not in table_map]
        if missing:
            raise ServiceError(
                404,
                "部分数据表不存在或索引已更新，请重新打开导出窗口",
                code="ddl_table_not_found",
                data={"table_ids": missing[:20]},
            )
        tables: list[dict[str, Any]] = []
        for table_id in ordered_ids:
            table = table_map[table_id]
            table["fields"] = fields_by_table.get(table_id, [])
            tables.append(table)
        try:
            return render_ddl(tables, config)
        except (TypeError, ValueError) as exc:
            raise ServiceError(422, str(exc), code="invalid_ddl_config") from exc

    def save_table_fields(
        self,
        table_id: str,
        expected_hash: str,
        fields: list[dict[str, Any]],
        table: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._write_lock:
            detail = self.table_detail(table_id)
            if str(detail.get("kind", "table")) == "view":
                raise ServiceError(422, "视图只读，不可编辑字段", code="view_readonly")
            project = self.get_project(str(detail["project_id"]))
            path = resolve_relative(Path(project["root_path"]), str(detail["relative_path"]))
            current_hash = file_sha256(path)
            if expected_hash != current_hash:
                raise ServiceError(
                    409,
                    "PDM 文件在打开后发生了变化，请刷新后再保存",
                    code="pdm_changed",
                    data={"current_hash": current_hash},
                )
            known_fields = {str(field["id"]): field for field in detail["fields"]}
            changes: dict[str, dict[str, object]] = {}
            for field in fields:
                field_id = str(field.get("id", ""))
                original = known_fields.get(field_id)
                if original is None:
                    raise ServiceError(422, "提交内容包含不属于该表的字段", code="invalid_field")
                code = str(field.get("code", "")).strip()
                data_type = str(field.get("data_type", "")).strip()
                if not code or not data_type:
                    raise ServiceError(422, "字段英文名和数据类型不能为空", code="invalid_field")
                candidate = {
                    "name": str(field.get("name", "")),
                    "code": code,
                    "data_type": data_type,
                    "length": str(field.get("length", "")),
                    "nullable": bool(field.get("nullable", True)),
                    "default_value": str(field.get("default_value", "")),
                    "comment": str(field.get("comment", "")),
                }
                current = {
                    "name": str(original["name"]),
                    "code": str(original["code"]),
                    "data_type": str(original["data_type"]),
                    "length": str(original["length"]),
                    "nullable": bool(original["nullable"]),
                    "default_value": str(original["default_value"]),
                    "comment": str(original["comment"]),
                }
                if candidate != current:
                    changes[str(original["xml_id"])] = candidate
            if set(known_fields) != {str(field.get("id", "")) for field in fields}:
                raise ServiceError(422, "保存时必须提交当前表的全部字段", code="incomplete_fields")

            table_changes: dict[str, dict[str, object]] = {}
            if table is not None:
                candidate_table = {
                    "name": str(table.get("name", "")).strip(),
                    "code": str(table.get("code", "")).strip(),
                    "comment": str(table.get("comment", "")),
                }
                current_table = {
                    "name": str(detail["name"]),
                    "code": str(detail["code"]),
                    "comment": str(detail["comment"]),
                }
                if candidate_table != current_table:
                    table_changes[str(detail["xml_id"])] = candidate_table

            if not table_changes and not changes:
                return detail

            backup = self._backup_existing(project, path, "字典编辑")
            temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
            try:
                update_pdm_dictionary(path, temp, table_changes, changes)
                parsed = parse_pdm(temp)
                with self.database.connect() as connection:
                    pdm_row = connection.execute("SELECT * FROM pdm_files WHERE id = ?", (detail["pdm_id"],)).fetchone()
                if pdm_row is None:
                    raise ServiceError(409, "PDM 索引已变化，请刷新后再保存", code="pdm_changed")
                if len(parsed.tables) != int(pdm_row["table_count"]) or parsed.field_count != int(pdm_row["field_count"]):
                    raise ServiceError(422, "保存校验失败：表或字段数量发生了意外变化", code="validation_failed")
                os.replace(temp, path)
                after_hash = parsed.source_hash
                with self.database.transaction() as connection:
                    self._update_saved_table_index(
                        connection,
                        detail,
                        path,
                        parsed,
                    )
                    connection.execute(
                        """
                        INSERT INTO save_history(
                            id, pdm_id, project_id, relative_path, backup_path,
                            before_hash, after_hash, saved_at
                        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(uuid.uuid4()),
                            detail["pdm_id"],
                            detail["project_id"],
                            detail["relative_path"],
                            str(backup),
                            current_hash,
                            after_hash,
                            utc_now(),
                        ),
                    )
            finally:
                if temp.exists():
                    temp.unlink()
            return self.table_detail(table_id)
