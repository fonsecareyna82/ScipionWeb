import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type FC, type KeyboardEvent,
} from "react";
import {
  DocsIcon,
  FolderIcon,
  OpenFolderIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@/icons";
import { HelpCircle } from "lucide-react";
import styles from "./protocoltree.module.css";

// --- Types ---
export interface IconData {
  name: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface ProtocolNode {
  text: string;
  value?: string | null;
  icon?: IconData;
  tag?: string;
  openItem?: boolean | string;
  visible?: boolean;
  childs?: ProtocolNode[];
}

/** Lets the search field drive the tree with the keyboard: ↑ ↓ move, → ← open and close, Enter opens. */
export interface ProtocolsTreeHandle {
  /** True when the key was used by the tree. */
  handleKey: (event: KeyboardEvent) => boolean;
}

interface ProtocolsTreeProps {
  data: ProtocolNode[];
  searchText?: string;
  onNodeDoubleClick?: (protocolId: string) => void;
  onNodeHelpClick?: (protocolId: string, protocolLabel?: string) => void;
  isDark?: boolean;
}

// The badges a protocol may carry (new, beta, updated)
const BADGES: Record<string, { label: string; className: string }> = {
  beta: { label: "Beta", className: styles.badgeBeta },
  new: { label: "New", className: styles.badgeNew },
  updated: { label: "Updated", className: styles.badgeUpdated },
};

const GROUP_TAGS = new Set(["section", "protocol_group", "package"]);

const isProtocol = (node: ProtocolNode) => node.tag === "protocol" && !!node.value;

// --- Search: every word, in any order, without minding case, accents, dashes or underscores ---
function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_/.]+/g, " ");
}

function searchWords(search: string): string[] {
  return normalizeForSearch(search).split(/\s+/).filter(Boolean);
}

/**
 * The branches where every word is found in a node's name or in the names of the folders above it. A folder that
 * matches on its own keeps everything inside it.
 */
const filterTree = (nodes: ProtocolNode[], words: string[], above = ""): ProtocolNode[] =>
  nodes
    .map((node) => {
      const context = `${above} ${normalizeForSearch(node.text)}`;
      if (words.every((word) => context.includes(word))) return node;
      const children = node.childs ? filterTree(node.childs, words, context) : [];
      return children.length > 0 ? { ...node, childs: children } : null;
    })
    .filter(Boolean) as ProtocolNode[];

const countProtocols = (nodes: ProtocolNode[] | undefined): number =>
  (nodes ?? []).reduce((total, node) => total + (isProtocol(node) ? 1 : 0) + countProtocols(node.childs), 0);

// --- Highlight every word searched ---
const highlightText = (text: string, words: string[]) => {
  if (words.length === 0) return text;

  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark key={idx} className={styles.highlight}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
};

type Row = { key: string; node: ProtocolNode; parentKey: string | null; hasChildren: boolean };

