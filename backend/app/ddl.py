from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable


MYSQL_CHARACTER_SETS: list[dict[str, str | int | bool]] = [
    {"value": "utf8mb4", "description": "UTF-8 Unicode", "default_collation": "utf8mb4_0900_ai_ci", "max_bytes": 4, "recommended": True},
    {"value": "utf8mb3", "description": "UTF-8 Unicode（已弃用，建议使用 utf8mb4）", "default_collation": "utf8mb3_general_ci", "max_bytes": 3, "deprecated": True},
    {"value": "armscii8", "description": "ARMSCII-8 Armenian", "default_collation": "armscii8_general_ci", "max_bytes": 1},
    {"value": "ascii", "description": "US ASCII", "default_collation": "ascii_general_ci", "max_bytes": 1},
    {"value": "big5", "description": "Big5 Traditional Chinese", "default_collation": "big5_chinese_ci", "max_bytes": 2},
    {"value": "binary", "description": "Binary pseudo charset", "default_collation": "binary", "max_bytes": 1},
    {"value": "cp1250", "description": "Windows Central European", "default_collation": "cp1250_general_ci", "max_bytes": 1},
    {"value": "cp1251", "description": "Windows Cyrillic", "default_collation": "cp1251_general_ci", "max_bytes": 1},
    {"value": "cp1256", "description": "Windows Arabic", "default_collation": "cp1256_general_ci", "max_bytes": 1},
    {"value": "cp1257", "description": "Windows Baltic", "default_collation": "cp1257_general_ci", "max_bytes": 1},
    {"value": "cp850", "description": "DOS West European", "default_collation": "cp850_general_ci", "max_bytes": 1},
    {"value": "cp852", "description": "DOS Central European", "default_collation": "cp852_general_ci", "max_bytes": 1},
    {"value": "cp866", "description": "DOS Russian", "default_collation": "cp866_general_ci", "max_bytes": 1},
    {"value": "cp932", "description": "SJIS for Windows Japanese", "default_collation": "cp932_japanese_ci", "max_bytes": 2},
    {"value": "dec8", "description": "DEC West European", "default_collation": "dec8_swedish_ci", "max_bytes": 1},
    {"value": "eucjpms", "description": "UJIS for Windows Japanese", "default_collation": "eucjpms_japanese_ci", "max_bytes": 3},
    {"value": "euckr", "description": "EUC-KR Korean", "default_collation": "euckr_korean_ci", "max_bytes": 2},
    {"value": "gb18030", "description": "China National Standard GB18030", "default_collation": "gb18030_chinese_ci", "max_bytes": 4},
    {"value": "gb2312", "description": "GB2312 Simplified Chinese", "default_collation": "gb2312_chinese_ci", "max_bytes": 2},
    {"value": "gbk", "description": "GBK Simplified Chinese", "default_collation": "gbk_chinese_ci", "max_bytes": 2},
    {"value": "geostd8", "description": "GEOSTD8 Georgian", "default_collation": "geostd8_general_ci", "max_bytes": 1},
    {"value": "greek", "description": "ISO 8859-7 Greek", "default_collation": "greek_general_ci", "max_bytes": 1},
    {"value": "hebrew", "description": "ISO 8859-8 Hebrew", "default_collation": "hebrew_general_ci", "max_bytes": 1},
    {"value": "hp8", "description": "HP West European", "default_collation": "hp8_english_ci", "max_bytes": 1},
    {"value": "keybcs2", "description": "DOS Kamenicky Czech-Slovak", "default_collation": "keybcs2_general_ci", "max_bytes": 1},
    {"value": "koi8r", "description": "KOI8-R Relcom Russian", "default_collation": "koi8r_general_ci", "max_bytes": 1},
    {"value": "koi8u", "description": "KOI8-U Ukrainian", "default_collation": "koi8u_general_ci", "max_bytes": 1},
    {"value": "latin1", "description": "cp1252 West European", "default_collation": "latin1_swedish_ci", "max_bytes": 1},
    {"value": "latin2", "description": "ISO 8859-2 Central European", "default_collation": "latin2_general_ci", "max_bytes": 1},
    {"value": "latin5", "description": "ISO 8859-9 Turkish", "default_collation": "latin5_turkish_ci", "max_bytes": 1},
    {"value": "latin7", "description": "ISO 8859-13 Baltic", "default_collation": "latin7_general_ci", "max_bytes": 1},
    {"value": "macce", "description": "Mac Central European", "default_collation": "macce_general_ci", "max_bytes": 1},
    {"value": "macroman", "description": "Mac West European", "default_collation": "macroman_general_ci", "max_bytes": 1},
    {"value": "sjis", "description": "Shift-JIS Japanese", "default_collation": "sjis_japanese_ci", "max_bytes": 2},
    {"value": "swe7", "description": "7bit Swedish", "default_collation": "swe7_swedish_ci", "max_bytes": 1},
    {"value": "tis620", "description": "TIS620 Thai", "default_collation": "tis620_thai_ci", "max_bytes": 1},
    {"value": "ucs2", "description": "UCS-2 Unicode（已弃用）", "default_collation": "ucs2_general_ci", "max_bytes": 2, "deprecated": True},
    {"value": "ujis", "description": "EUC-JP Japanese", "default_collation": "ujis_japanese_ci", "max_bytes": 3},
    {"value": "utf16", "description": "UTF-16 Unicode", "default_collation": "utf16_general_ci", "max_bytes": 4},
    {"value": "utf16le", "description": "UTF-16LE Unicode", "default_collation": "utf16le_general_ci", "max_bytes": 4},
    {"value": "utf32", "description": "UTF-32 Unicode", "default_collation": "utf32_general_ci", "max_bytes": 4},
]

