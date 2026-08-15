from backend.tray_menu import MenuMetrics, popup_position


def test_menu_rows_exclude_padding_and_divider() -> None:
    metrics = MenuMetrics()
    assert metrics.height == 126
    assert metrics.row_at(3) is None
    assert metrics.row_at(4) == 0
    assert metrics.row_at(31) == 0
    assert metrics.row_at(32) == 1
    assert metrics.row_at(59) == 1
    assert metrics.row_at(60) == 2
    assert metrics.row_at(87) == 2
    assert metrics.row_at(88) is None
    assert metrics.row_at(93) is None
    assert metrics.row_at(94) == 3
    assert metrics.row_at(121) == 3
    assert metrics.row_at(122) is None


def test_popup_position_stays_inside_monitor_work_area() -> None:
    assert popup_position(1918, 1078, 148, 126, 0, 0, 1920, 1080) == (1764, 946)
    assert popup_position(3, 4, 148, 126, 0, 0, 1920, 1080) == (8, 8)
