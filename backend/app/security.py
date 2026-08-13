from __future__ import annotations

from urllib.parse import urlsplit

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


def _is_loopback_authority(value: str) -> bool:
    try:
        parsed = urlsplit(f"//{value}")
        _ = parsed.port
    except ValueError:
        return False
    return (
        parsed.hostname in LOOPBACK_HOSTS
        and parsed.username is None
        and parsed.password is None
        and not parsed.path
        and not parsed.query
        and not parsed.fragment
    )


def _is_loopback_origin(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        _ = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme == "http"
        and parsed.hostname in LOOPBACK_HOSTS
        and parsed.username is None
        and parsed.password is None
        and parsed.path in ("", "/")
        and not parsed.query
        and not parsed.fragment
    )


class LocalRequestGuardMiddleware:
    """Reject DNS rebinding and cross-site browser requests to the local API."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        host = headers.get("host", "")
        if not _is_loopback_authority(host):
            await self._reject(scope, receive, send, 400, "拒绝非本机 Host", "invalid_host")
            return

        origin = headers.get("origin")
        if origin and not _is_loopback_origin(origin):
            await self._reject(scope, receive, send, 403, "拒绝非本地来源请求", "invalid_origin")
            return

        if headers.get("sec-fetch-site", "").casefold() == "cross-site":
            await self._reject(scope, receive, send, 403, "拒绝跨站请求", "cross_site_request")
            return

        await self.app(scope, receive, send)

    @staticmethod
    async def _reject(
        scope: Scope,
        receive: Receive,
        send: Send,
        status_code: int,
        message: str,
        code: str,
    ) -> None:
        response = JSONResponse(
            status_code=status_code,
            content={"detail": {"message": message, "code": code}},
        )
        await response(scope, receive, send)
