// File: src/pages/project/ProjectPage.tsx
import { useParams } from "react-router-dom";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ProtocolForm from "../../../components/protocol/ProtocolForm";
import { buildGraphElements } from "../../../utils/graph_utils";

import ReactFlow, {
  Background,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Edge,
  applyNodeChanges,
  NodeChange,
  Node,
  ReactFlowInstance,
  useUpdateNodeInternals,
} from "reactflow";
import "reactflow/dist/style.css";

import { createStatusNodeWrapper } from "../../../components/protocol/ProtocolNodeCardWrapper";
import { ProtocolsDrawer } from "@/components/protocol/ProtocolsDrawer";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MinusIcon, PlusIcon, RefreshCw, Trash2 } from "lucide-react";
import { FitViewIcon, TableIcon, TreeIcon } from "../../../icons";

import { useProjectService } from "@/ProjectServiceContext";
import { Project } from "@/types/project";

/* ---------- Local Types ---------- */
interface StatusNodeData {
  label: string;
  status?: string;
  id: string;
  color?: string;
  cpuTime?: string;
  elapsedTime?: string;
  tick?: number;
  numberOfSteps?: number;
  stepsDone?: number;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeId?: string | null;
}

/* =========================================================
   Top-level wrapper with the ReactFlowProvider
   (required so all RF hooks work correctly)
   ========================================================= */
export default function ProjectPage() {
  const { projectName } = useParams<{ projectName: string }>();
  if (!projectName) return null;

  return (
    <ReactFlowProvider>
      <ProjectPageInner projectName={projectName} />
    </ReactFlowProvider>
  );
}

/* =========================================================
   Real page component (inside ReactFlowProvider)
   ========================================================= */