# MySQL Connector/Python 的 MySQL 8.0 字符集表（8.0.30）包含 41 个字符集、
# 286 个排序规则。这里随应用静态发布，避免绿色版运行时依赖数据库或网络。
MYSQL_COLLATIONS_BY_CHARACTER_SET: dict[str, tuple[str, ...]] = {
    "armscii8": ("armscii8_general_ci", "armscii8_bin"),
    "ascii": ("ascii_general_ci", "ascii_bin"),
    "big5": ("big5_chinese_ci", "big5_bin"),
    "binary": ("binary",),
    "cp1250": ("cp1250_general_ci", "cp1250_czech_cs", "cp1250_croatian_ci", "cp1250_bin", "cp1250_polish_ci"),
    "cp1251": ("cp1251_bulgarian_ci", "cp1251_ukrainian_ci", "cp1251_bin", "cp1251_general_ci", "cp1251_general_cs"),
    "cp1256": ("cp1256_general_ci", "cp1256_bin"),
    "cp1257": ("cp1257_lithuanian_ci", "cp1257_bin", "cp1257_general_ci"),
    "cp850": ("cp850_general_ci", "cp850_bin"),
    "cp852": ("cp852_general_ci", "cp852_bin"),
    "cp866": ("cp866_general_ci", "cp866_bin"),
    "cp932": ("cp932_japanese_ci", "cp932_bin"),
    "dec8": ("dec8_swedish_ci", "dec8_bin"),
    "eucjpms": ("eucjpms_japanese_ci", "eucjpms_bin"),
    "euckr": ("euckr_korean_ci", "euckr_bin"),
    "gb18030": ("gb18030_chinese_ci", "gb18030_bin", "gb18030_unicode_520_ci"),
    "gb2312": ("gb2312_chinese_ci", "gb2312_bin"),
    "gbk": ("gbk_chinese_ci", "gbk_bin"),
    "geostd8": ("geostd8_general_ci", "geostd8_bin"),
    "greek": ("greek_general_ci", "greek_bin"),
    "hebrew": ("hebrew_general_ci", "hebrew_bin"),
    "hp8": ("hp8_english_ci", "hp8_bin"),
    "keybcs2": ("keybcs2_general_ci", "keybcs2_bin"),
    "koi8r": ("koi8r_general_ci", "koi8r_bin"),
    "koi8u": ("koi8u_general_ci", "koi8u_bin"),
    "latin1": (
        "latin1_german1_ci", "latin1_swedish_ci", "latin1_danish_ci", "latin1_german2_ci",
        "latin1_bin", "latin1_general_ci", "latin1_general_cs", "latin1_spanish_ci",
    ),
    "latin2": ("latin2_czech_cs", "latin2_general_ci", "latin2_hungarian_ci", "latin2_croatian_ci", "latin2_bin"),
    "latin5": ("latin5_turkish_ci", "latin5_bin"),
    "latin7": ("latin7_estonian_cs", "latin7_general_ci", "latin7_general_cs", "latin7_bin"),
    "macce": ("macce_general_ci", "macce_bin"),
    "macroman": ("macroman_general_ci", "macroman_bin"),
    "sjis": ("sjis_japanese_ci", "sjis_bin"),
    "swe7": ("swe7_swedish_ci", "swe7_bin"),
    "tis620": ("tis620_thai_ci", "tis620_bin"),
    "ucs2": (
        "ucs2_general_ci", "ucs2_bin", "ucs2_unicode_ci", "ucs2_icelandic_ci", "ucs2_latvian_ci",
        "ucs2_romanian_ci", "ucs2_slovenian_ci", "ucs2_polish_ci", "ucs2_estonian_ci", "ucs2_spanish_ci",
        "ucs2_swedish_ci", "ucs2_turkish_ci", "ucs2_czech_ci", "ucs2_danish_ci", "ucs2_lithuanian_ci",
        "ucs2_slovak_ci", "ucs2_spanish2_ci", "ucs2_roman_ci", "ucs2_persian_ci", "ucs2_esperanto_ci",
        "ucs2_hungarian_ci", "ucs2_sinhala_ci", "ucs2_german2_ci", "ucs2_croatian_ci",
        "ucs2_unicode_520_ci", "ucs2_vietnamese_ci", "ucs2_general_mysql500_ci",
    ),
    "ujis": ("ujis_japanese_ci", "ujis_bin"),
    "utf16": (
        "utf16_general_ci", "utf16_bin", "utf16_unicode_ci", "utf16_icelandic_ci", "utf16_latvian_ci",
        "utf16_romanian_ci", "utf16_slovenian_ci", "utf16_polish_ci", "utf16_estonian_ci", "utf16_spanish_ci",
        "utf16_swedish_ci", "utf16_turkish_ci", "utf16_czech_ci", "utf16_danish_ci", "utf16_lithuanian_ci",
        "utf16_slovak_ci", "utf16_spanish2_ci", "utf16_roman_ci", "utf16_persian_ci", "utf16_esperanto_ci",
        "utf16_hungarian_ci", "utf16_sinhala_ci", "utf16_german2_ci", "utf16_croatian_ci",
        "utf16_unicode_520_ci", "utf16_vietnamese_ci",
    ),
    "utf16le": ("utf16le_general_ci", "utf16le_bin"),
    "utf32": (
        "utf32_general_ci", "utf32_bin", "utf32_unicode_ci", "utf32_icelandic_ci", "utf32_latvian_ci",
        "utf32_romanian_ci", "utf32_slovenian_ci", "utf32_polish_ci", "utf32_estonian_ci", "utf32_spanish_ci",
        "utf32_swedish_ci", "utf32_turkish_ci", "utf32_czech_ci", "utf32_danish_ci", "utf32_lithuanian_ci",
        "utf32_slovak_ci", "utf32_spanish2_ci", "utf32_roman_ci", "utf32_persian_ci", "utf32_esperanto_ci",
        "utf32_hungarian_ci", "utf32_sinhala_ci", "utf32_german2_ci", "utf32_croatian_ci",
        "utf32_unicode_520_ci", "utf32_vietnamese_ci",
    ),
    "utf8mb3": (
        "utf8mb3_general_ci", "utf8mb3_tolower_ci", "utf8mb3_bin", "utf8mb3_unicode_ci",
        "utf8mb3_icelandic_ci", "utf8mb3_latvian_ci", "utf8mb3_romanian_ci", "utf8mb3_slovenian_ci",
        "utf8mb3_polish_ci", "utf8mb3_estonian_ci", "utf8mb3_spanish_ci", "utf8mb3_swedish_ci",
        "utf8mb3_turkish_ci", "utf8mb3_czech_ci", "utf8mb3_danish_ci", "utf8mb3_lithuanian_ci",
        "utf8mb3_slovak_ci", "utf8mb3_spanish2_ci", "utf8mb3_roman_ci", "utf8mb3_persian_ci",
        "utf8mb3_esperanto_ci", "utf8mb3_hungarian_ci", "utf8mb3_sinhala_ci", "utf8mb3_german2_ci",
        "utf8mb3_croatian_ci", "utf8mb3_unicode_520_ci", "utf8mb3_vietnamese_ci", "utf8mb3_general_mysql500_ci",
    ),
    "utf8mb4": (
        "utf8mb4_general_ci", "utf8mb4_bin", "utf8mb4_unicode_ci", "utf8mb4_icelandic_ci",
        "utf8mb4_latvian_ci", "utf8mb4_romanian_ci", "utf8mb4_slovenian_ci", "utf8mb4_polish_ci",
        "utf8mb4_estonian_ci", "utf8mb4_spanish_ci", "utf8mb4_swedish_ci", "utf8mb4_turkish_ci",
        "utf8mb4_czech_ci", "utf8mb4_danish_ci", "utf8mb4_lithuanian_ci", "utf8mb4_slovak_ci",
        "utf8mb4_spanish2_ci", "utf8mb4_roman_ci", "utf8mb4_persian_ci", "utf8mb4_esperanto_ci",
        "utf8mb4_hungarian_ci", "utf8mb4_sinhala_ci", "utf8mb4_german2_ci", "utf8mb4_croatian_ci",
        "utf8mb4_unicode_520_ci", "utf8mb4_vietnamese_ci", "utf8mb4_0900_ai_ci", "utf8mb4_de_pb_0900_ai_ci",
        "utf8mb4_is_0900_ai_ci", "utf8mb4_lv_0900_ai_ci", "utf8mb4_ro_0900_ai_ci", "utf8mb4_sl_0900_ai_ci",
        "utf8mb4_pl_0900_ai_ci", "utf8mb4_et_0900_ai_ci", "utf8mb4_es_0900_ai_ci", "utf8mb4_sv_0900_ai_ci",
        "utf8mb4_tr_0900_ai_ci", "utf8mb4_cs_0900_ai_ci", "utf8mb4_da_0900_ai_ci", "utf8mb4_lt_0900_ai_ci",
        "utf8mb4_sk_0900_ai_ci", "utf8mb4_es_trad_0900_ai_ci", "utf8mb4_la_0900_ai_ci",
        "utf8mb4_eo_0900_ai_ci", "utf8mb4_hu_0900_ai_ci", "utf8mb4_hr_0900_ai_ci", "utf8mb4_vi_0900_ai_ci",
        "utf8mb4_0900_as_cs", "utf8mb4_de_pb_0900_as_cs", "utf8mb4_is_0900_as_cs", "utf8mb4_lv_0900_as_cs",
        "utf8mb4_ro_0900_as_cs", "utf8mb4_sl_0900_as_cs", "utf8mb4_pl_0900_as_cs", "utf8mb4_et_0900_as_cs",
        "utf8mb4_es_0900_as_cs", "utf8mb4_sv_0900_as_cs", "utf8mb4_tr_0900_as_cs", "utf8mb4_cs_0900_as_cs",
        "utf8mb4_da_0900_as_cs", "utf8mb4_lt_0900_as_cs", "utf8mb4_sk_0900_as_cs",
        "utf8mb4_es_trad_0900_as_cs", "utf8mb4_la_0900_as_cs", "utf8mb4_eo_0900_as_cs",
        "utf8mb4_hu_0900_as_cs", "utf8mb4_hr_0900_as_cs", "utf8mb4_vi_0900_as_cs", "utf8mb4_ja_0900_as_cs",
        "utf8mb4_ja_0900_as_cs_ks", "utf8mb4_0900_as_ci", "utf8mb4_ru_0900_ai_ci", "utf8mb4_ru_0900_as_cs",
        "utf8mb4_zh_0900_as_cs", "utf8mb4_0900_bin", "utf8mb4_nb_0900_ai_ci", "utf8mb4_nb_0900_as_cs",
        "utf8mb4_nn_0900_ai_ci", "utf8mb4_nn_0900_as_cs", "utf8mb4_sr_latn_0900_ai_ci",
        "utf8mb4_sr_latn_0900_as_cs", "utf8mb4_bs_0900_ai_ci", "utf8mb4_bs_0900_as_cs",
        "utf8mb4_bg_0900_ai_ci", "utf8mb4_bg_0900_as_cs", "utf8mb4_gl_0900_ai_ci", "utf8mb4_gl_0900_as_cs",
        "utf8mb4_mn_cyrl_0900_ai_ci", "utf8mb4_mn_cyrl_0900_as_cs",
    ),
}

