import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApartmentOutlined,
  AimOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Input, Tooltip, Tree } from "antd";
import type { DataNode, TreeProps } from "antd/es/tree";
import type RcTree from "@rc-component/tree";
import {
  FolderGlyph,
  PdmGlyph,
  ProjectGlyph,
  TreeChevronGlyph,
} from "./PrototypeGlyphs";
import { useI18n } from "../features/preferences/PreferencesProvider";
import type { Settings, WorkspaceNode } from "../types";

interface NavigatorProps {
  trees: WorkspaceNode[];
  selectedNode: WorkspaceNode | null;
  settings: Settings | null;
  loading: boolean;
  locateNode: { projectId: string; pdmId: string; relativePath: string } | null;
  locateRevision: number;
  onLocate: () => void;
  onSelect: (node: WorkspaceNode) => void;
  onCreateProject: () => void;
  onImport: (node: WorkspaceNode | null) => void;
  onCreateFolder: (node: WorkspaceNode) => void;
  onRefresh: (node: WorkspaceNode | null) => void;
  onForceRefresh: (node: WorkspaceNode | null) => void;
  onRename: (node: WorkspaceNode) => void;
  onTrash: (node: WorkspaceNode) => void;
  onMove: (node: WorkspaceNode, parent: WorkspaceNode) => void;
  onOpenTrash: () => void;
  onOpenSettings: () => void;
}

interface NavigatorDataNode extends DataNode {
  raw: WorkspaceNode;
  children?: NavigatorDataNode[];
}

const NAVIGATOR_EXPANSION_STORAGE_KEY = "maxiong.navigatorExpandedKeys";

function hasStoredExpandedAncestors(
  key: React.Key,
  keys: Set<React.Key>,
): boolean {
  if (typeof key !== "string" || !key.startsWith("folder:")) return true;

  const folderKey = key.slice("folder:".length);
  const projectSeparator = folderKey.indexOf(":");
  if (projectSeparator === -1) return false;

  const projectId = folderKey.slice(0, projectSeparator);
  const relativePath = folderKey.slice(projectSeparator + 1);
  if (!keys.has(`project:${projectId}`)) return false;

  const pathParts = relativePath.split("/").filter(Boolean);
  let ancestorPath = "";
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    ancestorPath = ancestorPath
      ? `${ancestorPath}/${pathParts[index]}`
      : pathParts[index];
    if (!keys.has(`folder:${projectId}:${ancestorPath}`)) return false;
  }
  return true;
}

function readStoredExpandedKeys(): React.Key[] | null {
  try {
    const stored = window.localStorage.getItem(NAVIGATOR_EXPANSION_STORAGE_KEY);
    if (stored === null) return null;

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;

    const keys = parsed.filter(
      (key): key is React.Key =>
        typeof key === "string" || typeof key === "number",
    );
    const keySet = new Set(keys);
    const normalizedKeys = keys.filter((key) =>
      hasStoredExpandedAncestors(key, keySet),
    );
    if (normalizedKeys.length !== keys.length)
      storeExpandedKeys(normalizedKeys);
    return normalizedKeys;
  } catch {
    return null;
  }
}

