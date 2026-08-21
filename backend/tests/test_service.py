from __future__ import annotations

import hashlib
import json
import os
import zipfile
from pathlib import Path

import pytest

from backend.app.backup import BackupFormatError, inspect_backup_archive
from backend.app.ai_history import AiConversationService
from backend.app.config import AppPaths, SettingsStore
from backend.app.database import Database
from backend.app.pdm import file_sha256, parse_pdm
from backend.app.service import ServiceError, WorkspaceService
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
    saved = service.save_table_fields(
        table_id,
        str(detail["source_hash"]),
        fields,
        table={
            "name": "账户用户表",
            "code": "t_account_user",
            "comment": "码熊修订的表描述",
        },
    )
    assert saved["name"] == "账户用户表"
    assert saved["code"] == "t_account_user"
    assert saved["comment"] == "码熊修订的表描述"
    assert saved["fields"][1]["comment"] == "码熊修订的字段备注"
    parsed_table = parse_pdm(copied).tables[0]
    assert (parsed_table.name, parsed_table.code, parsed_table.comment) == (
        "账户用户表",
        "t_account_user",
        "码熊修订的表描述",
    )
    assert parsed_table.fields[1].comment == "码熊修订的字段备注"
    assert service.search_tables(
        project_id=project_id,
        scope_type="project",
        scope_path="",
        mode="table",
        query="修订的表描述",
        all_nodes=False,
        limit=100,
        offset=0,
    )["total"] == 1
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