MYSQL_DEFAULT_COLLATIONS = {
    str(item["value"]): str(item["default_collation"])
    for item in MYSQL_CHARACTER_SETS
}


def _collation_description(collation: str) -> str:
    properties: list[str] = []
    if "_0900_" in collation:
        properties.append("Unicode 9.0")
    if collation == "binary" or collation.endswith("_bin"):
        properties.append("二进制排序")
    elif "_ai_ci" in collation:
        properties.append("不区分重音与大小写")
    elif "_as_ci" in collation:
        properties.append("区分重音、不区分大小写")
    elif "_as_cs" in collation:
        properties.append("区分重音与大小写")
    elif collation.endswith("_ci"):
        properties.append("不区分大小写")
    elif collation.endswith("_cs"):
        properties.append("区分大小写")
    return " · ".join(properties) or "MySQL 排序规则"


MYSQL_COLLATIONS: list[dict[str, str | bool]] = [
    {
        "value": collation,
        "charset": charset,
        "description": _collation_description(collation),
        "default_for_charset": collation == MYSQL_DEFAULT_COLLATIONS[charset],
        "recommended": collation == "utf8mb4_0900_ai_ci",
    }
    for charset, collations in MYSQL_COLLATIONS_BY_CHARACTER_SET.items()
    for collation in collations
]

