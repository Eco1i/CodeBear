from __future__ import annotations

from pathlib import Path

from backend.app.config import AppPaths, SettingsStore
from backend.app.database import Database
from backend.app.ddl import MYSQL_CHARACTER_SETS, MYSQL_COLLATIONS, generate_ddl
from backend.app.service import WorkspaceService
from backend.tests.test_pdm import write_sample


def sample_table() -> dict:
    return {
        "id": "table-1",
        "ordinal": 0,
        "name": "商品信息表",
        "code": "T_PRODUCT",
        "comment": "商品基础信息",
        "fields": [
            {
                "id": "field-1",
                "code": "PRODUCT_ID",
                "name": "商品编号",
                "comment": "全局唯一商品编号",
                "data_type": "NUMBER",
                "length": "20",
                "nullable": False,
                "default_value": "",
                "is_primary_key": True,
            },
            {
                "id": "field-2",
                "code": "PRODUCT_NAME",
                "name": "商品名称",
                "comment": "",
                "data_type": "VARCHAR2",
                "length": "64",
                "nullable": False,
                "default_value": "'未命名'",
                "is_primary_key": False,
            },
            {
                "id": "field-3",
                "code": "CREATED_AT",
                "name": "创建时间",
                "comment": "",
                "data_type": "DATE",
                "length": "",
                "nullable": True,
                "default_value": "",
                "is_primary_key": False,
            },
            {
                "id": "field-4",
                "code": "EXT_VALUE",
                "name": "扩展值",
                "comment": "",
                "data_type": "未知业务类型",
                "length": "",
                "nullable": True,
                "default_value": "",
                "is_primary_key": False,
            },
        ],
    }


def base_config(database: str, version: str) -> dict:
    return {
        "database": database,
        "version": version,
        "schema": "demo",
        "include_comments": True,
        "drop_table": True,
        "if_not_exists": True,
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collation": "utf8mb4_0900_ai_ci",
        "tdsql_mode": "shard",
        "ignite_template": "PARTITIONED",
        "ignite_backups": 1,
        "ignite_atomicity": "TRANSACTIONAL",
        "ignite_write_sync": "FULL_SYNC",
        "ignite_cache_group": "CATALOG",
        "ignite_affinity_key": True,
    }


def test_mysql_character_set_catalog_is_complete_for_8_x() -> None:
    values = {str(item["value"]) for item in MYSQL_CHARACTER_SETS}
    assert len(values) == 41
    assert {
        "armscii8",
        "big5",
        "binary",
        "cp932",
        "eucjpms",
        "gb18030",
        "gb2312",
        "gbk",
        "utf8mb3",
        "utf8mb4",
        "utf16le",
        "utf32",
    } <= values

    collations = {str(item["value"]): str(item["charset"]) for item in MYSQL_COLLATIONS}
    assert len(collations) == 286
    assert sum(charset == "utf8mb4" for charset in collations.values()) == 89
    assert collations["utf8mb4_0900_bin"] == "utf8mb4"


def test_generate_mysql_ddl_maps_types_comments_and_options() -> None:
    config = base_config("mysql", "8.0")
    config["charset"] = "gb18030"
    config["collation"] = "gb18030_bin"
    result = generate_ddl([sample_table()], config)

    assert "DROP TABLE IF EXISTS `demo`.`T_PRODUCT`;" in result["script"]
    assert "`PRODUCT_ID` DECIMAL(20) NOT NULL" in result["script"]
    assert "`PRODUCT_NAME` VARCHAR(64) NOT NULL DEFAULT '未命名' COMMENT '商品名称'" in result["script"]
    assert "`CREATED_AT` DATETIME" in result["script"]
    assert "ENGINE=InnoDB DEFAULT CHARSET=gb18030 COLLATE=gb18030_bin" in result["script"]
    assert "PRIMARY KEY (`PRODUCT_ID`)" in result["script"]
    assert any(warning["code"] == "unknown_type" for warning in result["warnings"])


def test_generate_mysql_ddl_rejects_collation_from_another_character_set() -> None:
    config = base_config("mysql", "8.0")
    config["charset"] = "gb18030"
    config["collation"] = "utf8mb4_0900_bin"

    result = generate_ddl([sample_table()], config)

    assert "DEFAULT CHARSET=gb18030 COLLATE=gb18030_chinese_ci" in result["script"]
    assert any(warning["code"] == "invalid_collation" for warning in result["warnings"])