def test_dictionary_save_updates_only_the_changed_table_index(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = make_service(tmp_path)
    source = write_sample(tmp_path / "局部索引更新.pdm")
    project = service.create_project("局部索引更新测试")
    project_id = str(project["id"])
    service.import_staged_files(
        project_id,
        "",
        [(source.name, source)],
        overwrite=False,
    )
    table = service.search_tables(
        project_id=project_id,
        scope_type="project",
        scope_path="",
        mode="table",
        query="t_user",
        all_nodes=False,
        limit=100,
        offset=0,
    )["items"][0]
    detail = service.table_detail(str(table["id"]))
    detail["fields"][1]["comment"] = "仅更新当前字段索引"

    def reject_full_reindex(*_args, **_kwargs):
        pytest.fail("保存单张表时不应重新索引整份 PDM")

    monkeypatch.setattr(service, "_index_parsed", reject_full_reindex)
    saved = service.save_table_fields(
        str(detail["id"]),
        str(detail["source_hash"]),
        detail["fields"],
        table={
            "name": detail["name"],
            "code": detail["code"],
            "comment": detail["comment"],
        },
    )

    assert saved["fields"][1]["comment"] == "仅更新当前字段索引"
    assert service.search_tables(
        project_id=project_id,
        scope_type="project",
        scope_path="",
        mode="field",
        query="当前字段索引",
        all_nodes=False,
        limit=100,
        offset=0,
    )["total"] == 1

    service.save_table_fields(
        str(saved["id"]),
        str(saved["source_hash"]),
        saved["fields"],
        table={
            "name": saved["name"],
            "code": saved["code"],
            "comment": saved["comment"],
        },
    )
    with service.database.connect() as connection:
        history_count = int(connection.execute("SELECT COUNT(*) FROM save_history").fetchone()[0])
    assert history_count == 1


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


def test_fts_search_supports_chinese_codes_incremental_updates_and_like_fallback(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    source = write_sample(tmp_path / "全文检索.pdm")
    project = service.create_project("全文检索测试")
    project_id = str(project["id"])
    imported = service.import_staged_files(
        project_id,
        "",
        [(source.name, source)],
        overwrite=False,
    )
    assert imported["errors"] == []
    assert service.database.fts_available is True

    def search(mode: str, query: str) -> dict:
        return service.search_tables(
            project_id=project_id,
            scope_type="project",
            scope_path="",
            mode=mode,
            query=query,
            all_nodes=False,
            limit=100,
            offset=0,
        )

    assert search("table", "系统用户")["total"] == 1
    assert search("field", "用户编号")["total"] == 1
    assert search("field", "user_name")["total"] == 1
    assert search("table", "用户")["total"] == 1

    table = search("table", "系统用户")["items"][0]
    detail = service.table_detail(str(table["id"]))
    detail["fields"][1]["comment"] = "唯一登录名称"
    service.save_table_fields(str(table["id"]), str(detail["source_hash"]), detail["fields"])
    assert search("field", "登录名称")["total"] == 1

    service.database.fts_available = False
    assert search("field", "登录名称")["total"] == 1


def test_field_fts_search_uses_one_uncorrelated_index_scan(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = make_service(tmp_path)
    source = write_sample(tmp_path / "字段查询计划.pdm")
    project = service.create_project("字段查询计划测试")
    project_id = str(project["id"])
    service.import_staged_files(
        project_id,
        "",
        [(source.name, source)],
        overwrite=False,
    )

    statements: list[str] = []
    original_connect = service.database.connect

    def traced_connect():
        connection = original_connect()
        connection.set_trace_callback(statements.append)
        return connection

    monkeypatch.setattr(service.database, "connect", traced_connect)
    result = service.search_tables(
        project_id=project_id,
        scope_type="project",
        scope_path="",
        mode="field",
        query="user_name",
        all_nodes=False,
        limit=100,
        offset=0,
    )

    assert result["total"] == 1
    search_statements = [
        statement
        for statement in statements
        if "FROM model_tables t" in statement and "model_fields_fts MATCH" in statement
    ]
    assert len(search_statements) == 2
    assert all("t.id IN" in statement for statement in search_statements)

    with original_connect() as connection:
        for statement in search_statements:
            plan = connection.execute(f"EXPLAIN QUERY PLAN {statement}").fetchall()
            details = [str(row[3]) for row in plan]
            assert any("model_fields_fts" in detail for detail in details)
            assert all("CORRELATED" not in detail.upper() for detail in details)


def test_fts_index_rebuilds_when_out_of_sync_or_its_version_changes(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    source = write_sample(tmp_path / "索引重建.pdm")
    project = service.create_project("索引重建测试")
    service.import_staged_files(
        str(project["id"]),
        "",
        [(source.name, source)],
        overwrite=False,
    )

    with service.database.connect() as connection:
        connection.execute("INSERT INTO model_tables_fts(model_tables_fts) VALUES('delete-all')")

    database = Database(service.database.path)
    database.initialize()

    assert database.fts_available is True

    def indexed_table_count() -> int:
        with database.connect() as connection:
            return int(connection.execute(
                "SELECT COUNT(*) FROM model_tables_fts WHERE model_tables_fts MATCH ?",
                ('"系统用户"',),
            ).fetchone()[0])

    assert indexed_table_count() == 1
    with database.connect() as connection:
        connection.execute("INSERT INTO model_tables_fts(model_tables_fts) VALUES('delete-all')")
        connection.execute("UPDATE app_metadata SET value = 'outdated' WHERE key = 'fts_index_version'")

    database.initialize()
    assert indexed_table_count() == 1


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

    # 强制刷新：内容未变化时跳过重建，不产生行级重建
    forced = service.refresh_project(project_id, force=True)
    assert forced["indexed"] == 0
    assert forced["skipped"] == 1
    assert forced["unchanged"] == 0
    assert forced["errors"] == []

    # 内容变化但字节数相同并恢复修改时间：普通刷新按 mtime 跳过，强制刷新按内容哈希重建
    original_stat = copied.stat()
    current_content = copied.read_text(encoding="utf-8")
    copied.write_text(
        current_content.replace("保存系统用户", "保存系统甲户"),
        encoding="utf-8",
        newline="\n",
    )
    os.utime(copied, ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns))

    hidden_change = service.refresh_project(project_id)
    assert hidden_change["indexed"] == 0
    assert hidden_change["unchanged"] == 1

    forced_change = service.refresh_project(project_id, force=True)
    assert forced_change["indexed"] == 1
    assert forced_change["skipped"] == 0
    assert forced_change["errors"] == []


def test_force_refresh_reports_progress(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    source = write_sample(tmp_path / "进度样本.pdm")
    project = service.create_project("进度测试")
    project_id = str(project["id"])
    imported = service.import_staged_files(project_id, "", [(source.name, source)], overwrite=False)
    assert imported["errors"] == []

    events: list[tuple[int, int, str]] = []
    result = service.refresh_project(
        project_id,
        force=True,
        progress=lambda processed, total, current: events.append((processed, total, current)),
    )
    assert result["pdm_count"] == 1
    assert events and events[-1][0] == events[-1][1] == 1
    assert events[-1][2].endswith(".pdm")


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
    overwritten_search = target_service.search_tables(
        project_id=str(imported_project["id"]),
        scope_type="project",
        scope_path="",
        mode="table",
        query="系统用户",
        all_nodes=False,
        limit=100,
        offset=0,
    )
    assert overwritten_search["total"] == 2


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


def test_backup_batch_import_rebuilds_fts_and_restores_incremental_triggers(tmp_path: Path) -> None:
    source_service = make_service(tmp_path / "source")
    source = write_sample(tmp_path / "batch-source.pdm")
    source_project = source_service.create_project("批量导入项目")
    source_project_id = str(source_project["id"])
    source_service.import_staged_files(
        source_project_id,
        "",
        [(source.name, source)],
        overwrite=False,
    )
    archive_path, archive_name = source_service.export_backup(
        [{"project_id": source_project_id, "type": "project", "relative_path": ""}]
    )

    target_service = make_service(tmp_path / "target")
    existing_source = write_sample(tmp_path / "existing.pdm")
    existing_project = target_service.create_project("既有项目")
    existing_project_id = str(existing_project["id"])
    target_service.import_staged_files(
        existing_project_id,
        "",
        [(existing_source.name, existing_source)],
        overwrite=False,
    )
    inspection = target_service.stage_backup_file(archive_path, archive_name)
    project_key = str(inspection["projects"][0]["key"])
    result = target_service.import_backup(
        inspection["token"],
        [{"project_key": project_key, "type": "project", "relative_path": ""}],
        "rename",
    )

    assert len(result["imported"]) == 1
    imported_project = next(
        project for project in target_service.list_projects() if project["name"] == "批量导入项目"
    )
    search = target_service.search_tables(
        project_id=str(imported_project["id"]),
        scope_type="project",
        scope_path="",
        mode="field",
        query="user_name",
        all_nodes=False,
        limit=100,
        offset=0,
    )
    assert search["total"] == 1
    existing_search = target_service.search_tables(
        project_id=existing_project_id,
        scope_type="project",
        scope_path="",
        mode="table",
        query="系统用户",
        all_nodes=False,
        limit=100,
        offset=0,
    )
    assert existing_search["total"] == 1
    detail = target_service.table_detail(str(search["items"][0]["id"]))
    detail["fields"][1]["comment"] = "批量导入后增量更新"
    target_service.save_table_fields(
        str(search["items"][0]["id"]),
        str(detail["source_hash"]),
        detail["fields"],
    )
    updated_search = target_service.search_tables(
        project_id=str(imported_project["id"]),
        scope_type="project",
        scope_path="",
        mode="field",
        query="增量更新",
        all_nodes=False,
        limit=100,
        offset=0,
    )
    assert updated_search["total"] == 1
    with target_service.database.connect() as connection:
        connection.execute("INSERT INTO model_tables_fts(model_tables_fts, rank) VALUES('integrity-check', 1)")
        connection.execute("INSERT INTO model_fields_fts(model_fields_fts, rank) VALUES('integrity-check', 1)")
        table_count = int(connection.execute("SELECT COUNT(*) FROM model_tables").fetchone()[0])
        table_fts_count = int(connection.execute("SELECT COUNT(*) FROM model_tables_fts").fetchone()[0])
        field_count = int(connection.execute("SELECT COUNT(*) FROM model_fields").fetchone()[0])
        field_fts_count = int(connection.execute("SELECT COUNT(*) FROM model_fields_fts").fetchone()[0])
        trigger_count = int(connection.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'model_%_fts_%'"
        ).fetchone()[0])
    assert table_fts_count == table_count
    assert field_fts_count == field_count
    assert trigger_count == 6


def test_backup_batch_import_rolls_back_files_database_and_fts_triggers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_service = make_service(tmp_path / "source")
    source = write_sample(tmp_path / "rollback-source.pdm")
    source_project = source_service.create_project("回滚验证项目")
    source_project_id = str(source_project["id"])
    source_service.import_staged_files(
        source_project_id,
        "",
        [(source.name, source)],
        overwrite=False,
    )
    archive_path, archive_name = source_service.export_backup(
        [{"project_id": source_project_id, "type": "project", "relative_path": ""}]
    )

    target_service = make_service(tmp_path / "target")
    inspection = target_service.stage_backup_file(archive_path, archive_name)
    project_key = str(inspection["projects"][0]["key"])

    def fail_index(*args: object, **kwargs: object) -> str:
        raise RuntimeError("模拟批量索引失败")

    monkeypatch.setattr(target_service, "_index_parsed", fail_index)
    with pytest.raises(ServiceError, match="导入备份失败") as exc_info:
        target_service.import_backup(
            inspection["token"],
            [{"project_key": project_key, "type": "project", "relative_path": ""}],
            "rename",
        )
    assert exc_info.value.code == "backup_import_failed"

    assert target_service.list_projects() == []
    assert not (target_service.workspace_root / "回滚验证项目").exists()
    with target_service.database.connect() as connection:
        assert int(connection.execute("SELECT COUNT(*) FROM pdm_files").fetchone()[0]) == 0
        assert int(connection.execute("SELECT COUNT(*) FROM model_tables").fetchone()[0]) == 0
        assert int(connection.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'model_%_fts_%'"
        ).fetchone()[0]) == 6


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

    with pytest.raises(BackupFormatError, match="跨平台备份不支持"):
        inspect_backup_archive(archive_path)


def test_import_error_messages_do_not_leak_exception_details(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    project = service.create_project("异常样本")
    malformed = tmp_path / "坏文件.pdm"
    malformed.write_text("<Model><unclosed>", encoding="utf-8")
    result = service.import_staged_files(
        str(project["id"]),
        "",
        [(malformed.name, malformed)],
        overwrite=False,
    )
    assert [item["name"] for item in result["errors"]] == ["坏文件.pdm"]
    assert result["errors"][0]["error"] == "PDM 解析失败"


def test_backup_import_parse_errors_are_generic(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    malformed = b"<Model><unclosed>"
    digest = hashlib.sha256(malformed).hexdigest()
    manifest = {
        "format": "codebear-backup",
        "format_version": 1,
        "app_version": "1.1.1",
        "created_at": "2026-08-15T00:00:00+00:00",
        "projects": [
            {
                "key": "project-1",
                "name": "异常项目",
                "entries": [
                    {
                        "type": "pdm",
                        "path": "坏文件.pdm",
                        "archive_path": "content/0/坏文件.pdm",
                        "size": len(malformed),
                        "sha256": digest,
                    }
                ],
            }
        ],
    }
    archive_path = tmp_path / "坏备份.cbbak"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
        archive.writestr("content/0/坏文件.pdm", malformed)

    inspection = service.stage_backup_file(archive_path, archive_path.name)
    project_key = str(inspection["projects"][0]["key"])
    result = service.import_backup(
        inspection["token"],
        [{"project_key": project_key, "type": "project", "relative_path": ""}],
        "rename",
    )
    assert result["parse_errors"][0]["relative_path"] == "坏文件.pdm"
    assert result["parse_errors"][0]["error"] == "PDM 解析失败"
    serialized = json.dumps(result, ensure_ascii=False)
    assert "unclosed" not in serialized