MYSQL_STORAGE_ENGINES: list[dict[str, str | bool]] = [
    {"value": "InnoDB", "description": "默认事务引擎，支持行锁、崩溃恢复和外键", "recommended": True},
    {"value": "MyISAM", "description": "非事务引擎，适合只读或读多写少场景"},
    {"value": "MEMORY", "description": "数据保存在内存中，重启后数据丢失"},
    {"value": "CSV", "description": "以 CSV 文件保存数据，不支持索引"},
    {"value": "ARCHIVE", "description": "面向归档写入的压缩存储引擎"},
    {"value": "BLACKHOLE", "description": "接收但不保存数据，常用于复制拓扑"},
    {"value": "MRG_MYISAM", "description": "将结构相同的 MyISAM 表组成逻辑集合"},
    {"value": "FEDERATED", "description": "访问远程 MySQL 表；是否可用取决于服务器配置", "optional": True},
    {"value": "NDB", "description": "MySQL NDB Cluster 引擎；仅集群发行版可用", "optional": True},
]

DDL_OPTIONS: dict[str, Any] = {
    "databases": [
        {
            "value": "mysql",
            "label": "MySQL",
            "description": "社区版 / 企业版",
            "versions": ["8.0", "8.4"],
            "default_version": "8.0",
            "extension": ".sql",
        },
        {
            "value": "oracle",
            "label": "Oracle",
            "description": "Oracle Database",
            "versions": ["19c", "21c", "23ai"],
            "default_version": "19c",
            "extension": ".sql",
        },
        {
            "value": "dameng",
            "label": "达梦",
            "description": "DM Database",
            "versions": ["DM8"],
            "default_version": "DM8",
            "extension": ".sql",
        },
        {
            "value": "tdsql",
            "label": "TDSQL MySQL 版",
            "description": "分布式 InnoDB 引擎",
            "versions": ["5.7", "8.0"],
            "default_version": "8.0",
            "extension": ".sql",
        },
        {
            "value": "ignite",
            "label": "Apache Ignite",
            "description": "分布式内存数据库",
            "versions": ["2.15"],
            "default_version": "2.15",
            "extension": ".sql",
        },
    ],
    "mysql_character_sets": MYSQL_CHARACTER_SETS,
    "mysql_collations": MYSQL_COLLATIONS,
    "mysql_storage_engines": MYSQL_STORAGE_ENGINES,
    "tdsql_table_modes": [
        {"value": "shard", "label": "HASH 分表", "description": "自动使用每张表的首个主键作为 shardkey"},
        {"value": "single", "label": "单表", "description": "不拆分，数据位于第一个 set"},
        {"value": "broadcast", "label": "广播表", "description": "在所有 set 保存全量数据"},
    ],
    "ignite_templates": [
        {"value": "PARTITIONED", "label": "PARTITIONED", "description": "分区缓存（默认）"},
        {"value": "REPLICATED", "label": "REPLICATED", "description": "全量复制缓存"},
    ],
    "ignite_atomicity_modes": [
        {"value": "ATOMIC", "label": "ATOMIC"},
        {"value": "TRANSACTIONAL", "label": "TRANSACTIONAL"},
    ],
    "ignite_write_sync_modes": [
        {"value": "FULL_SYNC", "label": "FULL_SYNC"},
        {"value": "PRIMARY_SYNC", "label": "PRIMARY_SYNC"},
        {"value": "FULL_ASYNC", "label": "FULL_ASYNC"},
    ],
}


DATABASE_LABELS = {
    item["value"]: item["label"] for item in DDL_OPTIONS["databases"]
}

TYPE_ALIASES = {
    "VARCHAR2": "VARCHAR2",
    "NVARCHAR2": "NVARCHAR2",
    "VARCHAR": "VARCHAR",
    "NVARCHAR": "NVARCHAR2",
    "CHAR VARYING": "VARCHAR",
    "CHARACTER VARYING": "VARCHAR",
    "VHARCHAR2": "VARCHAR2",
    "VARHCAR2": "VARCHAR2",
    "VARVHAR2": "VARCHAR2",
    "VARHAR2": "VARCHAR2",
    "NUBMER": "NUMBER",
    "UMBER": "NUMBER",
    "NUMER": "NUMBER",
    "INT4": "INT",
    "INT8": "BIGINT",
    "BOOL": "BOOLEAN",
    "DATETIME2": "DATETIME",
    "DOUBLE PRECISION": "DOUBLE",
}

KNOWN_TYPES = {
    "VARCHAR2", "NVARCHAR2", "VARCHAR", "CHAR", "NCHAR", "TEXT", "TINYTEXT",
    "MEDIUMTEXT", "LONGTEXT", "CLOB", "NCLOB", "LONG", "BLOB", "TINYBLOB",
    "MEDIUMBLOB", "LONGBLOB", "BINARY", "VARBINARY", "RAW", "LONG RAW", "BYTEA",
    "NUMBER", "NUMERIC", "DECIMAL", "DEC", "INTEGER", "INT", "BIGINT", "SMALLINT",
    "TINYINT", "MEDIUMINT", "FLOAT", "DOUBLE", "REAL", "BINARY_FLOAT", "BINARY_DOUBLE",
    "BOOLEAN", "BIT", "DATE", "DATETIME", "TIMESTAMP", "TIME", "YEAR", "INTERVAL",
    "JSON", "JSONB", "XML", "XMLTYPE", "UUID", "ROWID", "UROWID",
}


@dataclass
class WarningCollector:
    items: list[dict[str, Any]] = field(default_factory=list)
    total: int = 0
    limit: int = 500

    def add(
        self,
        code: str,
        message: str,
        *,
        table: dict[str, Any] | None = None,
        column: dict[str, Any] | None = None,
        severity: str = "warning",
    ) -> None:
        self.total += 1
        if len(self.items) >= self.limit:
            return
        self.items.append(
            {
                "code": code,
                "severity": severity,
                "message": message,
                "table_id": str(table.get("id", "")) if table else "",
                "table_code": str(table.get("code", "")) if table else "",
                "field_code": str(column.get("code", "")) if column else "",
            }
        )


def ddl_options() -> dict[str, Any]:
    return DDL_OPTIONS


