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
import { createPortal } from "react-dom";
import {
  fetchProject,
  Project,
  fetchProtocolDetails,
  fetchNewProtocolDetails,
} from "../../../api/projects";
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
import {
  MinusIcon,
  Plus,
  PlusIcon,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { FitViewIcon, TableIcon, TreeIcon } from "../../../icons";

/**
 * ProjectPage
 *
 * FULL standalone file (copy-paste ready).
 *
 * All comments are in English and critical functions are documented.
 */

/* --------------------- Types --------------------- */
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

/* --------------------- Component --------------------- */
export default function ProjectPage() {
  const { projectName } = useParams<{ projectName: string }>();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<any>(null);

  // react-flow nodes / edges state
  const [nodes, setNodes, onNodesChange] = useNodesState<StatusNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previousNodeId, setPreviousNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"hierarchical" | "table">(
    "hierarchical"
  );
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [nodeTicks, setNodeTicks] = useState<Record<string, number>>({});
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [graphDirection, setGraphDirection] = useState<"TB" | "LR">("TB");

  // persistence control
  const disablePersistenceRef = useRef(false);
  const [flowKey, setFlowKey] = useState(
    () => `rf-${projectName}-${graphDirection}-${Date.now()}`
  );
  const [viewport, setViewport] = useState<{
    x: number;
    y: number;
    zoom: number;
  }>({ x: 0, y: 0, zoom: 0.38 });
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  // context menu state (viewport coordinates)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });

  const TIME_TO_REFRESH = 15000; // 15 seconds
  const localStorageKey = `project-${projectName}-node-positions`;

  // overlay / flicker control
  const [isSwitchingLayout, setIsSwitchingLayout] = useState(true);
  const [tableVisible, setTableVisible] = useState(viewMode === "table");
  const [nodesLoadedOnce, setNodesLoadedOnce] = useState(false);

  // initial load overlay control
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const firstLoadRef = useRef(true);

  // Zoom clamp (ensure zoom stays in acceptable range)
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 0.6;
  const clampZoom = (z: number | undefined | null) => {
    const num = typeof z === "number" && !Number.isNaN(z) ? z : 0.4;
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, num));
  };

  // keep latest nodes in ref to avoid render loops
  const nodesRef = useRef<Node[]>(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  /* --------------------- Node handlers --------------------- */

  /**
   * handleNodeClick
   * - highlight selected node and its connected edges
   * - if shift is pressed allow multi-select (noop here)
   */
  const handleNodeClick = (nodeData: any, event?: React.MouseEvent) => {
    handleCloseMenu();
    const isMultiSelect = event?.shiftKey;
    if (!isMultiSelect) {
      setPreviousNodeId(nodeData.id);
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeData.id ? n : { ...n, style: undefined }))
      );
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
    }
  };

  /**
   * handleNodeDoubleClick
   * - fetch full protocol details and open form drawer
   */
  const handleNodeDoubleClick = async (nodeData: any) => {
    handleCloseMenu();
    if (!projectName) return;
    try {
      const fullNodeData = await fetchProtocolDetails(projectName, nodeData.id);
      setSelectedNodeDetails(fullNodeData);
      setPreviousNodeId(nodeData.id);
    } catch (err) {
      console.error("Failed to fetch protocol details", err);
    }
  };

  const handleCloseForm = () => setSelectedNodeDetails(null);

  // nodeTypes mapping (wrap status nodes)
  const nodeTypes = useMemo(
    () => ({
      status: createStatusNodeWrapper(
        handleNodeClick,
        handleNodeDoubleClick,
        previousNodeId ?? undefined,
        hoveredNodeId ?? undefined,
        setHoveredNodeId,
        graphDirection
      ),
    }),
    [previousNodeId, hoveredNodeId, graphDirection]
  );

  /* --------------------- Persistence helpers --------------------- */

  /**
   * handleNodesChangeWithPersistence
   * - Applies node changes, persists positions to localStorage unless persistence disabled.
   */
  const handleNodesChangeWithPersistence = (changes: NodeChange[]) => {
    if (disablePersistenceRef.current) {
      return onNodesChange(changes);
    }
    setNodes((nds) => {
      const updated = applyNodeChanges(changes, nds);
      const positions = updated.map((n) => ({ id: n.id, position: n.position }));
      try {
        localStorage.setItem(`${localStorageKey}-${graphDirection}`, JSON.stringify(positions));
      } catch (err) {
        // ignore quota / security errors
      }
      return updated;
    });
  };

  const loadNodesWithPositions = (loadedNodes: Node[]) => {
    const savedPositions: { id: string; position: { x: number; y: number } }[] = JSON.parse(
      localStorage.getItem(`${localStorageKey}-${graphDirection}`) || "[]"
    );
    return loadedNodes.map((n) => {
      const saved = savedPositions.find((p) => p.id === n.id);
      return saved ? { ...n, position: saved.position } : n;
    });
  };

  const mergeNodesWithPositions = (newNodes: Node[]) => {
    return newNodes.map((n) => {
      const old = nodes.find((o) => o.id === n.id);
      return old ? { ...old, data: { ...old.data, ...n.data } } : n;
    });
  };

  const mergeEdges = (newEdges: Edge[]) => {
    const oldEdgesMap = new Map(edges.map((e) => [e.id, e]));
    return newEdges.map((e) => (oldEdgesMap.get(e.id) ? { ...oldEdgesMap.get(e.id)!, ...e } : e));
  };

  /* --------------------- Centering helper --------------------- */

  /**
   * centerLikeButton
   * - Centers the viewport to the average position of nodes (stable centering).
   * - Preserves zoom optionally and clamps to defined zoom range.
   */
  const centerLikeButton = useCallback((nodesList?: Node[], preserveZoom = true) => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    const list = nodesList ?? nodesRef.current ?? [];
    const validNodes = list.filter((n) => typeof n.position?.x === "number" && typeof n.position?.y === "number");
    if (validNodes.length === 0) {
      // fallback to fitView
      inst.fitView({ padding: 0.15, duration: 0 });
      requestAnimationFrame(() => {
        const vp = inst.getViewport();
        const clamped = { x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) };
        inst.setViewport(clamped);
        setViewport(clamped);
      });
      return;
    }

    const xSum = validNodes.reduce((sum, n) => sum + (n.position!.x ?? 0), 0);
    const ySum = validNodes.reduce((sum, n) => sum + (n.position!.y ?? 0), 0);
    const centerX = xSum / validNodes.length;
    const centerY = ySum / validNodes.length;

    const currentVp = inst.getViewport();
    const currentZoomRaw = preserveZoom ? currentVp.zoom : currentVp.zoom;
    const zoom = clampZoom(currentZoomRaw);
    inst.setCenter(centerX, centerY, { zoom, duration: 0 });

    requestAnimationFrame(() => {
      const vp = inst.getViewport();
      setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
    });
  }, []);

  /* --------------------- Fetch / load project --------------------- */

  /**
   * fetchAndLoadProject
   * - Loads project metadata and builds graph elements
   * - Applies saved positions if available
   */
  const fetchAndLoadProject = useCallback(async () => {
    if (!projectName) return;
    setIsRefreshing(true);
    try {
      const data = await fetchProject(projectName);
      setProject(data);

      if (data.protocols) {
        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(
          data.shortName,
          data.protocols,
          viewMode,
          graphDirection
        );
        const nodesWithPositions = loadNodesWithPositions(loadedNodes);

        setNodes(nodesWithPositions);
        setEdges(loadedEdges);
        setTableData(table ?? []);

        const initialTicks: Record<string, number> = {};
        nodesWithPositions.forEach((n) => {
          if (n.data?.status === "running") {
            initialTicks[n.id] = Number(n.data.elapsedTime) ?? 0;
          }
        });
        setNodeTicks(initialTicks);

        setNodesLoadedOnce(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
      if (firstLoadRef.current) {
        setIsInitialLoading(false);
        firstLoadRef.current = false;
      }
    }
  }, [projectName, viewMode, graphDirection]);

  useEffect(() => {
    fetchAndLoadProject();
  }, [fetchAndLoadProject]);

  /* --------------------- Refresh --------------------- */

  /**
   * handleRefresh
   * - Re-fetch project data and merge new nodes/edges
   */
  const handleRefresh = useCallback(async () => {
    if (!projectName) return;
    setIsRefreshing(true);
    try {
      const data = await fetchProject(projectName);
      setProject(data);

      if (data.protocols) {
        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(
          data.shortName,
          data.protocols,
          viewMode,
          graphDirection
        );
        const nodesWithPositions = mergeNodesWithPositions(loadedNodes);
        const edgesMerged = mergeEdges(loadedEdges);

        setNodes(nodesWithPositions);
        setEdges(edgesMerged);
        setTableData(table ?? []);

        setNodeTicks((prev) => {
          const updated: Record<string, number> = { ...prev };
          nodesWithPositions.forEach((n) => {
            if (n.data?.status === "running") {
              updated[n.id] = Math.max(prev[n.id] ?? 0, Number(n.data.elapsedTime) ?? 0);
            }
          });
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  }, [projectName, viewMode, graphDirection, nodes, edges]);

  // stable interval for refresh (keeps closure stable)
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

  /* --------------------- Reorganize (rebuild) --------------------- */

  /**
   * handleReorganize
   * - Clear persistence, reload project and re-center (used by UI button)
   */
  const handleReorganize = useCallback(
    async (opts?: { preserveZoom?: boolean }) => {
      if (!projectName) return;
      try {
        const instance = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
        const currentViewport = instance?.getViewport() ?? viewport;

        try {
          localStorage.removeItem(`${localStorageKey}-${graphDirection}`);
        } catch (err) {
          /* ignore */
        }

        disablePersistenceRef.current = true;
        setNodes([]);
        setEdges([]);
        setTableData([]);
        setNodeTicks({});
        setFlowKey(`rf-${projectName}-${graphDirection}-${Date.now()}`);

        const data = await fetchProject(projectName);
        setProject(data);
        if (!data.protocols) {
          disablePersistenceRef.current = false;
          return;
        }

        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(
          data.shortName,
          data.protocols,
          viewMode,
          graphDirection
        );

        setNodes(loadedNodes);
        setEdges(loadedEdges);
        setTableData(table ?? []);
        setNodeTicks({});

        setTimeout(() => {
          const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
          if (!inst) {
            disablePersistenceRef.current = false;
            return;
          }

          if (loadedNodes.length > 0) {
            // center like the button (wait two frames to ensure paint) and then wait a bit before hiding overlay
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                centerLikeButton(loadedNodes, opts?.preserveZoom ?? true);
                // small timeout to ensure browser painted final result -> reduces flicker
                setTimeout(() => {
                  disablePersistenceRef.current = false;
                }, 60);
              });
            });
          } else {
            const clamped = {
              x: currentViewport.x,
              y: currentViewport.y,
              zoom: clampZoom(currentViewport.zoom),
            };
            inst.setViewport(clamped);
            setViewport(clamped);
            disablePersistenceRef.current = false;
          }
        }, 0);
      } catch (err) {
        console.error(err);
        disablePersistenceRef.current = false;
      }
    },
    [projectName, viewMode, graphDirection, viewport, centerLikeButton]
  );

  /* --------------------- Ticks updater --------------------- */

  // increment running ticks every second for UI updates
  useEffect(() => {
    const interval = setInterval(() => {
      setNodeTicks((prev) => {
        const updated: Record<string, number> = { ...prev };
        nodesRef.current.forEach((node) => {
          if (node.data?.status === "running") {
            updated[node.id] = (prev[node.id] ?? Number(node.data.elapsedTime) ?? 0) + 1;
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

  // push tick values into nodes' data
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          tick: nodeTicks[node.id] ?? Number(node.data.elapsedTime) ?? 0,
        },
      }))
    );
  }, [nodeTicks]);

  /* --------------------- Layout change effect --------------------- */

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

    const instance = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!instance) {
      prevLayout.current = { viewMode, graphDirection };
      return;
    }

    const currentViewport = instance.getViewport();

    const { nodes: loadedNodes, edges: loadedEdges } = buildGraphElements(
      project.shortName,
      project.protocols,
      viewMode,
      graphDirection
    );
    const nodesWithPositions = loadNodesWithPositions(loadedNodes);

    // prevent persistence while we swap
    disablePersistenceRef.current = true;

    // show blocking overlay instantly to mask repaint
    setIsSwitchingLayout(true);

    // batch set nodes/edges — DON'T clear first to avoid a blank frame
    setNodes(nodesWithPositions);
    setEdges(loadedEdges);

    // wait two frames then center like the button; after that wait a little longer before hiding overlay
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
        if (!inst) {
          disablePersistenceRef.current = false;
          // small delay to ensure overlay doesn't flicker off/on
          setTimeout(() => setIsSwitchingLayout(false), 60);
          prevLayout.current = { viewMode, graphDirection };
          return;
        }

        if (nodesWithPositions.length > 0 && viewMode === "hierarchical") {
          centerLikeButton(nodesWithPositions, true);
          // give browser a bit of time to paint final positions (reduces visible flicker)
          requestAnimationFrame(() => {
            setTimeout(() => {
              disablePersistenceRef.current = false;
              setIsSwitchingLayout(false);
              prevLayout.current = { viewMode, graphDirection };
            }, 60);
          });
        } else {
          // non-hierarchical: restore previous viewport instantly
          const clamped = {
            x: currentViewport.x,
            y: currentViewport.y,
            zoom: clampZoom(currentViewport.zoom),
          };
          inst.setViewport(clamped);
          setViewport(clamped);
          requestAnimationFrame(() => {
            setTimeout(() => {
              disablePersistenceRef.current = false;
              setIsSwitchingLayout(false);
              prevLayout.current = { viewMode, graphDirection };
            }, 60);
          });
        }
      });
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphDirection, viewMode, project]);

  /* --------------------- Initial center effect --------------------- */

  useEffect(() => {
    if (!nodesLoadedOnce) return;
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;

    // ensure overlay on while we calculate + paint
    setIsSwitchingLayout(true);

    // compute center from the current nodes state (which we set when fetched)
    const validNodes = nodes.filter((n) => typeof n.position?.x === "number" && typeof n.position?.y === "number");
    if (validNodes.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          centerLikeButton(nodes, true);
          // wait a little after paint before hiding overlay to avoid flicker
          setTimeout(() => {
            setIsSwitchingLayout(false);
          }, 60);
        });
      });
    } else {
      inst.setViewport({ x: inst.getViewport().x, y: inst.getViewport().y, zoom: clampZoom(inst.getViewport().zoom) });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const vp = inst.getViewport();
          setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
          setTimeout(() => {
            setIsSwitchingLayout(false);
          }, 60);
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesLoadedOnce]);

  /* --------------------- Table switching: avoid flicker --------------------- */

  useEffect(() => {
    if (viewMode === "table") {
      setTableVisible(false);
      // while switching to table we still use the overlay (so both panes don't paint intermediate states)
      setIsSwitchingLayout(true);
      requestAnimationFrame(() => {
        setTableVisible(true);
        requestAnimationFrame(() => {
          // small wait to ensure paint complete
          setTimeout(() => {
            setIsSwitchingLayout(false);
          }, 60);
        });
      });
    } else {
      setTableVisible(false);
    }
  }, [viewMode]);

  /* --------------------- Table helpers / UI helpers --------------------- */

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

  const handleSearch = (query: string) => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;

    if (!query.trim()) {
      setHighlightedId(null);
      setPreviousNodeId(null);
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false, style: undefined })));
      setEdges((eds) => eds.map((e) => ({ ...e, style: undefined })));

      if (inst && nodes.length > 0) {
        const currentViewport = inst.getViewport();
        const validNodes = nodes.filter((n) => typeof n.position?.x === "number" && typeof n.position?.y === "number");
        if (validNodes.length > 0) {
          const xSum = validNodes.reduce((s, n) => s + (n.position?.x ?? 0), 0);
          const ySum = validNodes.reduce((s, n) => s + (n.position?.y ?? 0), 0);
          const centerX = xSum / validNodes.length;
          const centerY = ySum / validNodes.length;
          const zoom = clampZoom(currentViewport.zoom);
          inst.setCenter(centerX, centerY, { zoom, duration: 300 });
          const vp = inst.getViewport();
          setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
        } else {
          const clamped = { x: currentViewport.x, y: currentViewport.y, zoom: clampZoom(currentViewport.zoom) };
          inst.setViewport(clamped);
          setViewport(clamped);
        }
      }
      return;
    }

    if (viewMode === "table") {
      const matchRow = tableData.find((row) => row.id.toLowerCase().includes(query.toLowerCase()) || row.label.toLowerCase().includes(query.toLowerCase()));
      if (matchRow) scrollToProtocol(matchRow.id);
      return;
    }

    const match = nodes.find((node) => node.id.toLowerCase().includes(query.toLowerCase()) || (node.data?.label ?? "").toLowerCase().includes(query.toLowerCase()));

    if (!match) {
      setHighlightedId(null);
      setPreviousNodeId(null);
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false, style: undefined })));
      setEdges((eds) => eds.map((e) => ({ ...e, style: undefined })));
      return;
    }

    const highlightNodeStyle = { boxShadow: "0 0 0 4px rgba(0,112,243,0.12)" };

    setNodes((nds) =>
      nds.map((n) => (n.id === match.id ? { ...n, selected: true, style: { ...(n.style ?? {}), ...highlightNodeStyle } } : { ...n, selected: false, style: undefined }))
    );

    const connectedEdgeIds = edges.filter((e) => e.source === match.id || e.target === match.id).map((e) => e.id);
    setEdges((eds) => eds.map((e) => (connectedEdgeIds.includes(e.id) ? { ...e, style: { ...(e.style ?? {}), stroke: "#0070f3", strokeWidth: 3 } } : { ...e, style: undefined })));

    setPreviousNodeId(match.id);
    setHighlightedId(match.id);

    if (inst) {
      const currentZoom = inst.getViewport().zoom;
      const zoom = clampZoom(currentZoom);
      inst.setCenter(match.position.x, match.position.y, { zoom, duration: 500 });
      const vp = inst.getViewport();
      setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
    }
  };

  const handleRowDoubleClick = async (id: string) => {
    if (!projectName) return;
    try {
      const fullNodeData = await fetchProtocolDetails(projectName, id);
      setHighlightedId(id);
      setSelectedNodeDetails(fullNodeData);
      setPreviousNodeId(id);
    } catch (err) {
      console.error(err);
    }
  };

  /* --------------------- Time formatting helper (for table display) --------------------- */
  const formatCpuTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(hours)}h:${pad(minutes)}m:${pad(secs)}s`;
  };

  /* --------------------- Context menu (portal) --------------------- */

  /**
   * handleContextMenu
   * - Captures right click on the ReactFlow canvas
   * - Stores clientX/clientY and (optionally) node id for contextual actions
   */
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const nodeEl = (event.target as HTMLElement).closest(".react-flow__node");
    const nodeId = nodeEl?.getAttribute("data-id") ?? null;
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, nodeId });
  };

  const handleCloseMenu = () => setContextMenu((prev) => ({ ...prev, visible: false }));

  // close menu on outside interactions and ESC
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

  // ReactFlow init / move handlers (kept as in your original code)
  const handleOnInit = useCallback((inst: ReactFlowInstance) => {
    reactFlowInstanceRef.current = inst;
  }, []);

  const handleOnMoveEnd = useCallback((_: any, vp: { x: number; y: number; zoom: number }) => {
    setViewport(vp);
  }, []);

  /* --------------------- Controls for zoom / fit / center --------------------- */

  const ZOOM_FACTOR = 1.2;
  const handleZoomIn = useCallback(() => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    const vp = inst.getViewport();
    const newZoom = Math.min(vp.zoom * ZOOM_FACTOR, MAX_ZOOM);
    inst.setViewport({ x: vp.x, y: vp.y, zoom: newZoom });
    const newVp = inst.getViewport();
    setViewport({ x: newVp.x, y: newVp.y, zoom: newVp.zoom });
  }, []);

  const handleZoomOut = useCallback(() => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    const vp = inst.getViewport();
    const newZoom = Math.max(vp.zoom / ZOOM_FACTOR, MIN_ZOOM);
    inst.setViewport({ x: vp.x, y: vp.y, zoom: newZoom });
    const newVp = inst.getViewport();
    setViewport({ x: newVp.x, y: newVp.y, zoom: newVp.zoom });
  }, []);

  const handleCenterPreserveZoom = useCallback(() => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst || !nodes || nodes.length === 0) return;
    const validNodes = nodes.filter((n) => typeof n.position?.x === "number" && typeof n.position?.y === "number");
    if (validNodes.length === 0) return;
    const xSum = validNodes.reduce((sum, n) => sum + (n.position!.x ?? 0), 0);
    const ySum = validNodes.reduce((sum, n) => sum + (n.position!.y ?? 0), 0);
    const centerX = xSum / validNodes.length;
    const centerY = ySum / validNodes.length;
    const currentZoomRaw = inst.getViewport().zoom ?? viewport.zoom;
    const currentZoom = clampZoom(currentZoomRaw);
    inst.setCenter(centerX, centerY, { zoom: currentZoom, duration: 0 });
    const vp = inst.getViewport();
    setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
  }, [nodes, viewport]);

  const handleZoomToFit = useCallback(() => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    inst.fitView({ padding: 0.2, duration: 0 });
    requestAnimationFrame(() => {
      let vp = inst.getViewport();
      const clamped = { x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) };
      inst.setViewport(clamped);
      setViewport(clamped);
    });
  }, []);

  /* --------------------- Context menu portal component --------------------- */

  /**
   * ContextMenuPortal
   * - Renders children into document.body using createPortal.
   * - Positioned with client viewport coordinates to avoid transform offsets.
   */
  const ContextMenuPortal: React.FC<{
    x: number;
    y: number;
    onClose: () => void;
    children: React.ReactNode;
  }> = ({ x, y, onClose, children }) => {
    useEffect(() => {
      // prevent browser context menu while our menu is open
      const onContext = (e: MouseEvent) => {
        e.preventDefault();
      };
      window.addEventListener("contextmenu", onContext);
      return () => window.removeEventListener("contextmenu", onContext);
    }, []);

    const menu = (
      <div
        className="rf-context-menu-portal"
        style={{
          position: "fixed",
          top: y,
          left: x,
          zIndex: 99999,
          transform: "translate(0, 0)",
          maxWidth: "min(90vw, 420px)",
        }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    );

    return createPortal(menu, document.body);
  };

  /* --------------------- Render UI --------------------- */
  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-1">
        <div className="relative w-full max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input type="text" placeholder="Search protocol..." onChange={(e) => handleSearch(e.target.value)} className="w-full px-3 py-2 pl-10 pr-3 text-sm text-gray-800 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
        </div>

        <div className="ml-4 mr-4 p-2 border rounded-lg shadow-sm bg-white dark:bg-gray-800 flex items-center gap-4">
          <ProtocolsDrawer
            projectId={project?.id ? Number(project.id) : null}
            onProtocolDoubleClick={async (protocolClass: string) => {
              if (!projectName) return;
              try {
                const fullNodeData = await fetchNewProtocolDetails(projectName, protocolClass);
                setSelectedNodeDetails(fullNodeData);
                setPreviousNodeId(protocolClass);
              } catch (err) {
                console.error("Failed to fetch protocol details", err);
              }
            }}
          />

          <button onClick={() => console.log("Workflow clicked")} className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300`}>
            <TreeIcon className="w-4 h-4" />
            Workflows
          </button>
        </div>

        <div className="ml-4 mr-4 p-2 border rounded-lg shadow-sm bg-white dark:bg-gray-800 flex items-center gap-4">
          <span className="font-small text-xs">View mode:</span>
          <div className="flex gap-2">
            <button onClick={() => { setViewMode("hierarchical"); setGraphDirection("TB"); }} className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${viewMode === "hierarchical" && graphDirection === "TB" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}><TreeIcon className="w-4 h-4" /> Tree TB</button>

            <button onClick={() => { setViewMode("hierarchical"); setGraphDirection("LR"); }} className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${viewMode === "hierarchical" && graphDirection === "LR" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}><TreeIcon className="w-4 h-4 transform rotate-270" /> Tree LR</button>

            <button onClick={() => setViewMode("table")} className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${viewMode === "table" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}><TableIcon className="w-4 h-4" /> Table</button>
          </div>
        </div>
      </div>

      {/* If a protocol is selected, render form */}
      {selectedNodeDetails && <ProtocolForm data={selectedNodeDetails} onClose={handleCloseForm} />}

      <div className="flex-1 relative">
        {/* Initial blocking overlay only during first fetch */}
        {isInitialLoading && isRefreshing && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-50">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
              <span className="text-gray-700 text-sm font-medium">Loading project...</span>
            </div>
          </div>
        )}

        {/* Blocking overlay while switching layout */}
        {isSwitchingLayout && !(isInitialLoading && isRefreshing) && (
          <div
            aria-hidden
            className="absolute inset-0 z-60 flex items-center justify-center"
            style={{
              background: "var(--reactflow-background, #ffffff)",
              pointerEvents: "auto",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
            </div>
          </div>
        )}

        {/* TABLE pane */}
        <div
          ref={tableContainerRef}
          className="absolute inset-0 overflow-auto border rounded shadow p-4 z-30"
          style={{
            display: viewMode === "table" ? (tableVisible ? "block" : "none") : "none",
          }}
          aria-hidden={viewMode !== "table"}
        >
          <div className="flex justify-end mb-4 mr-1">
            <button className="refresh-btn" title="Refresh project" onClick={handleRefresh} disabled={isRefreshing}>
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
                <tr key={row.id} ref={(el) => { rowRefs.current[row.id] = el; }} onDoubleClick={() => handleRowDoubleClick(row.id)} className={`border-t border-gray-200 dark:border-gray-700 ${highlightedId === row.id ? "bg-yellow-100 dark:bg-yellow-900" : ""}`}>
                  <td className="px-4 py-2">{row.id}</td>
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className={`${row.status === "running" ? "pulsing-table" : ""}`} style={getStatusStyle(row.status)}>{row.status ?? "—"}</span>

                      {(row.status === "running" || row.status === "failed" || row.status === "aborted") && (
                        <div className="flex items-center gap-2 ml-4 flex-1">
                          <div className="w-16 h-3 bg-gray-300 dark:bg-gray-700 rounded overflow-hidden">
                            <div className={`h-3 ${row.status === "running" ? "bg-yellow-400" : row.status === "failed" || row.status === "aborted" ? "bg-red-500" : "bg-gray-400"} transition-all duration-300`} style={{ width: `${((row.stepsDone ?? 0) / (row.numberOfSteps ?? 1)) * 100}%` }} />
                          </div>
                          <span className="text-sm opacity-80">{row.stepsDone}/{row.numberOfSteps}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono">{formatCpuTime(row.tick ?? Number(row.elapsedTime) ?? 0)}</td>
                  <td className="px-4 py-2 space-x-2">
                    {row.children?.map((childId: string) => (
                      <button key={childId} onClick={() => scrollToProtocol(childId)} className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800">{childId}</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ReactFlow pane */}
        <div
          className="absolute inset-0 border"
          style={{
            display: viewMode === "hierarchical" ? "block" : "none",
            zIndex: 20,
            willChange: "transform, opacity",
            transformStyle: "preserve-3d",
            WebkitBackfaceVisibility: "hidden",
            backfaceVisibility: "hidden",
          }}
          aria-hidden={viewMode !== "hierarchical"}
        >
          <div className="absolute top-4 right-4 z-50">
            <div className="flex flex-col gap-1 p-1 bg-white/90 rounded shadow">
              <button title="Zoom in" onClick={handleZoomIn} className="p-1 rounded hover:bg-gray-100 dark:text-black"><PlusIcon className="w-4 h-4" /></button>
              <button title="Zoom out" onClick={handleZoomOut} className="p-1 rounded hover:bg-gray-100 dark:text-black"><MinusIcon className="w-4 h-4" /></button>
              <button title="Fit view" onClick={handleCenterPreserveZoom} className="p-1 rounded hover:bg-gray-100 dark:text-black"><FitViewIcon className="w-4 h-4" /></button>
              <button title="Reorganize project" onClick={() => handleReorganize({ preserveZoom: true })} className="p-1 rounded hover:bg-gray-100 dark:text-black"><TreeIcon className="w-4 h-4" /></button>
              <button title="Refresh project" onClick={handleRefresh} className="p-1 rounded hover:bg-gray-100 dark:text-black"><RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} /></button>
            </div>
          </div>

          <ReactFlowProvider key={flowKey}>
            <svg width="0" height="0" aria-hidden>
              <defs>
                <marker id="circle" viewBox="0 0 40 40" refX="20" refY="20" markerWidth="20" markerHeight="20" orient="auto-start-reverse">
                  <circle cx="20" cy="20" r="10" fill="#ff0000" />
                </marker>
              </defs>
            </svg>

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChangeWithPersistence}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              onInit={handleOnInit}
              onMoveEnd={handleOnMoveEnd}
              onPaneClick={() => handleCloseMenu()}
              defaultViewport={viewport}
              defaultEdgeOptions={{
                type: "default",
                style: { stroke: "#999", strokeWidth: 2 },
                markerEnd: "url(#circle)",
              }}
              onNodeDoubleClick={(evt, node) => handleNodeDoubleClick(node)}
              onNodeClick={(evt, node) => handleNodeClick(node, evt)}
              onContextMenu={handleContextMenu}
              style={{ width: "100%", height: "100%" }}
            >
              <Background />
            </ReactFlow>

            {/* Render context menu using portal (so transforms on ReactFlow do not affect positioning) */}
            {contextMenu.visible && (
              <ContextMenuPortal x={contextMenu.x} y={contextMenu.y} onClose={handleCloseMenu}>
                <div className="bg-white rounded shadow-md w-48 ring-1 ring-black/5 overflow-hidden">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-200 flex items-center gap-2 text-sm dark:text-black"
                    onClick={() => {
                      // Example behavior: add protocol - adapt to your actual add flow
                      handleRefresh();
                      handleCloseMenu();
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1 text-gray-500" /> Add protocol
                  </button>

                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 text-sm dark:text-black"
                    onClick={() => {
                      handleRefresh();
                      handleCloseMenu();
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-1 text-gray-500" />
                    Refresh graph
                  </button>

                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 text-sm dark:text-black"
                    onClick={() => {
                      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
                      handleCloseMenu();
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1 text-gray-500" />
                    Clear selection
                  </button>
                </div>
              </ContextMenuPortal>
            )}
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  );
}
