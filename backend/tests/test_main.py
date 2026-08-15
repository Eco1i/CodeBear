from __future__ import annotations


def test_main_module_builds_all_routes() -> None:
    import backend.app.main as main_module

    paths = {route.path for route in main_module.app.routes}
    assert "/api/dictionaries/excel/import" in paths
    assert "/api/updates/check" in paths
    assert "/api/updates/ignore" in paths
    assert "/api/tables/{table_id}/relations" in paths
    assert "/api/relations" in paths
    assert "/api/relations/{relation_id}" in paths
    assert "/api/health" in paths
