from __future__ import annotations

import ctypes
import sys
from ctypes import wintypes
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class MenuMetrics:
    width: int = 148
    row_height: int = 28
    divider_height: int = 6
    padding: int = 4

    @property
    def height(self) -> int:
        return self.padding * 2 + self.row_height * 3 + self.divider_height

    def row_at(self, y: int) -> int | None:
        first_start = self.padding
        first_end = first_start + self.row_height
        second_end = first_end + self.row_height
        third_start = second_end + self.divider_height
        if first_start <= y < first_end:
            return 0
        if first_end <= y < second_end:
            return 1
        if third_start <= y < third_start + self.row_height:
            return 2
        return None


def popup_position(
    cursor_x: int,
    cursor_y: int,
    menu_width: int,
    menu_height: int,
    work_left: int,
    work_top: int,
    work_right: int,
    work_bottom: int,
) -> tuple[int, int]:
    """Place the menu above and left of the cursor, clamped to the monitor."""
    margin = 8
    x = min(cursor_x - menu_width + 12, work_right - menu_width - margin)
    y = min(cursor_y - menu_height + 8, work_bottom - menu_height - margin)
    return max(work_left + margin, x), max(work_top + margin, y)


def enable_high_dpi() -> None:
    """Opt into crisp per-monitor rendering before any desktop window exists."""
    if sys.platform != "win32":
        return
    try:
        awareness = ctypes.c_void_p(-4)  # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
        if ctypes.windll.user32.SetProcessDpiAwarenessContext(awareness):
            return
    except (AttributeError, OSError):
        pass
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except (AttributeError, OSError):
        pass