// --- Main tree ---
export const ProtocolsTree = forwardRef<ProtocolsTreeHandle, ProtocolsTreeProps>(function ProtocolsTree({
  data,
  searchText = "",
  onNodeDoubleClick,
  onNodeHelpClick,
  isDark = false,
}, ref) {
  const words = useMemo(() => searchWords(searchText), [searchText]);
  const searching = words.length > 0;
  const filteredData = useMemo(() => (searching ? filterTree(data, words) : data), [data, words, searching]);
  const found = useMemo(() => countProtocols(filteredData), [filteredData]);

  // Folders opened or closed by hand; a new search starts again from the defaults
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const isExpanded = useCallback((key: string, node: ProtocolNode, isRoot: boolean) => {
    const hasChildren = !!node.childs?.length;
    if (key in toggled) return toggled[key];
    if (searching) return hasChildren && (isRoot || GROUP_TAGS.has(node.tag ?? ""));
    return node.openItem === true || node.openItem === "True";
  }, [toggled, searching]);

  // The rows shown now, top to bottom
  const rows = useMemo(() => {
    const list: Row[] = [];
    const walk = (nodes: ProtocolNode[], parentKey: string | null) => {
      nodes.forEach((node, idx) => {
        const key = parentKey == null ? String(idx) : `${parentKey}/${idx}`;
        const hasChildren = !!node.childs?.length;
        list.push({ key, node, parentKey, hasChildren });
        if (hasChildren && isExpanded(key, node, parentKey == null)) walk(node.childs!, key);
      });
    };
    walk(filteredData, null);
    return list;
  }, [filteredData, isExpanded]);

  // A new search: folders back to their defaults, and the first protocol found ready for Enter
  const firstProtocolKey = rows.find((row) => isProtocol(row.node))?.key ?? null;
  const firstProtocolRef = useRef(firstProtocolKey);
  firstProtocolRef.current = firstProtocolKey;
  useEffect(() => {
    setToggled({});
    setActiveKey(null);
  }, [searchText]);
  useEffect(() => {
    if (searching) setActiveKey((current) => current ?? firstProtocolRef.current);
  }, [searching, searchText]);

  useEffect(() => {
    if (!activeKey) return;
    const row = scrollRef.current?.querySelector(`[data-key="${activeKey}"]`) as HTMLElement | null;
    row?.scrollIntoView?.({ block: "nearest" });
  }, [activeKey]);

  const toggle = useCallback((key: string, node: ProtocolNode, isRoot: boolean, open?: boolean) => {
    setToggled((current) => ({ ...current, [key]: open ?? !isExpanded(key, node, isRoot) }));
  }, [isExpanded]);

  const openProtocol = useCallback((node: ProtocolNode) => {
    if (isProtocol(node)) onNodeDoubleClick?.(node.value!);
  }, [onNodeDoubleClick]);

  const handleKey = useCallback((event: KeyboardEvent): boolean => {
    const index = rows.findIndex((row) => row.key === activeKey);
    const active = index >= 0 ? rows[index] : null;
    const move = (to: number) => {
      if (rows.length === 0) return;
      setActiveKey(rows[Math.max(0, Math.min(rows.length - 1, to))].key);
    };

    switch (event.key) {
      case "ArrowDown":
        move(active ? index + 1 : 0);
        break;
      case "ArrowUp":
        move(active ? index - 1 : rows.length - 1);
        break;
      case "ArrowRight":
        if (!active?.hasChildren) return false;
        toggle(active.key, active.node, active.parentKey == null, true);
        break;
      case "ArrowLeft":
        if (!active) return false;
        if (active.hasChildren && isExpanded(active.key, active.node, active.parentKey == null)) {
          toggle(active.key, active.node, active.parentKey == null, false);
        } else if (active.parentKey != null) {
          setActiveKey(active.parentKey);
        } else {
          return false;
        }
        break;
      case "Enter": {
        const target = active ?? rows.find((row) => isProtocol(row.node)) ?? null;
        if (!target) return false;
        if (isProtocol(target.node)) openProtocol(target.node);
        else if (target.hasChildren) toggle(target.key, target.node, target.parentKey == null);
        break;
      }
      default:
        return false;
    }
    event.preventDefault();
    return true;
  }, [rows, activeKey, isExpanded, toggle, openProtocol]);

  useImperativeHandle(ref, () => ({ handleKey }), [handleKey]);

  const renderNodes = (nodes: ProtocolNode[], parentKey: string | null) =>
    nodes.map((node, idx) => {
      const key = parentKey == null ? String(idx) : `${parentKey}/${idx}`;
      return (
        <ProtocolNodeItem
          key={key}
          nodeKey={key}
          node={node}
          words={words}
          expanded={isExpanded(key, node, parentKey == null)}
          active={activeKey === key}
          onToggle={() => toggle(key, node, parentKey == null)}
          onActivate={() => setActiveKey(key)}
          onOpen={() => openProtocol(node)}
          onNodeHelpClick={onNodeHelpClick}
          renderChildren={(children) => renderNodes(children, key)}
        />
      );
    });

  return (
    <div className={[styles.treeRoot, isDark ? styles.dark : ""].filter(Boolean).join(" ")}>
      {searching && (
        <div className={styles.searchSummary} role="status">
          {found === 0 ? "Nothing found" : found === 1 ? "1 protocol" : `${found} protocols`}
          {found > 0 && <span className={styles.searchHint}>Enter opens the first · ↑ ↓ to choose</span>}
        </div>
      )}
      <div
        ref={scrollRef}
        className={styles.treeScroll}
        role="tree"
        aria-label="Protocols"
        tabIndex={0}
        onKeyDown={(event) => { handleKey(event); }}
      >
        {renderNodes(filteredData, null)}
      </div>
    </div>
  );
});

