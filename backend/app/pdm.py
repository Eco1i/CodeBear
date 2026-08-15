from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from lxml import etree


A = "{attribute}"
C = "{collection}"
O = "{object}"
TYPE_WITH_LENGTH = re.compile(r"^\s*([^()]+?)\s*\((.*)\)\s*$")
PI_ATTRIBUTE = re.compile(r'(\w+)="([^"]*)"')


@dataclass(frozen=True)
class ParsedField:
    xml_id: str
    ordinal: int
    name: str
    code: str
    data_type: str
    length: str
    nullable: bool
    default_value: str
    comment: str
    is_primary_key: bool


@dataclass(frozen=True)
class ParsedTable:
    xml_id: str
    ordinal: int
    name: str
    code: str
    comment: str
    fields: tuple[ParsedField, ...]


@dataclass(frozen=True)
class ParsedReferenceJoin:
    parent_column_xml_id: str
    child_column_xml_id: str


@dataclass(frozen=True)
class ParsedReference:
    xml_id: str
    name: str
    code: str
    cardinality: str
    parent_table_xml_id: str
    child_table_xml_id: str
    joins: tuple[ParsedReferenceJoin, ...]


@dataclass(frozen=True)
class ParsedPdm:
    source_hash: str
    file_size: int
    model_name: str
    pd_version: str
    target_db: str
    tables: tuple[ParsedTable, ...]
    references: tuple[ParsedReference, ...] = ()

    @property
    def field_count(self) -> int:
        return sum(len(table.fields) for table in self.tables)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _attribute_texts(element: etree._Element) -> dict[str, str]:
    values: dict[str, str] = {}
    for child in element:
        tag = child.tag
        if isinstance(tag, str) and tag.startswith(A):
            values[tag[len(A):]] = child.text.strip() if child.text else ""
    return values


def _split_data_type(raw_data_type: str, raw_length: str, raw_precision: str) -> tuple[str, str]:
    data_type = raw_data_type.strip()
    length = raw_length.strip()
    precision = raw_precision.strip()
    match = TYPE_WITH_LENGTH.match(data_type)
    if match:
        data_type = match.group(1).strip()
        embedded = match.group(2).strip()
        if not length:
            length = embedded
    if precision:
        if length and "," not in length:
            length = f"{length},{precision}"
        elif not length:
            length = precision
    return data_type, length


def _powerdesigner_metadata(path: Path) -> dict[str, str]:
    with path.open("rb") as stream:
        prefix = stream.read(8192).decode("utf-8", errors="replace")
    match = re.search(r"<\?PowerDesigner\s+(.*?)\?>", prefix, flags=re.DOTALL)
    if not match:
        return {}
    return dict(PI_ATTRIBUTE.findall(match.group(1)))