def test_generate_oracle_and_dameng_comments() -> None:
    oracle = generate_ddl([sample_table()], base_config("oracle", "19c"))
    assert '"PRODUCT_ID" NUMBER(20) NOT NULL' in oracle["script"]
    assert '"PRODUCT_NAME" VARCHAR2(64)' in oracle["script"]
    assert "EXECUTE IMMEDIATE 'DROP TABLE \"demo\".\"T_PRODUCT\" CASCADE CONSTRAINTS'" in oracle["script"]
    assert 'COMMENT ON TABLE "demo"."T_PRODUCT" IS \'商品基础信息\';' in oracle["script"]
    assert 'COMMENT ON COLUMN "demo"."T_PRODUCT"."PRODUCT_NAME" IS \'商品名称\';' in oracle["script"]

    dameng = generate_ddl([sample_table()], base_config("dameng", "DM8"))
    assert 'DROP TABLE IF EXISTS "demo"."T_PRODUCT";' in dameng["script"]
    assert '"PRODUCT_NAME" VARCHAR(64)' in dameng["script"]
    assert 'COMMENT ON TABLE "demo"."T_PRODUCT"' in dameng["script"]


def test_generate_tdsql_modes_and_ignite_cache_options() -> None:
    shard = generate_ddl([sample_table()], base_config("tdsql", "8.0"))
    assert "ENGINE=InnoDB" in shard["script"]
    assert "SHARDKEY=`PRODUCT_ID`;" in shard["script"]

    broadcast_config = base_config("tdsql", "5.7")
    broadcast_config["tdsql_mode"] = "broadcast"
    broadcast = generate_ddl([sample_table()], broadcast_config)
    assert "SHARDKEY=noshardkey_allset;" in broadcast["script"]

    ignite = generate_ddl([sample_table()], base_config("ignite", "2.15"))
    assert 'CREATE TABLE IF NOT EXISTS "demo"."T_PRODUCT"' in ignite["script"]
    assert 'WITH "TEMPLATE=PARTITIONED,BACKUPS=1,ATOMICITY=TRANSACTIONAL' in ignite["script"]
    assert "CACHE_GROUP=CATALOG" in ignite["script"]
    assert "AFFINITY_KEY=PRODUCT_ID" in ignite["script"]
    assert any(warning["code"] == "ignite_comments_not_persisted" for warning in ignite["warnings"])


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


def test_workspace_ddl_catalog_and_generation_use_indexed_tables(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    source = write_sample(tmp_path / "用户模型.pdm")
    project = service.create_project("DDL 测试")
    project_id = str(project["id"])
    service.import_staged_files(project_id, "", [(source.name, source)], overwrite=False)

    catalog = service.ddl_catalog(project_id)
    assert catalog["table_count"] == 1
    assert catalog["field_count"] == 2
    assert catalog["groups"][0]["file_name"] == "用户模型.pdm"
    table_id = str(catalog["groups"][0]["tables"][0]["id"])

    result = service.generate_ddl([table_id], base_config("mysql", "8.4"))
    assert result["table_count"] == 1
    assert "`t_user`" in result["script"]
    assert "`user_name` VARCHAR(64)" in result["script"]


def test_workspace_ddl_catalog_supports_lazy_groups_and_submitted_search(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    source = write_sample(tmp_path / "用户模型.pdm")
    project = service.create_project("DDL 懒加载测试")
    project_id = str(project["id"])
    service.import_staged_files(project_id, "", [(source.name, source)], overwrite=False)

    summary = service.ddl_catalog(project_id, include_tables=False)
    assert summary["table_count"] == 1
    assert summary["field_count"] == 2
    assert summary["groups"][0]["tables_loaded"] is False
    assert summary["groups"][0]["tables"] == []

    pdm_id = str(summary["groups"][0]["id"])
    hydrated = service.ddl_catalog(project_id, pdm_ids=[pdm_id])
    assert hydrated["groups"][0]["tables_loaded"] is True
    assert len(hydrated["groups"][0]["tables"]) == 1

    matched = service.ddl_catalog(project_id, query="t_user")
    assert matched["table_count"] == 1
    assert matched["groups"][0]["tables"][0]["code"] == "t_user"
    assert service.ddl_catalog(project_id, query="not-present")["groups"] == []
