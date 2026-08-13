from __future__ import annotations

import json
import re
import sqlite3
import uuid
from typing import Any

from .database import Database
from .service import ServiceError, utc_now


MAX_MESSAGE_PAYLOAD_BYTES = 512 * 1024
DEFAULT_CONVERSATION_TITLE = "新对话"


def _plain_text(value: str, *, limit: int) -> str:
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: max(1, limit - 1)].rstrip()}…"


def _automatic_title(content: str) -> str:
    return _plain_text(content, limit=40) or DEFAULT_CONVERSATION_TITLE


def _preview(content: str) -> str:
    return _plain_text(content, limit=100)


class AiConversationService:
    def __init__(self, database: Database):
        self.database = database

    @staticmethod
    def _message_payload(payload: dict[str, Any] | None) -> str:
        try:
            encoded = json.dumps(payload or {}, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError) as exc:
            raise ServiceError(422, "对话消息包含无法保存的数据", code="invalid_ai_message") from exc
        if len(encoded.encode("utf-8")) > MAX_MESSAGE_PAYLOAD_BYTES:
            raise ServiceError(413, "对话消息数据过大", code="ai_message_too_large")
        return encoded

    @staticmethod
    def _decode_payload(raw: str) -> dict[str, Any]:
        try:
            payload = json.loads(raw or "{}")
        except json.JSONDecodeError:
            return {}
        return payload if isinstance(payload, dict) else {}

    @classmethod
    def _message_from_row(cls, row: sqlite3.Row) -> dict[str, Any]:
        payload = cls._decode_payload(str(row["payload_json"]))
        payload.update(
            {
                "id": str(row["id"]),
                "role": str(row["role"]),
                "content": str(row["content"]),
                "created_at": str(row["created_at"]),
            }
        )
        return payload

    @staticmethod
    def _summary_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "title": str(row["title"]),
            "preview": _preview(str(row["preview"] or "")),
            "message_count": int(row["message_count"] or 0),
            "created_at": str(row["created_at"]),
            "updated_at": str(row["updated_at"]),
        }

    @staticmethod
    def _conversation_row(connection: sqlite3.Connection, conversation_id: str) -> sqlite3.Row:
        row = connection.execute(
            "SELECT id, title, created_at, updated_at FROM ai_conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        if row is None:
            raise ServiceError(404, "对话记录不存在", code="ai_conversation_not_found")
        return row

    @classmethod
    def _summary(cls, connection: sqlite3.Connection, conversation_id: str) -> dict[str, Any]:
        row = connection.execute(
            """
            SELECT c.id, c.title, c.created_at, c.updated_at,
                   COUNT(m.id) AS message_count,
                   COALESCE((
                       SELECT latest.content
                       FROM ai_messages latest
                       WHERE latest.conversation_id = c.id
                       ORDER BY latest.ordinal DESC
                       LIMIT 1
                   ), '') AS preview
            FROM ai_conversations c
            LEFT JOIN ai_messages m ON m.conversation_id = c.id
            WHERE c.id = ?
            GROUP BY c.id, c.title, c.created_at, c.updated_at
            """,
            (conversation_id,),
        ).fetchone()
        if row is None:
            raise ServiceError(404, "对话记录不存在", code="ai_conversation_not_found")
        return cls._summary_from_row(row)

    def list_conversations(self, *, limit: int = 200) -> list[dict[str, Any]]:
        normalized_limit = max(1, min(int(limit), 500))
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT c.id, c.title, c.created_at, c.updated_at,
                       COUNT(m.id) AS message_count,
                       COALESCE((
                           SELECT latest.content
                           FROM ai_messages latest
                           WHERE latest.conversation_id = c.id
                           ORDER BY latest.ordinal DESC
                           LIMIT 1
                       ), '') AS preview
                FROM ai_conversations c
                JOIN ai_messages m ON m.conversation_id = c.id
                GROUP BY c.id, c.title, c.created_at, c.updated_at
                ORDER BY c.updated_at DESC, c.created_at DESC
                LIMIT ?
                """,
                (normalized_limit,),
            ).fetchall()
        return [self._summary_from_row(row) for row in rows]

    def get_conversation(self, conversation_id: str) -> dict[str, Any]:
        with self.database.connect() as connection:
            summary = self._summary(connection, conversation_id)
            rows = connection.execute(
                """
                SELECT id, role, content, payload_json, created_at
                FROM ai_messages
                WHERE conversation_id = ?
                ORDER BY ordinal
                """,
                (conversation_id,),
            ).fetchall()
        return {**summary, "messages": [self._message_from_row(row) for row in rows]}

    def create_conversation(self, first_message: dict[str, Any]) -> dict[str, Any]:
        conversation_id = str(uuid.uuid4())
        now = utc_now()
        content = str(first_message.get("content") or "").strip()
        if not content:
            raise ServiceError(422, "首条消息不能为空", code="invalid_ai_message")
        title = _automatic_title(content) if first_message.get("role") == "user" else DEFAULT_CONVERSATION_TITLE
        with self.database.transaction() as connection:
            connection.execute(
                "INSERT INTO ai_conversations(id, title, created_at, updated_at) VALUES(?, ?, ?, ?)",
                (conversation_id, title, now, now),
            )
            self._add_message(connection, conversation_id, first_message, created_at=now)
        return self.get_conversation(conversation_id)

    def add_message(self, conversation_id: str, message: dict[str, Any]) -> dict[str, Any]:
        with self.database.transaction() as connection:
            self._conversation_row(connection, conversation_id)
            stored = self._add_message(connection, conversation_id, message)
            summary = self._summary(connection, conversation_id)
        return {"conversation": summary, "message": stored}

    def _add_message(
        self,
        connection: sqlite3.Connection,
        conversation_id: str,
        message: dict[str, Any],
        *,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        message_id = str(message.get("id") or uuid.uuid4())
        role = str(message.get("role") or "")
        content = str(message.get("content") or "").strip()
        if role not in {"user", "assistant"} or not content:
            raise ServiceError(422, "对话消息格式不正确", code="invalid_ai_message")

        existing = connection.execute(
            """
            SELECT id, conversation_id, role, content, payload_json, created_at
            FROM ai_messages
            WHERE id = ?
            """,
            (message_id,),
        ).fetchone()
        if existing is not None:
            if (
                str(existing["conversation_id"]) == conversation_id
                and str(existing["role"]) == role
                and str(existing["content"]) == content
            ):
                return self._message_from_row(existing)
            raise ServiceError(409, "对话消息标识冲突", code="ai_message_conflict")

        payload = message.get("payload")
        payload_json = self._message_payload(payload if isinstance(payload, dict) else {})
        next_ordinal = int(
            connection.execute(
                "SELECT COALESCE(MAX(ordinal), 0) + 1 FROM ai_messages WHERE conversation_id = ?",
                (conversation_id,),
            ).fetchone()[0]
        )
        timestamp = created_at or utc_now()
        connection.execute(
            """
            INSERT INTO ai_messages(id, conversation_id, ordinal, role, content, payload_json, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            (message_id, conversation_id, next_ordinal, role, content, payload_json, timestamp),
        )
        connection.execute(
            "UPDATE ai_conversations SET updated_at = ? WHERE id = ?",
            (timestamp, conversation_id),
        )
        row = connection.execute(
            "SELECT id, role, content, payload_json, created_at FROM ai_messages WHERE id = ?",
            (message_id,),
        ).fetchone()
        if row is None:  # pragma: no cover - guarded by the transaction above.
            raise ServiceError(500, "无法保存对话消息", code="ai_message_save_failed")
        return self._message_from_row(row)

    def rename_conversation(self, conversation_id: str, title: str) -> dict[str, Any]:
        normalized = _plain_text(title, limit=80)
        if not normalized:
            raise ServiceError(422, "对话标题不能为空", code="invalid_ai_conversation_title")
        with self.database.transaction() as connection:
            self._conversation_row(connection, conversation_id)
            connection.execute(
                "UPDATE ai_conversations SET title = ? WHERE id = ?",
                (normalized, conversation_id),
            )
            return self._summary(connection, conversation_id)

    def delete_conversation(self, conversation_id: str) -> None:
        with self.database.transaction() as connection:
            self._conversation_row(connection, conversation_id)
            connection.execute("DELETE FROM ai_conversations WHERE id = ?", (conversation_id,))
