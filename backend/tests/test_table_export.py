from __future__ import annotations

import csv
import json
from importlib import import_module
from io import BytesIO, StringIO

from openpyxl import load_workbook

_table_export = import_module("backend.app.table_export")
build_table_export = _table_export.build_table_export
table_export_stem = _table_export.table_export_stem


def sample_table() -> dict:
  return {
    "name": "用户表",
    "code": "t_user",
    "comment": "保存系统用户",
    "fields": [
      {
        "ordinal": 2,
        "is_primary_key": False,
        "code": "display_name",
        "name": "显示名称",
        "data_type": "VARCHAR2",
        "length": "100",
        "nullable": True,
        "default_value": "",
        "comment": "用户展示名称 | 可修改",
      },
      {
        "ordinal": 1,
        "is_primary_key": True,
        "code": '=HYPERLINK("https://example.invalid")',
        "name": "用户编号",
        "data_type": "NUMBER",
        "length": "20",
        "nullable": False,
        "default_value": "0",
        "comment": "全局唯一编号",
      },
    ],
  }


def test_xlsx_export_contains_table_metadata_and_ordered_fields() -> None:
  content, media_type, extension = build_table_export(sample_table(), "xlsx")
  worksheet = load_workbook(BytesIO(content), data_only=False).active

  assert media_type == (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
  assert extension == ".xlsx"
  assert worksheet is not None
  assert worksheet.title == "表结构"
  assert worksheet["B1"].value == "用户表"
  assert worksheet["D1"].value == "t_user"
  assert worksheet["A5"].value == 1
  assert worksheet["C5"].value == '=HYPERLINK("https://example.invalid")'
  assert worksheet["C5"].data_type == "s"
  assert worksheet["C6"].value == "display_name"
  assert worksheet.freeze_panes == "A5"


def test_csv_export_is_excel_friendly_and_protects_formula_cells() -> None:
  content, media_type, extension = build_table_export(sample_table(), "csv")
  text = content.decode("utf-8-sig")
  rows = list(csv.reader(StringIO(text)))

  assert media_type == "text/csv; charset=utf-8"
  assert extension == ".csv"
  assert rows[0][:3] == ["表名称", "表代码", "表描述"]
  assert rows[1][3] == "1"
  assert rows[1][5] == '\'=HYPERLINK("https://example.invalid")'
  assert rows[2][5] == "display_name"


def test_json_export_uses_stable_machine_readable_field_keys() -> None:
  content, media_type, extension = build_table_export(sample_table(), "json")
  payload = json.loads(content)

  assert media_type == "application/json; charset=utf-8"
  assert extension == ".json"
  assert payload["table"] == {
    "name": "用户表",
    "code": "t_user",
    "description": "保存系统用户",
  }
  assert [field["ordinal"] for field in payload["fields"]] == [1, 2]
  assert payload["fields"][0]["is_primary_key"] is True
  assert payload["fields"][0]["code"].startswith("=HYPERLINK")


def test_markdown_export_escapes_table_delimiters_and_localizes_headers() -> None:
  content, media_type, extension = build_table_export(sample_table(), "md", "en-US")
  text = content.decode("utf-8")

  assert media_type == "text/markdown; charset=utf-8"
  assert extension == ".md"
  assert "# 用户表" in text
  assert "| No. | Primary Key | Field Name |" in text
  assert r"用户展示名称 \| 可修改" in text


def test_table_export_stem_is_safe_for_windows_and_falls_back_for_empty_names() -> None:
  assert table_export_stem({"code": "bad/name?"}) == "bad_name_"
  assert table_export_stem({"code": "CON"}) == "_CON"
  assert table_export_stem({"code": "..."}) == "table"
  assert table_export_stem({"code": "a" * 119 + ".b"}) == "a" * 119
