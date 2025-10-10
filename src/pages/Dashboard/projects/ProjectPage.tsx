// File: src/pages/project/ProjectPage.tsx
import { useParams } from "react-router-dom";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
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

// <-- svc integration
import { useProjectService } from "@/ProjectServiceContext";
import { Project } from "@/types/project";

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
  const svc = useProjectService();

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

  // default initial viewport (zoom 0.32 on first load)
  const [viewport, setViewport] = useState<{ x: number; y: number; zoom: number }>({
    x: 0,
    y: 0,
    zoom: 0.32, // initial zoom for first render
  });
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

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
  const [isSwitchingLayout, setIsSwitchingLayout] = useState(false);
  const [, setTableVisible] = useState(viewMode === "table");
  const [nodesLoadedOnce, setNodesLoadedOnce] = useState(false);

  // first load flag to ensure we center only once
  const firstLoadRef = useRef(true);

  // Zoom clamp (ensure zoom stays in acceptable range)
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 0.6;
  const clampZoom = (z: number | undefined | null) => {
    const num = typeof z === "number" && !Number.isNaN(z) ? z : 0.32;
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

    const highlightNodeStyle = { boxShadow: "0 0 0 4px rgba(0,112,243,0.12)" };

    if (!isMultiSelect) {
      setPreviousNodeId(nodeData.id);

      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeData.id
            ? {
              ...n,
              selected: true,
              style: { ...(n.style ?? {}), ...highlightNodeStyle },
            }
            : { ...n, selected: false, style: undefined }
        )
      );

      const edgesToHighlight = edges
        .filter((e) => e.source === nodeData.id || e.target === nodeData.id)
        .map((e) => e.id);

      setEdges((eds) =>
        eds.map((edge) =>
          edgesToHighlight.includes(edge.id)
            ? { ...edge, style: { ...(edge.style ?? {}), stroke: "#0070f3", strokeWidth: 3 } }
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
      // svc: fetchProtocolDetails
      const fullNodeData = await svc.fetchProtocolDetails(projectName, nodeData.id);
      setSelectedNodeDetails(fullNodeData);
      setPreviousNodeId(nodeData.id);
    } catch (err) {
      console.error("Failed to fetch protocol details", err);
    }
  };

  const handleCloseForm = () => setSelectedNodeDetails(null);

  // nodeTypes mapping (wrap status nodes)
  // NOTE: this depends on selection + hover so it will recreate; if you want to avoid warning #002,
  // you can memoize only by graphDirection, but then pass selected/hover via refs.
  // dentro de ProjectPage.tsx (importante: sustituye tu bloque de nodeTypes)

  const onClickRef = useRef(handleNodeClick);
  const onDblClickRef = useRef(handleNodeDoubleClick);
  const prevIdRef = useRef<string | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const graphDirRef = useRef<"TB" | "LR">(graphDirection);

  // keep refs updated
  useEffect(() => { onClickRef.current = handleNodeClick; }, [handleNodeClick]);
  useEffect(() => { onDblClickRef.current = handleNodeDoubleClick; }, [handleNodeDoubleClick]);
  useEffect(() => { prevIdRef.current = previousNodeId; }, [previousNodeId]);
  useEffect(() => { hoveredIdRef.current = hoveredNodeId; }, [hoveredNodeId]);
  useEffect(() => { graphDirRef.current = graphDirection; }, [graphDirection]);

  // create nodeTypes ONCE and keep identity stable
  const nodeTypesRef = useRef<Record<string, any> | null>(null);
  if (!nodeTypesRef.current) {
    nodeTypesRef.current = {
      status: createStatusNodeWrapper(
        (data, evt) => onClickRef.current?.(data, evt),
        (data) => onDblClickRef.current?.(data),
        () => prevIdRef.current ?? undefined,
        () => hoveredIdRef.current ?? undefined,
        setHoveredNodeId,
        () => graphDirRef.current
      ),
    };
  }
  const nodeTypes = nodeTypesRef.current;


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

  // helper shallow compare for node.data (fast)
  const shallowEqual = (a: any, b: any) => {
    if (a === b) return true;
    if (!a || !b) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (a[k] !== b[k]) return false;
    }
    return true;
  };

  const mergeNodesWithPositions = (newNodes: Node[]) => {
    // map of old nodes by id
    const oldMap = new Map(nodes.map((n) => [n.id, n]));
    return newNodes.map((n) => {
      const old = oldMap.get(n.id);
      if (old) {
        // keep the old position (so nodes don't jump) unless the new node explicitly has a saved position
        const position = (old.position && old.position.x !== undefined && old.position.y !== undefined)
          ? old.position
          : (n.position ?? old.position);

        // if data did not change (shallow), reuse the old node object (same ref)
        if (shallowEqual(old.data, n.data) && position === old.position) {
          return old;
        }

        // otherwise return a new object but keep old.position reference
        return {
          ...old,
          position,
          data: { ...old.data, ...n.data }, // merge new data on top of old (preserve unchanged fields)
        } as Node;
      }

      // brand new node -> keep the new node (likely added)
      return n;
    });
  };

  const mergeEdges = (newEdges: Edge[]) => {
    const oldEdgesMap = new Map(edges.map((e) => [e.id, e]));
    return newEdges.map((e) => (oldEdgesMap.get(e.id) ? { ...oldEdgesMap.get(e.id)!, ...e } : e));
  };

  // ------------------------ Centering helper ------------------------

  /**
   * centerLikeButton
   * - Centers the viewport to the bounding box using React Flow's fitView.
   * - If preserveZoom = true, we compute the fit center and restore a given zoom (zoomOverride) or the current one.
   */
  const centerLikeButton = useCallback((nodesList?: Node[], preserveZoom = true, zoomOverride?: number) => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    const list = nodesList ?? nodesRef.current ?? [];
    const validNodes = list.filter((n) => typeof n.position?.x === "number" && typeof n.position?.y === "number");

    // If no nodes, just clamp current viewport
    if (validNodes.length === 0) {
      const vp = inst.getViewport();
      inst.setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) });
      setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) });
      return;
    }

    try {
      if (!preserveZoom) {
        // Let React Flow compute the bounding-box center + zoom
        inst.fitView({ padding: 0.12, duration: 0 });
        const vp = inst.getViewport();
        setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
        return;
      }

      // preserve current or override zoom
      const targetZoom = clampZoom(typeof zoomOverride === "number" ? zoomOverride : inst.getViewport().zoom);

      // compute bounding-box center from node positions (in graph coords)
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const n of validNodes) {
        const x = n.position!.x ?? 0;
        const y = n.position!.y ?? 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // Use setCenter so the provided graph-coordinates become centered in view with the desired zoom.
      inst.setCenter(centerX, centerY, { zoom: targetZoom, duration: 0 });

      // update local state to reflect what we set
      const finalVp = inst.getViewport();
      setViewport({ x: finalVp.x, y: finalVp.y, zoom: finalVp.zoom });
    } catch (err) {
      // fallback to average center if something goes wrong
      const xSum = validNodes.reduce((sum, n) => sum + (n.position!.x ?? 0), 0);
      const ySum = validNodes.reduce((sum, n) => sum + (n.position!.y ?? 0), 0);
      const centerX = xSum / validNodes.length;
      const centerY = ySum / validNodes.length;
      const currentVp = inst.getViewport();
      const zoom = clampZoom(currentVp.zoom);
      inst.setCenter(centerX, centerY, { zoom, duration: 0 });
      const vp = inst.getViewport();
      setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
    }
  }, []);


  /**
  * waitForNodesReady
  * - Waits until React Flow has internally mounted nodes and their positions
  * appear valid (not all 0, 0 / NaN and non-trivial bounding-box).
  * - Returns true if a valid state was detected before the timeout, false otherwise.
  *
  * @param expectedCount expected number of nodes (if unknown, set to 0 or 1)
  * @param timeoutMs maximum wait time in ms (default 2500)
  * @param debug if true console.log debugging information
  */
  const waitForNodesReady = async (expectedCount: number, timeoutMs = 2500, debug = false): Promise<boolean> => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) {
      if (debug) console.warn("waitForNodesReady: no reactflow instance available");
      return false;
    }

    const start = Date.now();

    return new Promise<boolean>((resolve) => {
      const check = () => {
        try {
          const instNodes = typeof inst.getNodes === "function" ? inst.getNodes() : [];

          if (debug) {
            console.debug("waitForNodesReady: instNodes.length=", instNodes.length, "expectedCount=", expectedCount);
          }

          // Requires at least expectedCount nodes (if expectedCount <= 0, requires at least 1)
          const needed = Math.max(1, expectedCount);
          if (instNodes && instNodes.length >= needed) {
            // validate positions: count nodes with valid numerical position
            let validPosCount = 0;
            let minX = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;

            for (const n of instNodes) {
              const x = n.position?.x;
              const y = n.position?.y;
              if (typeof x === "number" && typeof y === "number" && !Number.isNaN(x) && !Number.isNaN(y)) {
                validPosCount++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }

            const bboxWidth = isFinite(minX) && isFinite(maxX) ? Math.abs(maxX - minX) : 0;
            const bboxHeight = isFinite(minY) && isFinite(maxY) ? Math.abs(maxY - minY) : 0;

            if (debug) {
              console.debug("waitForNodesReady: validPosCount=", validPosCount, "bboxWidth=", bboxWidth, "bboxHeight=", bboxHeight);
            }

            // Heuristic: at least 1 valid position and non-trivial bounding-box
            if (validPosCount >= 1 && (bboxWidth > 1 || bboxHeight > 1)) {
              resolve(true);
              return;
            }
          }
        } catch (err) {
          if (debug) console.warn("waitForNodesReady: check error", err);
          // keep trying
        }

        if (Date.now() - start > timeoutMs) {
          if (debug) console.warn("waitForNodesReady: timeout");
          resolve(false);
          return;
        }

        // retry at the next animation frame (best for layout/paint)
        requestAnimationFrame(check);
      };

      requestAnimationFrame(check);
    });
  };


  /**
   * fetchAndLoadProject
   * - Loads project metadata and builds graph elements
   * - Applies saved positions if available
   * - Centers reliably on first load using ensureCenterAfterRender helper
   */
  const fetchAndLoadProject = useCallback(async () => {
    if (!projectName) return;
    setIsRefreshing(true);
    try {
      // svc: fetchProject
      const data = await svc.fetchProject(projectName);
      setProject(data);

      if (data.protocols) {
        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(
          data.shortName,
          data.protocols,
          viewMode,
          graphDirection
        );

        // apply saved positions if they exist
        const nodesWithPositions = loadNodesWithPositions(loadedNodes);

        // update main state
        setNodes(nodesWithPositions);
        setEdges(loadedEdges);
        setTableData(table ?? []);
        setIsSwitchingLayout(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
              if (inst && nodesWithPositions.length > 0 && viewMode === "hierarchical") {
                centerLikeButton(nodesWithPositions, true, viewportRef.current.zoom);
              }
            } finally {
              setIsSwitchingLayout(false);
            }
          });
        });

        // set initial ticks
        const initialTicks: Record<string, number> = {};
        nodesWithPositions.forEach((n) => {
          if ((n as any).data?.status === "running") {
            initialTicks[n.id] = Number((n as any).data.elapsedTime) ?? 0;
          }
        });
        setNodeTicks(initialTicks);

        setNodesLoadedOnce(true);

        // --- center only on first load (MutationObserver + rAF double frame) ---
        if (firstLoadRef.current && viewMode === "hierarchical") {
          const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
          const desiredCount = Math.max(1, nodesWithPositions.length);

          let observer: MutationObserver | null = null;
          let fallbackTimer: any = null;
          let centered = false;

          const doCenter = (_methodDesc: string) => {
            if (centered) return;
            centered = true;
            try {
              centerLikeButton(nodesWithPositions, true, viewportRef.current.zoom);
            } catch (err) {
              try {
                if (inst && inst.getNodes && inst.getNodes().length > 0) {
                  inst.fitView({ padding: 0.12, duration: 0 });
                  const vp = inst.getViewport();
                  setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
                } else if (inst) {
                  const vp = inst.getViewport();
                  inst.setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(viewportRef.current.zoom) });
                  setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(viewportRef.current.zoom) });
                }
              } catch { }
            } finally {
              firstLoadRef.current = false;
              if (observer) { try { observer.disconnect(); } catch { } observer = null; }
              if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
            }
          };

          try {
            const nodesContainer = document.querySelector(".react-flow__nodes");
            if (nodesContainer) {
              const initialNodeEls = nodesContainer.querySelectorAll(".react-flow__node");
              if (initialNodeEls.length >= desiredCount) {
                requestAnimationFrame(() => requestAnimationFrame(() => doCenter("dom-immediate")));
              } else {
                observer = new MutationObserver(() => {
                  const els = nodesContainer.querySelectorAll(".react-flow__node");
                  if (els.length >= desiredCount) {
                    requestAnimationFrame(() => requestAnimationFrame(() => doCenter("dom-observer")));
                  }
                });
                observer.observe(nodesContainer, { childList: true, subtree: true });
                fallbackTimer = setTimeout(async () => {
                  if (observer) { try { observer.disconnect(); } catch { } observer = null; }
                  const ready = await waitForNodesReady(nodesWithPositions.length, 2000, true);
                  if (ready) {
                    doCenter("waitForNodesReady-fallback");
                  } else {
                    doCenter("fallback-final");
                  }
                }, 3000);
              }
            } else {
              const ready = await waitForNodesReady(nodesWithPositions.length, 2500, true);
              if (ready && inst) {
                doCenter("waitForNodesReady");
              } else if (inst) {
                try {
                  if (inst.getNodes && inst.getNodes().length > 0) {
                    inst.fitView({ padding: 0.12, duration: 0 });
                    const vp = inst.getViewport();
                    setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
                  } else {
                    const vp = inst.getViewport();
                    inst.setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(viewportRef.current.zoom) });
                    setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(viewportRef.current.zoom) });
                  }
                } catch { }
                firstLoadRef.current = false;
              } else {
                firstLoadRef.current = false;
              }
            }
          } catch {
            const ready = await waitForNodesReady(nodesWithPositions.length, 2000, true);
            if (ready && inst) {
              doCenter("catch-fallback");
            } else {
              if (inst) {
                try {
                  if (inst.getNodes && inst.getNodes().length > 0) {
                    inst.fitView({ padding: 0.12, duration: 0 });
                    const vp = inst.getViewport();
                    setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
                  } else {
                    const vp = inst.getViewport();
                    inst.setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(viewportRef.current.zoom) });
                    setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(viewportRef.current.zoom) });
                  }
                } catch { }
              }
              firstLoadRef.current = false;
            }
          }
        }
      }
    } catch (err) {
      console.error("fetchAndLoadProject error:", err);
      setIsSwitchingLayout(false);
      // ensure we don't leave refreshing forever
    } finally {
      setIsRefreshing(false);
    }
  }, [projectName, viewMode, graphDirection, centerLikeButton, svc]);


  useEffect(() => {
    fetchAndLoadProject();
  }, [fetchAndLoadProject]);

  // ------------------------ Refresh ------------------------

  /**
   * handleRefresh
   * - Re-fetch project data and merge new nodes/edges
   * - IMPORTANT: does NOT recenter or change node positions
   */
  const handleRefresh = useCallback(async () => {
    if (!projectName) return;
    setIsRefreshing(true);
    try {
      // svc: fetchProject
      const data = await svc.fetchProject(projectName);
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
            if ((n as any).data?.status === "running") {
              updated[n.id] = Math.max(prev[n.id] ?? 0, Number((n as any).data.elapsedTime) ?? 0);
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
  }, [projectName, viewMode, graphDirection, nodes, edges, svc]);

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

  // ------------------------ Reorganize (rebuild) ------------------------

  /**
   * handleReorganize
   * - Clear persistence, reload project and re-center (used by UI button)
   */
  const handleReorganize = useCallback(
    async (opts?: { preserveZoom?: boolean }) => {
      if (!projectName) return;
      try {
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

        // svc: fetchProject
        const data = await svc.fetchProject(projectName);
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

        // center after reorganize (preserve zoom)
        setTimeout(() => {
          const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
          if (!inst) {
            disablePersistenceRef.current = false;
            return;
          }

          if (loadedNodes.length > 0 && viewMode === "hierarchical") {
            // Use viewportRef.current.zoom to try to preserve initial zoom if needed
            centerLikeButton(loadedNodes, opts?.preserveZoom ?? true, viewportRef.current.zoom);
          } else {
            const vp = inst.getViewport();
            inst.setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) });
            setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) });
          }

          // re-enable persistence after a short delay
          setTimeout(() => {
            disablePersistenceRef.current = false;
          }, 60);
        }, 0);
      } catch (err) {
        console.error(err);
        disablePersistenceRef.current = false;
      }
    },
    [projectName, viewMode, graphDirection, viewport, centerLikeButton, svc]
  );

  // ------------------------ Ticks updater ------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      setNodeTicks((prev) => {
        const updated: Record<string, number> = { ...prev };
        nodesRef.current.forEach((node) => {
          if ((node as any).data?.status === "running") {
            updated[node.id] = (prev[node.id] ?? Number((node as any).data.elapsedTime) ?? 0) + 1;
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
          ...(node as any).data,
          tick: nodeTicks[node.id] ?? Number((node as any).data.elapsedTime) ?? 0,
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

    // prevent persistence while swapping layout
    disablePersistenceRef.current = true;

    // show blocking overlay to mask repaint
    setIsSwitchingLayout(true);

    // batch set nodes/edges — don't clear first to avoid a blank frame
    setNodes(nodesWithPositions);
    setEdges(loadedEdges);

    // wait two frames then center; after that hide overlay
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
        if (!inst) {
          disablePersistenceRef.current = false;
          setTimeout(() => setIsSwitchingLayout(false), 60);
          prevLayout.current = { viewMode, graphDirection };
          return;
        }

        if (nodesWithPositions.length > 0 && viewMode === "hierarchical") {
          centerLikeButton(nodesWithPositions, true);
          requestAnimationFrame(() => {
            setTimeout(() => {
              disablePersistenceRef.current = false;
              setIsSwitchingLayout(false);
              prevLayout.current = { viewMode, graphDirection };
            }, 60);
          });
        } else {
          const clamped = { x: currentViewport.x, y: currentViewport.y, zoom: clampZoom(currentViewport.zoom) };
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

  // ------------------------ Initial first-center effect ----------
  useEffect(() => {
    if (!nodesLoadedOnce) return;
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;

    // overlay on while we calculate + paint
    setIsSwitchingLayout(true);

    const validNodes = nodes.filter((n) => typeof n.position?.x === "number" && typeof n.position?.y === "number");
    if (validNodes.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // keep the existing viewport but clamp zoom only
          inst.setViewport({ x: viewportRef.current.x, y: viewportRef.current.y, zoom: clampZoom(viewportRef.current.zoom) });
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

  // --------------------- Table switching: avoid flicker ---------------------
  useEffect(() => {
    if (viewMode === "table") {
      setTableVisible(false);
      setIsSwitchingLayout(true);
      requestAnimationFrame(() => {
        setTableVisible(true);
        requestAnimationFrame(() => {
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

    const match = nodes.find((node) => node.id.toLowerCase().includes(query.toLowerCase()) || ((node as any).data?.label ?? "").toLowerCase().includes(query.toLowerCase()));

    if (!match) {
      setHighlightedId(null);
      setPreviousNodeId(null);
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false, style: undefined })));
      setEdges((eds) => eds.map((e) => ({ ...e, style: undefined })));
      return;
    }

    const highlightNodeStyle = { boxShadow: "0 0 0 4px rgba(0,112,243,0.12)" };

    setNodes((nds) =>
      nds.map((n) => (n.id === match.id ? { ...n, selected: true, style: { ...((n as any).style ?? {}), ...highlightNodeStyle } } : { ...n, selected: false, style: undefined }))
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
      // svc: fetchProtocolDetails
      const fullNodeData = await svc.fetchProtocolDetails(projectName, id);
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

  // ------------------------ ReactFlow init / move handlers ------------------------
  const handleOnInit = useCallback((inst: ReactFlowInstance) => {
    reactFlowInstanceRef.current = inst;
    try {
      const current = inst.getViewport();
      // clamp zoom but KEEP current x/y that React Flow already set
      const desiredZoom = clampZoom(viewportRef.current.zoom ?? current.zoom);
      inst.setViewport({ x: current.x, y: current.y, zoom: desiredZoom });
      const vp = inst.getViewport();
      // sync state with instance's viewport
      setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
    } catch (err) {
      setIsSwitchingLayout(false);
    }
  }, []);



  const handleOnMoveEnd = useCallback((_: any, vp: { x: number; y: number; zoom: number }) => {
    setViewport(vp);
  }, []);

  // ------------------------ Controls ------------------------
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

  /**
   * handleFitView
   * - behaves like "center, preserve zoom" (the button in your custom controls)
   */
  const handleFitView = useCallback(() => {
    // preserve zoom by default
    centerLikeButton(undefined, true);
  }, [centerLikeButton]);

  // ------------------------ Render ------------------------
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
                // svc: fetchNewProtocolDetails
                const fullNodeData = await svc.fetchNewProtocolDetails(projectName, protocolClass);
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

      {selectedNodeDetails && <ProtocolForm data={selectedNodeDetails}
        projectProtocols={project?.protocols ?? project?.protocols ?? {}}
        onClose={handleCloseForm} />}

      <div className="flex-1 relative">
        {/* Initial blocking overlay only during first fetch */}
        {isSwitchingLayout && (
          <div aria-hidden className="absolute inset-0 z-60 flex items-center justify-center" style={{ background: "var(--reactflow-background, #ffffff)", pointerEvents: "auto" }}>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
            </div>
          </div>
        )}

        {/* TABLE pane */}
        <div ref={tableContainerRef}
          className="absolute inset-0 overflow-auto border rounded shadow p-4 z-30 transition-opacity"
          style={{
            opacity: viewMode === "table" ? 1 : 0,
            pointerEvents: viewMode === "table" ? "auto" : "none",
          }}
          aria-hidden={viewMode !== "table"}>
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
        <div className="absolute inset-0 border transition-opacity"
          style={{
            opacity: viewMode === "hierarchical" ? 1 : 0,
            pointerEvents: viewMode === "hierarchical" ? "auto" : "none",
            zIndex: 20,
          }}
          aria-hidden={viewMode !== "hierarchical"}>
          <div className="absolute top-4 right-4 z-50">
            <div className="flex flex-col gap-1 p-1 bg-white/90 rounded shadow">
              <button title="Zoom in" onClick={handleZoomIn} className="p-1 rounded hover:bg-gray-100 dark:text-black"><PlusIcon className="w-4 h-4" /></button>
              <button title="Zoom out" onClick={handleZoomOut} className="p-1 rounded hover:bg-gray-100 dark:text-black"><MinusIcon className="w-4 h-4" /></button>
              <button title="Fit view (preserve zoom)" onClick={handleFitView} className="p-1 rounded hover:bg-gray-100 dark:text-black"><FitViewIcon className="w-4 h-4" /></button>
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
              onNodeDoubleClick={(_, node) => handleNodeDoubleClick(node)}
              onNodeClick={(evt, node) => handleNodeClick(node, evt)}
              onContextMenu={handleContextMenu}
              style={{ width: "100%", height: "100%" }}
            >
              <Background />
            </ReactFlow>

            {contextMenu.visible && (
              <DropdownMenu open={true} onOpenChange={handleCloseMenu}>
                <DropdownMenuTrigger asChild>
                  <button style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, width: 0, height: 0, opacity: 0 }} />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                  <DropdownMenuItem onClick={() => { handleRefresh(); handleCloseMenu(); }}>
                    <PlusIcon className="w-4 h-4 mr-2" />
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
      </div>
    </div>
  );
}