if sys.platform == "win32":
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)
    dwmapi = ctypes.WinDLL("dwmapi", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    WM_DESTROY = 0x0002
    WM_PAINT = 0x000F
    WM_KILLFOCUS = 0x0008
    WM_KEYDOWN = 0x0100
    WM_MOUSEMOVE = 0x0200
    WM_LBUTTONUP = 0x0202
    WM_MOUSELEAVE = 0x02A3
    VK_ESCAPE = 0x1B
    VK_RETURN = 0x0D
    VK_UP = 0x26
    VK_DOWN = 0x28
    WS_POPUP = 0x80000000
    WS_EX_TOPMOST = 0x00000008
    WS_EX_TOOLWINDOW = 0x00000080
    SW_SHOWNOACTIVATE = 4
    SW_SHOW = 5
    SWP_NOMOVE = 0x0002
    SWP_NOSIZE = 0x0001
    SWP_NOACTIVATE = 0x0010
    HWND_TOPMOST = -1
    CS_DROPSHADOW = 0x00020000
    COLOR_WINDOW = 5
    IDC_ARROW = 32512
    MONITOR_DEFAULTTONEAREST = 2
    TME_LEAVE = 0x00000002
    DT_LEFT = 0x00000000
    DT_VCENTER = 0x00000004
    DT_SINGLELINE = 0x00000020
    TRANSPARENT = 1
    FW_NORMAL = 400

    class RECT(ctypes.Structure):
        _fields_ = [("left", wintypes.LONG), ("top", wintypes.LONG), ("right", wintypes.LONG), ("bottom", wintypes.LONG)]

    class POINT(ctypes.Structure):
        _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]

    class PAINTSTRUCT(ctypes.Structure):
        _fields_ = [
            ("hdc", wintypes.HDC),
            ("fErase", wintypes.BOOL),
            ("rcPaint", RECT),
            ("fRestore", wintypes.BOOL),
            ("fIncUpdate", wintypes.BOOL),
            ("rgbReserved", ctypes.c_byte * 32),
        ]

    class MONITORINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", RECT), ("rcWork", RECT), ("dwFlags", wintypes.DWORD)]

    class TRACKMOUSEEVENT(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("dwFlags", wintypes.DWORD), ("hwndTrack", wintypes.HWND), ("dwHoverTime", wintypes.DWORD)]

    WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

    class WNDCLASSW(ctypes.Structure):
        _fields_ = [
            ("style", wintypes.UINT),
            ("lpfnWndProc", WNDPROC),
            ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int),
            ("hInstance", wintypes.HINSTANCE),
            ("hIcon", wintypes.HICON),
            ("hCursor", wintypes.HANDLE),
            ("hbrBackground", wintypes.HBRUSH),
            ("lpszMenuName", wintypes.LPCWSTR),
            ("lpszClassName", wintypes.LPCWSTR),
        ]

    kernel32.GetModuleHandleW.restype = wintypes.HINSTANCE
    user32.LoadCursorW.restype = wintypes.HANDLE
    user32.RegisterClassW.argtypes = [ctypes.POINTER(WNDCLASSW)]
    user32.RegisterClassW.restype = wintypes.ATOM
    user32.CreateWindowExW.argtypes = [
        wintypes.DWORD,
        wintypes.LPCWSTR,
        wintypes.LPCWSTR,
        wintypes.DWORD,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.HWND,
        wintypes.HMENU,
        wintypes.HINSTANCE,
        wintypes.LPVOID,
    ]
    user32.CreateWindowExW.restype = wintypes.HWND
    user32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user32.DefWindowProcW.restype = ctypes.c_ssize_t
    user32.GetCursorPos.argtypes = [ctypes.POINTER(POINT)]
    user32.MonitorFromPoint.argtypes = [POINT, wintypes.DWORD]
    user32.MonitorFromPoint.restype = wintypes.HANDLE
    user32.GetMonitorInfoW.argtypes = [wintypes.HANDLE, ctypes.POINTER(MONITORINFO)]
    user32.GetDpiForWindow.argtypes = [wintypes.HWND]
    user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.SetFocus.argtypes = [wintypes.HWND]
    user32.DestroyWindow.argtypes = [wintypes.HWND]
    user32.InvalidateRect.argtypes = [wintypes.HWND, ctypes.POINTER(RECT), wintypes.BOOL]
    user32.TrackMouseEvent.argtypes = [ctypes.POINTER(TRACKMOUSEEVENT)]
    user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(RECT)]
    user32.BeginPaint.argtypes = [wintypes.HWND, ctypes.POINTER(PAINTSTRUCT)]
    user32.BeginPaint.restype = wintypes.HDC
    user32.EndPaint.argtypes = [wintypes.HWND, ctypes.POINTER(PAINTSTRUCT)]
    user32.FillRect.argtypes = [wintypes.HDC, ctypes.POINTER(RECT), wintypes.HBRUSH]
    user32.DrawTextW.argtypes = [wintypes.HDC, wintypes.LPCWSTR, ctypes.c_int, ctypes.POINTER(RECT), wintypes.UINT]
    gdi32.CreateSolidBrush.argtypes = [wintypes.DWORD]
    gdi32.CreateSolidBrush.restype = wintypes.HBRUSH
    gdi32.CreateFontW.restype = wintypes.HFONT
    gdi32.SelectObject.argtypes = [wintypes.HDC, wintypes.HANDLE]
    gdi32.SelectObject.restype = wintypes.HANDLE
    gdi32.DeleteObject.argtypes = [wintypes.HANDLE]
    gdi32.SetBkMode.argtypes = [wintypes.HDC, ctypes.c_int]
    gdi32.SetTextColor.argtypes = [wintypes.HDC, wintypes.DWORD]
    dwmapi.DwmSetWindowAttribute.argtypes = [wintypes.HWND, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD]

    _WINDOWS: dict[int, "TrayPopupMenu"] = {}
    _CLASS_ATOM = 0
    _CLASS_NAME = "CodeBearTrayPopupMenu"

    def _rgb(hex_color: str) -> int:
        value = hex_color.lstrip("#")
        red, green, blue = (int(value[index:index + 2], 16) for index in (0, 2, 4))
        return red | (green << 8) | (blue << 16)

    def _lo_word(value: int) -> int:
        return ctypes.c_short(value & 0xFFFF).value

    def _hi_word(value: int) -> int:
        return ctypes.c_short((value >> 16) & 0xFFFF).value

    @WNDPROC
    def _window_proc(hwnd: int, message: int, wparam: int, lparam: int) -> int:
        window = _WINDOWS.get(int(hwnd))
        if window is not None:
            return window.handle_message(message, wparam, lparam)
        return int(user32.DefWindowProcW(hwnd, message, wparam, lparam))