def parse_pdm(path: Path) -> ParsedPdm:
    parser = etree.XMLParser(
        resolve_entities=False,
        no_network=True,
        remove_blank_text=False,
        strip_cdata=False,
        huge_tree=True,
    )
    tree = etree.parse(str(path), parser)
    metadata = _powerdesigner_metadata(path)
    root = tree.getroot()
    tables: list[ParsedTable] = []

    for table_node in root.iter(f"{O}Table"):
        table_xml_id = table_node.get("Id")
        if not table_xml_id:
            continue

        primary_key_ids: set[str] = set()
        primary_collection = table_node.find(f"{C}PrimaryKey")
        primary_ref = ""
        if primary_collection is not None:
            for key_ref in primary_collection:
                if key_ref.tag == f"{O}Key" and key_ref.get("Ref"):
                    primary_ref = str(key_ref.get("Ref"))
                    break

        keys_collection = table_node.find(f"{C}Keys")
        if keys_collection is not None and primary_ref:
            for key_node in keys_collection:
                if key_node.tag != f"{O}Key" or key_node.get("Id") != primary_ref:
                    continue
                key_columns = key_node.find(f"{C}Key.Columns")
                if key_columns is not None:
                    for column_ref in key_columns:
                        ref = column_ref.get("Ref")
                        if ref:
                            primary_key_ids.add(str(ref))

        fields: list[ParsedField] = []
        columns_collection = table_node.find(f"{C}Columns")
        if columns_collection is not None:
            for column_node in columns_collection:
                if column_node.tag != f"{O}Column" or not column_node.get("Id"):
                    continue
                xml_id = str(column_node.get("Id"))
                attributes = _attribute_texts(column_node)
                data_type, length = _split_data_type(
                    attributes.get("DataType", ""),
                    attributes.get("Length", ""),
                    attributes.get("Precision", ""),
                )
                mandatory = attributes.get("Mandatory", "").lower() in {"1", "true", "yes"}
                fields.append(
                    ParsedField(
                        xml_id=xml_id,
                        ordinal=len(fields) + 1,
                        name=attributes.get("Name", ""),
                        code=attributes.get("Code", ""),
                        data_type=data_type,
                        length=length,
                        nullable=not mandatory,
                        default_value=attributes.get("DefaultValue", ""),
                        comment=attributes.get("Comment", ""),
                        is_primary_key=xml_id in primary_key_ids,
                    )
                )

        attributes = _attribute_texts(table_node)
        tables.append(
            ParsedTable(
                xml_id=str(table_xml_id),
                ordinal=len(tables) + 1,
                name=attributes.get("Name", ""),
                code=attributes.get("Code", ""),
                comment=attributes.get("Comment", ""),
                fields=tuple(fields),
            )
        )

    model_name = ""
    for model_node in root.iter(f"{O}Model"):
        if model_node.get("Id"):
            model_name = _attribute_texts(model_node).get("Name", "")
            break

    table_xml_ids = {table.xml_id for table in tables}
    references: list[ParsedReference] = []
    for reference_node in root.iter(f"{O}Reference"):
        reference_xml_id = reference_node.get("Id")
        if not reference_xml_id:
            continue
        parent_node = reference_node.find(f"{C}ParentTable/{O}Table")
        child_node = reference_node.find(f"{C}ChildTable/{O}Table")
        parent_table_xml_id = parent_node.get("Ref") if parent_node is not None else None
        child_table_xml_id = child_node.get("Ref") if child_node is not None else None
        if not parent_table_xml_id or not child_table_xml_id:
            continue
        if parent_table_xml_id not in table_xml_ids or child_table_xml_id not in table_xml_ids:
            continue
        joins: list[ParsedReferenceJoin] = []
        joins_collection = reference_node.find(f"{C}Joins")
        if joins_collection is not None:
            for join_node in joins_collection:
                if join_node.tag != f"{O}ReferenceJoin":
                    continue
                object1 = join_node.find(f"{C}Object1/{O}Column")
                object2 = join_node.find(f"{C}Object2/{O}Column")
                parent_column_xml_id = object1.get("Ref") if object1 is not None else None
                child_column_xml_id = object2.get("Ref") if object2 is not None else None
                if parent_column_xml_id and child_column_xml_id:
                    joins.append(
                        ParsedReferenceJoin(
                            parent_column_xml_id=str(parent_column_xml_id),
                            child_column_xml_id=str(child_column_xml_id),
                        )
                    )
        attributes = _attribute_texts(reference_node)
        references.append(
            ParsedReference(
                xml_id=str(reference_xml_id),
                name=attributes.get("Name", ""),
                code=attributes.get("Code", ""),
                cardinality=attributes.get("Cardinality", ""),
                parent_table_xml_id=str(parent_table_xml_id),
                child_table_xml_id=str(child_table_xml_id),
                joins=tuple(joins),
            )
        )

    stat = path.stat()
    return ParsedPdm(
        source_hash=file_sha256(path),
        file_size=stat.st_size,
        model_name=model_name or metadata.get("Name", ""),
        pd_version=metadata.get("version", ""),
        target_db=metadata.get("Target", ""),
        tables=tuple(tables),
        references=tuple(references),
    )


def count_model_objects(path: Path) -> tuple[int, int]:
    parsed = parse_pdm(path)
    return len(parsed.tables), parsed.field_count


