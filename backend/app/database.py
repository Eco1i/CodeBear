from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable, Iterator


SCHEMA = """
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    root_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pdm_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    mtime_ns INTEGER NOT NULL DEFAULT 0,
    model_name TEXT NOT NULL DEFAULT '',
    pd_version TEXT NOT NULL DEFAULT '',
    target_db TEXT NOT NULL DEFAULT '',
    table_count INTEGER NOT NULL DEFAULT 0,
    field_count INTEGER NOT NULL DEFAULT 0,
    parsed_at TEXT NOT NULL,
    parse_error TEXT,
    UNIQUE(project_id, relative_path)
);

CREATE INDEX IF NOT EXISTS idx_pdm_project_path
ON pdm_files(project_id, relative_path);

CREATE TABLE IF NOT EXISTS model_tables (
    id TEXT PRIMARY KEY,
    pdm_id TEXT NOT NULL REFERENCES pdm_files(id) ON DELETE CASCADE,
    xml_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    field_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(pdm_id, xml_id)
);

CREATE INDEX IF NOT EXISTS idx_tables_pdm ON model_tables(pdm_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_tables_code ON model_tables(code);
CREATE INDEX IF NOT EXISTS idx_tables_name ON model_tables(name);

CREATE TABLE IF NOT EXISTS model_fields (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL REFERENCES model_tables(id) ON DELETE CASCADE,
    xml_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL DEFAULT '',
    data_type TEXT NOT NULL DEFAULT '',
    length TEXT NOT NULL DEFAULT '',
    nullable INTEGER NOT NULL DEFAULT 1,
    default_value TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    is_primary_key INTEGER NOT NULL DEFAULT 0,
    UNIQUE(table_id, xml_id)
);

CREATE INDEX IF NOT EXISTS idx_fields_table ON model_fields(table_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_fields_code ON model_fields(code);
CREATE INDEX IF NOT EXISTS idx_fields_name ON model_fields(name);

CREATE TABLE IF NOT EXISTS table_relations (
    id TEXT PRIMARY KEY,
    source_table_id TEXT NOT NULL REFERENCES model_tables(id) ON DELETE CASCADE,
    source_field_id TEXT NOT NULL REFERENCES model_fields(id) ON DELETE CASCADE,
    target_table_id TEXT NOT NULL REFERENCES model_tables(id) ON DELETE CASCADE,
    target_field_id TEXT NOT NULL REFERENCES model_fields(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cardinality TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('auto', 'manual')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(source_table_id, source_field_id, target_table_id, target_field_id)
);

CREATE INDEX IF NOT EXISTS idx_table_relations_source ON table_relations(source_table_id);
CREATE INDEX IF NOT EXISTS idx_table_relations_target ON table_relations(target_table_id);
CREATE INDEX IF NOT EXISTS idx_table_relations_source_field ON table_relations(source_field_id);
CREATE INDEX IF NOT EXISTS idx_table_relations_target_field ON table_relations(target_field_id);

CREATE TABLE IF NOT EXISTS dictionaries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual', 'excel')),
    source_name TEXT NOT NULL DEFAULT '',
    source_sheet TEXT NOT NULL DEFAULT '',
    code_column TEXT NOT NULL DEFAULT '',
    name_column TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dictionary_items (
    id TEXT PRIMARY KEY,
    dictionary_id TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    ordinal INTEGER NOT NULL DEFAULT 0,
    UNIQUE(dictionary_id, code)
);

CREATE INDEX IF NOT EXISTS idx_dictionary_items_dictionary
ON dictionary_items(dictionary_id, ordinal, code);

CREATE TABLE IF NOT EXISTS dictionary_field_bindings (
    field_id TEXT PRIMARY KEY REFERENCES model_fields(id) ON DELETE CASCADE,
    dictionary_id TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dictionary_bindings_dictionary
ON dictionary_field_bindings(dictionary_id, field_id);

CREATE TABLE IF NOT EXISTS trash (
    id TEXT PRIMARY KEY,
    original_project_id TEXT,
    project_name TEXT NOT NULL DEFAULT '',
    original_relative_path TEXT NOT NULL DEFAULT '',
    trash_path TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    deleted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS save_history (
    id TEXT PRIMARY KEY,
    pdm_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    backup_path TEXT NOT NULL,
    before_hash TEXT NOT NULL,
    after_hash TEXT NOT NULL,
    saved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated
ON ai_conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    UNIQUE(conversation_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
ON ai_messages(conversation_id, ordinal);

CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


FTS_INDEX_VERSION = "1-trigram"
FTS_TABLE_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS model_tables_fts USING fts5(
    code,
    name,
    comment,
    content='model_tables',
    content_rowid='rowid',
    tokenize='trigram'
);

CREATE VIRTUAL TABLE IF NOT EXISTS model_fields_fts USING fts5(
    code,
    name,
    comment,
    content='model_fields',
    content_rowid='rowid',
    tokenize='trigram'
);
"""