class TrayPopupMenu:
    """A small high-DPI Win32 popup used instead of the blurry shell menu."""

    def __init__(
        self,
        actions: tuple[Callable[[], None], Callable[[], None], Callable[[], None]],
    ):
        if sys.platform != "win32":
            raise RuntimeError("TrayPopupMenu is available on Windows only")
        self.actions = actions
        self.metrics = MenuMetrics()
        self.hwnd = 0
        self.hovered: int | None = None
        self.selected = 0
        self.tracking_mouse = False
        self._font = 0
        self._register_class()

    def _register_class(self) -> None:
        global _CLASS_ATOM
        if _CLASS_ATOM:
            return
        instance = kernel32.GetModuleHandleW(None)
        window_class = WNDCLASSW(
            CS_DROPSHADOW,
            _window_proc,
            0,
            0,
            instance,
            None,
            user32.LoadCursorW(None, IDC_ARROW),
            wintypes.HBRUSH(COLOR_WINDOW + 1),
            None,
            _CLASS_NAME,
        )
        _CLASS_ATOM = int(user32.RegisterClassW(ctypes.byref(window_class)))
        if not _CLASS_ATOM:
            raise ctypes.WinError(ctypes.get_last_error())

    def show_at_cursor(self) -> None:
        cursor = POINT()
        user32.GetCursorPos(ctypes.byref(cursor))
        monitor = user32.MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST)
        monitor_info = MONITORINFO(ctypes.sizeof(MONITORINFO))
        user32.GetMonitorInfoW(monitor, ctypes.byref(monitor_info))
        dpi = 96
        scale = dpi / 96
        width = round(self.metrics.width * scale)
        height = round(self.metrics.height * scale)
        x, y = popup_position(cursor.x, cursor.y, width, height, monitor_info.rcWork.left, monitor_info.rcWork.top, monitor_info.rcWork.right, monitor_info.rcWork.bottom)
        self.hwnd = int(user32.CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
            _CLASS_NAME,
            "码熊",
            WS_POPUP,
            x,
            y,
            width,
            height,
            None,
            None,
            kernel32.GetModuleHandleW(None),
            None,
        ))
        if not self.hwnd:
            raise ctypes.WinError(ctypes.get_last_error())
        _WINDOWS[self.hwnd] = self
        if hasattr(user32, "GetDpiForWindow"):
            dpi = int(user32.GetDpiForWindow(self.hwnd)) or 96
            if dpi != 96:
                scale = dpi / 96
                width = round(self.metrics.width * scale)
                height = round(self.metrics.height * scale)
                x, y = popup_position(cursor.x, cursor.y, width, height, monitor_info.rcWork.left, monitor_info.rcWork.top, monitor_info.rcWork.right, monitor_info.rcWork.bottom)
                user32.SetWindowPos(self.hwnd, HWND_TOPMOST, x, y, width, height, SWP_NOACTIVATE)
        self.scale = scale
        self._font = gdi32.CreateFontW(-round(14 * scale), 0, 0, 0, FW_NORMAL, 0, 0, 0, 1, 0, 5, 4, 0, "Microsoft YaHei UI")
        try:
            corner = ctypes.c_int(2)
            dwmapi.DwmSetWindowAttribute(self.hwnd, 33, ctypes.byref(corner), ctypes.sizeof(corner))
        except OSError:
            pass
        user32.ShowWindow(self.hwnd, SW_SHOW)
        user32.SetForegroundWindow(self.hwnd)
        user32.SetFocus(self.hwnd)

    def close(self) -> None:
        if self.hwnd:
            user32.DestroyWindow(self.hwnd)

    def handle_message(self, message: int, wparam: int, lparam: int) -> int:
        if message == WM_PAINT:
            self._paint()
            return 0
        if message == WM_MOUSEMOVE:
            if not self.tracking_mouse:
                tracking = TRACKMOUSEEVENT(ctypes.sizeof(TRACKMOUSEEVENT), TME_LEAVE, self.hwnd, 0)
                user32.TrackMouseEvent(ctypes.byref(tracking))
                self.tracking_mouse = True
            row = self.metrics.row_at(round(_hi_word(lparam) / self.scale))
            if row != self.hovered:
                self.hovered = row
                if row is not None:
                    self.selected = row
                user32.InvalidateRect(self.hwnd, None, False)
            return 0
        if message == WM_MOUSELEAVE:
            self.tracking_mouse = False
            self.hovered = None
            user32.InvalidateRect(self.hwnd, None, False)
            return 0
        if message == WM_LBUTTONUP:
            row = self.metrics.row_at(round(_hi_word(lparam) / self.scale))
            if row is not None:
                action = self.actions[row]
                self.close()
                action()
            return 0
        if message == WM_KEYDOWN:
            if wparam == VK_ESCAPE:
                self.close()
            elif wparam in (VK_UP, VK_DOWN):
                delta = -1 if wparam == VK_UP else 1
                self.selected = (self.selected + delta) % len(self.actions)
                self.hovered = self.selected
                user32.InvalidateRect(self.hwnd, None, False)
            elif wparam == VK_RETURN:
                action = self.actions[self.selected]
                self.close()
                action()
            return 0
        if message == WM_KILLFOCUS:
            self.close()
            return 0
        if message == WM_DESTROY:
            _WINDOWS.pop(self.hwnd, None)
            if self._font:
                gdi32.DeleteObject(self._font)
            self.hwnd = 0
            return 0
        return int(user32.DefWindowProcW(self.hwnd, message, wparam, lparam))

    def _fill(self, hdc: int, rect: RECT, color: str) -> None:
        brush = gdi32.CreateSolidBrush(_rgb(color))
        user32.FillRect(hdc, ctypes.byref(rect), brush)
        gdi32.DeleteObject(brush)

    def _text(self, hdc: int, text: str, rect: RECT, color: str) -> None:
        old_font = gdi32.SelectObject(hdc, self._font)
        gdi32.SetBkMode(hdc, TRANSPARENT)
        gdi32.SetTextColor(hdc, _rgb(color))
        user32.DrawTextW(hdc, text, -1, ctypes.byref(rect), DT_LEFT | DT_VCENTER | DT_SINGLELINE)
        gdi32.SelectObject(hdc, old_font)

    def _paint(self) -> None:
        paint = PAINTSTRUCT()
        hdc = user32.BeginPaint(self.hwnd, ctypes.byref(paint))
        try:
            scale = self.scale
            client = RECT()
            user32.GetClientRect(self.hwnd, ctypes.byref(client))
            self._fill(hdc, client, "#FFFFFF")
            divider_top = self.metrics.padding + self.metrics.row_height * 2
            third_top = divider_top + self.metrics.divider_height
            rows = (
                (self.metrics.padding, "打开码熊"),
                (self.metrics.padding + self.metrics.row_height, "打开数据目录"),
                (third_top, "退出码熊"),
            )
            for index, (top, label) in enumerate(rows):
                if self.hovered == index:
                    self._fill(
                        hdc,
                        RECT(
                            round(4 * scale),
                            round((top + 1) * scale),
                            round((self.metrics.width - 4) * scale),
                            round((top + self.metrics.row_height - 1) * scale),
                        ),
                        "#F1F5F9",
                    )
                self._text(
                    hdc,
                    label,
                    RECT(
                        round(14 * scale),
                        round(top * scale),
                        round((self.metrics.width - 10) * scale),
                        round((top + self.metrics.row_height) * scale),
                    ),
                    "#26384A",
                )

            divider_y = divider_top + self.metrics.divider_height // 2
            self._fill(
                hdc,
                RECT(
                    round(10 * scale),
                    round(divider_y * scale),
                    round((self.metrics.width - 10) * scale),
                    round((divider_y + 1) * scale),
                ),
                "#E5E7EB",
            )
        finally:
            user32.EndPaint(self.hwnd, ctypes.byref(paint))
