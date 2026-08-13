import asyncio
import json
from collections.abc import Iterable

from backend.app.security import LocalRequestGuardMiddleware


def invoke(headers: Iterable[tuple[bytes, bytes]]) -> tuple[int, dict]:
    messages: list[dict] = []

    async def downstream(scope: dict, receive, send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": b'{"ok":true}'})

    async def receive() -> dict:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict) -> None:
        messages.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/write",
        "raw_path": b"/write",
        "query_string": b"",
        "server": ("127.0.0.1", 8765),
        "client": ("127.0.0.1", 50000),
        "headers": list(headers),
    }
    asyncio.run(LocalRequestGuardMiddleware(downstream)(scope, receive, send))
    status = next(message["status"] for message in messages if message["type"] == "http.response.start")
    body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return status, json.loads(body)


def test_accepts_loopback_origin() -> None:
    status, body = invoke(
        ((b"host", b"127.0.0.1:8765"), (b"origin", b"http://localhost:5173"))
    )
    assert status == 200
    assert body == {"ok": True}


def test_rejects_nonlocal_origin() -> None:
    status, body = invoke(
        ((b"host", b"127.0.0.1:8765"), (b"origin", b"https://attacker.example"))
    )
    assert status == 403
    assert body["detail"]["code"] == "invalid_origin"


def test_rejects_cross_site_request_without_origin() -> None:
    status, body = invoke(
        ((b"host", b"127.0.0.1:8765"), (b"sec-fetch-site", b"cross-site"))
    )
    assert status == 403
    assert body["detail"]["code"] == "cross_site_request"


def test_rejects_nonlocal_host() -> None:
    status, body = invoke(((b"host", b"attacker.example"),))
    assert status == 400
    assert body["detail"]["code"] == "invalid_host"
