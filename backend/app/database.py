from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


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
"""


class Database:
    def __init__(self, path: Path):
        self.path = path
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