def _normalized_type(value: object) -> str:
    normalized = str(value or "").strip().upper()
    normalized = normalized.translate(str.maketrans({"（": "(", "）": ")", "，": ","}))
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"\s*\(.*\)\s*$", "", normalized).strip()
    if normalized in TYPE_ALIASES:
        return TYPE_ALIASES[normalized]
    if normalized in KNOWN_TYPES:
        return normalized
    for candidate in sorted(KNOWN_TYPES, key=len, reverse=True):
        if re.search(rf"(?:^|\s){re.escape(candidate)}$", normalized):
            return candidate
    return normalized


def _normalized_length(value: object) -> str:
    normalized = str(value or "").strip().translate(str.maketrans({"（": "(", "）": ")", "，": ","}))
    normalized = normalized.strip("() ")
    match = re.fullmatch(r"(\d+)(?:\s*,\s*(\d+))?", normalized)
    if not match:
        return ""
    return match.group(1) if match.group(2) is None else f"{match.group(1)},{match.group(2)}"


def _numeric_parts(length: str) -> tuple[int | None, int | None]:
    if not length:
        return None, None
    parts = length.split(",", 1)
    precision = int(parts[0])
    scale = int(parts[1]) if len(parts) == 2 else None
    return precision, scale


def _varchar_length(length: str, default: int = 255) -> str:
    if not length:
        return str(default)
    return length.split(",", 1)[0]


def _quote_identifier(value: str, database: str) -> str:
    if database in {"mysql", "tdsql"}:
        return f"`{value.replace('`', '``')}`"
    return f'"{value.replace(chr(34), chr(34) * 2)}"'


def _sql_string(value: object) -> str:
    return "'" + str(value or "").replace("'", "''") + "'"


def _safe_identifier(
    value: object,
    fallback: str,
    warnings: WarningCollector,
    *,
    table: dict[str, Any] | None = None,
    column: dict[str, Any] | None = None,
) -> str:
    identifier = str(value or "").strip()
    if identifier:
        return identifier
    warnings.add(
        "missing_identifier",
        f"缺少英文标识，已使用 {fallback}",
        table=table,
        column=column,
    )
    return fallback


def _qualified_name(schema: str, table_name: str, database: str) -> str:
    table_sql = _quote_identifier(table_name, database)
    if not schema:
        return table_sql
    return f"{_quote_identifier(schema, database)}.{table_sql}"


def _column_comment(column: dict[str, Any]) -> str:
    return str(column.get("comment") or column.get("name") or "").strip()


def _table_comment(table: dict[str, Any]) -> str:
    return str(table.get("comment") or table.get("name") or "").strip()


def _default_clause(value: object) -> str:
    default = str(value or "").strip()
    return f" DEFAULT {default}" if default else ""


def _mysql_type(
    column: dict[str, Any],
    warnings: WarningCollector,
    table: dict[str, Any],
) -> str:
    raw_type = str(column.get("data_type") or "").strip()
    data_type = _normalized_type(raw_type)
    length = _normalized_length(column.get("length"))
    if data_type in {"VARCHAR", "VARCHAR2", "NVARCHAR2"}:
        return f"VARCHAR({_varchar_length(length)})"
    if data_type in {"CHAR", "NCHAR"}:
        return f"CHAR({_varchar_length(length, 1)})"
    if data_type in {"TEXT", "TINYTEXT", "MEDIUMTEXT", "LONGTEXT", "CLOB", "NCLOB", "LONG", "XML", "XMLTYPE"}:
        return "LONGTEXT" if data_type not in {"TINYTEXT", "MEDIUMTEXT", "TEXT"} else data_type
    if data_type in {"BLOB", "TINYBLOB", "MEDIUMBLOB", "LONGBLOB", "LONG RAW"}:
        return "LONGBLOB" if data_type in {"BLOB", "LONG RAW"} else data_type
    if data_type in {"BINARY", "VARBINARY", "RAW", "BYTEA"}:
        return f"VARBINARY({_varchar_length(length)})"
    if data_type in {"NUMBER", "NUMERIC", "DECIMAL", "DEC"}:
        precision, scale = _numeric_parts(length)
        if precision is None:
            warnings.add("number_without_precision", f"{raw_type or 'NUMBER'} 未指定精度，已映射为 DECIMAL(38,10)", table=table, column=column)
            return "DECIMAL(38,10)"
        if scale not in {None, 0}:
            return f"DECIMAL({precision},{scale})"
        if precision <= 9:
            return "INT"
        if precision <= 18:
            return "BIGINT"
        return f"DECIMAL({precision})"
    if data_type in {"INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT", "MEDIUMINT"}:
        return "INT" if data_type == "INTEGER" else data_type
    if data_type in {"FLOAT", "DOUBLE", "REAL", "BINARY_FLOAT", "BINARY_DOUBLE"}:
        return "DOUBLE" if data_type in {"DOUBLE", "BINARY_DOUBLE"} else "FLOAT"
    if data_type in {"BOOLEAN", "BIT"}:
        return "BOOLEAN"
    if data_type == "DATE":
        warnings.add("date_to_datetime", "DATE 已按日期时间语义映射为 DATETIME", table=table, column=column, severity="info")
        return "DATETIME"
    if data_type in {"DATETIME", "TIMESTAMP", "TIME", "YEAR", "JSON"}:
        return data_type
    if data_type in {"UUID", "ROWID", "UROWID"}:
        return "CHAR(36)" if data_type == "UUID" else "VARCHAR(64)"
    fallback = "VARCHAR(255)"
    warnings.add("unknown_type", f"无法识别数据类型“{raw_type or '空'}”，已映射为 {fallback}", table=table, column=column)
    return fallback


