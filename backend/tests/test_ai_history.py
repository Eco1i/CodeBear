from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.ai_history import AiConversationService
from backend.app.database import Database
from backend.app.service import ServiceError


def history_service(tmp_path: Path) -> tuple[Database, AiConversationService]:
    database = Database(tmp_path / "maxiong.db")
    database.initialize()
    return database, AiConversationService(database)


def test_ai_conversation_round_trip_preserves_structured_message_data(tmp_path: Path) -> None:
    _, service = history_service(tmp_path)
    created = service.create_conversation(
        {
            "id": "user-1",
            "role": "user",
            "content": "  行情价格主要存在哪张表？  ",
            "payload": {"scope": {"type": "project", "project_id": "project-1"}},
        }
    )

    assert created["title"] == "行情价格主要存在哪张表？"
    assert created["message_count"] == 1
    assert created["messages"][0]["scope"] == {"type": "project", "project_id": "project-1"}

    result = service.add_message(
        created["id"],
        {
            "id": "assistant-1",
            "role": "assistant",
            "content": "最直接的是行情信息表。",
            "payload": {
                "model": "deepseek-v4-flash",
                "confidence": "high",
                "evidence": [
                    {
                        "table_id": "table-1",
                        "table_code": "TTRD_MARKET_PRICE",
                        "table_name": "行情信息表",
                        "relevance": "direct",
                    }
                ],
            },
        },
    )

    assert result["conversation"]["message_count"] == 2
    assert result["conversation"]["preview"] == "最直接的是行情信息表。"
    loaded = service.get_conversation(created["id"])
    assert [message["id"] for message in loaded["messages"]] == ["user-1", "assistant-1"]
    assert loaded["messages"][1]["confidence"] == "high"
    assert loaded["messages"][1]["evidence"][0]["table_id"] == "table-1"


def test_ai_conversations_are_sorted_renamed_and_deleted_locally(tmp_path: Path) -> None:
    database, service = history_service(tmp_path)
    first = service.create_conversation(
        {"id": "user-a", "role": "user", "content": "第一段对话", "payload": {}}
    )
    second = service.create_conversation(
        {"id": "user-b", "role": "user", "content": "第二段对话", "payload": {}}
    )

    summaries = service.list_conversations()
    assert {item["id"] for item in summaries} == {first["id"], second["id"]}

    renamed = service.rename_conversation(first["id"], "  行情表排查  ")
    assert renamed["title"] == "行情表排查"

    service.delete_conversation(first["id"])
    assert [item["id"] for item in service.list_conversations()] == [second["id"]]
    with database.connect() as connection:
        remaining = connection.execute(
            "SELECT COUNT(*) FROM ai_messages WHERE conversation_id = ?",
            (first["id"],),
        ).fetchone()[0]
    assert remaining == 0

    with pytest.raises(ServiceError) as error:
        service.get_conversation(first["id"])
    assert error.value.code == "ai_conversation_not_found"


def test_ai_message_retries_are_idempotent_and_conflicts_are_rejected(tmp_path: Path) -> None:
    _, service = history_service(tmp_path)
    created = service.create_conversation(
        {"id": "stable-message", "role": "user", "content": "查找商品信息表", "payload": {}}
    )

    retried = service.add_message(
        created["id"],
        {"id": "stable-message", "role": "user", "content": "查找商品信息表", "payload": {}},
    )
    assert retried["conversation"]["message_count"] == 1

    with pytest.raises(ServiceError) as error:
        service.add_message(
            created["id"],
            {"id": "stable-message", "role": "user", "content": "另一条消息", "payload": {}},
        )
    assert error.value.code == "ai_message_conflict"
