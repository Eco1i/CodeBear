from __future__ import annotations


def test_main_module_builds_all_routes() -> None:
    import backend.app.main as main_module

    route_paths = [route.path for route in main_module.app.routes]
    paths = set(route_paths)
    assert "/api/dictionaries/excel/import" in paths
    assert "/api/updates/check" in paths
    assert "/api/updates/ignore" in paths
    assert "/api/tables/delete-preview" in paths
    assert "/api/tables/delete" in paths
    assert "/api/tables/{table_id}/relations" in paths
    assert "/api/relations" in paths
    assert "/api/relations/{relation_id}" in paths
    assert "/api/health" in paths
    assert route_paths.index("/api/tables/delete") < route_paths.index("/api/tables/{table_id}")