FTS_TRIGGER_STATEMENTS = (
    """CREATE TRIGGER IF NOT EXISTS model_tables_fts_insert
AFTER INSERT ON model_tables BEGIN
    INSERT INTO model_tables_fts(rowid, code, name, comment)
    VALUES (new.rowid, new.code, new.name, new.comment);
END""",

    """CREATE TRIGGER IF NOT EXISTS model_tables_fts_delete
AFTER DELETE ON model_tables BEGIN
    INSERT INTO model_tables_fts(model_tables_fts, rowid, code, name, comment)
    VALUES ('delete', old.rowid, old.code, old.name, old.comment);
END""",

    """CREATE TRIGGER IF NOT EXISTS model_tables_fts_update
AFTER UPDATE ON model_tables BEGIN
    INSERT INTO model_tables_fts(model_tables_fts, rowid, code, name, comment)
    VALUES ('delete', old.rowid, old.code, old.name, old.comment);
    INSERT INTO model_tables_fts(rowid, code, name, comment)
    VALUES (new.rowid, new.code, new.name, new.comment);
END""",

    """CREATE TRIGGER IF NOT EXISTS model_fields_fts_insert
AFTER INSERT ON model_fields BEGIN
    INSERT INTO model_fields_fts(rowid, code, name, comment)
    VALUES (new.rowid, new.code, new.name, new.comment);
END""",

    """CREATE TRIGGER IF NOT EXISTS model_fields_fts_delete
AFTER DELETE ON model_fields BEGIN
    INSERT INTO model_fields_fts(model_fields_fts, rowid, code, name, comment)
    VALUES ('delete', old.rowid, old.code, old.name, old.comment);
END""",

    """CREATE TRIGGER IF NOT EXISTS model_fields_fts_update
AFTER UPDATE ON model_fields BEGIN
    INSERT INTO model_fields_fts(model_fields_fts, rowid, code, name, comment)
    VALUES ('delete', old.rowid, old.code, old.name, old.comment);
    INSERT INTO model_fields_fts(rowid, code, name, comment)
    VALUES (new.rowid, new.code, new.name, new.comment);
END""",
)
FTS_TRIGGER_NAMES = tuple(
    statement.split("CREATE TRIGGER IF NOT EXISTS ", 1)[1].splitlines()[0]
    for statement in FTS_TRIGGER_STATEMENTS
)
FTS_SCHEMA = FTS_TABLE_SCHEMA + "\n" + "\n".join(
    f"{statement};" for statement in FTS_TRIGGER_STATEMENTS
)