def _oracle_like_type(
    column: dict[str, Any],
    warnings: WarningCollector,
    table: dict[str, Any],
    *,
    dameng: bool,
) -> str:
    raw_type = str(column.get("data_type") or "").strip()
    data_type = _normalized_type(raw_type)
    length = _normalized_length(column.get("length"))
    varchar_name = "VARCHAR" if dameng else "VARCHAR2"
    if data_type in {"VARCHAR", "VARCHAR2"}:
        return f"{varchar_name}({_varchar_length(length)})"
    if data_type == "NVARCHAR2":
        return f"NVARCHAR2({_varchar_length(length)})"
    if data_type in {"CHAR", "NCHAR"}:
        return f"{data_type}({_varchar_length(length, 1)})"
    if data_type in {"TEXT", "TINYTEXT", "MEDIUMTEXT", "LONGTEXT", "CLOB", "NCLOB", "LONG", "JSON", "JSONB", "XML", "XMLTYPE"}:
        return "CLOB"
    if data_type in {"BLOB", "TINYBLOB", "MEDIUMBLOB", "LONGBLOB", "BINARY", "VARBINARY", "RAW", "LONG RAW", "BYTEA"}:
        if data_type in {"RAW", "VARBINARY", "BINARY"} and length:
            return f"RAW({_varchar_length(length)})" if not dameng else f"VARBINARY({_varchar_length(length)})"
        return "BLOB"
    if data_type in {"NUMBER", "NUMERIC", "DECIMAL", "DEC"}:
        return f"NUMBER({length})" if length else "NUMBER"
    integer_precision = {
        "TINYINT": 3,
        "SMALLINT": 5,
        "MEDIUMINT": 8,
        "INTEGER": 10,
        "INT": 10,
        "BIGINT": 19,
    }
    if data_type in integer_precision:
        return f"NUMBER({integer_precision[data_type]})"
    if data_type in {"FLOAT", "REAL", "BINARY_FLOAT"}:
        return "FLOAT" if dameng else "BINARY_FLOAT"
    if data_type in {"DOUBLE", "BINARY_DOUBLE"}:
        return "DOUBLE" if dameng else "BINARY_DOUBLE"
    if data_type in {"BOOLEAN", "BIT"}:
        return "BIT" if dameng else "NUMBER(1)"
    if data_type == "DATETIME":
        return "DATETIME" if dameng else "TIMESTAMP"
    if data_type in {"DATE", "TIMESTAMP", "TIME"}:
        if data_type == "TIME" and not dameng:
            return "TIMESTAMP"
        return data_type
    if data_type == "YEAR":
        return "NUMBER(4)"
    if data_type == "UUID":
        return f"{varchar_name}(36)"
    if data_type in {"ROWID", "UROWID"} and not dameng:
        return data_type
    fallback = f"{varchar_name}(255)"
    warnings.add("unknown_type", f"无法识别数据类型“{raw_type or '空'}”，已映射为 {fallback}", table=table, column=column)
    return fallback


def _ignite_type(
    column: dict[str, Any],
    warnings: WarningCollector,
    table: dict[str, Any],
) -> str:
    raw_type = str(column.get("data_type") or "").strip()
    data_type = _normalized_type(raw_type)
    length = _normalized_length(column.get("length"))
    if data_type in {"VARCHAR", "VARCHAR2", "NVARCHAR2", "TEXT", "TINYTEXT", "MEDIUMTEXT", "LONGTEXT", "CLOB", "NCLOB", "LONG", "JSON", "JSONB", "XML", "XMLTYPE"}:
        return f"VARCHAR({_varchar_length(length, 65535 if data_type not in {'VARCHAR', 'VARCHAR2', 'NVARCHAR2'} else 255)})"
    if data_type in {"CHAR", "NCHAR"}:
        return f"CHAR({_varchar_length(length, 1)})"
    if data_type in {"BLOB", "TINYBLOB", "MEDIUMBLOB", "LONGBLOB", "BINARY", "VARBINARY", "RAW", "LONG RAW", "BYTEA"}:
        return f"BINARY({_varchar_length(length, 65535)})"
    if data_type in {"NUMBER", "NUMERIC", "DECIMAL", "DEC"}:
        return f"DECIMAL({length})" if length else "DECIMAL"
    if data_type in {"INTEGER", "INT", "MEDIUMINT"}:
        return "INT"
    if data_type in {"BIGINT", "SMALLINT", "TINYINT"}:
        return data_type
    if data_type in {"FLOAT", "REAL", "BINARY_FLOAT"}:
        return "REAL"
    if data_type in {"DOUBLE", "BINARY_DOUBLE"}:
        return "DOUBLE"
    if data_type in {"BOOLEAN", "BIT"}:
        return "BOOLEAN"
    if data_type in {"DATE", "TIMESTAMP", "TIME"}:
        return data_type
    if data_type == "DATETIME":
        return "TIMESTAMP"
    if data_type == "YEAR":
        return "SMALLINT"
    if data_type == "UUID":
        return "UUID"
    fallback = "VARCHAR(255)"
    warnings.add("unknown_type", f"无法识别数据类型“{raw_type or '空'}”，已映射为 {fallback}", table=table, column=column)
    return fallback


def _prepared_columns(
    table: dict[str, Any],
    database: str,
    warnings: WarningCollector,
) -> list[tuple[dict[str, Any], str, str]]:
    prepared: list[tuple[dict[str, Any], str, str]] = []
    used: set[str] = set()
    for index, column in enumerate(table.get("fields") or [], start=1):
        code = _safe_identifier(column.get("code"), f"COLUMN_{index}", warnings, table=table, column=column)
        base_code = code
        suffix = 2
        while code.casefold() in used:
            code = f"{base_code}_{suffix}"
            suffix += 1
        if code != base_code:
            warnings.add("duplicate_identifier", f"字段标识“{base_code}”重复，已改为“{code}”", table=table, column=column)
        used.add(code.casefold())
        if database in {"mysql", "tdsql"}:
            sql_type = _mysql_type(column, warnings, table)
        elif database == "oracle":
            sql_type = _oracle_like_type(column, warnings, table, dameng=False)
        elif database == "dameng":
            sql_type = _oracle_like_type(column, warnings, table, dameng=True)
        else:
            sql_type = _ignite_type(column, warnings, table)
        prepared.append((column, code, sql_type))
    return prepared