function storeExpandedKeys(keys: React.Key[]): void {
  try {
    window.localStorage.setItem(
      NAVIGATOR_EXPANSION_STORAGE_KEY,
      JSON.stringify(keys),
    );
  } catch {
    // The tree remains usable when browser storage is unavailable.
  }
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function copyWithProject(
  node: WorkspaceNode,
  projectId: string,
): WorkspaceNode {
  return {
    ...node,
    project_id: node.project_id || projectId,
    children: node.children?.map((child) => copyWithProject(child, projectId)),
  };
}

function toDataNode(
  node: WorkspaceNode,
  selectedId?: string,
): NavigatorDataNode {
  return {
    key: node.id,
    title: node.name,
    raw: node,
    className:
      node.id === selectedId ? "navigator-tree-node-selected" : undefined,
    isLeaf: node.type === "pdm",
    children: node.children?.map((child) => toDataNode(child, selectedId)),
  };
}

function filterDataNode(
  node: NavigatorDataNode,
  query: string,
): NavigatorDataNode | null {
  if (!query) return node;
  const children = (node.children || [])
    .map((child) => filterDataNode(child, query))
    .filter((child): child is NavigatorDataNode => Boolean(child));
  if (node.raw.name.toLocaleLowerCase().includes(query) || children.length) {
    return { ...node, children };
  }
  return null;
}

function collectNodes(
  nodes: NavigatorDataNode[],
  map: Map<React.Key, WorkspaceNode>,
): void {
  nodes.forEach((node) => {
    map.set(node.key, node.raw);
    collectNodes(node.children || [], map);
  });
}

function collectSubtreeKeys(node: WorkspaceNode, keys: Set<React.Key>): void {
  keys.add(node.id);
  node.children?.forEach((child) => collectSubtreeKeys(child, keys));
}

export function ProjectNavigator({
  trees,
  selectedNode,
  settings,
  loading,
  locateNode,
  locateRevision,
  onLocate,
  onSelect,
  onCreateProject,
  onImport,
  onCreateFolder,
  onRefresh,
  onForceRefresh,
  onRename,
  onTrash,
  onMove,
  onOpenTrash,
  onOpenSettings,
}: NavigatorProps) {
  const { t } = useI18n();
  const treeRef = useRef<RcTree>(null);
  const handledLocateRevisionRef = useRef(0);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(
    () => readStoredExpandedKeys() ?? [],
  );
  const allData = useMemo(
    () =>
      trees.map((tree) => {
        const normalized = copyWithProject(
          tree,
          tree.project_id || tree.id.replace("project:", ""),
        );
        return toDataNode(normalized, selectedNode?.id);
      }),
    [selectedNode?.id, trees],
  );
  const nodeMap = useMemo(() => {
    const map = new Map<React.Key, WorkspaceNode>();
    collectNodes(allData, map);
    return map;
  }, [allData]);
  const visibleData = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return allData
      .map((node) => filterDataNode(node, normalized))
      .filter((node): node is NavigatorDataNode => Boolean(node));
  }, [allData, query]);

  const allExpandedKeys = useMemo(() => [...nodeMap.keys()], [nodeMap]);

  useEffect(() => {
    if (
      !locateRevision ||
      !locateNode ||
      handledLocateRevisionRef.current === locateRevision
    )
      return;
    const pdmNode = [...nodeMap.values()].find(
      (node) =>
        node.type === "pdm" &&
        node.project_id === locateNode.projectId &&
        (node.pdm_id === locateNode.pdmId ||
          node.relative_path === locateNode.relativePath),
    );
    if (!pdmNode) return;
    handledLocateRevisionRef.current = locateRevision;
    setDraftQuery("");
    setQuery("");
    const ancestors: React.Key[] = [`project:${locateNode.projectId}`];
    const folderParts = parentPath(pdmNode.relative_path)
      .split("/")
      .filter(Boolean);
    let folderPath = "";
    folderParts.forEach((part) => {
      folderPath = folderPath ? `${folderPath}/${part}` : part;
      ancestors.push(`folder:${locateNode.projectId}:${folderPath}`);
    });
    setExpandedKeys((currentKeys) => {
      const nextExpandedKeys = [...new Set([...currentKeys, ...ancestors])];
      storeExpandedKeys(nextExpandedKeys);
      return nextExpandedKeys;
    });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        treeRef.current?.scrollTo({ key: pdmNode.id, align: "auto" });
        document
          .querySelector(".navigator-tree .navigator-tree-node-selected")
          ?.scrollIntoView({
            block: "nearest",
          });
      });
    });
  }, [locateNode, locateRevision, nodeMap]);
  const submitSearch = () => setQuery(draftQuery.trim());
  const clearSearch = () => {
    setDraftQuery("");
    setQuery("");
  };
  const moreMenuItems = [
    {
      key: "force-refresh",
      icon: <ReloadOutlined />,
      label: t("nav.forceRefresh"),
      disabled: !trees.length || loading,
      onClick: () => onForceRefresh(selectedNode),
    },
  ];

  const titleRender = (data: DataNode) => {
    const node = (data as NavigatorDataNode).raw;
    const menuItems = [
      ...(node.type === "pdm"
        ? []
        : [
            {
              key: "folder",
              icon: <FolderAddOutlined />,
              label: t("nav.createSubfolder"),
              onClick: () => onCreateFolder(node),
            },
            {
              key: "import",
              icon: <UploadOutlined />,
              label: t("nav.importPdm"),
              onClick: () => onImport(node),
            },
          ]),
      { type: "divider" as const },
      {
        key: "rename",
        icon: <EditOutlined />,
        label: t("nav.rename"),
        onClick: () => onRename(node),
      },
      {
        key: "delete",
        icon: <DeleteOutlined />,
        danger: true,
        label: t("nav.moveToTrash"),
        onClick: () => onTrash(node),
      },
    ];
    const count =
      node.type === "project"
        ? `${node.pdm_count || 0} PDM`
        : node.type === "folder"
          ? String(node.pdm_count || 0)
          : node.parse_error
            ? "!"
            : String(node.table_count || 0);
    const icon =
      node.type === "project" ? (
        <ProjectGlyph className="tree-node-icon tree-project-icon" />
      ) : node.type === "folder" ? (
        <FolderGlyph className="tree-node-icon tree-folder-icon" />
      ) : (
        <PdmGlyph
          className={`tree-node-icon tree-pdm-icon${node.parse_error ? " is-error" : ""}`}
        />
      );
    return (
      <Dropdown menu={{ items: menuItems }} trigger={["contextMenu"]}>
        <div
          className={`tree-title tree-title-${node.type}`}
          title={node.parse_error || node.name}
        >
          <span className="tree-label">
            {icon}
            <span className="tree-name">{node.name}</span>
          </span>
          <span
            className={node.parse_error ? "tree-count is-error" : "tree-count"}
          >
            {count}
          </span>
        </div>
      </Dropdown>
    );
  };

  const handleDrop: TreeProps["onDrop"] = (info) => {
    const source = nodeMap.get(info.dragNode.key);
    const target = nodeMap.get(info.node.key);
    if (
      !source ||
      !target ||
      source.type === "project" ||
      source.project_id !== target.project_id
    )
      return;
    let destination = target;
    if (target.type === "pdm" || info.dropToGap) {
      const desiredPath = parentPath(target.relative_path);
      destination =
        [...nodeMap.values()].find(
          (candidate) =>
            candidate.project_id === target.project_id &&
            candidate.relative_path === desiredPath &&
            candidate.type !== "pdm",
        ) ||
        [...nodeMap.values()].find(
          (candidate) =>
            candidate.project_id === target.project_id &&
            candidate.type === "project",
        ) ||
        target;
    }
    if (parentPath(source.relative_path) === destination.relative_path) return;
    onMove(source, destination);
  };

  return (
    <aside className="project-navigator">
      <div className="navigator-search">
        <Input
          aria-label={t("nav.searchPlaceholder")}
          allowClear
          prefix={
            <button
              type="button"
              className="input-search-trigger"
              aria-label={t("nav.search")}
              title={t("nav.search")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={submitSearch}
            >
              <SearchOutlined />
            </button>
          }
          placeholder={t("nav.searchPlaceholder")}
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          onPressEnter={submitSearch}
          onClear={clearSearch}
        />
      </div>
      <div className="navigator-toolbar">
        <span className="navigator-title">
          <i />
          {t("nav.projectDirectory")}
        </span>
        <div className="navigator-actions">
          <Tooltip
            title={
              locateNode ? t("nav.locatePdm") : t("message.selectTableFirst")
            }
          >
            <Button
              type="text"
              size="small"
              icon={<AimOutlined />}
              disabled={!locateNode}
              aria-label={t("nav.locatePdm")}
              onClick={onLocate}
            />
          </Tooltip>
          <Tooltip title={t("nav.newProject")}>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              aria-label={t("nav.newProject")}
              onClick={onCreateProject}
            />
          </Tooltip>
          <Tooltip title={t("nav.newFolder")}>
            <Button
              type="text"
              size="small"
              icon={<FolderOpenOutlined />}
              aria-label={t("nav.newFolder")}
              disabled={!selectedNode}
              onClick={() => selectedNode && onCreateFolder(selectedNode)}
            />
          </Tooltip>
          <Tooltip title={t("nav.refresh")}>
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined spin={loading} />}
              aria-label={t("nav.refresh")}
              disabled={!trees.length}
              onClick={() => onRefresh(selectedNode)}
            />
          </Tooltip>
          <Dropdown
            menu={{ items: moreMenuItems }}
            trigger={["click"]}
            placement="bottomRight"
          >
            <Tooltip title={t("nav.moreActions")}>
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                aria-label={t("nav.moreActions")}
                disabled={!trees.length}
              />
            </Tooltip>
          </Dropdown>
        </div>
      </div>
      <div className="navigator-tree">
        {visibleData.length ? (
          <Tree
            ref={treeRef}
            blockNode
            showLine={{ showLeafIcon: false }}
            motion={null}
            autoExpandParent={false}
            switcherIcon={(props) => (
              <TreeChevronGlyph expanded={Boolean(props.expanded)} />
            )}
            treeData={visibleData}
            titleRender={titleRender}
            selectedKeys={selectedNode ? [selectedNode.id] : []}
            expandedKeys={query ? allExpandedKeys : expandedKeys}
            onExpand={(keys, info) => {
              if (!query) {
                let nextKeys = [...keys];
                if (!info.expanded) {
                  const collapsedKeys = new Set<React.Key>();
                  collectSubtreeKeys(
                    (info.node as NavigatorDataNode).raw,
                    collapsedKeys,
                  );
                  nextKeys = nextKeys.filter((key) => !collapsedKeys.has(key));
                }
                setExpandedKeys(nextKeys);
                storeExpandedKeys(nextKeys);
              }
            }}
            onSelect={(keys) => {
              const node = keys.length ? nodeMap.get(keys[0]) : undefined;
              if (node) onSelect(node);
            }}
            draggable={{
              icon: false,
              nodeDraggable: (node) =>
                nodeMap.get(node.key)?.type !== "project",
            }}
            onDrop={handleDrop}
          />
        ) : (
          <div className="navigator-empty">
            <ApartmentOutlined />
            <span>
              {query ? t("nav.noMatchingNodes") : t("nav.noProjects")}
            </span>
            {!query && (
              <Button type="link" onClick={onCreateProject}>
                {t("nav.createFirstProject")}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="navigator-footer">
        <button
          className="workspace-status"
          type="button"
          onClick={onOpenSettings}
        >
          <span className="status-dot" />
          <span>
            <strong>{t("nav.connected")}</strong>
            <small title={settings?.workspace_root}>
              {settings?.workspace_root || t("nav.readingWorkspace")}
            </small>
          </span>
        </button>
        <Tooltip title={t("nav.openTrash")}>
          <Button
            type="text"
            icon={<InboxOutlined />}
            aria-label={t("nav.openTrash")}
            onClick={onOpenTrash}
          />
        </Tooltip>
      </div>
    </aside>
  );
}
