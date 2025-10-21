import { useParams } from "react-router-dom";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
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

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/dialog/alert-dialog";
import { Button } from "@/components/ui/button";

import { MinusIcon, PlusIcon, RefreshCw, Trash2 } from "lucide-react";
import { FitViewIcon, TableIcon, TreeIcon } from "../../../icons";

import { useProjectService } from "@/ProjectServiceContext";
import { Project } from "@/types/project";
import Label from "@/components/form/Label";
import { Input } from "@mui/material";
import toast from "react-hot-toast";

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
  parents?: string[];
  children?: string[];
  __pathVer?: number;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeId?: string | null;
}

type NodeActions = {
  onEdit?: (id: string) => void;
  onRename?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRestartAll?: (id: string) => void;
  onContinueAll?: (id: string) => void;
  onResetFrom?: (id: string) => void;
  onSelectFrom?: (id: string) => void;
  onSelectTo?: (id: string) => void;
  onStop?: (id: string) => void;
};

export default function ProjectPage() {
  const { projectName } = useParams<{ projectName: string }>();
  const svc = useProjectService();

  const [project, setProject] = useState<Project | undefined>(undefined);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<any>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState<StatusNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const delayedRefreshTimerRef = useRef<number | null>(null);

  const [previousNodeId, setPreviousNodeId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = previousNodeId; }, [previousNodeId]);

  const [viewMode, setViewMode] = useState<"hierarchical" | "table">("hierarchical");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [nodeTicks, setNodeTicks] = useState<Record<string, number>>({});
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [graphDirection, setGraphDirection] = useState<"TB" | "LR">("TB");

  const [hideGraphDuringCenter, setHideGraphDuringCenter] = useState(false);
  const [, startTransition] = useTransition();
  const disablePersistenceRef = useRef(false);

  const [viewport, setViewport] = useState<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 0.32 });
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });

  const TIME_TO_REFRESH = 15000;
  const localStorageKey = `project-${projectName}-node-positions`;

  const [isSwitchingLayout, setIsSwitchingLayout] = useState(false);
  const [, setTableVisible] = useState(viewMode === "table");
  const [nodesLoadedOnce, setNodesLoadedOnce] = useState(false);
  const firstLoadRef = useRef(true);

  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 0.6;
  const clampZoom = (z: number | undefined | null) => {
    const num = typeof z === "number" && !Number.isNaN(z) ? z : 0.32;
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, num));
  };

  const nodesRef = useRef<Node[]>(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const edgesRef = useRef<Edge[]>(edges);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const isRunningNode = (n: Node) => (n as any).data?.status === "running";

  /* --------------------- Selection state --------------------- */
  const [, setPathNodeIds] = useState<string[]>([]);
  const [, setPathEdgeIds] = useState<string[]>([]);
  const pathSelRef = useRef<{ nodes: Set<string>; edges: Set<string> }>({ nodes: new Set(), edges: new Set() });

  const suppressNextSyncRef = useRef(false);
  const suppressOneFrame = () => {
    suppressNextSyncRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressNextSyncRef.current = false;
      });
    });
  };

  const getSelectedPathIds = () => pathSelRef.current.nodes;
  const SELECT_COLOR = "#0070f3";
  const PATH_COLOR = "#0070f3";

  const setsEqual = (a: Set<string>, b: Set<string>) => {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  };

  const getUnifiedSelectedIds = (): Set<string> => {
    const out = new Set<string>(Array.from(pathSelRef.current.nodes));
    const single = selectedIdRef.current;
    if (single) out.add(single);
    return out;
  };

  const clearAllSelectionHard = useCallback(() => {
    if (pathSelRef.current.nodes.size || pathSelRef.current.edges.size) {
      pathSelRef.current = { nodes: new Set(), edges: new Set() };
      setPathNodeIds([]);
      setPathEdgeIds([]);
      setEdges((eds) =>
        eds.map((e) => {
          if ((e as any).__path || (e as any).__hl) {
            const styleCopy: any = { ...(e.style ?? {}) };
            delete styleCopy.strokeDasharray;
            if (styleCopy.stroke === PATH_COLOR || styleCopy.stroke === SELECT_COLOR) delete styleCopy.stroke;
            const sw = Number(styleCopy.strokeWidth);
            if (!Number.isNaN(sw) && (sw <= 4 || sw === 4)) delete styleCopy.strokeWidth;
            const cleaned: any = { ...e, style: Object.keys(styleCopy).length ? styleCopy : undefined };
            delete (cleaned as any).__path;
            delete (cleaned as any).__hl;
            return cleaned;
          }
          return e;
        })
      );
    } else {
      setEdges((eds) =>
        eds.map((e) => {
          if ((e as any).__hl) {
            const { style, ...rest } = e;
            const ns: any = { ...(style ?? {}) };
            if (ns.stroke === SELECT_COLOR) delete ns.stroke;
            const sw = Number(ns.strokeWidth);
            if (!Number.isNaN(sw) && sw === 4) delete ns.strokeWidth;
            const clean: any = { ...rest, style: Object.keys(ns).length ? ns : undefined };
            delete (clean as any).__hl;
            return clean;
          }
          return e;
        })
      );
    }

    suppressOneFrame();
    setNodes((prev) => (prev.some((n) => n.selected) ? prev.map((n) => ({ ...n, selected: false })) : prev));
    selectedIdRef.current = null;
    setPreviousNodeId(null);
    setHighlightedId(null);
  }, [setNodes, setEdges]);

  /* --------------------- Edge painters --------------------- */
  const curIsBlue = (e: Edge) =>
    (e.style as any)?.stroke === SELECT_COLOR && Number((e.style as any)?.strokeWidth) === 4;

  const paintEdgeHighlight = useCallback((eds: Edge[], selectedId: string | null): Edge[] => {
    if (!selectedId) {
      let anyStyled = false;
      for (const e of eds) {
        if ((e as any).__hl || (e.style as any)?.stroke === SELECT_COLOR) { anyStyled = true; break; }
      }
      if (!anyStyled) return eds;
      return eds.map((e) => {
        if ((e as any).__hl || (e.style && (e.style as any).stroke === SELECT_COLOR)) {
          const { style, ...rest } = e;
          const newStyle: any = { ...(style ?? {}) };
          if ((e as any).__path) {
            if (newStyle.stroke === SELECT_COLOR) delete newStyle.stroke;
            const sw = Number(newStyle.strokeWidth);
            if (!Number.isNaN(sw) && sw === 4) delete newStyle.strokeWidth;
          } else {
            delete newStyle.stroke;
            delete newStyle.strokeWidth;
          }
          const clean: any = { ...rest, style: Object.keys(newStyle).length ? newStyle : undefined };
          delete (clean as any).__hl;
          return clean;
        }
        return e;
      });
    }

    let changed = false;
    const next = eds.map((e) => {
      const isConn = e.source === selectedId || e.target === selectedId;
      if (isConn) {
        const curStroke = (e.style as any)?.stroke;
        const curWidth = Number((e.style as any)?.strokeWidth);
        if (curStroke === SELECT_COLOR && curWidth === 4) return e;
        changed = true;
        return {
          ...e,
          style: { ...(e.style ?? {}), stroke: SELECT_COLOR, strokeWidth: 4 },
          __hl: true as any,
        };
      } else if ((e as any).__hl || curIsBlue(e)) {
        changed = true;
        const { style, ...rest } = e;
        const newStyle: any = { ...(style ?? {}) };
        if ((e as any).__path) {
          if (newStyle.stroke === SELECT_COLOR) delete newStyle.stroke;
          const sw = Number(newStyle.strokeWidth);
          if (!Number.isNaN(sw) && sw === 4) delete newStyle.strokeWidth;
        } else {
          delete newStyle.stroke;
          delete newStyle.strokeWidth;
        }
        const clean: any = { ...rest, style: Object.keys(newStyle).length ? newStyle : undefined };
        delete (clean as any).__hl;
        return clean;
      }
      return e;
    });
    return changed ? next : eds;
  }, []);

  const paintPathHighlight = useCallback((eds: Edge[], edgeIdsSet: Set<string>): Edge[] => {
    let changed = false;
    const next = eds.map((e) => {
      const inSet = edgeIdsSet.has(e.id);
      const wasPath = !!(e as any).__path;
      const isHL = !!(e as any).__hl;

      if (inSet) {
        if (isHL) return e;
        const newStyle: any = {
          ...(e.style ?? {}),
          stroke: PATH_COLOR,
          strokeWidth: Math.max(4, Number((e.style as any)?.strokeWidth) || 4),
          strokeDasharray: "6 3",
        };
        if (!wasPath || (e.style as any)?.stroke !== PATH_COLOR || Number((e.style as any)?.strokeWidth) < 4) {
          changed = true;
          return { ...e, style: newStyle, __path: true as any };
        }
        return e;
      } else if (wasPath) {
        const styleCopy: any = { ...(e.style ?? {}) };
        if (isHL) {
          if (styleCopy.stroke === PATH_COLOR) delete styleCopy.stroke;
          if (styleCopy.strokeDasharray === "6 3") delete styleCopy.strokeDasharray;
          changed = true;
          const cleaned: any = { ...e, style: Object.keys(styleCopy).length ? styleCopy : undefined };
          delete (cleaned as any).__path;
          return cleaned;
        } else {
          if (styleCopy.stroke === PATH_COLOR) delete styleCopy.stroke;
          const sw = Number(styleCopy.strokeWidth);
          if (!Number.isNaN(sw) && sw <= 4) delete styleCopy.strokeWidth;
          if (styleCopy.strokeDasharray === "6 3") delete styleCopy.strokeDasharray;
          changed = true;
          const cleaned: any = { ...e, style: Object.keys(styleCopy).length ? styleCopy : undefined };
          delete (cleaned as any).__path;
          return cleaned;
        }
      }
      return e;
    });
    return changed ? next : eds;
  }, []);

  /* --------------------- Edge set helpers --------------------- */
  const computeEdgesTouchingNodes = useCallback((nodeSet: Set<string>) => {
    const edgeIds: string[] = [];
    for (const e of edgesRef.current) {
      const s = String(e.source);
      const t = String(e.target);
      if (nodeSet.has(s) || nodeSet.has(t)) edgeIds.push(e.id);
    }
    return new Set(edgeIds);
  }, []);

  /* --------------------- Selection application --------------------- */
  const bumpNodesForPath = useCallback(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: { ...(n as any).data, __pathVer: ((n as any).data?.__pathVer ?? 0) + 1 },
      }))
    );
  }, [setNodes]);

  const applyPathSelection = useCallback((nodeIds: string[], edgeIds?: string[]) => {
    const nextNodes = new Set(nodeIds.map(String));
    const nextEdges = new Set(edgeIds ?? Array.from(computeEdgesTouchingNodes(nextNodes)));
    pathSelRef.current = { nodes: nextNodes, edges: nextEdges };
    setPathNodeIds(Array.from(nextNodes));
    setPathEdgeIds(Array.from(nextEdges));

    setNodes((prev) => prev.map((n) => ({ ...n, selected: nextNodes.has(n.id) })));

    setEdges((eds) => paintPathHighlight(eds, nextEdges));
    setEdges((eds) => paintEdgeHighlight(eds, null));
    bumpNodesForPath();
  }, [computeEdgesTouchingNodes, paintPathHighlight, paintEdgeHighlight, setNodes, setEdges, bumpNodesForPath]);

  const clearPathSelection = useCallback(() => {
    if (pathSelRef.current.nodes.size === 0 && pathSelRef.current.edges.size === 0) return;
    pathSelRef.current = { nodes: new Set(), edges: new Set() };
    setPathNodeIds([]);
    setPathEdgeIds([]);
    setEdges((eds) => paintPathHighlight(eds, new Set()));
    bumpNodesForPath();
  }, [paintPathHighlight, bumpNodesForPath]);

  const applyEdgeHighlight = useCallback((selectedId: string | null) => {
    setEdges((eds) => {
      let out = paintEdgeHighlight(eds, selectedId);
      if (pathSelRef.current.edges.size) {
        out = paintPathHighlight(out, pathSelRef.current.edges);
      }
      return out;
    });
  }, [paintEdgeHighlight, paintPathHighlight, setEdges]);

  /* --------------------- Node click / double click --------------------- */
  const handleNodeClick = (nodeData: any, evt?: React.MouseEvent) => {
    if (evt?.ctrlKey || evt?.metaKey || evt?.shiftKey) return;

    if (pathSelRef.current.nodes.size || pathSelRef.current.edges.size) {
      clearPathSelection();
    }

    const id = String(nodeData.id);
    selectedIdRef.current = id;
    setPreviousNodeId(id);
    setHighlightedId(id);
    applyEdgeHighlight(id);

    suppressOneFrame();
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id ? (n.selected ? n : { ...n, selected: true }) : (n.selected ? { ...n, selected: false } : n)
      )
    );
  };

  const handleNodeDoubleClick = async (nodeData: any) => {
    if (!projectName) return;
    try {
      const fullNodeData = await svc.fetchProtocolDetails(projectName, nodeData.id);
      const id = String(nodeData.id);
      selectedIdRef.current = id;
      setSelectedNodeDetails(fullNodeData);
      setPreviousNodeId(id);
      setHighlightedId(id);
      applyEdgeHighlight(id);
    } catch (err) {
      console.error("Failed to fetch protocol details", err);
    }
  };

  const handleCloseForm = () => setSelectedNodeDetails(null);

  /* --------------------- Wrapper plumbing --------------------- */
  const onClickRef = useRef(handleNodeClick);
  const onDblClickRef = useRef(handleNodeDoubleClick);
  const prevIdRef = useRef<string | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const graphDirRef = useRef<"TB" | "LR">(graphDirection);

  useEffect(() => { onClickRef.current = handleNodeClick; }, [handleNodeClick]);
  useEffect(() => { onDblClickRef.current = handleNodeDoubleClick; }, [handleNodeDoubleClick]);
  useEffect(() => { prevIdRef.current = previousNodeId; }, [previousNodeId]);
  useEffect(() => { hoveredIdRef.current = hoveredNodeId; }, [hoveredNodeId]);
  useEffect(() => { graphDirRef.current = graphDirection; }, [graphDirection]);

  const nodeActionsRef = useRef<NodeActions>({});

  /* Error helper */
  const getErrorMsg = (e: any) => {
    if (e && typeof e === "object") {
      const status = (e as any).status;
      const data = (e as any).data;
      if (status === 500) return (data?.detail as string) || (e.message as string) || "Server error";
      return (data?.message as string) || (e.message as string) || "Operation failed";
    }
    return "Operation failed";
  };

  const getNodeLabelById = (id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    return ((node as any)?.data?.label as string) || id;
  };

  const genCopyName = (id: string) => {
    const label = getNodeLabelById(id);
    const normalized = String(label).trim().replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
    return `${normalized}_copy_${Date.now().toString().slice(-5)}`;
  };

  const duplicateNow = async (ids: string[]) => {
    if (!projectName) return;
    const cleanIds = ids.filter((i) => i && i !== "PROJECT");
    if (cleanIds.length === 0) return;
    try {
      const items = cleanIds.map((id) => ({ id, name: genCopyName(id) }));
      await svc.duplicateProtocol(projectName, items);
      toast.success(cleanIds.length > 1 ? "Protocols duplicated successfully." : "Protocol duplicated successfully.");

      clearAllSelectionHard();
      await handleRefresh();
    } catch (e) {
      console.error(e);
      toast.error(getErrorMsg(e));
    }
  };

  // Stops multiple protocols in a single request (bulk).
  const stopProtocolNow = async (ids: string[]) => {
    if (!projectName) return;

    const cleanIds = Array.from(new Set((ids ?? []).map(String)))
      .filter((id) => id && id !== "PROJECT");

    if (cleanIds.length === 0) return;

    try {
      await svc.stopProtocol(projectName, cleanIds);

      toast.success(
        cleanIds.length > 1
          ? `Stop requested for ${cleanIds.length} protocols.`
          : "Stop requested."
      );

      clearAllSelectionHard();
      await handleRefresh();
    } catch (e) {
      console.error(e);
      toast.error(getErrorMsg(e));
    }
  };

  const openRename = (id: string) => setDlgRename({ open: true, id, value: findNodeLabel(id) });

  const openDelete = (id: string) => {
    const selected =
      pathSelRef.current.nodes.size > 0
        ? Array.from(pathSelRef.current.nodes).map(String).filter((x) => x !== "PROJECT")
        : [String(id)];
    setConfirm({ open: true, id: null, ids: selected, kind: "delete" });
  };

  const openRestartAll = (id: string) => setConfirm({ open: true, id, ids: null, kind: "restartAll" });
  const openContinueAll = (id: string) => setConfirm({ open: true, id, ids: null, kind: "continueAll" });
  const openResetFrom = (id: string) => setDlgResetFrom({ open: true, id });

  const openStop = (id: string) => {
    console.log('openStop', id)
    const ids =
      pathSelRef.current.nodes.size > 0
        ? Array.from(pathSelRef.current.nodes).map(String).filter((x) => x !== "PROJECT")
        : [String(id)];

    setConfirm({
      open: true,
      id: ids.length === 1 ? ids[0] : null,
      ids: ids.length > 1 ? ids : null,
      kind: "stop",
    });
  };

  /* -------- Build adjacency from edges -------- */
  const buildAdjacency = useCallback(() => {
    const parents = new Map<string, Set<string>>();
    const children = new Map<string, Set<string>>();

    for (const e of edgesRef.current) {
      const s = String(e.source);
      const t = String(e.target);
      if (!children.has(s)) children.set(s, new Set());
      if (!parents.has(t)) parents.set(t, new Set());
      children.get(s)!.add(t);
      parents.get(t)!.add(s);
      if (!parents.has(s)) parents.set(s, new Set());
      if (!children.has(t)) children.set(t, new Set());
    }
    return { parents, children };
  }, []);

  const collectDescendants = useCallback((startIdRaw: string) => {
    const startId = String(startIdRaw);
    const { children } = buildAdjacency();
    const q: string[] = [startId];
    const visited = new Set<string>();
    while (q.length) {
      const cur = String(q.shift()!);
      if (cur === "PROJECT") continue;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const ch = children.get(cur) ?? new Set<string>();
      for (const c of ch) if (!visited.has(c)) q.push(String(c));
    }
    visited.delete("PROJECT");
    return visited;
  }, [buildAdjacency]);

  const collectAncestors = useCallback((startIdRaw: string) => {
    const startId = String(startIdRaw);
    const { parents } = buildAdjacency();
    const q: string[] = [startId];
    const visited = new Set<string>();
    while (q.length) {
      const cur = String(q.shift()!);
      if (cur === "PROJECT") continue;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const pa = parents.get(cur) ?? new Set<string>();
      for (const p of pa) if (!visited.has(p)) q.push(String(p));
    }
    visited.delete("PROJECT");
    return visited;
  }, [buildAdjacency]);

  const applyGenericSelectionFromSet = useCallback((ids: Set<string>) => {
    applyPathSelection(Array.from(ids));
    applyEdgeHighlight(null);
  }, [applyPathSelection, applyEdgeHighlight]);

  const handleSelectFrom = useCallback((id: string) => {
    const nodesSet = collectDescendants(id);
    if (id !== "PROJECT") nodesSet.add(String(id));
    applyGenericSelectionFromSet(nodesSet);
  }, [collectDescendants, applyGenericSelectionFromSet]);

  const handleSelectTo = useCallback((id: string) => {
    const nodesSet = collectAncestors(id);
    if (id !== "PROJECT") nodesSet.add(String(id));
    applyGenericSelectionFromSet(nodesSet);
  }, [collectAncestors, applyGenericSelectionFromSet]);

  useEffect(() => {
    nodeActionsRef.current = {
      onEdit: (id) => handleNodeDoubleClick({ id }),
      onRename: openRename,
      onDuplicate: (id) => {
        const ids =
          pathSelRef.current.nodes.size > 0
            ? Array.from(pathSelRef.current.nodes).map(String).filter((x) => x !== "PROJECT")
            : [String(id)];
        duplicateNow(ids);
      },
      onDelete: openDelete,
      onRestartAll: openRestartAll,
      onContinueAll: openContinueAll,
      onResetFrom: openResetFrom,
      onSelectFrom: handleSelectFrom,
      onSelectTo: handleSelectTo,
      onStop: openStop,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSelectFrom, handleSelectTo, duplicateNow]);

  const nodeTypesRef = useRef<Record<string, any> | null>(null);
  if (!nodeTypesRef.current) {
    nodeTypesRef.current = {
      status: createStatusNodeWrapper(
        (data, evt) => onClickRef.current?.(data, evt),
        (data) => onDblClickRef.current?.(data),
        () => selectedIdRef.current ?? undefined,
        () => hoveredIdRef.current ?? undefined,
        setHoveredNodeId,
        () => graphDirRef.current,
        () => nodeActionsRef.current,
        () => getSelectedPathIds()
      ),
    };
  }
  const nodeTypes = nodeTypesRef.current;

  /* --------------------- Persistence of positions --------------------- */
  const handleNodesChangeWithPersistence = (changes: NodeChange[]) => {
    if (disablePersistenceRef.current) return onNodesChange(changes);
    setNodes((nds) => {
      const updated = applyNodeChanges(changes, nds);
      const positions = updated.map((n) => ({ id: n.id, position: n.position }));
      try {
        localStorage.setItem(`${localStorageKey}-${graphDirection}`, JSON.stringify(positions));
      } catch { }
      return updated;
    });
  };

  const loadNodesWithPositions = (loadedNodes: Node[]) => {
    const saved: { id: string; position: { x: number; y: number } }[] =
      JSON.parse(localStorage.getItem(`${localStorageKey}-${graphDirection}`) || "[]");
    return loadedNodes.map((n) => {
      const s = saved.find((p) => p.id === n.id);
      return s ? { ...n, position: s.position } : n;
    });
  };

  const shallowEqual = (a: any, b: any) => {
    if (a === b) return true;
    if (!a || !b) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) if (a[k] !== b[k]) return false;
    return true;
  };

  const mergeNodesWithPositions = (newNodes: Node[]) => {
    const oldMap = new Map(nodes.map((n) => [n.id, n]));
    return newNodes.map((n) => {
      const old = oldMap.get(n.id);
      if (old) {
        const position =
          old.position && old.position.x !== undefined && old.position.y !== undefined
            ? old.position
            : n.position ?? old.position;
        if (shallowEqual((old as any).data, (n as any).data) && position === old.position) return old;
        return { ...old, position, data: { ...(old as any).data, ...(n as any).data } } as Node;
      }
      return n;
    });
  };

  const mergeEdges = (newEdges: Edge[]) => {
    const oldEdgesMap = new Map(edges.map((e) => [e.id, e]));
    return newEdges.map((e) => (oldEdgesMap.get(e.id) ? { ...oldEdgesMap.get(e.id)!, ...e } : e));
  };

  /* ------------------------ Centering helper ------------------------ */
  const centerLikeButton = useCallback((nodesList?: Node[], preserveZoom = true, zoomOverride?: number) => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    const list = nodesList ?? nodesRef.current ?? [];
    const validNodes = list.filter((n) => typeof n.position?.x === "number" && typeof n.position?.y === "number");
    if (validNodes.length === 0) {
      const vp = inst.getViewport();
      inst.setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) });
      setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) });
      return;
    }
    try {
      if (!preserveZoom) {
        inst.fitView({ padding: 0.12, duration: 0 });
        const vp = inst.getViewport();
        setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
        return;
      }
      const targetZoom = clampZoom(typeof zoomOverride === "number" ? zoomOverride : inst.getViewport().zoom);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
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
      inst.setCenter(centerX, centerY, { zoom: targetZoom, duration: 0 });
      const finalVp = inst.getViewport();
      setViewport({ x: finalVp.x, y: finalVp.y, zoom: finalVp.zoom });
    } catch {
      const xSum = validNodes.reduce((s, n) => s + (n.position!.x ?? 0), 0);
      const ySum = validNodes.reduce((s, n) => s + (n.position!.y ?? 0), 0);
      const centerX = xSum / validNodes.length;
      const centerY = ySum / validNodes.length;
      const currentVp = inst.getViewport();
      const zoom = clampZoom(currentVp.zoom);
      inst.setCenter(centerX, centerY, { zoom, duration: 0 });
      const vp = inst.getViewport();
      setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
    }
  }, []);

  /* ------------------------ Wait for nodes helper ------------------------ */
  const waitForNodesReady = async (expectedCount: number, timeoutMs = 2500): Promise<boolean> => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return false;
    const start = Date.now();
    return new Promise<boolean>((resolve) => {
      const check = () => {
        try {
          const instNodes = typeof inst.getNodes === "function" ? inst.getNodes() : [];
          const needed = Math.max(1, expectedCount);
          if (instNodes && instNodes.length >= needed) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, valid = 0;
            for (const n of instNodes) {
              const x = n.position?.x, y = n.position?.y;
              if (typeof x === "number" && typeof y === "number" && !Number.isNaN(x) && !Number.isNaN(y)) {
                valid++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
            const w = isFinite(minX) && isFinite(maxX) ? Math.abs(maxX - minX) : 0;
            const h = isFinite(minY) && isFinite(maxY) ? Math.abs(maxY - minY) : 0;
            if (valid >= 1 && (w > 1 || h > 1)) return resolve(true);
          }
        } catch { }
        if (Date.now() - start > timeoutMs) return resolve(false);
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  };

  /* ------------------------ Fetch & load ------------------------ */
  const fetchAndLoadProject = useCallback(async () => {
    if (!projectName) return;
    setIsRefreshing(true);
    try {
      const data = await svc.fetchProject(projectName);
      setProject(data);

      if (data.protocols) {
        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(
          data.shortName, data.protocols, viewMode, graphDirection
        );

        // ⚠️ En vista TABLE: NO toques nodes/edges ni la selección
        if (viewMode === "table") {
          startTransition(() => setTableData(table ?? []));
          setIsLoadingProject(false);
          setIsRefreshing(false);
          return;
        }

        const nodesWithPositions = loadNodesWithPositions(loadedNodes);

        const initialTicks: Record<string, number> = {};
        nodesWithPositions.forEach((n) => {
          if ((n as any).data?.status === "running") {
            initialTicks[n.id] = Number((n as any).data.elapsedTime) ?? 0;
          }
        });
        const nodesWithTick = nodesWithPositions.map((n) =>
          isRunningNode(n)
            ? { ...n, data: { ...(n as any).data, tick: initialTicks[n.id] ?? Number((n as any).data?.elapsedTime) ?? 0 } }
            : n
        );

        const unifiedSelectedIds = getUnifiedSelectedIds();
        const seededNodes = nodesWithTick.map((n) => ({ ...n, selected: unifiedSelectedIds.has(n.id) }));

        const recomputedEdgeSet = computeEdgesTouchingNodes(unifiedSelectedIds);
        pathSelRef.current.edges = recomputedEdgeSet;

        startTransition(() => {
          setNodes(seededNodes);
          setEdges((_) => {
            let base = loadedEdges;
            base = paintEdgeHighlight(base, selectedIdRef.current ?? null);
            if (recomputedEdgeSet.size) base = paintPathHighlight(base, recomputedEdgeSet);
            return base;
          });
          setTableData(table ?? []);
        });

        setNodeTicks(initialTicks);
        setNodesLoadedOnce(true);

        if (firstLoadRef.current && viewMode === "hierarchical") {
          const desiredCount = Math.max(1, nodesWithPositions.length);
          let observer: MutationObserver | null = null;
          let fallbackTimer: any = null;
          let centered = false;

          const doCenter = () => {
            if (centered) return;
            centered = true;
            try { centerLikeButton(nodesWithPositions, true, viewportRef.current.zoom); }
            finally {
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
                requestAnimationFrame(() => requestAnimationFrame(doCenter));
              } else {
                observer = new MutationObserver(() => {
                  const els = nodesContainer.querySelectorAll(".react-flow__node");
                  if (els.length >= desiredCount) {
                    requestAnimationFrame(() => requestAnimationFrame(doCenter));
                  }
                });
                observer.observe(nodesContainer, { childList: true, subtree: true });
                fallbackTimer = setTimeout(async () => {
                  if (observer) { try { observer.disconnect(); } catch { } observer = null; }
                  await waitForNodesReady(nodesWithPositions.length, 2000);
                  doCenter();
                }, 3000);
              }
            } else {
              const ready = await waitForNodesReady(nodesWithPositions.length, 2500);
              if (ready) doCenter(); else firstLoadRef.current = false;
            }
          } catch {
            const ready = await waitForNodesReady(nodesWithPositions.length, 2000);
            if (ready) doCenter(); else firstLoadRef.current = false;
          }
        }
      }
    } catch (err) {
      console.error("fetchAndLoadProject error:", err);
    } finally {
      setIsRefreshing(false);
      setIsLoadingProject(false);
    }
  }, [projectName, viewMode, graphDirection, centerLikeButton, svc, paintEdgeHighlight, paintPathHighlight, computeEdgesTouchingNodes]);

  useEffect(() => {
    setIsLoadingProject(true);
    fetchAndLoadProject();
  }, [projectName, fetchAndLoadProject]);

  /* ------------------------ Refresh ------------------------ */
  const handleRefresh = useCallback(async () => {
    if (!projectName) return;
    setIsRefreshing(true);
    try {
      const data = await svc.fetchProject(projectName);
      setProject(data);

      if (data.protocols) {
        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(
          data.shortName, data.protocols, viewMode, graphDirection
        );

        // ⚠️ En vista TABLE: NO toques nodes/edges ni selección, solo la tabla
        if (viewMode === "table") {
          startTransition(() => setTableData(table ?? []));
          setIsRefreshing(false);
          return;
        }

        const nodesWithPositions = mergeNodesWithPositions(loadedNodes);
        const edgesMerged = mergeEdges(loadedEdges);

        const unifiedSelectedIds = getUnifiedSelectedIds();
        const nodesSeed = nodesWithPositions.map((n) =>
          isRunningNode(n)
            ? { ...n, data: { ...(n as any).data, tick: (nodeTicks[n.id] ?? Number((n as any).data?.elapsedTime) ?? 0) }, selected: unifiedSelectedIds.has(n.id) }
            : { ...n, selected: unifiedSelectedIds.has(n.id) }
        );

        const recomputedEdgeSet = computeEdgesTouchingNodes(unifiedSelectedIds);
        pathSelRef.current.edges = recomputedEdgeSet;

        startTransition(() => {
          setNodes(nodesSeed);
          setEdges((_) => {
            let out = paintEdgeHighlight(edgesMerged, selectedIdRef.current ?? null);
            if (recomputedEdgeSet.size) out = paintPathHighlight(out, recomputedEdgeSet);
            return out;
          });
          setTableData(table ?? []);
        });

        setNodeTicks((prev) => {
          const updated: Record<string, number> = {};
          nodesWithPositions.forEach((n) => {
            const status = (n as any).data?.status;
            const elapsed = Number((n as any).data?.elapsedTime) ?? 0;
            if (status === "running") updated[n.id] = Math.max(prev[n.id] ?? 0, elapsed);
          });
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  }, [projectName, viewMode, graphDirection, nodeTicks, svc, paintEdgeHighlight, paintPathHighlight, computeEdgesTouchingNodes]);

  const handleRefreshRef = useRef(handleRefresh);
  useEffect(() => { handleRefreshRef.current = handleRefresh; }, [handleRefresh]);
  useEffect(() => {
    const interval = setInterval(() => { handleRefreshRef.current(); }, TIME_TO_REFRESH);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (delayedRefreshTimerRef.current !== null) {
        clearTimeout(delayedRefreshTimerRef.current);
        delayedRefreshTimerRef.current = null;
      }
    };
  }, []);

  /* ------------------------ Reorganize ------------------------ */
  const handleReorganize = useCallback(
    async (opts?: { preserveZoom?: boolean }) => {
      if (!projectName) return;
      try {
        try { localStorage.removeItem(`${localStorageKey}-${graphDirection}`); } catch { }
        disablePersistenceRef.current = true;
        setHideGraphDuringCenter(true);

        const data = await svc.fetchProject(projectName);
        setProject(data);
        if (!data.protocols) {
          disablePersistenceRef.current = false;
          setHideGraphDuringCenter(false);
          return;
        }

        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(
          data.shortName, data.protocols, viewMode, graphDirection
        );

        // ⚠️ Si estás en TABLE, no reorganizamos el grafo ni tocamos selección
        if (viewMode === "table") {
          startTransition(() => setTableData(table ?? []));
          disablePersistenceRef.current = false;
          setHideGraphDuringCenter(false);
          return;
        }

        const nodesWithPositions = loadNodesWithPositions(loadedNodes);

        const unifiedSelectedIds = getUnifiedSelectedIds();
        const nodesSeeded = nodesWithPositions.map((n) => ({ ...n, selected: unifiedSelectedIds.has(n.id) }));
        const recomputedEdgeSet = computeEdgesTouchingNodes(unifiedSelectedIds);
        pathSelRef.current.edges = recomputedEdgeSet;

        startTransition(() => {
          setNodes(nodesSeeded);
          setEdges((_) => {
            let out = paintEdgeHighlight(loadedEdges, selectedIdRef.current ?? null);
            if (recomputedEdgeSet.size) out = paintPathHighlight(out, recomputedEdgeSet);
            return out;
          });
          setTableData(table ?? []);
          setNodeTicks((prev) => {
            const seeded: Record<string, number> = {};
            nodesWithPositions.forEach((n) => {
              if ((n as any).data?.status === "running") {
                const v = Number((n as any).data?.elapsedTime) ?? prev[n.id] ?? 0;
                seeded[n.id] = v;
              }
            });
            return seeded;
          });
        });

        requestAnimationFrame(() => {
          const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
          if (inst && nodesWithPositions.length > 0 && viewMode === "hierarchical") {
            const preserve = opts?.preserveZoom ?? true;
            centerLikeButton(nodesWithPositions, preserve, viewportRef.current.zoom);
          } else if (inst) {
            const vp = inst.getViewport();
            inst.setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) });
            setViewport({ x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) });
          }
          disablePersistenceRef.current = false;
          setHideGraphDuringCenter(false);
        });
      } catch (err) {
        console.error(err);
        disablePersistenceRef.current = false;
        setHideGraphDuringCenter(false);
      }
    },
    [projectName, viewMode, graphDirection, centerLikeButton, svc, paintEdgeHighlight, paintPathHighlight, computeEdgesTouchingNodes]
  );

  /* ------------------------ Ticks updater ------------------------ */
  useEffect(() => {
    const interval = setInterval(() => {
      let nextTicks: Record<string, number> = {};
      setNodeTicks((prev) => {
        const next: Record<string, number> = {};
        for (const id in prev) next[id] = prev[id] + 1;
        nextTicks = next;
        return next;
      });

      setNodes((prev) => {
        if (!prev || prev.length === 0) return prev;
        let changed = false;
        const updated = prev.map((n) => {
          if (!isRunningNode(n)) return n;
          const prevTick = Number((n as any).data?.tick ?? (n as any).data?.elapsedTime ?? 0);
          const newTick = nextTicks[n.id] !== undefined ? nextTicks[n.id] : prevTick + 1;
          if (newTick === prevTick) return n;
          changed = true;
          return { ...n, data: { ...(n as any).data, tick: newTick } };
        });
        return changed ? updated : prev;
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

  /* ------------------------ Layout change effect ------------------------ */
  const prevLayout = useRef({ viewMode, graphDirection });
  useLayoutEffect(() => {
    const layoutChanged =
      prevLayout.current.viewMode !== viewMode ||
      prevLayout.current.graphDirection !== graphDirection;
    if (!layoutChanged) return;
    if (!project?.protocols) { prevLayout.current = { viewMode, graphDirection }; return; }

    // ✅ Si vamos a TABLE, no tocar grafo ni selección; solo gestionar overlay y highlight
    if (viewMode === "table") {
      setIsSwitchingLayout(true);
      requestAnimationFrame(() => setTimeout(() => setIsSwitchingLayout(false), 60));
      if (pathSelRef.current.nodes.size === 0) setHighlightedId(selectedIdRef.current ?? null);
      prevLayout.current = { viewMode, graphDirection };
      return;
    }

    // Vista jerárquica: sí actualizamos grafo
    const instance = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!instance) { prevLayout.current = { viewMode, graphDirection }; return; }

    const currentViewport = instance.getViewport();
    const { nodes: loadedNodes, edges: loadedEdges } =
      buildGraphElements(project.shortName, project.protocols, viewMode, graphDirection);
    const nodesWithPositions = loadNodesWithPositions(loadedNodes);

    const unifiedSelectedIds = getUnifiedSelectedIds();
    const nodesSeeded = nodesWithPositions.map((n) => ({ ...n, selected: unifiedSelectedIds.has(n.id) }));
    const recomputedEdgeSet = computeEdgesTouchingNodes(unifiedSelectedIds);
    pathSelRef.current.edges = recomputedEdgeSet;

    disablePersistenceRef.current = true;
    setIsSwitchingLayout(true);

    startTransition(() => {
      setNodes(nodesSeeded);
      setEdges((_) => {
        let out = paintEdgeHighlight(loadedEdges, selectedIdRef.current ?? null);
        if (recomputedEdgeSet.size) out = paintPathHighlight(out, recomputedEdgeSet);
        return out;
      });
    });

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
  }, [graphDirection, viewMode, project, paintEdgeHighlight, paintPathHighlight, computeEdgesTouchingNodes]);

  /* ------------------------ First-center ------------------------ */
  useEffect(() => {
    if (!nodesLoadedOnce) return;
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    setIsSwitchingLayout(true);

    const validNodes = nodes.filter((n) => typeof n.position?.x === "number" && typeof n.position?.y === "number");
    if (validNodes.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inst.setViewport({ x: viewportRef.current.x, y: viewportRef.current.y, zoom: clampZoom(viewportRef.current.zoom) });
          setTimeout(() => setIsSwitchingLayout(false), 60);
        });
      });
    } else {
      inst.setViewport({ x: inst.getViewport().x, y: inst.getViewport().y, zoom: clampZoom(inst.getViewport().zoom) });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const vp = inst.getViewport();
          setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
          setTimeout(() => setIsSwitchingLayout(false), 60);
        });
      });
    }
  }, [nodesLoadedOnce]);

  /* ============================================================
     Tabla: scroll controlado (una sola vez) + highlight estable
     ============================================================ */
  const didScrollForTableRef = useRef(false);
  const tableScrollRetriesRef = useRef(0);

  const scrollSelectedRowIntoViewOnce = useCallback(() => {
    const id = pathSelRef.current.nodes.size === 0 ? selectedIdRef.current : null;
    if (!id) {
      setHighlightedId(null);
      didScrollForTableRef.current = true;
      return;
    }

    setHighlightedId(id);

    const row = rowRefs.current[id];
    const container = tableContainerRef.current;
    if (row && container && container.offsetHeight > 0) {
      const rowTop = row.offsetTop;
      const desired = rowTop - container.offsetHeight / 2 + row.offsetHeight / 2;
      container.scrollTop = Math.max(0, desired);
      didScrollForTableRef.current = true;
      tableScrollRetriesRef.current = 0;
      return;
    }

    if (tableScrollRetriesRef.current < 10) {
      tableScrollRetriesRef.current += 1;
      requestAnimationFrame(scrollSelectedRowIntoViewOnce);
    } else {
      didScrollForTableRef.current = true;
      tableScrollRetriesRef.current = 0;
    }
  }, [setHighlightedId]);

  useEffect(() => {
    if (viewMode !== "table") {
      setTableVisible(false);
      didScrollForTableRef.current = false;
      tableScrollRetriesRef.current = 0;
      return;
    }

    setTableVisible(false);
    setIsSwitchingLayout(true);
    requestAnimationFrame(() => {
      setTableVisible(true);
      requestAnimationFrame(() => {
        setTimeout(() => setIsSwitchingLayout(false), 60);
        if (!didScrollForTableRef.current) {
          tableScrollRetriesRef.current = 0;
          requestAnimationFrame(scrollSelectedRowIntoViewOnce);
        }
      });
    });
  }, [viewMode, scrollSelectedRowIntoViewOnce]);

  useEffect(() => {
    if (viewMode === "table" && pathSelRef.current.nodes.size === 0) {
      setHighlightedId(selectedIdRef.current ?? null);
    }
  }, [isRefreshing, viewMode]);

  /* --------------------- Search helpers --------------------- */
  const scrollToProtocol = (id: string) => {
    const row = rowRefs.current[id];
    const container = tableContainerRef.current;
    if (row && container) {
      setHighlightedId(id);
      const rowTop = row.offsetTop;
      const rowHeight = row.offsetHeight;
      const containerHeight = container.offsetHeight;
      container.scrollTop = Math.max(0, rowTop - containerHeight / 2 + rowHeight / 2);
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
    return { backgroundColor: colorMap[status ?? ""] ?? "#eee", padding: "4px 8px", borderRadius: "6px", fontWeight: 300, color: "black" };
  };

  const formatCpuTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(hours)}h:${pad(minutes)}m:${pad(secs)}s`;
  };

  const handleSearch = (query: string) => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;

    if (!query.trim()) {
      setHighlightedId(null);
      setPreviousNodeId(null);
      applyEdgeHighlight(null);
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
      const matchRow = tableData.find((row) =>
        row.id.toLowerCase().includes(query.toLowerCase()) ||
        row.label.toLowerCase().includes(query.toLowerCase())
      );
      if (matchRow) scrollToProtocol(matchRow.id);
      return;
    }

    const match = nodes.find((node) =>
      node.id.toLowerCase().includes(query.toLowerCase()) ||
      ((node as any).data?.label ?? "").toLowerCase().includes(query.toLowerCase())
    );

    if (!match) {
      setHighlightedId(null);
      setPreviousNodeId(null);
      applyEdgeHighlight(null);
      return;
    }

    setPreviousNodeId(match.id);
    setHighlightedId(match.id);
    applyEdgeHighlight(match.id);

    const inst2 = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (inst2) {
      const currentZoom = inst2.getViewport().zoom;
      const zoom = clampZoom(currentZoom);
      inst2.setCenter((match as any).position.x, (match as any).position.y, { zoom, duration: 500 });
      const vp = inst2.getViewport();
      setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
    }
  };

  const handleRowDoubleClick = async (id: string) => {
    if (!projectName) return;
    try {
      const fullNodeData = await svc.fetchProtocolDetails(projectName, id);
      setHighlightedId(id);
      setSelectedNodeDetails(fullNodeData);
      setPreviousNodeId(id);
      applyEdgeHighlight(id);
    } catch (err) {
      console.error(err);
    }
  };

  const findNodeLabel = (id: string) => {
    const n = nodesRef.current.find((m) => m.id === id);
    return ((n as any)?.data?.label as string) ?? id;
  };

  /* --------------------- Pane context menu --------------------- */
  const handleContextMenu = (event: React.MouseEvent) => {
    if ((event as any).defaultPrevented) return;
    const target = event.target as HTMLElement;
    const isNode = !!target.closest(".react-flow__node");
    if (isNode) return;

    event.preventDefault();
    event.stopPropagation();

    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, nodeId: null });
  };

  const handleCloseMenu = () => setContextMenu((prev) => ({ ...prev, visible: false }));

  useEffect(() => {
    if (!contextMenu.visible) return;
    const onWindowMouseDown = () => handleCloseMenu();
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") handleCloseMenu(); };
    window.addEventListener("mousedown", onWindowMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onWindowMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu.visible]);

  /* ------------------------ ReactFlow init / move / selection ------------------------ */
  const handleOnInit = useCallback((inst: ReactFlowInstance) => {
    reactFlowInstanceRef.current = inst;
    try {
      const current = inst.getViewport();
      const desiredZoom = clampZoom(viewportRef.current.zoom ?? current.zoom);
      inst.setViewport({ x: current.x, y: current.y, zoom: desiredZoom });
      const vp = inst.getViewport();
      setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
    } catch { }
  }, []);

  const handleOnMoveEnd = useCallback((_: any, vp: { x: number; y: number; zoom: number }) => {
    setViewport(vp);
  }, []);

  const onSelectionChange = useCallback(({ nodes: selNodes }: { nodes: Node[]; edges: Edge[] }) => {
    if (suppressNextSyncRef.current) {
      suppressNextSyncRef.current = false;
      return;
    }

    const ids = new Set((selNodes ?? []).map((n) => n.id));

    if (ids.size > 1) {
      if (setsEqual(ids, pathSelRef.current.nodes)) return;
      applyGenericSelectionFromSet(ids);
      return;
    }

    if (ids.size === 1) {
      if (pathSelRef.current.nodes.size || pathSelRef.current.edges.size) {
        clearPathSelection();
      }
      const id = selNodes![0].id;
      selectedIdRef.current = id;
      setPreviousNodeId(id);
      setHighlightedId(id);
      applyEdgeHighlight(id);
      setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === id })));
      return;
    }

    selectedIdRef.current = null;
    setPreviousNodeId(null);
    setHighlightedId(null);
    clearPathSelection();
    applyEdgeHighlight(null);
    setNodes((prev) => (prev.some((n) => n.selected) ? prev.map((n) => ({ ...n, selected: false })) : prev));
  }, [setNodes, applyGenericSelectionFromSet, clearPathSelection, applyEdgeHighlight]);

  /* ------------------------ Dialogs + API ------------------------ */
  type ConfirmKind = "delete" | "restartAll" | "continueAll" | "stop";

  const [dlgRename, setDlgRename] = useState<{ open: boolean; id: string | null; value: string }>({
    open: false, id: null, value: "",
  });
  const [dlgResetFrom, setDlgResetFrom] = useState<{ open: boolean; id: string | null }>({
    open: false, id: null,
  });

  const [confirm, setConfirm] = useState<{
    open: boolean;
    id: string | null;
    ids: string[] | null;
    kind: ConfirmKind | null;
  }>({
    open: false, id: null, ids: null, kind: null,
  });

  const submitRename = async () => {
    if (!projectName || !dlgRename.id || !dlgRename.value.trim()) return;
    const id = dlgRename.id;
    const value = dlgRename.value.trim();

    setDlgRename({ open: false, id: null, value: "" });
    try {
      await svc.renameProtocol(projectName, id, value);
      toast.success("Protocol renamed successfully.");
      await handleRefresh();
    } catch (e) {
      console.error(e);
      toast.error(getErrorMsg(e));
    }
  };

  /* ------------------------ Controls ------------------------ */
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
  const handleFitView = useCallback(() => { centerLikeButton(undefined, true); }, [centerLikeButton]);

  /* ------------------------ Render ------------------------ */
  return (
    <div className="h-screen flex flex-col relative">
      {/* Header */}
      <div className="flex justify-between items-center mb-1">
        <div className="relative w-full max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search protocol..."
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-2 pl-10 pr-3 text-sm text-gray-800 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          />
        </div>

        <div className="ml-4 mr-4 p-2 border rounded-lg shadow-sm bg-white dark:bg-gray-800 flex items-center gap-4">
          <ProtocolsDrawer
            projectId={project?.id ? Number(project.id) : null}
            onProtocolDoubleClick={async (protocolClass: string) => {
              if (!projectName) return;
              try {
                const fullNodeData = await svc.fetchNewProtocolDetails(projectName, protocolClass);
                setSelectedNodeDetails(fullNodeData);
                setPreviousNodeId(protocolClass);
                applyEdgeHighlight(protocolClass);
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

        <div className="ml-4 mr-4 p-2 border rounded-lg shadow-sm bg-white dark:bg-gray-800 flex items-center gap-4">
          <span className="font-small text-xs">View mode:</span>
          <div className="flex gap-2">
            <button
              onClick={() => { setViewMode("hierarchical"); setGraphDirection("TB"); }}
              className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${viewMode === "hierarchical" && graphDirection === "TB" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}
            >
              <TreeIcon className="w-4 h-4" /> Tree TB
            </button>
            <button
              onClick={() => { setViewMode("hierarchical"); setGraphDirection("LR"); }}
              className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${viewMode === "hierarchical" && graphDirection === "LR" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}
            >
              <TreeIcon className="w-4 h-4 transform rotate-270" /> Tree LR
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1 rounded-lg text-xs flex items-center gap-1 ${viewMode === "table" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}
            >
              <TableIcon className="w-4 h-4" /> Table
            </button>
          </div>
        </div>
      </div>

      {selectedNodeDetails && (
        <ProtocolForm
          data={selectedNodeDetails}
          projectProtocols={project?.protocols ?? project?.protocols ?? {}}
          onClose={handleCloseForm}
          onExecuted={() => {
            // Immediate refresh
            handleRefreshRef.current?.();
            // Schedule a second refresh after 5s; clear any previous pending one
            if (delayedRefreshTimerRef.current !== null) {
              clearTimeout(delayedRefreshTimerRef.current);
            }
            delayedRefreshTimerRef.current = window.setTimeout(() => {
              // Safe lookup of the latest handleRefresh
              handleRefreshRef.current?.();
            }, 5000);
          }}
        />
      )}

      <div className="flex-1 relative">
        {/* switching overlay */}
        {isSwitchingLayout && (
          <div aria-hidden className="absolute inset-0 z-60 flex itemscenter justify-center" style={{ background: "var(--reactflow-background, #ffffff)", pointerEvents: "none" }}>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
            </div>
          </div>
        )}

        {/* initial loading overlay */}
        {isLoadingProject && (
          <div role="status" aria-live="polite" className="absolute inset-0 z-[80] flex flex-col items-center justify-center bg-white/75 dark:bg-gray-900/75 backdrop-blur-[2px]" style={{ pointerEvents: "auto" }}>
            <div className="relative">
              <div className="w-8 h-8 rounded-full border-2 border-gray-300" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gray-700 animate-spin" />
            </div>
            <p className="mt-3 text-xs tracking-wide text-gray-700 dark:text-gray-200">
              Loading <span className="font-medium">Project</span>…
            </p>
          </div>
        )}

        {/* TABLE */}
        <div
          ref={tableContainerRef}
          className="absolute inset-0 overflow-auto border rounded shadow p-3 z-30 transition-opacity"
          style={{ opacity: viewMode === "table" ? 1 : 0, pointerEvents: viewMode === "table" ? "auto" : "none" }}
          aria-hidden={viewMode !== "table"}
        >
          <div className="flex justify-end mb-4 mr-4">
            <button className="refresh-btn" title="Refresh project" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          <table className="cursor-pointer w-full text-sm border border-gray-300 dark:border-gray-700">
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
                  ref={(el) => { rowRefs.current[row.id] = el; }}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button,a")) return;

                    if (pathSelRef.current.nodes.size || pathSelRef.current.edges.size) {
                      clearPathSelection();
                    }

                    suppressOneFrame();
                    setNodes((prev) =>
                      prev.map((n) =>
                        n.id === row.id
                          ? (n.selected ? n : { ...n, selected: true })
                          : (n.selected ? { ...n, selected: false } : n)
                      )
                    );
                    selectedIdRef.current = row.id;
                    setPreviousNodeId(row.id);
                    setHighlightedId(row.id);
                    applyEdgeHighlight(row.id);
                  }}
                  onDoubleClick={() => handleRowDoubleClick(row.id)}
                  className={`border-t border-gray-200 dark:border-gray-700 ${highlightedId === row.id ? "bg-yellow-100 dark:bg-yellow-900" : ""}`}
                >
                  <td className="ml-2 mt-2 px-3 py-1 inline-flex items-center justify-center rounded-full bg-gray-200 text-black text-xs">{row.id}</td>
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className={`${row.status === "running" ? "pulsing-table" : ""}`} style={getStatusStyle(row.status)}>{row.status ?? "—"}</span>
                      {(row.status === "running" || row.status === "failed" || row.status === "aborted") && (
                        <div className="flex items-center gap-2 ml-4 flex-1">
                          <div className="w-16 h-3 bg-gray-300 dark:bg-gray-700 rounded overflow-hidden">
                            <div
                              className={`h-3 ${row.status === "running" ? "bg-yellow-400" : row.status === "failed" || row.status === "aborted" ? "bg-red-500" : "bg-gray-400"} transition-all duration-300`}
                              style={{ width: `${((row.stepsDone ?? 0) / (row.numberOfSteps ?? 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm opacity-80">{row.stepsDone}/{row.numberOfSteps}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono">
                    {formatCpuTime(row.tick ?? Number(row.elapsedTime) ?? 0)}
                  </td>
                  <td className="px-4 py-2 space-x-2">
                    {row.children?.map((childId: string) => (
                      <button key={childId} onClick={() => scrollToProtocol(childId)} className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800">
                        {childId}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ReactFlow */}
        <div
          className="absolute inset-0 border transition-opacity"
          style={{
            opacity: viewMode === "hierarchical" ? (hideGraphDuringCenter ? 0 : 1) : 0,
            pointerEvents: viewMode === "hierarchical" ? "auto" : "none",
            zIndex: 20,
          }}
          aria-hidden={viewMode !== "hierarchical"}
        >
          <div className="absolute top-4 right-4 z-50">
            <div className="flex flex-col gap-1 p-1 bg-white/90 rounded shadow">
              <button title="Zoom in" onClick={handleZoomIn} className="p-1 rounded hover:bg-gray-100 dark:text-black">
                <PlusIcon className="w-4 h-4" />
              </button>
              <button title="Zoom out" onClick={handleZoomOut} className="p-1 rounded hover:bg-gray-100 dark:text-black">
                <MinusIcon className="w-4 h-4" />
              </button>
              <button title="Fit view (preserve zoom)" onClick={handleFitView} className="p-1 rounded hover:bg-gray-100 dark:text-black">
                <FitViewIcon className="w-4 h-4" />
              </button>
              <button title="Reorganize project" onClick={() => handleReorganize({ preserveZoom: true })} className="p-1 rounded hover:bg-gray-100 dark:text-black">
                <TreeIcon className="w-4 h-4" />
              </button>
              <button title="Refresh project" onClick={handleRefresh} className="p-1 rounded hover:bg-gray-100 dark:text-black">
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <ReactFlowProvider>
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
              onPaneClick={() => {
                handleCloseMenu();
                clearAllSelectionHard();
                applyEdgeHighlight(null);
              }}
              onSelectionChange={onSelectionChange}
              onContextMenu={handleContextMenu}
              defaultViewport={viewport}
              defaultEdgeOptions={{ type: "default", style: { stroke: "#999", strokeWidth: 2 }, markerEnd: "url(#circle)" }}
              onNodeDoubleClick={(_, node) => handleNodeDoubleClick(node)}
              onNodeClick={(evt, node) => handleNodeClick(node, evt)}
              multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
              selectionKeyCode="Shift"
              selectionOnDrag
              style={{ width: "100%", height: "100%" }}
            >
              <Background />
            </ReactFlow>
            {contextMenu.visible && (
              <DropdownMenu open onOpenChange={() => handleCloseMenu()}>
                <DropdownMenuTrigger asChild>
                  <button style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, width: 0, height: 0, opacity: 0 }} />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <>
                    <DropdownMenuItem onSelect={handleRefresh}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh graph
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        clearAllSelectionHard();
                        applyEdgeHighlight(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear selection
                    </DropdownMenuItem>
                  </>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </ReactFlowProvider>
        </div>
      </div>

      {/* --- Dialogs --- */}
      <Dialog open={dlgRename.open} onOpenChange={(open: boolean) => { if (!open) setDlgRename({ open: false, id: null, value: "" }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename protocol</DialogTitle>
            <DialogDescription>Set a new name for this protocol.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Label htmlFor="rename">New name</Label>
            <Input id="rename" value={dlgRename.value} onChange={(e) => setDlgRename((s) => ({ ...s, value: e.target.value }))} placeholder="e.g. motioncorr_02" />
          </div>
          <DialogFooter>
            <Button onClick={() => setDlgRename({ open: false, id: null, value: "" })} className="rounded-full px-4 py-2 min-w-[140px] font-medium bg-gray-200 hover:bg-gray-300 text-gray-800">
              Cancel
            </Button>
            <Button onClick={submitRename} disabled={!dlgRename.value.trim()} className="rounded-full px-4 py-2 min-w-[140px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 disabled:cursor-not-allowed">
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm.open} onOpenChange={(open: boolean) => { if (!open) setConfirm({ open: false, id: null, ids: null, kind: null }); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="mb-6">
              {confirm.kind === "delete" && "Delete protocol(s)?"}
              {confirm.kind === "restartAll" && "Restart all steps?"}
              {confirm.kind === "continueAll" && "Continue all steps?"}
              {confirm.kind === "stop" && "Stop protocol(s)?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="mb-5">
              {confirm.kind === "delete" && "This action cannot be undone. This will permanently remove the selected protocol(s) and outputs not used elsewhere."}
              {confirm.kind === "restartAll" && "All protocols will be restarted from this protocol, so the previous results will be deleted"}
              {confirm.kind === "continueAll" && "All protocols will continue for this protocol, so the previous results will be affected"}
              {confirm.kind === "stop" && "This will attempt to gracefully stop the selected protocol(s). Running work may be interrupted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirm({ open: false, id: null, ids: null, kind: null })} className="rounded-full px-4 py-2 min-w-[140px] font-medium bg-gray-200 hover:bg-gray-300 text-gray-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!projectName || !confirm.kind) return;
                const kind = confirm.kind; // snapshot before state changes
                try {
                  if (confirm.kind === "delete") {
                    const ids = confirm.ids ?? (confirm.id ? [confirm.id] : []);
                    if (ids.length === 0) return;
                    await svc.deleteProtocol(projectName, ids);

                    clearAllSelectionHard();

                    toast.success(ids.length > 1 ? "Protocols deleted." : "Protocol deleted.");
                  } else if (confirm.kind === "restartAll" && confirm.id) {
                    await svc.restartAll(projectName, confirm.id);
                    toast.success("Restart started.");
                  } else if (confirm.kind === "continueAll" && confirm.id) {
                    await svc.continueAll(projectName, confirm.id);
                    toast.success("Continue started.");
                  } else if (confirm.kind === "stop") {
                    const ids = confirm.ids ?? (confirm.id ? [confirm.id] : []);
                    if (ids.length === 0) return;
                    await stopProtocolNow(ids); // already refreshes
                  }
                  setConfirm({ open: false, id: null, ids: null, kind: null });
                  if (kind !== "stop") await handleRefresh();
                } catch (e) {
                  console.error(e);
                  toast.error(getErrorMsg(e));
                }
              }}
              className="rounded-full px-4 py-2 min-w-[140px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {confirm.kind === "delete"
                ? "Delete"
                : confirm.kind === "restartAll"
                  ? "Restart"
                  : confirm.kind === "continueAll"
                    ? "Continue"
                    : "Stop"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dlgResetFrom.open} onOpenChange={(open: boolean) => { if (!open) setDlgResetFrom({ open: false, id: null }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset from this protocol?</DialogTitle>
            <DialogDescription>Downstream steps may be invalidated. You can re-run them later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDlgResetFrom({ open: false, id: null })} className="rounded-full px-4 py-2 min-w-[140px] font-medium bg-gray-200 hover:bg-gray-300 text-gray-800">
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!projectName || !dlgResetFrom.id) return;
                try {
                  await svc.resetFrom(projectName, dlgResetFrom.id);
                  setDlgResetFrom({ open: false, id: null });
                  toast.success("Reset completed.");
                  await handleRefresh();
                } catch (e) {
                  console.error(e);
                  toast.error(getErrorMsg(e));
                }
              }}
              className="rounded-full px-4 py-2 min-w-[140px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Reset from here
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
