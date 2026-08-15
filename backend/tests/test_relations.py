from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.backup import extract_relation_payload, inspect_backup_archive
from backend.app.config import AppPaths, SettingsStore
from backend.app.database import Database
from backend.app.service import ServiceError, WorkspaceService

RELATION_SAMPLE_PDM = """<?xml version="1.0" encoding="UTF-8"?>
<?PowerDesigner Name="关系测试模型" Target="ORACLE Version 11g" version="15.1.0.2850"?>
<Model xmlns:a="attribute" xmlns:c="collection" xmlns:o="object">
  <o:RootObject Id="o1">
    <c:Children>
      <o:Model Id="o2">
        <a:Name>关系测试模型</a:Name>
        <c:Tables>
          <o:Table Id="o10">
            <a:Name>订单表</a:Name>
            <a:Code>t_order</a:Code>
            <a:Comment>订单主表</a:Comment>
            <c:Columns>
              <o:Column Id="o11"><a:Name>订单编号</a:Name><a:Code>order_id</a:Code><a:DataType>NUMBER(20)</a:DataType><a:Length>20</a:Length><a:Mandatory>1</a:Mandatory></o:Column>
              <o:Column Id="o12"><a:Name>订单金额</a:Name><a:Code>order_amount</a:Code><a:DataType>NUMBER(18,2)</a:DataType></o:Column>
            </c:Columns>
            <c:Keys><o:Key Id="o13"><c:Key.Columns><o:Column Ref="o11" /></c:Key.Columns></o:Key></c:Keys>
            <c:PrimaryKey><o:Key Ref="o13" /></c:PrimaryKey>
          </o:Table>
          <o:Table Id="o20">
            <a:Name>订单明细表</a:Name>
            <a:Code>t_order_item</a:Code>
            <a:Comment>订单明细</a:Comment>
            <c:Columns>
              <o:Column Id="o21"><a:Name>明细编号</a:Name><a:Code>item_id</a:Code><a:DataType>NUMBER(20)</a:DataType><a:Length>20</a:Length><a:Mandatory>1</a:Mandatory></o:Column>
              <o:Column Id="o22"><a:Name>订单编号</a:Name><a:Code>order_id</a:Code><a:DataType>NUMBER(20)</a:DataType><a:Length>20</a:Length></o:Column>
            </c:Columns>
            <c:Keys><o:Key Id="o23"><c:Key.Columns><o:Column Ref="o21" /></c:Key.Columns></o:Key></c:Keys>
            <c:PrimaryKey><o:Key Ref="o23" /></c:PrimaryKey>
          </o:Table>
        </c:Tables>
        <c:References>
          <o:Reference Id="o30">
            <a:Name>推断外键 T_ORDER_ITEM.ORDER_ID -&gt; T_ORDER.ORDER_ID</a:Name>
            <a:Code>FK_ITEM_ORDER</a:Code>
            <a:Cardinality>1..n</a:Cardinality>
            <c:ParentTable><o:Table Ref="o10" /></c:ParentTable>
            <c:ChildTable><o:Table Ref="o20" /></c:ChildTable>
            <c:Joins>
              <o:ReferenceJoin Id="o31">
                <c:Object1><o:Column Ref="o11" /></c:Object1>
                <c:Object2><o:Column Ref="o22" /></c:Object2>
              </o:ReferenceJoin>
            </c:Joins>
          </o:Reference>
        </c:References>
      </o:Model>
    </c:Children>
  </o:RootObject>
</Model>
"""


def write_relation_sample(path: Path) -> Path:
    path.write_text(RELATION_SAMPLE_PDM, encoding="utf-8", newline="\n")
    return path


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


def import_sample(service: WorkspaceService, tmp_path: Path) -> tuple[dict, dict]:
    source = write_relation_sample(tmp_path / "关系样本.pdm")
    project = service.create_project("关系测试")
    result = service.import_staged_files(str(project["id"]), "", [(source.name, source)], overwrite=False)
    assert result["errors"] == []
    tables = service.search_tables(
        project_id=str(project["id"]),
        scope_type="project",
        scope_path="",
        mode="table",
        query="",
        all_nodes=False,
        limit=100,
        offset=0,
    )["items"]
    by_code = {str(item["code"]): item for item in tables}
    return by_code["t_order"], by_code["t_order_item"]