def _mysql_table(
    table: dict[str, Any],
    config: dict[str, Any],
    warnings: WarningCollector,
    *,
    tdsql: bool,
) -> str:
    database = "tdsql" if tdsql else "mysql"
    table_code = _safe_identifier(table.get("code"), f"TABLE_{int(table.get('ordinal') or 0) + 1}", warnings, table=table)
    qualified = _qualified_name(str(config.get("schema") or "").strip(), table_code, database)
    prepared = _prepared_columns(table, database, warnings)
    if not prepared:
        warnings.add("empty_table", "表中没有字段，无法生成有效 CREATE TABLE", table=table, severity="error")
        return f"-- 跳过空表：{table_code}"
    definitions: list[str] = []
    primary_keys: list[str] = []
    for column, code, sql_type in prepared:
        nullable = "" if bool(column.get("nullable", True)) else " NOT NULL"
        comment = ""
        if bool(config.get("include_comments", True)):
            description = _column_comment(column)
            if description:
                comment = f" COMMENT {_sql_string(description)}"
        definitions.append(
            f"  {_quote_identifier(code, database)} {sql_type}{nullable}{_default_clause(column.get('default_value'))}{comment}"
        )
        if bool(column.get("is_primary_key")):
            primary_keys.append(code)
    if primary_keys:
        definitions.append("  PRIMARY KEY (" + ", ".join(_quote_identifier(code, database) for code in primary_keys) + ")")
    create_keyword = "CREATE TABLE IF NOT EXISTS" if bool(config.get("if_not_exists", True)) else "CREATE TABLE"
    body = f"{create_keyword} {qualified} (\n" + ",\n".join(definitions) + "\n)"
    options: list[str] = []
    if not tdsql:
        engine = str(config.get("engine") or "InnoDB")
        allowed_engines = {str(item["value"]) for item in MYSQL_STORAGE_ENGINES}
        if engine not in allowed_engines:
            engine = "InnoDB"
            warnings.add("invalid_engine", "存储引擎不可用，已回退为 InnoDB", table=table)
        charset = str(config.get("charset") or "utf8mb4")
        allowed_charsets = {str(item["value"]) for item in MYSQL_CHARACTER_SETS}
        if charset not in allowed_charsets:
            charset = "utf8mb4"
            warnings.add("invalid_charset", "字符集不在目标版本清单中，已回退为 utf8mb4", table=table)
        collation = str(config.get("collation") or MYSQL_DEFAULT_COLLATIONS[charset])
        allowed_collations = set(MYSQL_COLLATIONS_BY_CHARACTER_SET[charset])
        if collation not in allowed_collations:
            collation = MYSQL_DEFAULT_COLLATIONS[charset]
            warnings.add(
                "invalid_collation",
                f"排序规则与字符集 {charset} 不匹配，已回退为 {collation}",
                table=table,
            )
        options.extend([f"ENGINE={engine}", f"DEFAULT CHARSET={charset}", f"COLLATE={collation}"])
    else:
        charset = str(config.get("charset") or "utf8mb4")
        allowed_charsets = {str(item["value"]) for item in MYSQL_CHARACTER_SETS}
        if charset not in allowed_charsets:
            charset = "utf8mb4"
            warnings.add("invalid_charset", "字符集不在目标版本清单中，已回退为 utf8mb4", table=table)
        options.extend(["ENGINE=InnoDB", f"DEFAULT CHARSET={charset}"])
    if bool(config.get("include_comments", True)):
        description = _table_comment(table)
        if description:
            options.append(f"COMMENT={_sql_string(description)}")
    if options:
        body += " " + " ".join(options)
    if tdsql:
        mode = str(config.get("tdsql_mode") or "shard")
        if mode == "broadcast":
            body += " SHARDKEY=noshardkey_allset"
        elif mode == "shard":
            if primary_keys:
                body += f" SHARDKEY={_quote_identifier(primary_keys[0], database)}"
            else:
                warnings.add("missing_shard_key", "HASH 分表需要主键；该表已按单表语法生成", table=table, severity="error")
        elif mode != "single":
            warnings.add("invalid_tdsql_mode", "未知的 TDSQL 表类型；该表已按单表语法生成", table=table)
    statements: list[str] = []
    if bool(config.get("drop_table", False)):
        statements.append(f"DROP TABLE IF EXISTS {qualified};")
    statements.append(body + ";")
    return "\n\n".join(statements)


def _oracle_like_table(
    table: dict[str, Any],
    config: dict[str, Any],
    warnings: WarningCollector,
    *,
    dameng: bool,
) -> str:
    database = "dameng" if dameng else "oracle"
    table_code = _safe_identifier(table.get("code"), f"TABLE_{int(table.get('ordinal') or 0) + 1}", warnings, table=table)
    qualified = _qualified_name(str(config.get("schema") or "").strip(), table_code, database)
    prepared = _prepared_columns(table, database, warnings)
    if not prepared:
        warnings.add("empty_table", "表中没有字段，无法生成有效 CREATE TABLE", table=table, severity="error")
        return f"-- 跳过空表：{table_code}"
    definitions: list[str] = []
    primary_keys: list[str] = []
    for column, code, sql_type in prepared:
        nullable = "" if bool(column.get("nullable", True)) else " NOT NULL"
        definitions.append(
            f"  {_quote_identifier(code, database)} {sql_type}{_default_clause(column.get('default_value'))}{nullable}"
        )
        if bool(column.get("is_primary_key")):
            primary_keys.append(code)
    if primary_keys:
        definitions.append("  PRIMARY KEY (" + ", ".join(_quote_identifier(code, database) for code in primary_keys) + ")")
    statements: list[str] = []
    if bool(config.get("drop_table", False)):
        if dameng:
            statements.append(f"DROP TABLE IF EXISTS {qualified};")
        else:
            escaped = qualified.replace("'", "''")
            statements.append(
                "BEGIN\n"
                f"  EXECUTE IMMEDIATE 'DROP TABLE {escaped} CASCADE CONSTRAINTS';\n"
                "EXCEPTION\n"
                "  WHEN OTHERS THEN\n"
                "    IF SQLCODE != -942 THEN RAISE; END IF;\n"
                "END;\n/"
            )
    create = "CREATE TABLE " + qualified + " (\n" + ",\n".join(definitions) + "\n)"
    tablespace = str(config.get("tablespace") or "").strip()
    if tablespace:
        create += f" TABLESPACE {_quote_identifier(tablespace, database)}"
    statements.append(create + ";")
    if bool(config.get("include_comments", True)):
        table_description = _table_comment(table)
        if table_description:
            statements.append(f"COMMENT ON TABLE {qualified} IS {_sql_string(table_description)};")
        for column, code, _ in prepared:
            description = _column_comment(column)
            if description:
                statements.append(
                    f"COMMENT ON COLUMN {qualified}.{_quote_identifier(code, database)} IS {_sql_string(description)};"
                )
    return "\n\n".join(statements)


