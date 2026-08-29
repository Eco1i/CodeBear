import { useEffect, useRef } from "react";
import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
import {
  CloseOutlined,
  MoreOutlined,
  TableOutlined,
} from "@ant-design/icons";
import type { TableTab } from "../types";

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
      { key: "close-current", label: "关闭当前" },
      { key: "close-left", label: "关闭左侧", disabled: index <= 0 },
      { key: "close-right", label: "关闭右侧", disabled: index < 0 || index >= tabs.length - 1 },
      { key: "close-others", label: "关闭其他", disabled: tabs.length < 2 },
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

  return (
    <div className="table-tabs" role="tablist" aria-label="已打开的数据表">
      <div className="table-tabs-scroll">
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
            >
              <div className={`table-tab${active ? " is-active" : ""}`}>
                <button
                  ref={active ? activeTabRef : undefined}
                  type="button"
                  className="table-tab-main"
                  role="tab"
                  aria-selected={active}
                  aria-label={`${tab.name || tab.code || "数据表"}${dirty ? "，有未保存修改" : ""}`}
                  title={`${tab.name || tab.code || "数据表"}${tab.code ? ` · ${tab.code}` : ""}`}
                  onClick={() => onSelect(tab.id)}
                  onKeyDown={(event) => {
                    const index = tabs.findIndex((item) => item.id === tab.id);
                    const nextIndex = event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (index + tabs.length - 1) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : -1;
                    if (nextIndex >= 0) {
                      event.preventDefault();
                      onSelect(tabs[nextIndex].id);
                    }
                  }}
                >
                  <TableOutlined />
                  <span className="table-tab-name">{tab.code || tab.name || "未命名表"}</span>
                  {dirty ? <span className="table-tab-dirty" aria-hidden="true" /> : null}
                </button>
                <Button
                  type="text"
                  size="small"
                  className="table-tab-close"
                  icon={<CloseOutlined />}
                  aria-label={`关闭 ${tab.name || tab.code || "数据表"}`}
                  onClick={() => onClose(tab.id)}
                />
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
        >
          <Button
            type="text"
            size="small"
            className="table-tab-action"
            icon={<MoreOutlined />}
            aria-label="标签页菜单"
            title="标签页菜单"
          />
        </Dropdown>
      </div>
    </div>
  );
}

export type { TableTabsProps };