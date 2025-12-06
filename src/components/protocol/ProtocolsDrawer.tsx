import { useState, useCallback, useEffect, useRef } from "react";
import { ProtocolsTree, ProtocolNode } from "./ProtocolTree";
import { loadProtocols } from "@/api/projects";
import { BoxCubeIcon } from "@/icons";

interface ProtocolsDrawerProps {
  projectId: number | null;
  onProtocolDoubleClick?: (protocolId: string) => void;

  /** Controlled mode: parent drives the open state */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;

  /** Auto-load protocols when the drawer opens in controlled mode */
  autoLoadOnOpen?: boolean;
}

export const ProtocolsDrawer: React.FC<ProtocolsDrawerProps> = ({
  projectId,
  onProtocolDoubleClick,
  open: openProp,
  onOpenChange,
  autoLoadOnOpen = true,
}) => {
  const [protocols, setProtocols] = useState<ProtocolNode[]>([]);
  const [loading, setLoading] = useState(false);

  // Controlled vs uncontrolled open state
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

  // Track last loaded project id to avoid redundant fetches
  const lastLoadedProjectId = useRef<number | null>(null);

  /** Fetch protocols for the given project and do not change the open state. */
  const fetchProtocolsForProject = useCallback(
    async (pid: number) => {
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
    },
    []
  );

  /** Old button flow: load first, then open the drawer. */
  const handleButtonOpen = useCallback(async () => {
    if (projectId == null) return;
    await fetchProtocolsForProject(projectId);
    setOpen(true);
  }, [projectId, fetchProtocolsForProject]);

  /** In controlled mode, auto-load when the drawer becomes visible. */
  useEffect(() => {
    if (!autoLoadOnOpen) return;
    if (!isOpen) return;
    if (projectId == null) return;

    const needsLoad =
      protocols.length === 0 || lastLoadedProjectId.current !== projectId;

    if (needsLoad) {
      // Fire and forget; open state is already true
      fetchProtocolsForProject(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId, autoLoadOnOpen]);

  // Close on Escape
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  // Autofocus search when opening
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // If project changes while closed, clear previous list to force a fresh load on next open
  useEffect(() => {
    if (!isOpen) {
      setProtocols([]);
      setSelectedRoot(null);
      lastLoadedProjectId.current = null;
      setSearchText("");
    }
  }, [projectId, isOpen]);

  return (
    <>
      {/* Trigger button (uncontrolled convenience) */}
      <button
        onClick={handleButtonOpen}
        disabled={loading || projectId == null}
        className="px-3 py-1 rounded-lg text-xs flex items-center gap-1 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
      >
        <BoxCubeIcon className="w-4 h-4" />
        {loading ? "Loading…" : "Protocols"}
      </button>

      {/* Drawer */}
      <div
        className={`
    fixed top-3 border bottom-0 right-2 w-130
    bg-white dark:bg-gray-800 shadow-xl
    rounded-2xl overflow-hidden
    transform transition-all duration-300 ease-in-out z-50
    ${isOpen
            ? "translate-x-0 opacity-100 pointer-events-auto"
            : "translate-x-full opacity-0 pointer-events-none"}
  `}
      >
        {/* Close */}
        <div className="relative">
          <button
            onClick={() => setOpen(false)}
            className="absolute top-17 right-4 z-50 text-gray-500 hover:text-gray-900 dark:hover:text-white bg-gray-200 dark:bg-gray-800 rounded-full w-8 h-8 shadow-lg"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        {/* Header */}
        <div className="flex flex-col p-3 rounded-lg bg-gradient-to-r text-gray-200  from-gray-800 to-gray-700 dark:from-gray-800 dark:to-gray-700 border-b border-gray-300 shadow-sm mt-14">
          <h2 className="text-lg">Protocols</h2>
        </div>

        {/* Root selector */}
        {protocols.length > 1 && (
          <div className="p-1 ml-3 border-b border-gray-200 dark:border-gray-700">
            <select
              className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
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

        {/* Search */}
        <div className="p-1 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-40 ml-3">
          <div className="relative w-full max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-gray-400 dark:text-gray-500"
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
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search protocols..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-125 px-3 py-2 pl-10 pr-3 border text-gray-800 border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>

        {/* Tree */}
        <div className="p-3 overflow-y-auto h-[calc(100%-192px)] scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent">
          {selectedRoot ? (
            <ProtocolsTree
              data={[selectedRoot]}
              searchText={searchText}
              onNodeDoubleClick={(protocolId: string) => {
                onProtocolDoubleClick?.(protocolId);
                setOpen(false);
              }}
            />
          ) : (
            <div className="text-gray-500">
              {loading
                ? "Loading protocols…"
                : projectId == null
                  ? "Select a project to view protocols"
                  : "No protocols found"}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