def test_pdm_reference_parsed_as_auto_relation(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    order, order_item = import_sample(service, tmp_path)
    relations = service.list_table_relations(str(order_item["id"]))
    assert len(relations["incoming"]) == 0
    assert len(relations["outgoing"]) == 1
    relation = relations["outgoing"][0]
    assert relation["source_type"] == "auto"
    assert relation["name"] == "FK_ITEM_ORDER"
    assert relation["cardinality"] == "1..n"
    assert relation["source_table"]["code"] == "t_order_item"
    assert relation["source_field"]["code"] == "order_id"
    assert relation["target_table"]["code"] == "t_order"
    assert relation["target_field"]["code"] == "order_id"
    order_relations = service.list_table_relations(str(order["id"]))
    assert order_relations["incoming"][0]["name"] == "FK_ITEM_ORDER"


def test_manual_relation_crud_and_validation(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    order, order_item = import_sample(service, tmp_path)
    detail = service.table_detail(str(order_item["id"]))
    order_fields = service.table_detail(str(order["id"]))["fields"]
    order_amount_id = str(order_fields[1]["id"])
    created = service.create_relation(
        source_table_id=str(order_item["id"]),
        source_field_id=str(detail["fields"][0]["id"]),
        target_table_id=str(order["id"]),
        target_field_id=order_amount_id,
        name="FK_ITEM_AMOUNT",
        cardinality="1..1",
        note="手工补充关系",
    )
    assert created["source_type"] == "manual"
    assert created["cardinality"] == "1..1"

    with pytest.raises(ServiceError) as exc_info:
        service.create_relation(
            source_table_id=str(order_item["id"]),
            source_field_id=str(detail["fields"][0]["id"]),
            target_table_id=str(order["id"]),
            target_field_id=order_amount_id,
            name="重复关系",
            cardinality="",
            note="",
        )
    assert exc_info.value.code == "relation_exists"

    with pytest.raises(ServiceError) as exc_info:
        service.create_relation(
            source_table_id=str(order_item["id"]),
            source_field_id=order_amount_id,  # 属于另一张表
            target_table_id=str(order["id"]),
            target_field_id=str(order_fields[0]["id"]),
            name="错误关系",
            cardinality="",
            note="",
        )
    assert exc_info.value.code == "invalid_relation"

    updated = service.update_relation(str(created["id"]), name="FK_ITEM_AMOUNT_V2", cardinality="n..m", note="更新")
    assert updated["name"] == "FK_ITEM_AMOUNT_V2"
    assert service.delete_relation(str(created["id"])) == {"deleted": True}
    assert service.list_table_relations(str(order_item["id"]))["outgoing"][0]["source_type"] == "auto"


def test_auto_relation_is_readonly(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    _, order_item = import_sample(service, tmp_path)
    relation = service.list_table_relations(str(order_item["id"]))["outgoing"][0]
    with pytest.raises(ServiceError) as exc_info:
        service.update_relation(str(relation["id"]), name="X", cardinality="", note="")
    assert exc_info.value.code == "relation_readonly"
    with pytest.raises(ServiceError) as exc_info:
        service.delete_relation(str(relation["id"]))
    assert exc_info.value.code == "relation_readonly"


def test_refresh_preserves_manual_and_rebuilds_auto(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    order, order_item = import_sample(service, tmp_path)
    order_fields = service.table_detail(str(order["id"]))["fields"]
    manual = service.create_relation(
        source_table_id=str(order_item["id"]),
        source_field_id=str(service.table_detail(str(order_item["id"]))["fields"][1]["id"]),
        target_table_id=str(order["id"]),
        target_field_id=str(order_fields[1]["id"]),
        name="FK_MANUAL",
        cardinality="1..1",
        note="",
    )
    service.refresh_project(str(order["project_id"]), force=True)
    relations = service.list_table_relations(str(order_item["id"]))
    outgoing = {r["name"]: r for r in relations["outgoing"]}
    assert "FK_ITEM_ORDER" in outgoing
    assert outgoing["FK_MANUAL"]["source_type"] == "manual"
    assert outgoing["FK_ITEM_ORDER"]["source_type"] == "auto"
    assert str(manual["id"]) == outgoing["FK_MANUAL"]["id"]


def test_duplicate_reference_pairs_deduped(tmp_path: Path) -> None:
    """同一对 (表, 字段) 在多个 Reference 里重复出现时只保留一条，刷新不报错。"""
    service = make_service(tmp_path)
    dup_block = """          <o:Reference Id="o32">
            <a:Name>重复外键 T_ORDER_ITEM.ORDER_ID -&gt; T_ORDER.ORDER_ID</a:Name>
            <a:Code>FK_ITEM_ORDER_DUP</a:Code>
            <a:Cardinality>1..1</a:Cardinality>
            <c:ParentTable><o:Table Ref="o10" /></c:ParentTable>
            <c:ChildTable><o:Table Ref="o20" /></c:ChildTable>
            <c:Joins>
              <o:ReferenceJoin Id="o33">
                <c:Object1><o:Column Ref="o11" /></c:Object1>
                <c:Object2><o:Column Ref="o22" /></c:Object2>
              </o:ReferenceJoin>
            </c:Joins>
          </o:Reference>
"""
    duplicated = RELATION_SAMPLE_PDM.replace(
        "          </o:Reference>\n        </c:References>",
        "          </o:Reference>\n" + dup_block + "        </c:References>",
    )
    source = tmp_path / "重复关系样本.pdm"
    source.write_text(duplicated, encoding="utf-8", newline="\n")
    project = service.create_project("重复关系测试")
    result = service.import_staged_files(str(project["id"]), "", [(source.name, source)], overwrite=False)
    assert result["errors"] == []
    tables = service.search_tables(
        project_id=str(project["id"]),
        scope_type="project",
        scope_path="",
        mode="table",
        query="",
        all_nodes=False,
        limit=100,
        offset=0,
    )["items"]
    order_item = next(item for item in tables if str(item["code"]) == "t_order_item")
    outgoing = service.list_table_relations(str(order_item["id"]))["outgoing"]
    assert len(outgoing) == 1
    assert outgoing[0]["name"] == "FK_ITEM_ORDER"

    refreshed = service.refresh_project(str(project["id"]), force=True)
    assert refreshed["skipped"] == 1
    assert refreshed["indexed"] == 0
    assert len(service.list_table_relations(str(order_item["id"]))["outgoing"]) == 1


def test_backup_roundtrip_restores_manual_relations(tmp_path: Path) -> None:
    source_service = make_service(tmp_path / "source")
    order, order_item = import_sample(source_service, tmp_path / "source")
    source_service.create_relation(
        source_table_id=str(order_item["id"]),
        source_field_id=str(source_service.table_detail(str(order_item["id"]))["fields"][1]["id"]),
        target_table_id=str(order["id"]),
        target_field_id=str(source_service.table_detail(str(order["id"]))["fields"][1]["id"]),
        name="FK_MANUAL",
        cardinality="1..1",
        note="随备份迁移",
    )
    selections = [{"project_id": str(order["project_id"]), "type": "project", "relative_path": ""}]
    payload = source_service.export_relation_payload(selections)
    assert len(payload["relations"]) == 1
    archive_path, archive_name = source_service.export_backup(selections, relation_payload=payload)
    manifest = inspect_backup_archive(archive_path)
    assert manifest["stats"]["relation_count"] == 1

    target_service = make_service(tmp_path / "target")
    inspection = target_service.stage_backup_file(archive_path, archive_name)
    project_key = str(inspection["projects"][0]["key"])
    result = target_service.import_backup(
        inspection["token"],
        [{"project_key": project_key, "type": "project", "relative_path": ""}],
        "rename",
    )
    relation_payload = extract_relation_payload(target_service._staged_backup_path(inspection["token"]))
    assert relation_payload is not None
    restored = target_service.import_relation_payload(relation_payload, result["project_mapping"])
    assert restored == {"relation_count": 1}

    target_table = target_service.search_tables(
        project_id=str(result["projects"][0]["id"]),
        scope_type="project",
        scope_path="",
        mode="table",
        query="t_order_item",
        all_nodes=False,
        limit=10,
        offset=0,
    )["items"][0]
    outgoing = target_service.list_table_relations(str(target_table["id"]))["outgoing"]
    assert {r["name"] for r in outgoing} == {"FK_ITEM_ORDER", "FK_MANUAL"}


def test_export_filters_by_selection_scope(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    order, order_item = import_sample(service, tmp_path)
    service.create_relation(
        source_table_id=str(order_item["id"]),
        source_field_id=str(service.table_detail(str(order_item["id"]))["fields"][1]["id"]),
        target_table_id=str(order["id"]),
        target_field_id=str(service.table_detail(str(order["id"]))["fields"][1]["id"]),
        name="FK_MANUAL",
        cardinality="",
        note="",
    )
    project_scope = [{"project_id": str(order["project_id"]), "type": "project", "relative_path": ""}]
    assert len(service.export_relation_payload(project_scope)["relations"]) == 1
    other_scope = [{"project_id": "not-exist", "type": "project", "relative_path": ""}]
    assert service.export_relation_payload(other_scope)["relations"] == []


def test_export_can_omit_relation_payload(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    order, order_item = import_sample(service, tmp_path)
    service.create_relation(
        source_table_id=str(order_item["id"]),
        source_field_id=str(service.table_detail(str(order_item["id"]))["fields"][1]["id"]),
        target_table_id=str(order["id"]),
        target_field_id=str(service.table_detail(str(order["id"]))["fields"][1]["id"]),
        name="FK_MANUAL",
        cardinality="",
        note="",
    )
    selections = [{"project_id": str(order["project_id"]), "type": "project", "relative_path": ""}]

    without_relations, _ = service.export_backup(selections, relation_payload=None)
    manifest = inspect_backup_archive(without_relations)
    assert "relation_data" not in manifest
    assert manifest["stats"]["relation_count"] == 0
    assert extract_relation_payload(without_relations) is None

    with_relations, _ = service.export_backup(
        selections,
        relation_payload=service.export_relation_payload(selections),
    )
    manifest_with = inspect_backup_archive(with_relations)
    assert manifest_with["stats"]["relation_count"] == 1
    assert extract_relation_payload(with_relations) is not None
