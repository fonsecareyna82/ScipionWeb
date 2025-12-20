import { useState, useCallback, useEffect, useRef, type FC } from "react";
import { createPortal } from "react-dom";
import { ProtocolsTree, type ProtocolNode } from "./ProtocolTree";
import { loadProtocols } from "@/api/projects";
import { BoxCubeIcon } from "@/icons";
import { X } from "lucide-react";
import styles from "./protocolsdrawer.module.css";

interface ProtocolsDrawerProps {
  projectId: number | null;
  onProtocolDoubleClick?: (protocolId: string) => void;

  open?: boolean;
  onOpenChange?: (open: boolean) => void;

  autoLoadOnOpen?: boolean;
}

const getHostIsDarkFromElement = (el: HTMLElement | null): boolean => {
  if (!el || typeof document === "undefined") return false;

  const widgetRoot = el.closest(".projectpage-widget-root") as HTMLElement | null;
  const probe = widgetRoot ?? el;

  const probeDark =
    probe.classList.contains("dark") || probe.getAttribute("data-theme") === "dark";

  if (probeDark) return true;

  const html = document.documentElement;
  const body = document.body;

  return Boolean(
    html.classList.contains("dark") ||
      html.getAttribute("data-theme") === "dark" ||
      body?.classList.contains("dark") ||
      body?.getAttribute("data-theme") === "dark"
  );
};

export const ProtocolsDrawer: FC<ProtocolsDrawerProps> = ({
  projectId,
  onProtocolDoubleClick,
  open: openProp,
  onOpenChange,
  autoLoadOnOpen = true,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostIsDark, setHostIsDark] = useState(false);

  useEffect(() => {
    // syncHostDarkMode
    const sync = () => setHostIsDark(getHostIsDarkFromElement(hostRef.current));
    sync();

    const widgetRoot = hostRef.current?.closest(".projectpage-widget-root") as HTMLElement | null;

    const obs = new MutationObserver(() => sync());
    try {
      if (widgetRoot) {
        obs.observe(widgetRoot, { attributes: true, attributeFilter: ["class", "data-theme"] });
      }
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
      if (document.body) {
        obs.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme"] });
      }
    } catch {
      // noOp
    }

    return () => obs.disconnect();
  }, []);

  const [protocols, setProtocols] = useState<ProtocolNode[]>([]);
  const [loading, setLoading] = useState(false);

  const [innerOpen, setInnerOpen] = useState(false);
  const isControlled = typeof openProp === "boolean";
  const isOpen = isControlled ? (openProp as boolean) : innerOpen;

  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInnerOpen(v);
  };

  const [selectedRoot, setSelectedRoot] = useState<ProtocolNode | null>(null);
  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const lastLoadedProjectId = useRef<number | null>(null);

  const fetchProtocolsForProject = useCallback(async (pid: number) => {
    setLoading(true);
    try {
      const data = await loadProtocols(pid);
      const normalized = Array.isArray(data) ? data : Object.values(data);
      setProtocols(normalized);
      setSelectedRoot(normalized.length > 0 ? normalized[0] : null);
      lastLoadedProjectId.current = pid;
    } catch (err) {
      console.error("Error loading protocols:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleButtonOpen = useCallback(async () => {
    if (projectId == null) return;
    await fetchProtocolsForProject(projectId);
    setOpen(true);
  }, [projectId, fetchProtocolsForProject]);

  useEffect(() => {
    if (!autoLoadOnOpen) return;
    if (!isOpen) return;
    if (projectId == null) return;

    const needsLoad =
      protocols.length === 0 || lastLoadedProjectId.current !== projectId;

    if (needsLoad) {
      fetchProtocolsForProject(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId, autoLoadOnOpen]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [isControlled, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setProtocols([]);
      setSelectedRoot(null);
      lastLoadedProjectId.current = null;
      setSearchText("");
    }
  }, [projectId, isOpen]);

  const drawerEl = (
    <div
      className={[
        styles.drawer,
        styles.drawerVars,
        hostIsDark ? styles.dark : "",
        isOpen ? styles.drawerOpen : styles.drawerClosed,
      ]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-label="Protocols drawer"
      aria-hidden={!isOpen}
    >
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>Protocols</h2>

        <button
          onClick={() => setOpen(false)}
          className={styles.closeButton}
          aria-label="Close drawer"
          type="button"
        >
          <X className={styles.closeIcon} />
        </button>
      </div>

      {protocols.length > 1 && (
        <div className={styles.rootSelectWrap}>
          <select
            className={styles.rootSelect}
            value={selectedRoot ? Math.max(0, protocols.indexOf(selectedRoot)) : 0}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setSelectedRoot(protocols[idx] ?? null);
              setSearchText("");
            }}
          >
            {protocols.map((node, idx) => (
              <option key={idx} value={idx}>
                {node.text}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.searchWrap}>
        <div className={styles.searchField}>
          <span className={styles.searchIconWrap} aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={styles.searchIcon}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </span>

          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search protocols..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      <div className={styles.treeArea}>
        {selectedRoot ? (
          <ProtocolsTree
            data={[selectedRoot]}
            searchText={searchText}
            isDark={hostIsDark}
            onNodeDoubleClick={(protocolId: string) => {
              onProtocolDoubleClick?.(protocolId);
              setOpen(false);
            }}
          />
        ) : (
          <div className={styles.emptyState}>
            {loading
              ? "Loading protocols…"
              : projectId == null
                ? "Select a project to view protocols"
                : "No protocols found"}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div ref={hostRef} className={styles.drawerRoot}>
      <button
        onClick={handleButtonOpen}
        disabled={loading || projectId == null}
        className="pp-chipBtn"
        type="button"
      >
        <BoxCubeIcon className={styles.triggerIcon} />
        {loading ? "Loading…" : "Protocols"}
      </button>

      {typeof document !== "undefined" ? createPortal(drawerEl, document.body) : null}
    </div>
  );
};