class Database:
    def __init__(self, path: Path):
        self.path = path
        self.fts_available = False
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 30000")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            try:
                connection.executescript(FTS_SCHEMA)
                row = connection.execute(
                    "SELECT value FROM app_metadata WHERE key = 'fts_index_version'"
                ).fetchone()
                if row is None or str(row["value"]) != FTS_INDEX_VERSION:
                    self._rebuild_fts(connection)
                    connection.execute(
                        """
                        INSERT INTO app_metadata(key, value) VALUES('fts_index_version', ?)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value
                        """,
                        (FTS_INDEX_VERSION,),
                    )
                else:
                    try:
                        connection.execute(
                            "INSERT INTO model_tables_fts(model_tables_fts, rank) VALUES('integrity-check', 1)"
                        )
                        connection.execute(
                            "INSERT INTO model_fields_fts(model_fields_fts, rank) VALUES('integrity-check', 1)"
                        )
                    except sqlite3.DatabaseError:
                        self._rebuild_fts(connection)
                self.fts_available = True
            except sqlite3.DatabaseError:
                # FTS is a performance cache. Unsupported or damaged indexes must
                # never prevent the workspace from opening with LIKE search.
                self.fts_available = False

    @staticmethod
    def _rebuild_fts(connection: sqlite3.Connection) -> None:
        connection.execute("INSERT INTO model_tables_fts(model_tables_fts) VALUES('rebuild')")
        connection.execute("INSERT INTO model_fields_fts(model_fields_fts) VALUES('rebuild')")

    @staticmethod
    def _fts_pdm_chunks(pdm_ids: Iterable[str]) -> Iterator[tuple[str, ...]]:
        values = tuple(dict.fromkeys(pdm_ids))
        for offset in range(0, len(values), 400):
            yield values[offset:offset + 400]

    @classmethod
    def _delete_fts_for_pdms(cls, connection: sqlite3.Connection, pdm_ids: Iterable[str]) -> None:
        for chunk in cls._fts_pdm_chunks(pdm_ids):
            placeholders = ", ".join("?" for _ in chunk)
            connection.execute(
                f"""
                INSERT INTO model_fields_fts(model_fields_fts, rowid, code, name, comment)
                SELECT 'delete', mf.rowid, mf.code, mf.name, mf.comment
                FROM model_fields mf
                JOIN model_tables mt ON mt.id = mf.table_id
                WHERE mt.pdm_id IN ({placeholders})
                """,
                chunk,
            )
            connection.execute(
                f"""
                INSERT INTO model_tables_fts(model_tables_fts, rowid, code, name, comment)
                SELECT 'delete', rowid, code, name, comment
                FROM model_tables
                WHERE pdm_id IN ({placeholders})
                """,
                chunk,
            )

    @classmethod
    def _insert_fts_for_pdms(cls, connection: sqlite3.Connection, pdm_ids: Iterable[str]) -> None:
        for chunk in cls._fts_pdm_chunks(pdm_ids):
            placeholders = ", ".join("?" for _ in chunk)
            connection.execute(
                f"""
                INSERT INTO model_tables_fts(rowid, code, name, comment)
                SELECT rowid, code, name, comment
                FROM model_tables
                WHERE pdm_id IN ({placeholders})
                """,
                chunk,
            )
            connection.execute(
                f"""
                INSERT INTO model_fields_fts(rowid, code, name, comment)
                SELECT mf.rowid, mf.code, mf.name, mf.comment
                FROM model_fields mf
                JOIN model_tables mt ON mt.id = mf.table_id
                WHERE mt.pdm_id IN ({placeholders})
                """,
                chunk,
            )

    @contextmanager
    def defer_fts_updates(
        self,
        connection: sqlite3.Connection,
        existing_pdm_ids: Iterable[str],
    ) -> Iterator[set[str]]:
        """Synchronize affected FTS rows once after a transaction-sized batch."""
        updated_pdm_ids: set[str] = set()
        if not self.fts_available:
            yield updated_pdm_ids
            return
        for trigger_name in FTS_TRIGGER_NAMES:
            connection.execute(f"DROP TRIGGER IF EXISTS {trigger_name}")
        try:
            self._delete_fts_for_pdms(connection, existing_pdm_ids)
            yield updated_pdm_ids
            self._insert_fts_for_pdms(connection, updated_pdm_ids)
            for statement in FTS_TRIGGER_STATEMENTS:
                connection.execute(statement)
        except Exception:
            # Trigger drops are transactional. The surrounding rollback restores
            # the original triggers together with the content tables.
            raise

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
