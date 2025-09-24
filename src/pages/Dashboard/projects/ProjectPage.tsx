// src/pages/project/ProjectPage.tsx
import { useParams } from "react-router-dom";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchProject, Project, fetchProtocolDetails, fetchNewProtocolDetails } from "../../../api/projects";
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
import { MinusIcon, Plus, PlusIcon, RefreshCw, Target, TargetIcon, Trash2 } from "lucide-react";
import { FitViewIcon, TableIcon, TreeIcon } from "../../../icons";

/**
 * ProjectPage without native ReactFlow controls.
 * Custom overlay controls (+ / - / fit / reorganize / refresh).
 */

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

export default function ProjectPage() {
  const { projectName } = useParams<{ projectName: string }>();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<any>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<StatusNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previousNodeId, setPreviousNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"hierarchical" | "table">("hierarchical");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [nodeTicks, setNodeTicks] = useState<Record<string, number>>({});
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [graphDirection, setGraphDirection] = useState<"TB" | "LR">("TB");

  const disablePersistenceRef = useRef(false);
  const [flowKey, setFlowKey] = useState(() => `rf-${projectName}-${graphDirection}-${Date.now()}`);
  const [viewport, setViewport] = useState<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 0.4 });
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });

  const TIME_TO_REFRESH = 15000; // 15s
  const localStorageKey = `project-${projectName}-node-positions`;

  //----------------------------------------------------------------------
  // ------------------------ Node click handlers ------------------------
  //----------------------------------------------------------------------
  const handleNodeClick = (nodeData: any, event?: React.MouseEvent) => {
    const isMultiSelect = event?.shiftKey;
    if (!isMultiSelect) {
      setPreviousNodeId(nodeData.id);
      setNodes((nds) => nds.map((n) => (n.id === nodeData.id ? n : { ...n, style: undefined })));
      const edgesToHighlight = edges.filter((e) => e.source === nodeData.id || e.target === nodeData.id).map((e) => e.id);
      setEdges((eds) => eds.map((edge) => (edgesToHighlight.includes(edge.id) ? { ...edge, style: { ...edge.style, stroke: "#0070f3", strokeWidth: 3 } } : { ...edge, style: undefined })));
    }
  };

  const handleNodeDoubleClick = async (nodeData: any) => {
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

  // ------------------------ Node types ------------------------
  const nodeTypes = useMemo(
    () => ({
      status: createStatusNodeWrapper(handleNodeClick, handleNodeDoubleClick, previousNodeId ?? undefined, hoveredNodeId ?? undefined, setHoveredNodeId, graphDirection),
    }),
    [previousNodeId, hoveredNodeId, graphDirection]
  );

  //----------------------------------------------------------------------
  // ------------------------ Persistence helpers ------------------------
  //----------------------------------------------------------------------
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
        // ignore
      }
      return updated;
    });
  };

  const loadNodesWithPositions = (loadedNodes: Node[]) => {
    const savedPositions: { id: string; position: { x: number; y: number } }[] = JSON.parse(localStorage.getItem(`${localStorageKey}-${graphDirection}`) || "[]");
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

  // ------------------------ Fetch project ------------------------
  const fetchAndLoadProject = useCallback(async () => {
    if (!projectName) return;
    setIsRefreshing(true);
    try {
      const data = await fetchProject(projectName);
      setProject(data);

      if (data.protocols) {
        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(data.shortName, data.protocols, viewMode, graphDirection);
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
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  }, [projectName, viewMode, graphDirection]);

  useEffect(() => {
    fetchAndLoadProject();
  }, [fetchAndLoadProject]);

  // ------------------------ Refresh ------------------------
  const handleRefresh = useCallback(async () => {
    if (!projectName) return;
    setIsRefreshing(true);
    try {
      const data = await fetchProject(projectName);
      setProject(data);

      if (data.protocols) {
        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(data.shortName, data.protocols, viewMode, graphDirection);
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

  // stable interval using ref
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

  // ------------------------ Reorganize ------------------------
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

        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(data.shortName, data.protocols, viewMode, graphDirection);

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
            const validNodes = loadedNodes.filter((n) => typeof n.position?.x === "number" && typeof n.position?.y === "number");
            const xSum = validNodes.reduce((sum, n) => sum + (n.position?.x ?? 0), 0);
            const ySum = validNodes.reduce((sum, n) => sum + (n.position?.y ?? 0), 0);
            const centerX = xSum / Math.max(1, validNodes.length);
            const centerY = ySum / Math.max(1, validNodes.length);

            const zoom = opts?.preserveZoom ? currentViewport.zoom ?? inst.getViewport().zoom : inst.getViewport().zoom;
            inst.setCenter(centerX, centerY, { zoom, duration: 0 });
            setViewport({ x: inst.getViewport().x, y: inst.getViewport().y, zoom: inst.getViewport().zoom });
          } else {
            inst.setViewport(currentViewport);
          }

          disablePersistenceRef.current = false;
        }, 0);
      } catch (err) {
        console.error(err);
        disablePersistenceRef.current = false;
      }
    },
    [projectName, viewMode, graphDirection, viewport]
  );

  // ------------------------ Ticks updater ------------------------
  const nodesRef = useRef<Node[]>(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

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

      setTableData((prev) => prev.map((row) => (row.status === "running" ? { ...row, tick: (row.tick ?? Number(row.elapsedTime) ?? 0) + 1 } : row)));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

  // ------------------------ Layout change effect ------------------------
  const prevLayout = useRef({ viewMode, graphDirection });
  useLayoutEffect(() => {
    const layoutChanged = prevLayout.current.viewMode !== viewMode || prevLayout.current.graphDirection !== graphDirection;
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

    const { nodes: loadedNodes, edges: loadedEdges } = buildGraphElements(project.shortName, project.protocols, viewMode, graphDirection);
    const nodesWithPositions = loadNodesWithPositions(loadedNodes);

    disablePersistenceRef.current = true;
    setNodes(nodesWithPositions);
    setEdges(loadedEdges);

    setTimeout(() => {
      const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
      if (!inst) {
        disablePersistenceRef.current = false;
        prevLayout.current = { viewMode, graphDirection };
        return;
      }

      if (nodesWithPositions.length > 0 && viewMode === "hierarchical") {
        const validNodes = nodesWithPositions.filter((n) => typeof n.position?.x === "number" && typeof n.position?.y === "number");
        const xSum = validNodes.reduce((sum, n) => sum + (n.position?.x ?? 0), 0);
        const ySum = validNodes.reduce((sum, n) => sum + (n.position?.y ?? 0), 0);
        const centerX = xSum / Math.max(1, validNodes.length);
        const centerY = ySum / Math.max(1, validNodes.length);

        const zoom = currentViewport.zoom ?? inst.getViewport().zoom;
        inst.setCenter(centerX, centerY, { zoom, duration: 0 });
        setViewport({ x: inst.getViewport().x, y: inst.getViewport().y, zoom: inst.getViewport().zoom });
      } else {
        inst.setViewport(currentViewport);
      }

      disablePersistenceRef.current = false;
      prevLayout.current = { viewMode, graphDirection };
    }, 0);
  }, [graphDirection, viewMode, project]);

  // ------------------------ Table helpers ------------------------
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

  // ------------------------ Search (highlights node + edges) ------------------------
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
          inst.setCenter(centerX, centerY, { zoom: currentViewport.zoom, duration: 300 });
          setViewport({ x: inst.getViewport().x, y: inst.getViewport().y, zoom: inst.getViewport().zoom });
        } else {
          inst.setViewport(currentViewport);
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
      inst.setCenter(match.position.x, match.position.y, { zoom: currentZoom, duration: 500 });
      setViewport({ x: inst.getViewport().x, y: inst.getViewport().y, zoom: inst.getViewport().zoom });
    }
  };

  // ------------------------ Row double click ------------------------
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

  // ------------------------ Time formatting ------------------------
  const formatCpuTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(hours)}h:${pad(minutes)}m:${pad(secs)}s`;
  };

  // ------------------------ Context menu ------------------------
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

  // ------------------------ ReactFlow init / move handlers ------------------------
  const handleOnInit = useCallback((inst: ReactFlowInstance) => {
    reactFlowInstanceRef.current = inst;
  
    if (nodes.length > 0) {
      // calculate center of all nodes
      const validNodes = nodes.filter(
        n => typeof n.position?.x === "number" && typeof n.position?.y === "number"
      );
      if (validNodes.length > 0) {
        const xSum = validNodes.reduce((s, n) => s + (n.position!.x ?? 0), 0);
        const ySum = validNodes.reduce((s, n) => s + (n.position!.y ?? 0), 0);
        const centerX = xSum / validNodes.length;
        const centerY = ySum / validNodes.length;
  
        // use a fixed initial zoom
        inst.setCenter(centerX, centerY, { zoom: viewport.zoom ?? 0.4, duration: 0 });
  
        // synchronize viewport in state
        const vp = inst.getViewport();
        setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
      }
    }
  }, [nodes, viewport, setViewport]);

  const handleOnMoveEnd = useCallback((_: any, vp: { x: number; y: number; zoom: number }) => {
    setViewport(vp);
  }, []);

  // ------------------------ Custom controls: zoom in/out, center preserve zoom, fitView ------------------------
  const ZOOM_FACTOR = 1.2;

  const handleZoomIn = useCallback(() => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    const vp = inst.getViewport();
    const newZoom = Math.min(vp.zoom * ZOOM_FACTOR, 0.6);
    inst.setViewport({ x: vp.x, y: vp.y, zoom: newZoom });
    setViewport({ x: inst.getViewport().x, y: inst.getViewport().y, zoom: inst.getViewport().zoom });
  }, []);

  const handleZoomOut = useCallback(() => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    const vp = inst.getViewport();
    const newZoom = Math.max(vp.zoom / ZOOM_FACTOR, 0.2);
    inst.setViewport({ x: vp.x, y: vp.y, zoom: newZoom });
    setViewport({ x: inst.getViewport().x, y: inst.getViewport().y, zoom: inst.getViewport().zoom });
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
    const currentZoom = inst.getViewport().zoom ?? viewport.zoom;
    inst.setCenter(centerX, centerY, { zoom: currentZoom, duration: 0 });
    const vp = inst.getViewport();
    setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
  }, [nodes, viewport]);

  const handleZoomToFit = useCallback(() => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    inst.fitView({ padding: 0.2, duration: 0 });
    setTimeout(() => {
      const vp = inst.getViewport();
      setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
    }, 350);
  }, []);


  // ------------------------ Render ------------------------
  return (
    <div className="h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="relative w-full max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input type="text" placeholder="Search protocol..." onChange={(e) => handleSearch(e.target.value)} className="w-full px-3 py-2 pl-10 pr-3 text-sm text-gray-800 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
        </div>

        <div className="ml-4 mr-4 p-4 border rounded-lg shadow-sm bg-white dark:bg-gray-800 flex items-center gap-4">
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

      {selectedNodeDetails && <ProtocolForm data={selectedNodeDetails} onClose={handleCloseForm} />}

      {!project ? (
        <p className="text-gray-500">Loading project data...</p>
      ) : viewMode === "table" ? (
        <div ref={tableContainerRef} className="overflow-auto h-[80vh] border rounded shadow p-4">
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
      ) : (
        <div className="h-full w-full border relative">
          {/* custom overlay controls (replaces native Controls) */}
          <div className="absolute top-4 right-4 z-10">
            <div className="flex flex-col gap-1 p-1 bg-white/90 rounded shadow">
              <button title="Zoom in" onClick={handleZoomIn} className="p-1 rounded hover:bg-gray-100 dark:text-black"><PlusIcon className="w-4 h-4"/></button>
              <button title="Zoom out" onClick={handleZoomOut} className="p-1 rounded hover:bg-gray-100 dark:text-black"><MinusIcon className="w-4 h-4"/></button>
              <button title="Fit view" onClick={handleCenterPreserveZoom} className="p-1 rounded hover:bg-gray-100 dark:text-black"><FitViewIcon className="w-4 h-4"/></button>
              {/* <button title="Fit view (zoom to fit)" onClick={handleZoomToFit} className="p-1 rounded hover:bg-gray-100"><FindIcon/></button> */}
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
              minZoom={0.2}
              maxZoom={0.6}
              onInit={handleOnInit}
              onMoveEnd={handleOnMoveEnd}
              defaultViewport={viewport}
              defaultEdgeOptions={{
                type: "default",
                style: { stroke: "#999", strokeWidth: 2 },
                markerEnd: "url(#circle)",
              }}
              onNodeDoubleClick={(evt, node) => handleNodeDoubleClick(node)}
              onNodeClick={(evt, node) => handleNodeClick(node, evt)}
              onContextMenu={handleContextMenu}
              style={{ width: "100%", height: "calc(100vh - 220px)" }}
            >
              <Background />
              {/* no Controls -> native controls removed */}
            </ReactFlow>

            {contextMenu.visible && (
              <DropdownMenu open={true} onOpenChange={handleCloseMenu}>
                <DropdownMenuTrigger asChild>
                  <button style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, width: 0, height: 0, opacity: 0 }} />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                  <DropdownMenuItem onClick={() => { handleRefresh(); handleCloseMenu(); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add protocol
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => { handleRefresh(); handleCloseMenu(); }}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh graph
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => { setNodes((nds) => nds.map((n) => ({ ...n, selected: false }))); handleCloseMenu(); }}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear selection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
}
