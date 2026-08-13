from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from backend.app.backup import BackupFormatError, inspect_backup_archive
from backend.app.ai_history import AiConversationService
from backend.app.config import AppPaths, SettingsStore
from backend.app.database import Database
from backend.app.pdm import file_sha256, parse_pdm
from backend.app.service import WorkspaceService
from backend.tests.test_pdm import write_sample


def make_service(tmp_path: Path) -> WorkspaceService:
    paths = AppPaths(
        app_data=tmp_path / "app-data",
        database=tmp_path / "app-data" / "maxiong.db",
        settings=tmp_path / "app-data" / "settings.json",
    )
    paths.app_data.mkdir(parents=True)
    database = Database(paths.database)
    database.initialize()
    return WorkspaceService(database, SettingsStore(paths))


def test_workspace_import_search_edit_move_and_restore(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    source = write_sample(tmp_path / "源文件.pdm")
    original_hash = file_sha256(source)
    project = service.create_project("数据标准")
    project_id = str(project["id"])
    service.create_folder(project_id, "", "核心模型")

    result = service.import_staged_files(
        project_id,
        "核心模型",
        [(source.name, source)],
        overwrite=False,
    )

    assert result["errors"] == []
    assert result["imported"][0]["table_count"] == 1
    assert file_sha256(source) == original_hash
    copied = Path(project["root_path"]) / "核心模型" / source.name
    assert copied.exists()

    table_result = service.search_tables(
        project_id=project_id,
        scope_type="project",
        scope_path="",
        mode="table",
        query="用户",
        all_nodes=False,
        limit=100,
        offset=0,
    )
    assert table_result["total"] == 1
    assert table_result["field_total"] == 2
    assert table_result["pdm_total"] == 1
    field_result = service.search_tables(
        project_id=project_id,
        scope_type="folder",
        scope_path="核心模型",
        mode="field",
        query="user_name",
        all_nodes=False,
        limit=100,
        offset=0,
    )
    assert field_result["total"] == 1

    table_id = str(table_result["items"][0]["id"])
    detail = service.table_detail(table_id)
    fields = detail["fields"]
    fields[1]["comment"] = "码熊修订的字段备注"
    saved = service.save_table_fields(table_id, str(detail["source_hash"]), fields)
    assert saved["fields"][1]["comment"] == "码熊修订的字段备注"
    assert parse_pdm(copied).tables[0].fields[1].comment == "码熊修订的字段备注"
    assert file_sha256(source) == original_hash
    backup_root = Path(project["root_path"]).parent / ".码熊备份"
    assert len(list(backup_root.rglob("*.pdm"))) == 1

    renamed = service.rename_node(project_id, "核心模型/源文件.pdm", "用户模型")
    assert renamed["relative_path"] == "核心模型/用户模型.pdm"
    service.create_folder(project_id, "", "归档")
    moved = service.move_node(project_id, "核心模型/用户模型.pdm", "归档")
    assert moved["relative_path"] == "归档/用户模型.pdm"
    tree = service.project_tree(project_id)
    assert tree["pdm_count"] == 1

    trashed = service.trash_node(project_id, "归档/用户模型.pdm")
    assert service.search_tables(
        project_id=project_id,
        scope_type="project",
        scope_path="",
        mode="table",
        query="",
        all_nodes=False,
        limit=100,
        offset=0,
    )["total"] == 0
    restored = service.restore_trash(str(trashed["trash_id"]))
    assert restored["project_id"] == project_id
    assert (Path(project["root_path"]) / "归档" / "用户模型.pdm").exists()
    assert service.search_tables(
        project_id=project_id,
        scope_type="project",
        scope_path="",
        mode="table",
        query="",
        all_nodes=False,
        limit=100,
        offset=0,
    )["total"] == 1


def test_table_search_paginates_without_truncating_scope_totals(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    first_source = write_sample(tmp_path / "用户模型_A.pdm")
    second_source = write_sample(tmp_path / "用户模型_B.pdm")
    project = service.create_project("分页测试")
    project_id = str(project["id"])

    result = service.import_staged_files(
        project_id,
        "",
        [(first_source.name, first_source), (second_source.name, second_source)],
        overwrite=False,
    )
    assert result["errors"] == []

    first_page = service.search_tables(
        project_id=project_id,
        scope_type="project",
        scope_path="",
        mode="table",
        query="",
        all_nodes=False,
        limit=1,
        offset=0,
    )
    second_page = service.search_tables(
        project_id=project_id,
        scope_type="project",
        scope_path="",
        mode="table",
        query="",
        all_nodes=False,
        limit=1,
        offset=1,
    )

    assert first_page["total"] == 2
    assert first_page["field_total"] == 4
    assert first_page["pdm_total"] == 2
    assert len(first_page["items"]) == 1
    assert len(second_page["items"]) == 1
    assert first_page["items"][0]["id"] != second_page["items"][0]["id"]
    assert second_page["total"] == first_page["total"]
    assert second_page["field_total"] == first_page["field_total"]
    assert second_page["pdm_total"] == first_page["pdm_total"]

    filtered_page = service.search_tables(
        project_id=project_id,
        scope_type="project",
        scope_path="",
        mode="table",
        query="用户",
        all_nodes=False,
        limit=1,
        offset=0,
    )
    assert filtered_page["total"] == 2
    assert len(filtered_page["items"]) == 1


def test_project_refresh_only_reindexes_changed_files_unless_forced(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    source = write_sample(tmp_path / "增量刷新.pdm")
    project = service.create_project("增量刷新测试")
    project_id = str(project["id"])
    imported = service.import_staged_files(
        project_id,
        "",
        [(source.name, source)],
        overwrite=False,
    )
    assert imported["errors"] == []

    unchanged = service.refresh_project(project_id)
    assert unchanged["indexed"] == 0
    assert unchanged["unchanged"] == 1
    assert unchanged["errors"] == []

    copied = Path(project["root_path"]) / source.name
    content = copied.read_text(encoding="utf-8")
    copied.write_text(
        content.replace("</Model>", "  <!-- changed -->\n</Model>"),
        encoding="utf-8",
        newline="\n",
    )

    changed = service.refresh_project(project_id)
    assert changed["indexed"] == 1
    assert changed["unchanged"] == 0
    assert changed["errors"] == []

    unchanged_again = service.refresh_project(project_id)
    assert unchanged_again["indexed"] == 0
    assert unchanged_again["unchanged"] == 1

    forced = service.refresh_project(project_id, force=True)
    assert forced["indexed"] == 1
    assert forced["unchanged"] == 0
    assert forced["errors"] == []


def test_selective_backup_export_import_and_conflict_policies(tmp_path: Path) -> None:
    source_service = make_service(tmp_path / "source")
    AiConversationService(source_service.database).create_conversation(
        {
            "id": "private-question",
            "role": "user",
            "content": "这条 AI 对话不能进入项目备份",
            "payload": {},
        }
    )
    picked = write_sample(tmp_path / "picked.pdm")
    ignored = write_sample(tmp_path / "ignored.pdm")
    source_project = source_service.create_project("备份源项目")
    source_project_id = str(source_project["id"])
    source_service.create_folder(source_project_id, "", "选择范围")
    source_service.create_folder(source_project_id, "选择范围", "空文件夹")
    source_service.create_folder(source_project_id, "", "不导出")
    assert source_service.import_staged_files(
        source_project_id,
        "选择范围",
        [(picked.name, picked)],
        overwrite=False,
    )["errors"] == []
    assert source_service.import_staged_files(
        source_project_id,
        "不导出",
        [(ignored.name, ignored)],
        overwrite=False,
    )["errors"] == []

    archive_path, archive_name = source_service.export_backup(
        [
            {
                "project_id": source_project_id,
                "type": "folder",
                "relative_path": "选择范围",
            }
        ]
    )
    assert archive_name.endswith(".cbbak")
    manifest = inspect_backup_archive(archive_path)
    with zipfile.ZipFile(archive_path) as archive:
        archived_names = archive.namelist()
    assert all("maxiong.db" not in name and "ai_conversation" not in name for name in archived_names)
    paths = {(entry["type"], entry["path"]) for entry in manifest["projects"][0]["entries"]}
    assert ("folder", "选择范围") in paths
    assert ("folder", "选择范围/空文件夹") in paths
    assert ("pdm", "选择范围/picked.pdm") in paths
    assert all(not path.startswith("不导出") for _, path in paths)

    target_service = make_service(tmp_path / "target")
    inspection = target_service.stage_backup_file(archive_path, archive_name)
    project_key = str(inspection["projects"][0]["key"])
    selections = [{"project_key": project_key, "type": "project", "relative_path": ""}]

    first = target_service.import_backup(inspection["token"], selections, "rename")
    assert len(first["imported"]) == 1
    assert first["renamed"] == []
    imported_project = next(
        project for project in target_service.list_projects() if project["name"] == "备份源项目"
    )
    imported_root = Path(imported_project["root_path"])
    assert (imported_root / "选择范围" / "picked.pdm").is_file()
    assert (imported_root / "选择范围" / "空文件夹").is_dir()
    assert not (imported_root / "不导出").exists()

    renamed = target_service.import_backup(inspection["token"], selections, "rename")
    assert len(renamed["renamed"]) == 1
    assert (imported_root / "选择范围" / "picked (导入).pdm").is_file()

    skipped = target_service.import_backup(inspection["token"], selections, "skip")
    assert skipped["imported"] == []
    assert len(skipped["skipped"]) == 1

    overwritten_target = imported_root / "选择范围" / "picked.pdm"
    overwritten_target.write_text("damaged", encoding="utf-8")
    overwritten = target_service.import_backup(inspection["token"], selections, "overwrite")
    assert len(overwritten["imported"]) == 1
    assert parse_pdm(overwritten_target).tables[0].code == "t_user"


def test_legacy_data_migration_can_import_a_single_pdm(tmp_path: Path) -> None:
    legacy_data = tmp_path / "CodeBear-v0.2.1-win-x64" / "data"
    legacy_project = legacy_data / "workspace" / "旧版项目"
    (legacy_project / "子目录").mkdir(parents=True)
    source = write_sample(legacy_project / "子目录" / "旧版模型.pdm")
    assert source.is_file()
    (legacy_project / "不选择").mkdir()
    write_sample(legacy_project / "不选择" / "其他模型.pdm")

    service = make_service(tmp_path / "current")
    inspection = service.stage_legacy_data(str(legacy_data))
    assert inspection["source_type"] == "legacy"
    project = inspection["projects"][0]
    result = service.import_backup(
        inspection["token"],
        [
            {
                "project_key": project["key"],
                "type": "pdm",
                "relative_path": "子目录/旧版模型.pdm",
            }
        ],
        "rename",
    )
    assert len(result["imported"]) == 1
    imported_project = service.list_projects()[0]
    imported_root = Path(imported_project["root_path"])
    assert (imported_root / "子目录" / "旧版模型.pdm").is_file()
    assert not (imported_root / "不选择" / "其他模型.pdm").exists()


def test_backup_rejects_archive_path_traversal(tmp_path: Path) -> None:
    archive_path = tmp_path / "malicious.cbbak"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("../escape.pdm", "malicious")

    with pytest.raises(BackupFormatError, match="备份边界"):
        inspect_backup_archive(archive_path)


def test_backup_rejects_internal_workspace_paths(tmp_path: Path) -> None:
    archive_path = tmp_path / "internal-path.cbbak"
    manifest = {
        "format": "codebear-backup",
        "format_version": 1,
        "app_version": "0.4.0",
        "created_at": "2026-08-11T00:00:00+00:00",
        "projects": [
            {
                "key": "project-1",
                "name": "测试项目",
                "entries": [{"type": "folder", "path": ".码熊备份"}],
            }
        ],
    }
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))

    with pytest.raises(BackupFormatError, match="Windows 不允许"):
        inspect_backup_archive(archive_path)