function ProjectPageInner({ projectName }: { projectName: string }) {
  const svc = useProjectService();

  /* ---------- Data & UI state ---------- */
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<any>(null);

  // Graph state
  const [nodes, setNodes, onNodesChange] = useNodesState<StatusNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);

  // Table data (mirrors protocols)
  const [tableData, setTableData] = useState<any[]>([]);

  // Misc UI state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previousNodeId, setPreviousNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"hierarchical" | "table">("hierarchical");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [graphDirection, setGraphDirection] = useState<"TB" | "LR">("TB");

  // Timers / refresh
  const TIME_TO_REFRESH = 15000; // 15s

  // Persistence & instance refs
  const disablePersistenceRef = useRef(false);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const updateNodeInternals = useUpdateNodeInternals();

  // Table helpers
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });

  // Overlay (protect while swapping layouts / first paint)
  const [isSwitchingLayout, setIsSwitchingLayout] = useState(true);

  // Node timers (tick every second if "running")
  const [nodeTicks, setNodeTicks] = useState<Record<string, number>>({});

  // Flow key to hard-remount ReactFlow when needed (prevents stale internals)
  const [flowKey, setFlowKey] = useState(() => `rf-${projectName}-${graphDirection}-${Date.now()}`);

  // Initial zoom limits
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 0.6;

  // Persist node positions by project + direction
  const localStorageKey = `project-${projectName}-node-positions`;

  // Keep nodes mirror in ref (avoid stale closures)
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  /* ---------- Helpers ---------- */

  // Clamp zoom so user can't zoom too far
  const clampZoom = (z: number | undefined | null) => {
    const num = typeof z === "number" && !Number.isNaN(z) ? z : 0.32;
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, num));
  };

  // Build stable nodeTypes that only change when LR/TB changes
  // (avoids React Flow warning #002)
  const nodeTypes = useMemo(
    () => ({
      status: createStatusNodeWrapper(
        (data) => handleNodeClick(data),
        (data) => handleNodeDoubleClick(data),
        previousNodeId ?? undefined,
        hoveredNodeId ?? undefined,
        setHoveredNodeId,
        graphDirection
      ),
    }),
    // Important: only depend on graphDirection to keep it stable for hover/click
    [graphDirection] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Save node positions to localStorage
  const handleNodesChangeWithPersistence = (changes: NodeChange[]) => {
    if (disablePersistenceRef.current) {
      onNodesChange(changes);
      return;
    }
    setNodes((nds) => {
      const updated = applyNodeChanges(changes, nds);
      const positions = updated.map((n) => ({ id: n.id, position: n.position }));
      try {
        localStorage.setItem(`${localStorageKey}-${graphDirection}`, JSON.stringify(positions));
      } catch {
        // ignore quota/security errors
      }
      return updated;
    });
  };

  // Load saved positions (per direction)
  const loadNodesWithPositions = (loadedNodes: Node[]) => {
    const savedPositions: { id: string; position: { x: number; y: number } }[] =
      JSON.parse(localStorage.getItem(`${localStorageKey}-${graphDirection}`) || "[]");
    return loadedNodes.map((n) => {
      const saved = savedPositions.find((p) => p.id === n.id);
      return saved ? { ...n, position: saved.position } : n;
    });
  };

  const shallowEqual = (a: any, b: any) => {
    if (a === b) return true;
    if (!a || !b) return false;
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) if (a[k] !== b[k]) return false;
    return true;
  };

  // Merge keeping user positions and source/target handles so edges adapt to LR/TB
  const mergeNodesWithPositions = (newNodes: Node[]) => {
    const oldMap = new Map(nodes.map((n) => [n.id, n]));
    return newNodes.map((n) => {
      const old = oldMap.get(n.id);
      if (!old) return n;

      const position =
        old.position && old.position.x !== undefined && old.position.y !== undefined
          ? old.position
          : (n.position ?? old.position);

      const sameData = shallowEqual((old as any).data, (n as any).data);
      const samePosRef = position === old.position;
      const sameHandles = old.sourcePosition === n.sourcePosition && old.targetPosition === n.targetPosition;

      if (sameData && samePosRef && sameHandles) return old;

      return {
        ...old,
        position,
        data: { ...(old as any).data, ...(n as any).data },
        sourcePosition: n.sourcePosition,
        targetPosition: n.targetPosition,
      } as Node;
    });
  };

  const mergeEdges = (newEdges: Edge[]) => {
    const oldMap = new Map(edges.map((e) => [e.id, e]));
    return newEdges.map((e) => (oldMap.get(e.id) ? { ...oldMap.get(e.id)!, ...e } : e));
  };

  // Compute bounding-box center and center view (preserving current zoom)
  // We do NOT manage viewport in state to avoid fighting with pan
  const centerLikeButton = useCallback((nodesList?: Node[]) => {
    const inst = reactFlowInstanceRef.current;
    if (!inst) return;

    const list = nodesList ?? nodesRef.current;
    const valid = list.filter(
      (n) => typeof n.position?.x === "number" && typeof n.position?.y === "number"
    );
    if (!valid.length) return;

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of valid) {
      const { x, y } = n.position!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const vp = inst.getViewport();
    const targetZoom = clampZoom(vp.zoom);
    inst.setCenter(cx, cy, { zoom: targetZoom, duration: 0 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Fetch & lifecycle ---------- */

  // First load / reload project + graph
  const fetchAndLoadProject = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await svc.fetchProject(projectName);
      setProject(data);

      if (!data?.protocols) {
        setNodes([]);
        setEdges([]);
        setTableData([]);
        setIsRefreshing(false);
        return;
      }

      const { nodes: builtNodes, edges: builtEdges, table } = buildGraphElements(
        data.shortName,
        data.protocols,
        viewMode,
        graphDirection
      );

      const nodesWithPositions = loadNodesWithPositions(builtNodes);

      setNodes(nodesWithPositions);
      setEdges(builtEdges);
      setTableData(table ?? []);

      // Recompute handles/paths after painting to adapt to LR/TB
      requestAnimationFrame(() => {
        const ids = nodesWithPositions.map((n) => n.id);
        ids.forEach((id) => updateNodeInternals(id));
      });

      // Initial ticks for "running" nodes
      const initialTicks: Record<string, number> = {};
      nodesWithPositions.forEach((n) => {
        const d = (n as any).data;
        if (d?.status === "running") {
          initialTicks[n.id] = Number(d.elapsedTime) ?? 0;
        }
      });
      setNodeTicks(initialTicks);

      // Center once after first graph build
      requestAnimationFrame(() => centerLikeButton(nodesWithPositions));
    } catch (err) {
      console.error("fetchAndLoadProject error:", err);
    } finally {
      setIsRefreshing(false);
      setIsSwitchingLayout(false);
    }
  }, [projectName, graphDirection, viewMode, svc, updateNodeInternals, centerLikeButton]);

  useEffect(() => {
    // Initial load
    fetchAndLoadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAndLoadProject]);

  // Background auto-refresh (does not recentre or reset user pan)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await svc.fetchProject(projectName);
      setProject(data);

      if (!data?.protocols) return;

      const { nodes: builtNodes, edges: builtEdges, table } = buildGraphElements(
        data.shortName,
        data.protocols,
        viewMode,
        graphDirection
      );

      const nodesWithPositions = mergeNodesWithPositions(builtNodes);
      const edgesMerged = mergeEdges(builtEdges);

      setNodes(nodesWithPositions);
      setEdges(edgesMerged);
      setTableData(table ?? []);

      // Recompute handles/paths so edges snap to the correct sides
      requestAnimationFrame(() => {
        const ids = nodesWithPositions.map((n) => n.id);
        ids.forEach((id) => updateNodeInternals(id));
      });

      // Update ticks for running nodes (keep max)
      setNodeTicks((prev) => {
        const updated: Record<string, number> = { ...prev };
        nodesWithPositions.forEach((n) => {
          const nd = (n as any).data;
          if (nd?.status === "running") {
            updated[n.id] = Math.max(prev[n.id] ?? 0, Number(nd.elapsedTime) ?? 0);
          }
        });
        return updated;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  }, [projectName, viewMode, graphDirection, nodes, edges, svc, updateNodeInternals]);

  // Keep refresh interval stable
  const handleRefreshRef = useRef(handleRefresh);
  useEffect(() => {
    handleRefreshRef.current = handleRefresh;
  }, [handleRefresh]);
  useEffect(() => {
    const interval = setInterval(() => {
      handleRefreshRef.current();
    }, TIME_TO_REFRESH);
    return () => clearInterval(interval);
  }, []);

  // Rebuild graph & center (clears saved positions)
  const handleReorganize = useCallback(
    async (opts?: { preserveZoom?: boolean }) => {
      try {
        try {
          localStorage.removeItem(`${localStorageKey}-${graphDirection}`);
        } catch {
          /* ignore */
        }

        disablePersistenceRef.current = true;
        setIsSwitchingLayout(true);

        // Hard remount to purge internal RF state
        setFlowKey(`rf-${projectName}-${graphDirection}-${Date.now()}`);

        const data = await svc.fetchProject(projectName);
        setProject(data);
        if (!data?.protocols) {
          disablePersistenceRef.current = false;
          setIsSwitchingLayout(false);
          return;
        }

        const { nodes: builtNodes, edges: builtEdges, table } = buildGraphElements(
          data.shortName,
          data.protocols,
          viewMode,
          graphDirection
        );

        setNodes(builtNodes);
        setEdges(builtEdges);
        setTableData(table ?? []);

        requestAnimationFrame(() => {
          const ids = builtNodes.map((n) => n.id);
          ids.forEach((id) => updateNodeInternals(id));
          requestAnimationFrame(() => centerLikeButton(builtNodes));
        });
      } catch (err) {
        console.error(err);
      } finally {
        setTimeout(() => {
          disablePersistenceRef.current = false;
          setIsSwitchingLayout(false);
        }, 60);
      }
    },
    [projectName, viewMode, graphDirection, centerLikeButton, svc, updateNodeInternals]
  );

  /* ---------- Per-node timers (ticks) ---------- */
  useEffect(() => {
    const interval = setInterval(() => {
      setNodeTicks((prev) => {
        const updated: Record<string, number> = { ...prev };
        nodesRef.current.forEach((node) => {
          const nd = (node as any).data;
          if (nd?.status === "running") {
            updated[node.id] = (prev[node.id] ?? Number(nd.elapsedTime) ?? 0) + 1;
          }
        });
        return updated;
      });

      setTableData((prev) =>
        prev.map((row) =>
          row.status === "running"
            ? { ...row, tick: (row.tick ?? Number(row.elapsedTime) ?? 0) + 1 }
            : row
        )
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Inject tick into node.data without replacing node objects unnecessarily
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...(node as any).data,
          tick: nodeTicks[node.id] ?? Number((node as any).data?.elapsedTime) ?? 0,
        },
      }))
    );
  }, [nodeTicks, setNodes]);

  /* ---------- Layout switch (LR <-> TB or to table) ---------- */
  const prevLayout = useRef({ viewMode, graphDirection });
  useLayoutEffect(() => {
    const layoutChanged =
      prevLayout.current.viewMode !== viewMode ||
      prevLayout.current.graphDirection !== graphDirection;

    if (!layoutChanged) return;
    if (!project?.protocols) {
      prevLayout.current = { viewMode, graphDirection };
      return;
    }

    const { nodes: builtNodes, edges: builtEdges } = buildGraphElements(
      project.shortName,
      project.protocols,
      viewMode,
      graphDirection
    );

    // While swapping layouts we don't want to persist accidental positions
    disablePersistenceRef.current = true;
    setIsSwitchingLayout(true);

    // Keep saved positions (per-direction) if any
    const nodesWithPositions = loadNodesWithPositions(builtNodes);

    // Swap in a single batch
    setNodes(nodesWithPositions);
    setEdges(builtEdges);

    // Ensure handles/paths get recomputed for the new direction
    requestAnimationFrame(() => {
      const ids = nodesWithPositions.map((n) => n.id);
      ids.forEach((id) => updateNodeInternals(id));
      // Center only for hierarchical view
      if (viewMode === "hierarchical") {
        requestAnimationFrame(() => centerLikeButton(nodesWithPositions));
      }
      setTimeout(() => {
        disablePersistenceRef.current = false;
        setIsSwitchingLayout(false);
      }, 60);
    });

    prevLayout.current = { viewMode, graphDirection };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphDirection, viewMode, project]);

  /* ---------- Node interactions ---------- */
  const handleNodeClick = (nodeData: any, event?: React.MouseEvent) => {
    setContextMenu((p) => ({ ...p, visible: false }));

    const multi = event?.shiftKey;
    if (multi) return;

    setPreviousNodeId(nodeData.id);

    // Highlight connected edges
    const edgesToHighlight = edges
      .filter((e) => e.source === nodeData.id || e.target === nodeData.id)
      .map((e) => e.id);

    setEdges((eds) =>
      eds.map((edge) =>
        edgesToHighlight.includes(edge.id)
          ? { ...edge, style: { ...edge.style, stroke: "#0070f3", strokeWidth: 3 } }
          : { ...edge, style: undefined }
      )
    );
  };

  const handleNodeDoubleClick = async (nodeData: any) => {
    setContextMenu((p) => ({ ...p, visible: false }));
    try {
      const full = await svc.fetchProtocolDetails(projectName, nodeData.id);
      setSelectedNodeDetails(full);
      setPreviousNodeId(nodeData.id);
    } catch (err) {
      console.error("Failed to fetch protocol details", err);
    }
  };

  const handleCloseForm = () => setSelectedNodeDetails(null);

  /* ---------- Search / table helpers ---------- */
  const scrollToProtocol = (id: string) => {
    const row = rowRefs.current[id];
    const container = tableContainerRef.current;
    if (row && container) {
      setHighlightedId(id);
      const rowTop = row.offsetTop;
      const rowHeight = row.offsetHeight;
      const containerHeight = container.offsetHeight;
      container.scrollTo({
        top: rowTop - containerHeight / 2 + rowHeight / 2,
        behavior: "smooth",
      });
    }
  };

  const getStatusStyle = (status?: string) => {
    const colorMap: Record<string, string> = {
      running: "#FCCE62",
      saved: "#D9F1FA",
      launched: "#D9F1FA",
      finished: "#D2F5CB",
      failed: "#F5CCCB",
      aborted: "#F5CCCB",
      interactive: "#f7f3bf",
    };
    return {
      backgroundColor: colorMap[status ?? ""] ?? "#eee",
      padding: "4px 8px",
      borderRadius: "6px",
      fontWeight: 300,
      color: "black",
    };
  };

  const formatCpuTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(h)}h:${pad(m)}m:${pad(s)}s`;
  };

  const handleSearch = (query: string) => {
    const inst = reactFlowInstanceRef.current;
    if (!query.trim()) {
      setHighlightedId(null);
      setPreviousNodeId(null);
      setEdges((eds) => eds.map((e) => ({ ...e, style: undefined })));
      return;
    }

    if (viewMode === "table") {
      const matchRow = tableData.find(
        (row) =>
          row.id.toLowerCase().includes(query.toLowerCase()) ||
          row.label.toLowerCase().includes(query.toLowerCase())
      );
      if (matchRow) scrollToProtocol(matchRow.id);
      return;
    }

    const match = nodesRef.current.find(
      (n) =>
        n.id.toLowerCase().includes(query.toLowerCase()) ||
        (((n as any).data?.label ?? "") as string)
          .toLowerCase()
          .includes(query.toLowerCase())
    );
    if (!match) {
      setHighlightedId(null);
      setPreviousNodeId(null);
      setEdges((eds) => eds.map((e) => ({ ...e, style: undefined })));
      return;
    }

    // Highlight node via selectedNodeId (StatusNode will render it)
    setPreviousNodeId(match.id);
    setHighlightedId(match.id);

    // Highlight edges connected to the match
    const connectedEdgeIds = edges
      .filter((e) => e.source === match.id || e.target === match.id)
      .map((e) => e.id);
    setEdges((eds) =>
      eds.map((e) =>
        connectedEdgeIds.includes(e.id)
          ? { ...e, style: { ...(e.style ?? {}), stroke: "#0070f3", strokeWidth: 3 } }
          : { ...e, style: undefined }
      )
    );

    // Center on the node (preserving current zoom)
    if (inst && match.position) {
      const vp = inst.getViewport();
      inst.setCenter(match.position.x, match.position.y, {
        zoom: clampZoom(vp.zoom),
        duration: 300,
      });
    }
  };

  /* ---------- Context menu ---------- */
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const nodeEl = (event.target as HTMLElement).closest(".react-flow__node");
    const nodeId = nodeEl?.getAttribute("data-id") ?? null;
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, nodeId });
  };

  const handleCloseMenu = () => setContextMenu((prev) => ({ ...prev, visible: false }));

  useEffect(() => {
    if (!contextMenu.visible) return;
    const onWindowMouseDown = () => handleCloseMenu();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseMenu();
    };
    window.addEventListener("mousedown", onWindowMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onWindowMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu.visible]);

  /* ---------- React Flow Init & Controls ---------- */
  const handleOnInit = useCallback((inst: ReactFlowInstance) => {
    // Keep a ref to the instance. Do not set viewport here (avoid fighting pan).
    reactFlowInstanceRef.current = inst;
  }, []);

  const ZOOM_FACTOR = 1.2;
  const handleZoomIn = useCallback(() => {
    const inst = reactFlowInstanceRef.current;
    if (!inst) return;
    const vp = inst.getViewport();
    inst.setViewport({ x: vp.x, y: vp.y, zoom: Math.min(vp.zoom * ZOOM_FACTOR, MAX_ZOOM) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleZoomOut = useCallback(() => {
    const inst = reactFlowInstanceRef.current;
    if (!inst) return;
    const vp = inst.getViewport();
    inst.setViewport({ x: vp.x, y: vp.y, zoom: Math.max(vp.zoom / ZOOM_FACTOR, MIN_ZOOM) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFitView = useCallback(() => {
    // Behaves like our center button (preserves current zoom)
    centerLikeButton();
  }, [centerLikeButton]);

  /* ---------- Render ---------- */
  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-1">
        {/* Search */}
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
            type="text"
            placeholder="Search protocol..."
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-2 pl-10 pr-3 text-sm text-gray-800 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          />
        </div>

        {/* Protocols / Workflows */}
        <div className="ml-4 mr-4 p-2 border rounded-lg shadow-sm bg-white dark:bg-gray-800 flex items-center gap-4">
          <ProtocolsDrawer
            projectId={project?.id ? Number(project.id) : null}
            onProtocolDoubleClick={async (protocolClass: string) => {
              try {
                const fullNodeData = await svc.fetchNewProtocolDetails(projectName, protocolClass);
                setSelectedNodeDetails(fullNodeData);
                setPreviousNodeId(protocolClass);
              } catch (err) {
                console.error("Failed to fetch protocol details", err);
              }
            }}
          />

          <button
            onClick={() => console.log("Workflow clicked")}
            className="px-3 py-1 rounded-lg text-xs flex items-center gap-1 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          >
            <TreeIcon className="w-4 h-4" />
            Workflows
          </button>
        </div>

        {/* View mode controls */}
        <div className="ml-4 mr-4 p-2 border rounded-lg shadow-sm bg-white dark:bg-gray-800 flex items-center gap-4">
          <span className="font-small text-xs">View mode:</span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setViewMode("hierarchical");
                setGraphDirection("TB");
              }}
              className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${
                viewMode === "hierarchical" && graphDirection === "TB"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              <TreeIcon className="w-4 h-4" /> Tree TB
            </button>

            <button
              onClick={() => {
                setViewMode("hierarchical");
                setGraphDirection("LR");
              }}
              className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${
                viewMode === "hierarchical" && graphDirection === "LR"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              <TreeIcon className="w-4 h-4 transform rotate-270" /> Tree LR
            </button>

            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${
                viewMode === "table"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              <TableIcon className="w-4 h-4" /> Table
            </button>
          </div>
        </div>
      </div>

      {/* Drawer with protocol form */}
      {selectedNodeDetails && (
        <ProtocolForm
          data={selectedNodeDetails}
          projectProtocols={project?.protocols ?? {}}
          onClose={handleCloseForm}
        />
      )}

      {/* Main content */}
      <div className="flex-1 relative">
        {/* Switching overlay (mask while swapping layout) */}
        {isSwitchingLayout && (
          <div
            aria-hidden
            className="absolute inset-0 z-60 flex items-center justify-center"
            style={{ background: "var(--reactflow-background, #ffffff)", pointerEvents: "auto" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
            </div>
          </div>
        )}

        {/* ===== TABLE ===== */}
        <div
          ref={tableContainerRef}
          className="absolute inset-0 overflow-auto border rounded shadow p-4 z-30 transition-opacity"
          style={{
            opacity: viewMode === "table" ? 1 : 0,
            pointerEvents: viewMode === "table" ? "auto" : "none",
          }}
          aria-hidden={viewMode !== "table"}
        >
          <div className="flex justify-end mb-4 mr-1">
            <button
              className="refresh-btn"
              title="Refresh project"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          <table className="w-full text-sm border border-gray-300 dark:border-gray-700">
            <thead className="bg-gray-300 dark:bg-gray-800 font-normal">
              <tr>
                <th className="px-4 py-2 text-left font-normal">Id</th>
                <th className="px-4 py-2 text-left font-normal">Protocol</th>
                <th className="px-4 py-2 text-left font-normal">State</th>
                <th className="px-4 py-2 text-left font-normal">Elapsed</th>
                <th className="px-4 py-2 text-left font-normal">Dependent</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row) => (
                <tr
                  key={row.id}
                  ref={(el) => {
                    rowRefs.current[row.id] = el;
                  }}
                  onDoubleClick={() => {
                    // Open details from the table
                    svc
                      .fetchProtocolDetails(projectName, row.id)
                      .then((full) => {
                        setHighlightedId(row.id);
                        setSelectedNodeDetails(full);
                        setPreviousNodeId(row.id);
                      })
                      .catch((err) => console.error(err));
                  }}
                  className={`border-t border-gray-200 dark:border-gray-700 ${
                    highlightedId === row.id ? "bg-yellow-100 dark:bg-yellow-900" : ""
                  }`}
                >
                  <td className="px-4 py-2">{row.id}</td>
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`${row.status === "running" ? "pulsing-table" : ""}`}
                        style={getStatusStyle(row.status)}
                      >
                        {row.status ?? "—"}
                      </span>

                      {(row.status === "running" ||
                        row.status === "failed" ||
                        row.status === "aborted") && (
                        <div className="flex items-center gap-2 ml-4 flex-1">
                          <div className="w-16 h-3 bg-gray-300 dark:bg-gray-700 rounded overflow-hidden">
                            <div
                              className={`h-3 ${
                                row.status === "running"
                                  ? "bg-yellow-400"
                                  : row.status === "failed" || row.status === "aborted"
                                  ? "bg-red-500"
                                  : "bg-gray-400"
                              } transition-all duration-300`}
                              style={{
                                width: `${((row.stepsDone ?? 0) / (row.numberOfSteps ?? 1)) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm opacity-80">
                            {row.stepsDone}/{row.numberOfSteps}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono">
                    {formatCpuTime(row.tick ?? Number(row.elapsedTime) ?? 0)}
                  </td>
                  <td className="px-4 py-2 space-x-2">
                    {row.children?.map((childId: string) => (
                      <button
                        key={childId}
                        onClick={() => scrollToProtocol(childId)}
                        className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800"
                      >
                        {childId}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ===== REACTFLOW ===== */}
        <div
          className="absolute inset-0 border transition-opacity"
          style={{
            opacity: viewMode === "hierarchical" ? 1 : 0,
            pointerEvents: viewMode === "hierarchical" ? "auto" : "none",
            zIndex: 20,
          }}
          aria-hidden={viewMode !== "hierarchical"}
        >
          {/* Controls */}
          <div className="absolute top-4 right-4 z-50">
            <div className="flex flex-col gap-1 p-1 bg-white/90 rounded shadow">
              <button
                title="Zoom in"
                onClick={handleZoomIn}
                className="p-1 rounded hover:bg-gray-100 dark:text-black"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
              <button
                title="Zoom out"
                onClick={handleZoomOut}
                className="p-1 rounded hover:bg-gray-100 dark:text-black"
              >
                <MinusIcon className="w-4 h-4" />
              </button>
              <button
                title="Fit view (preserve zoom)"
                onClick={handleFitView}
                className="p-1 rounded hover:bg-gray-100 dark:text-black"
              >
                <FitViewIcon className="w-4 h-4" />
              </button>
              <button
                title="Reorganize project"
                onClick={() => handleReorganize({ preserveZoom: true })}
                className="p-1 rounded hover:bg-gray-100 dark:text-black"
              >
                <TreeIcon className="w-4 h-4" />
              </button>
              <button
                title="Refresh project"
                onClick={handleRefresh}
                className="p-1 rounded hover:bg-gray-100 dark:text-black"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Arrow marker definition */}
          <svg width="0" height="0" aria-hidden>
            <defs>
              <marker
                id="circle"
                viewBox="0 0 40 40"
                refX="20"
                refY="20"
                markerWidth="20"
                markerHeight="20"
                orient="auto-start-reverse"
              >
                <circle cx="20" cy="20" r="10" fill="#ff0000" />
              </marker>
            </defs>
          </svg>

          {/* The Flow */}
          <ReactFlow
            key={flowKey}
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChangeWithPersistence}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            onInit={handleOnInit}
            onPaneClick={() => handleCloseMenu()}
            defaultViewport={{ x: 0, y: 0, zoom: 0.32 }}
            defaultEdgeOptions={{
              type: "default",
              style: { stroke: "#999", strokeWidth: 2 },
              markerEnd: "url(#circle)",
            }}
            onNodeDoubleClick={(_, node) => handleNodeDoubleClick(node)}
            onNodeClick={(evt, node) => handleNodeClick(node, evt)}
            onContextMenu={handleContextMenu}
            style={{ width: "100%", height: "100%" }}
          >
            <Background />
          </ReactFlow>

          {/* Context menu */}
          {contextMenu.visible && (
            <DropdownMenu open={true} onOpenChange={handleCloseMenu}>
              <DropdownMenuTrigger asChild>
                <button
                  style={{
                    position: "fixed",
                    top: contextMenu.y,
                    left: contextMenu.x,
                    width: 0,
                    height: 0,
                    opacity: 0,
                  }}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuItem
                  onClick={() => {
                    handleRefresh();
                    handleCloseMenu();
                  }}
                >
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Add protocol
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => {
                    handleRefresh();
                    handleCloseMenu();
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh graph
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => {
                    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
                    handleCloseMenu();
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear selection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
