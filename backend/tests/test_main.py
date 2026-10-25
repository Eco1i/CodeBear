from __future__ import annotations

from importlib import import_module

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient


def test_main_module_builds_all_routes() -> None:
    main_module = import_module("backend.app.main")

    route_paths = [
        route.path for route in main_module.app.routes if isinstance(route, APIRoute)
    ]
    paths = set(route_paths)
    assert "/api/dictionaries/excel/import" in paths
    assert "/api/updates/check" in paths
    assert "/api/updates/ignore" in paths
    assert "/api/tables/delete-preview" in paths
    assert "/api/tables/delete" in paths
    assert "/api/tables/{table_id}/export" in paths
    assert "/api/tables/{table_id}/relations" in paths
    assert "/api/relations" in paths
    assert "/api/relations/{relation_id}" in paths
    assert "/api/health" in paths
    assert "/api/settings/startup" in paths
    assert route_paths.index("/api/tables/delete") < route_paths.index(
        "/api/tables/{table_id}"
    )


def test_table_structure_export_endpoint_returns_a_download(monkeypatch) -> None:
    main_module = import_module("backend.app.main")

    monkeypatch.setattr(
        main_module.service,
        "table_detail",
        lambda table_id: {
            "id": table_id,
            "name": "用户表",
            "code": "t_user",
            "comment": "保存系统用户",
            "fields": [],
        },
    )
    response = TestClient(main_module.app).get(
        "/api/tables/table-1/export?format=json&language=en-US",
        headers={"host": "127.0.0.1:8765"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json; charset=utf-8"
    assert "filename*=UTF-8''t_user.json" in response.headers["content-disposition"]
    assert response.json()["table"]["code"] == "t_user"
    assert response.headers["cache-control"] == "no-store"


def test_startup_settings_endpoints_read_and_update_the_current_user_choice(
    monkeypatch,
) -> None:
    main_module = import_module("backend.app.main")

    class FakeStartupService:
        enabled = False

        def get_status(self) -> dict[str, bool]:
            return {"supported": True, "enabled": self.enabled}

        def set_enabled(self, enabled: bool) -> dict[str, bool]:
            self.enabled = enabled
            return self.get_status()

    monkeypatch.setattr(main_module, "startup_service", FakeStartupService())
    client = TestClient(main_module.app)
    headers = {"host": "127.0.0.1:8765"}

    assert client.get("/api/settings/startup", headers=headers).json() == {
        "supported": True,
        "enabled": False,
    }
    response = client.put(
        "/api/settings/startup",
        json={"enabled": True},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json() == {"supported": True, "enabled": True}

    invalid = client.put(
        "/api/settings/startup",
        json={"enabled": "true"},
        headers=headers,
    )
    assert invalid.status_code == 422
