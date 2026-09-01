import { useEffect, useRef, type WheelEvent } from "react";
import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { CloseOutlined, MoreOutlined, TableOutlined } from "@ant-design/icons";
import type { TableTab } from "../types";
import { useI18n } from "../../preferences/PreferencesProvider";

const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;

interface TableTabsProps {
  tabs: TableTab[];
  activeTableId: string | null;
  dirtyTableIds: ReadonlySet<string>;
  onSelect: (tableId: string) => void;
  onClose: (tableId: string) => void;
  onCloseOthers: (tableId: string) => void;
  onCloseToLeft: (tableId: string) => void;
  onCloseToRight: (tableId: string) => void;
}

export function TableTabs({
  tabs,
  activeTableId,
  dirtyTableIds,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseToLeft,
  onCloseToRight,
}: TableTabsProps) {
  const { t } = useI18n();
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const activeTab = activeTabRef.current;
    if (activeTab && typeof activeTab.scrollIntoView === "function") {
      activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeTableId]);

  const getTabMenuItems = (tableId: string): MenuProps["items"] => {
    const index = tabs.findIndex((tab) => tab.id === tableId);
    return [
      { key: "close-current", label: t("table.closeCurrent") },
      { key: "close-left", label: t("table.closeLeft"), disabled: index <= 0 },
      {
        key: "close-right",
        label: t("table.closeRight"),
        disabled: index < 0 || index >= tabs.length - 1,
      },
      {
        key: "close-others",
        label: t("table.closeOthers"),
        disabled: tabs.length < 2,
      },
    ];
  };

  const handleMenuClick = (tableId: string, key: string) => {
    if (key === "close-current") onClose(tableId);
    if (key === "close-left") onCloseToLeft(tableId);
    if (key === "close-right") onCloseToRight(tableId);
    if (key === "close-others") onCloseOthers(tableId);
  };

  const activeMenuItems: NonNullable<MenuProps["items"]> = activeTableId
    ? getTabMenuItems(activeTableId) || []
    : [];

  const handleActiveMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (activeTableId) handleMenuClick(activeTableId, key);
  };

  const handleTabsWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const strip = event.currentTarget;
    const maxScrollLeft = strip.scrollWidth - strip.clientWidth;
    if (maxScrollLeft <= 0) return;

    const rawDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (rawDelta === 0) return;

    const deltaScale =
      event.deltaMode === WHEEL_DELTA_LINE
        ? 16
        : event.deltaMode === WHEEL_DELTA_PAGE
          ? strip.clientWidth
          : 1;
    const nextScrollLeft = Math.max(
      0,
      Math.min(maxScrollLeft, strip.scrollLeft + rawDelta * deltaScale),
    );
    if (nextScrollLeft === strip.scrollLeft) return;

    event.preventDefault();
    strip.scrollLeft = nextScrollLeft;
  };

  return (
    <div className="table-tabs" role="tablist" aria-label={t("table.openTabs")}>
      <div className="table-tabs-scroll" onWheel={handleTabsWheel}>
        {tabs.map((tab) => {
          const active = tab.id === activeTableId;
          const dirty = dirtyTableIds.has(tab.id);
          return (
            <Dropdown
              key={tab.id}
              menu={{
                items: getTabMenuItems(tab.id),
                onClick: ({ key }) => handleMenuClick(tab.id, key),
              }}
              trigger={["contextMenu"]}
              placement="bottomLeft"
              classNames={{ root: "table-tabs-dropdown" }}
            >
              <div className={`table-tab${active ? " is-active" : ""}`}>
                <button
                  ref={active ? activeTabRef : undefined}
                  type="button"
                  className="table-tab-main"
                  role="tab"
                  aria-selected={active}
                  aria-label={`${tab.name || tab.code || t("common.table")}${dirty ? `, ${t("table.unsaved")}` : ""}`}
                  title={`${tab.name || tab.code || t("common.table")}${tab.code ? ` · ${tab.code}` : ""}`}
                  onClick={() => onSelect(tab.id)}
                  onKeyDown={(event) => {
                    const index = tabs.findIndex((item) => item.id === tab.id);
                    let nextIndex = -1;
                    if (event.key === "ArrowRight")
                      nextIndex = (index + 1) % tabs.length;
                    else if (event.key === "ArrowLeft")
                      nextIndex = (index + tabs.length - 1) % tabs.length;
                    else if (event.key === "Home") nextIndex = 0;
                    else if (event.key === "End") nextIndex = tabs.length - 1;
                    if (nextIndex >= 0) {
                      event.preventDefault();
                      onSelect(tabs[nextIndex].id);
                    }
                  }}
                >
                  <TableOutlined />
                  <span className="table-tab-name">
                    {tab.code || tab.name || t("table.unnamed")}
                  </span>
                  {dirty ? (
                    <span className="table-tab-dirty" aria-hidden="true" />
                  ) : null}
                </button>
                <button
                  type="button"
                  className="table-tab-close"
                  aria-label={t("table.close", {
                    name: tab.name || tab.code || t("common.table"),
                  })}
                  onClick={() => onClose(tab.id)}
                >
                  <CloseOutlined />
                </button>
              </div>
            </Dropdown>
          );
        })}
      </div>
      <div className="table-tabs-actions">
        <Dropdown
          menu={{ items: activeMenuItems, onClick: handleActiveMenuClick }}
          trigger={["click"]}
          placement="bottomRight"
          classNames={{ root: "table-tabs-dropdown" }}
        >
          <Button
            type="text"
            size="small"
            className="table-tab-action"
            icon={<MoreOutlined />}
            aria-label={t("table.tabMenu")}
            title={t("table.tabMenu")}
          />
        </Dropdown>
      </div>
    </div>
  );
}

export type { TableTabsProps };