// --- One node and, when open, what it holds ---
const ProtocolNodeItem: FC<{
  nodeKey: string;
  node: ProtocolNode;
  words: string[];
  expanded: boolean;
  active: boolean;
  onToggle: () => void;
  onActivate: () => void;
  onOpen: () => void;
  onNodeHelpClick?: (protocolId: string, protocolLabel?: string) => void;
  renderChildren: (children: ProtocolNode[]) => React.ReactNode;
}> = ({ nodeKey, node, words, expanded, active, onToggle, onActivate, onOpen, onNodeHelpClick, renderChildren }) => {
  const hasChildren = !!(node.childs && node.childs.length > 0);

  const tagIcon = () => {
    if (node.tag?.startsWith("protocol") && node.tag !== "protocol_group") {
      return <DocsIcon className={styles.iconDoc} />;
    }
    if (GROUP_TAGS.has(node.tag ?? "")) {
      return expanded ? (
        <OpenFolderIcon className={styles.iconOpenFolder} />
      ) : (
        <FolderIcon className={styles.iconFolder} />
      );
    }
    return null;
  };

  const badge = node.tag?.startsWith("protocol") && node.icon?.name ? BADGES[node.icon.name.split(".")[0]] : undefined;

  const handleHelpClick = (e: React.MouseEvent) => {
    // preventRowHandlersAndOpenHelp
    e.preventDefault();
    e.stopPropagation();
    if (node.tag === "protocol" && node.value && onNodeHelpClick) {
      onNodeHelpClick(node.value, node.text);
    }
  };

  const showHelp = node.tag === "protocol" && !!node.value && !!onNodeHelpClick;

  return (
    <div className={styles.nodeItem}>
      <div
        className={[styles.nodeRow, active ? styles.nodeRowActive : ""].filter(Boolean).join(" ")}
        role="treeitem"
        data-key={nodeKey}
        aria-selected={active}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-level={nodeKey.split("/").length}
        onClick={() => {
          onActivate();
          if (hasChildren) onToggle();
        }}
        onDoubleClick={() => {
          if (node.tag === "protocol") onOpen();
        }}
      >
        <span className={styles.chevronWrap} aria-hidden="true">
          {hasChildren && (expanded ? (
            <ChevronUpIcon className={styles.chevronIcon} />
          ) : (
            <ChevronDownIcon className={styles.chevronIcon} />
          ))}
        </span>

        {tagIcon()}

        <span className={styles.nodeText} style={{ flex: 1, minWidth: 0 }}>
          {highlightText(node.text, words)}
        </span>

        {badge && <span className={[styles.badge, badge.className].join(" ")}>{badge.label}</span>}

        {showHelp && (
          <button
            type="button"
            className={styles.helpButton}
            aria-label="Open protocol help"
            title="Help"
            onClick={handleHelpClick}
            onDoubleClick={(e) => {
              // preventDoubleClickFromFiringRowHandler
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <HelpCircle className={styles.helpIcon} />
          </button>
        )}
      </div>

      {hasChildren && (
        <div
          role="group"
          className={[
            styles.children,
            expanded ? styles.childrenOpen : styles.childrenClosed,
          ].join(" ")}
        >
          {renderChildren(node.childs!)}
        </div>
      )}
    </div>
  );
};