def _set_text(parent: etree._Element, local_name: str, value: str, *, remove_empty: bool = False) -> None:
    child = parent.find(f"{A}{local_name}")
    if not value and remove_empty:
        if child is not None:
            parent.remove(child)
        return
    if child is None:
        child = etree.Element(f"{A}{local_name}")
        insert_at = len(parent)
        for index, sibling in enumerate(parent):
            if not isinstance(sibling.tag, str) or not sibling.tag.startswith(A):
                insert_at = index
                break
        parent.insert(insert_at, child)
    child.text = value


def _build_data_type(data_type: str, length: str) -> str:
    base = data_type.strip()
    if not base or not length.strip() or "(" in base:
        return base
    no_length_types = {"DATE", "CLOB", "BLOB", "NCLOB", "LONG", "XMLTYPE", "BOOLEAN"}
    if base.upper() in no_length_types:
        return base
    return f"{base}({length.strip()})"


def update_pdm_dictionary(
    source: Path,
    destination: Path,
    table_changes_by_xml_id: dict[str, dict[str, object]],
    field_changes_by_xml_id: dict[str, dict[str, object]],
) -> tuple[int, int]:
    parser = etree.XMLParser(
        resolve_entities=False,
        no_network=True,
        remove_blank_text=False,
        strip_cdata=False,
        huge_tree=True,
    )
    tree = etree.parse(str(source), parser)
    root = tree.getroot()
    found_tables: set[str] = set()
    found_fields: set[str] = set()

    for table_node in root.iter(f"{O}Table"):
        xml_id = table_node.get("Id")
        if not xml_id or xml_id not in table_changes_by_xml_id:
            continue
        change = table_changes_by_xml_id[xml_id]
        found_tables.add(str(xml_id))
        _set_text(table_node, "Name", str(change.get("name", "")).strip())
        _set_text(table_node, "Code", str(change.get("code", "")).strip())
        _set_text(
            table_node,
            "Comment",
            str(change.get("comment", "")),
            remove_empty=True,
        )

    for column_node in root.iter(f"{O}Column"):
        xml_id = column_node.get("Id")
        if not xml_id or xml_id not in field_changes_by_xml_id:
            continue
        change = field_changes_by_xml_id[xml_id]
        found_fields.add(str(xml_id))
        name = str(change.get("name", "")).strip()
        code = str(change.get("code", "")).strip()
        data_type = str(change.get("data_type", "")).strip()
        length = str(change.get("length", "")).strip()
        nullable = bool(change.get("nullable", True))
        default_value = str(change.get("default_value", ""))
        comment = str(change.get("comment", ""))

        _set_text(column_node, "Name", name)
        _set_text(column_node, "Code", code)
        _set_text(column_node, "DataType", _build_data_type(data_type, length))
        precision = ""
        stored_length = length
        if "," in length:
            stored_length, precision = (part.strip() for part in length.split(",", 1))
        _set_text(column_node, "Length", stored_length, remove_empty=True)
        _set_text(column_node, "Precision", precision, remove_empty=True)
        _set_text(column_node, "Mandatory", "" if nullable else "1", remove_empty=True)
        _set_text(column_node, "DefaultValue", default_value, remove_empty=True)
        _set_text(column_node, "Comment", comment, remove_empty=True)

    missing_tables = set(table_changes_by_xml_id) - found_tables
    if missing_tables:
        raise ValueError(f"PDM 中找不到 {len(missing_tables)} 个待修改数据表")
    missing_fields = set(field_changes_by_xml_id) - found_fields
    if missing_fields:
        raise ValueError(f"PDM 中找不到 {len(missing_fields)} 个待修改字段")

    tree.write(
        str(destination),
        encoding="UTF-8",
        xml_declaration=True,
        pretty_print=False,
    )
    return len(found_tables), len(found_fields)


def update_pdm_fields(
    source: Path,
    destination: Path,
    changes_by_xml_id: dict[str, dict[str, object]],
) -> tuple[int, int]:
    _, updated_fields = update_pdm_dictionary(
        source,
        destination,
        {},
        changes_by_xml_id,
    )
    return updated_fields, len(changes_by_xml_id)