def _ignite_table(
    table: dict[str, Any],
    config: dict[str, Any],
    warnings: WarningCollector,
) -> str:
    database = "ignite"
    table_code = _safe_identifier(table.get("code"), f"TABLE_{int(table.get('ordinal') or 0) + 1}", warnings, table=table)
    qualified = _qualified_name(str(config.get("schema") or "PUBLIC").strip(), table_code, database)
    prepared = _prepared_columns(table, database, warnings)
    if not prepared:
        warnings.add("empty_table", "表中没有字段，无法生成有效 CREATE TABLE", table=table, severity="error")
        return f"-- 跳过空表：{table_code}"
    definitions: list[str] = []
    primary_keys: list[str] = []
    for column, code, sql_type in prepared:
        nullable = "" if bool(column.get("nullable", True)) else " NOT NULL"
        definitions.append(
            f"  {_quote_identifier(code, database)} {sql_type}{_default_clause(column.get('default_value'))}{nullable}"
        )
        if bool(column.get("is_primary_key")):
            primary_keys.append(code)
    if primary_keys:
        definitions.append("  PRIMARY KEY (" + ", ".join(_quote_identifier(code, database) for code in primary_keys) + ")")
    else:
        warnings.add("ignite_missing_primary_key", "Ignite 表未定义主键，请在执行前确认缓存键设计", table=table, severity="error")
    create_keyword = "CREATE TABLE IF NOT EXISTS" if bool(config.get("if_not_exists", True)) else "CREATE TABLE"
    create = f"{create_keyword} {qualified} (\n" + ",\n".join(definitions) + "\n)"
    template = str(config.get("ignite_template") or "PARTITIONED").upper()
    if template not in {"PARTITIONED", "REPLICATED"}:
        template = "PARTITIONED"
        warnings.add("invalid_ignite_template", "缓存模板不可用，已回退为 PARTITIONED", table=table)
    with_options = [f"TEMPLATE={template}"]
    if template == "PARTITIONED":
        backups = max(0, min(10, int(config.get("ignite_backups") or 0)))
        with_options.append(f"BACKUPS={backups}")
    atomicity = str(config.get("ignite_atomicity") or "ATOMIC").upper()
    if atomicity not in {"ATOMIC", "TRANSACTIONAL"}:
        atomicity = "ATOMIC"
    with_options.append(f"ATOMICITY={atomicity}")
    write_sync = str(config.get("ignite_write_sync") or "FULL_SYNC").upper()
    if write_sync not in {"FULL_SYNC", "PRIMARY_SYNC", "FULL_ASYNC"}:
        write_sync = "FULL_SYNC"
    with_options.append(f"WRITE_SYNCHRONIZATION_MODE={write_sync}")
    cache_group = str(config.get("ignite_cache_group") or "").strip()
    if cache_group:
        with_options.append(f"CACHE_GROUP={cache_group}")
    if primary_keys and bool(config.get("ignite_affinity_key", True)):
        with_options.append(f"AFFINITY_KEY={primary_keys[0]}")
    create += ' WITH "' + ",".join(with_options) + '";'
    statements: list[str] = []
    if bool(config.get("drop_table", False)):
        statements.append(f"DROP TABLE IF EXISTS {qualified};")
    if bool(config.get("include_comments", True)) and (_table_comment(table) or any(_column_comment(column) for column, _, _ in prepared)):
        warnings.add("ignite_comments_not_persisted", "Ignite 2.15 CREATE TABLE 不持久化表与字段注释，已仅在脚本中保留说明", table=table, severity="info")
        description = _table_comment(table)
        if description:
            statements.append(f"-- {table_code}: {description.replace(chr(10), ' ')}")
    statements.append(create)
    return "\n\n".join(statements)


def generate_ddl(tables: Iterable[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any]:
    selected = list(tables)
    database = str(config.get("database") or "").lower()
    if database not in DATABASE_LABELS:
        raise ValueError("不支持的目标数据库")
    version = str(config.get("version") or "").strip()
    database_option = next(item for item in DDL_OPTIONS["databases"] if item["value"] == database)
    if version not in database_option["versions"]:
        raise ValueError("目标数据库版本不受支持")
    if not selected:
        raise ValueError("请至少选择一张数据表")

    warnings = WarningCollector()
    header = [
        f"-- 码熊生成 · {DATABASE_LABELS[database]} {version}",
        f"-- 共 {len(selected)} 张表，{sum(len(table.get('fields') or []) for table in selected)} 个字段",
        "-- 生成结果可在码熊中继续编辑，请在目标环境执行前复核。",
    ]
    blocks: list[str] = []
    for table in selected:
        if database == "mysql":
            blocks.append(_mysql_table(table, config, warnings, tdsql=False))
        elif database == "tdsql":
            blocks.append(_mysql_table(table, config, warnings, tdsql=True))
        elif database == "oracle":
            blocks.append(_oracle_like_table(table, config, warnings, dameng=False))
        elif database == "dameng":
            blocks.append(_oracle_like_table(table, config, warnings, dameng=True))
        else:
            blocks.append(_ignite_table(table, config, warnings))
    if warnings.total > len(warnings.items):
        warnings.items.append(
            {
                "code": "warnings_truncated",
                "severity": "info",
                "message": f"另有 {warnings.total - len(warnings.items)} 项提醒未逐条展示",
                "table_id": "",
                "table_code": "",
                "field_code": "",
            }
        )
    script = "\n".join(header) + "\n\n" + "\n\n".join(blocks) + "\n"
    return {
        "database": database,
        "database_label": DATABASE_LABELS[database],
        "version": version,
        "extension": str(database_option["extension"]),
        "script": script,
        "warnings": warnings.items,
        "warning_count": warnings.total,
        "table_count": len(selected),
        "column_count": sum(len(table.get("fields") or []) for table in selected),
        "line_count": script.count("\n"),
        "char_count": len(script),
    }
