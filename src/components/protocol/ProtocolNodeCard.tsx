// src/components/protocol/ProtocolNodeCard.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";

import { Handle, Position, useReactFlow } from "reactflow";
import styles from "./ProtocolNodeCard.module.css";

import { useDrag } from "./DragContext";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "../ui/dropdown-menu";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "../ui/context-menu";

import {
  MoreHorizontal,
  Pencil,
  FolderOpen,
  Copy,
  Trash2,
  FileUp,
  RefreshCw,
  Play,
  RotateCcw,
  ArrowUpRight,
  Upload,
  Square,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Scan,
  Eye,
  Tags,
  Plus,
  Check,
} from "lucide-react";

import AnalyzeOutputDialog from "@/components/analyze/analyze-output-dialog";
import type {
  AnalyzeViewerResolveContext,
  AnalyzeViewerResolveDecision,
  Id,
} from "@/services/ProjectService";

import type { ProtocolTag } from "@/components/tags/tagTypes";

// Uses your tag store hook (no selector args)
import { useTagStore } from "@/stores/tag_store";

import { useProjectService } from "@/ProjectServiceContext";

const statusColors: Record<string, string> = {
  running: "#FCCE62",
  saved: "#D9F1FA",
  launched: "#D9F1FA",
  finished: "#D2F5CB",
  failed: "#F5CCCB",
  aborted: "#F5CCCB",
  interactive: "#f7f3bf",
  root: "#D9F1FA",
  scheduled: "#f7f3bf",
  new: "#1E90FF",
};

const statusBadgeColors: Record<string, string> = {
  running: "#918516",
  saved: "#1E90FF",
  launched: "#1E90FF",
  finished: "#28A745",
  failed: "#DC3545",
  aborted: "#DC3545",
  interactive: "#FFC107",
  scheduled: "#918516",
  new: "#1E90FF",
};

export type ExternalAnalyzeViewerService = {
  resolveAnalyzeViewer?: (ctx: AnalyzeViewerResolveContext) => Promise<AnalyzeViewerResolveDecision>;
};

type StatusNodeProps = {
  id?: string;
  data: {
    label: string;
    title: string;
    status?: string;
    id: string;
    color?: string;
    cpuTime?: string;
    elapsedTime?: string;
    tick?: number;
    numberOfSteps?: number;
    stepsDone?: number;
    outputs?: any[];
    inputs?: any[];
    parents?: string[];
    children?: string[];
    __pathVer?: number;
    projectId?: string | number;

    // tags (can be list of ids or objects; normalized later)
    tags?: any[];
  };

  selectedNodeId?: string;
  hoveredNodeId?: string;
  isHovered?: boolean;
  setHoveredNodeId?: Dispatch<SetStateAction<string | null>>;
  graphDirection?: "TB" | "LR";
  onClick?: (evt?: ReactMouseEvent) => void;
  onDoubleClick?: () => void;
  zoomLevel?: number;
  compactThreshold?: number;

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
  onBrowse?: (protocolId: string, projectId?: string | number, protocolLabel?: string) => void;

  // opens the tag manager (create/edit tag definitions)
  onManageTags?: (protocolId: string, projectId?: string | number, protocolLabel?: string) => void;

  inPathSelection?: boolean;
  pathSelectionActive?: boolean;

  sourcePosition?: Position;
  targetPosition?: Position;

  showHandles?: boolean;

  service?: ExternalAnalyzeViewerService;
};

const formatCpuTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}h:${pad(minutes)}m:${pad(secs)}s`;
};

type NormalizedOutput = {
  name?: string; // outputKeyNameUsedByBackend
  info?: string;
  paramClass: string;
  pointerClass?: string;
  value?: string;
  parentId?: string | number;
};

const normalizeOutputItem = (outputObj: unknown): NormalizedOutput | null => {
  // normalizeOutputItem
  if (!outputObj || typeof outputObj !== "object") return null;

  const flatCandidate = outputObj as Record<string, unknown>;

  const hasAnyClassHint = "paramClass" in flatCandidate || "pointerClass" in flatCandidate || "_class" in flatCandidate;

  const looksLikeOutput =
    hasAnyClassHint &&
    ("info" in flatCandidate ||
      "name" in flatCandidate ||
      "outputName" in flatCandidate ||
      "value" in flatCandidate ||
      "parentId" in flatCandidate);

  if (looksLikeOutput) {
    const pointerClass =
      typeof flatCandidate.pointerClass === "string"
        ? flatCandidate.pointerClass
        : typeof flatCandidate._class === "string"
          ? (flatCandidate._class as string)
          : undefined;

    const rawParamClass = typeof flatCandidate.paramClass === "string" ? flatCandidate.paramClass : "";
    const inferredParamClass = rawParamClass || (pointerClass ? "PointerParam" : "");

    const normalized: NormalizedOutput = {
      name:
        typeof flatCandidate.outputName === "string"
          ? flatCandidate.outputName
          : typeof flatCandidate.name === "string"
            ? flatCandidate.name
            : undefined,
      info: typeof flatCandidate.info === "string" ? flatCandidate.info : undefined,
      paramClass: inferredParamClass,
      pointerClass,
      value: typeof flatCandidate.value === "string" ? flatCandidate.value : undefined,
      parentId:
        typeof flatCandidate.parentId === "string" || typeof flatCandidate.parentId === "number"
          ? flatCandidate.parentId
          : undefined,
    };

    return normalized.paramClass ? normalized : null;
  }

  const entries = Object.entries(flatCandidate);
  if (entries.length === 1) {
    const [wrappedName, wrappedValue] = entries[0];
    if (wrappedValue && typeof wrappedValue === "object") {
      const wrappedDef = wrappedValue as Record<string, unknown>;

      const hasAnyWrappedClassHint = "paramClass" in wrappedDef || "pointerClass" in wrappedDef || "_class" in wrappedDef;

      if (hasAnyWrappedClassHint) {
        const pointerClass =
          typeof wrappedDef.pointerClass === "string"
            ? wrappedDef.pointerClass
            : typeof wrappedDef._class === "string"
              ? (wrappedDef._class as string)
              : undefined;

        const rawParamClass = typeof wrappedDef.paramClass === "string" ? wrappedDef.paramClass : "";
        const inferredParamClass = rawParamClass || (pointerClass ? "PointerParam" : "");

        const normalized: NormalizedOutput = {
          name: wrappedName,
          info: typeof wrappedDef.info === "string" ? wrappedDef.info : undefined,
          paramClass: inferredParamClass,
          pointerClass,
          value: typeof wrappedDef.value === "string" ? wrappedDef.value : undefined,
          parentId:
            typeof wrappedDef.parentId === "string" || typeof wrappedDef.parentId === "number"
              ? wrappedDef.parentId
              : undefined,
        };

        return normalized.paramClass ? normalized : null;
      }
    }
  }

  return null;
};

const openDecisionUrl = (decision: AnalyzeViewerResolveDecision) => {
  // openDecisionUrl
  if (!decision || decision.handled !== true) return false;

  const url = decision.url;
  if (!url) return false;

  const target = decision.target ?? "_blank";

  if (target === "_self") {
    window.location.assign(url);
    return true;
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return true;
};

type ReactFlowSelectionEvent = ReactMouseEvent | ReactPointerEvent<HTMLDivElement>;

function uniqStrings(values: string[]): string[] {
  // uniqStrings
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function filterExistingTagIds(tagIds: string[], defs: ProtocolTag[]): string[] {
  // filterExistingTagIds
  const allowed = new Set(defs.map((t) => String(t.id)));
  return uniqStrings(tagIds).filter((id) => allowed.has(String(id)));
}

function normalizeTagIdCandidate(raw: unknown, allTags: ProtocolTag[]): string {
  // normalizeTagIdCandidate
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const byId = new Map(allTags.map((t) => [String(t.id), t]));
  if (byId.has(s)) return s;

  const lower = s.toLowerCase();
  const byTitle = new Map(allTags.map((t) => [String(t.title ?? "").trim().toLowerCase(), t]));
  const hit = byTitle.get(lower);
  return hit ? String(hit.id) : s;
}

function normalizeTagIdsFromRaw(rawTags: unknown, allTags: ProtocolTag[]): string[] {
  // normalizeTagIdsFromRaw
  if (!Array.isArray(rawTags)) return [];

  const out: string[] = [];

  for (const item of rawTags) {
    if (typeof item === "string" || typeof item === "number") {
      const id = normalizeTagIdCandidate(item, allTags);
      if (id) out.push(id);
      continue;
    }

    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const directId = obj.id ?? obj.tagId ?? obj.tag_id;
      if (directId != null) {
        const id = normalizeTagIdCandidate(directId, allTags);
        if (id) out.push(id);
        continue;
      }

      const titleCandidate = obj.title ?? obj.name ?? obj.label;
      if (titleCandidate != null) {
        const id = normalizeTagIdCandidate(titleCandidate, allTags);
        if (id) out.push(id);
      }
    }
  }

  return uniqStrings(out);
}

function normalizeTagIdsList(raw: unknown): string[] {
  // normalizeTagIdsList
  if (!Array.isArray(raw)) return [];
  return uniqStrings(
    raw
      .map((x) => String(x ?? "").trim())
      .filter((s) => s.length > 0),
  );
}

type TagAssignments = Record<string, Record<string, string[]>>;

type TagStoreApi = {
  tags?: ProtocolTag[];
  tagsById?: Map<string, ProtocolTag>;
  assignments?: TagAssignments;

  getAssignedTagIds?: (projectId: string | number | undefined, protocolId: string | number | undefined) => string[];
  setAssignedTagIds?: (
    projectId: string | number | undefined,
    protocolId: string | number | undefined,
    nextTagIds: string[],
  ) => void;
  setAssignedTagIdsBatch?: (updates: Array<{ projectId: string | number | undefined; protocolId: string; tagIds: string[] }>) => void;
};

function hasStoreAssignment(assignments: TagAssignments | undefined, projectId: unknown, protocolId: unknown): boolean {
  // hasStoreAssignment
  const p = String(projectId ?? "").trim();
  const pr = String(protocolId ?? "").trim();
  if (!p || !pr) return false;

  const byProject = assignments?.[p];
  if (!byProject) return false;

  return Object.prototype.hasOwnProperty.call(byProject, pr);
}

export default function ProtocolNodeCard({
  data,
  selectedNodeId,
  graphDirection = "TB",
  onClick,
  onDoubleClick,
  zoomLevel = 0.6,
  compactThreshold = 0.25,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  onRestartAll,
  onContinueAll,
  onResetFrom,
  onSelectFrom,
  onSelectTo,
  onStop,
  onBrowse,
  onManageTags,
  inPathSelection = false,
  pathSelectionActive = false,
  showHandles = true,
  service,
}: StatusNodeProps) {
  const svc = useProjectService();
  const svcRef = useRef(svc);
  useEffect(() => {
    // syncSvcRef
    svcRef.current = svc;
  }, [svc]);

  const [isHovered, setIsHovered] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const isSelected = selectedNodeId === data.id;

  const { setCurrentDraggedOutput } = useDrag();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const suppressNextMenuActionRef = useRef(false);

  const armSuppressNextMenuAction = useCallback(() => {
    // suppressNextMenuAction
    suppressNextMenuActionRef.current = true;

    window.setTimeout(() => {
      suppressNextMenuActionRef.current = false;
    }, 0);
  }, []);

  const contextMenuOpenedAtRef = useRef<number>(0);

  const armContextMenuOpenGuard = useCallback(() => {
    // armContextMenuOpenGuard
    contextMenuOpenedAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
  }, []);

  const isInContextMenuOpenGuardWindow = useCallback(() => {
    // isInContextMenuOpenGuardWindow
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    return now - contextMenuOpenedAtRef.current < 120;
  }, []);

  const runMenuAction = useCallback(
    (e: Event, fn?: () => void) => {
      // runMenuAction
      e.stopPropagation();

      // Do not preventDefault here, otherwise Radix will keep the menu open
      if (isInContextMenuOpenGuardWindow()) return;
      fn?.();
    },
    [isInContextMenuOpenGuardWindow],
  );

  const isProjectNode = data.id === "PROJECT";
  const isCompactView = zoomLevel <= compactThreshold;

  const bgColor = statusColors[data.status ?? "finished"] ?? statusColors.root;
  data.color = bgColor;

  const nodeStyle: React.CSSProperties = {
    backgroundColor: bgColor,
  };

  const classNames = [
    styles.card,
    styles.crispText,
    isHovered ? styles.hovered : "",
    isSelected ? styles.selected : "",
    inPathSelection ? styles.inPathSelection : "",
  ]
    .filter(Boolean)
    .join(" ");

  // tagStateFromStore (no selector args)
  const tagStore = useTagStore() as unknown as TagStoreApi;

  const allTags: ProtocolTag[] = Array.isArray(tagStore?.tags) ? (tagStore.tags as ProtocolTag[]) : [];

  const storeAssignments = tagStore?.assignments;
  const getAssignedTagIds = tagStore?.getAssignedTagIds;
  const setAssignedTagIds = tagStore?.setAssignedTagIds;
  const setAssignedTagIdsBatch = tagStore?.setAssignedTagIdsBatch;

  const normalizedProjectId = useMemo(() => {
    // normalizedProjectId
    const s = String(data.projectId ?? "").trim();
    if (!s || s === "null" || s === "undefined") return null;
    return data.projectId as Id;
  }, [data.projectId]);

  const normalizedProtocolId = useMemo(() => {
    // normalizedProtocolId
    const s = String(data.id ?? "").trim();
    if (!s || s === "null" || s === "undefined") return null;
    return data.id as Id;
  }, [data.id]);

  const backendAssignmentsWriteEnabled =
    normalizedProjectId != null &&
    normalizedProtocolId != null &&
    typeof (svcRef.current as any)?.setProtocolTagIds === "function";

  const storedAssigned: string[] =
    typeof getAssignedTagIds === "function"
      ? uniqStrings(getAssignedTagIds(data.projectId, data.id) ?? [])
      : [];

  const fromDataAssigned = useMemo(() => {
    // fromDataAssigned
    return normalizeTagIdsFromRaw((data as any)?.tags, allTags);
  }, [data, allTags]);

  const hasExplicitStoreAssignment = useMemo(() => {
    // hasExplicitStoreAssignment
    return hasStoreAssignment(storeAssignments, data.projectId, data.id);
  }, [storeAssignments, data.projectId, data.id]);

  useEffect(() => {
    // seedStoreAssignmentsFromNodeData
    if (isProjectNode) return;
    if (typeof setAssignedTagIds !== "function") return;

    // If the store does not have an explicit assignment yet, seed it from data.tags (once per protocol)
    if (!hasExplicitStoreAssignment) {
      const initial = uniqStrings(fromDataAssigned);
      if (initial.length > 0) {
        setAssignedTagIds(data.projectId, data.id, initial);
      } else {
        // We do not seed empty assignments to avoid marking protocols unnecessarily
      }
    }
  }, [
    data.id,
    data.projectId,
    fromDataAssigned,
    hasExplicitStoreAssignment,
    isProjectNode,
    setAssignedTagIds,
  ]);

  const effectiveAssignedTagIds = useMemo(() => {
    // effectiveAssignedTagIds
    // Critical: once the store has an explicit assignment, it overrides node data to make UI updates immediate
    if (hasExplicitStoreAssignment) return uniqStrings(storedAssigned);
    return uniqStrings(fromDataAssigned);
  }, [fromDataAssigned, hasExplicitStoreAssignment, storedAssigned]);

  const selectedTagIds = useMemo(() => {
    // selectedTagIds
    return filterExistingTagIds(effectiveAssignedTagIds, allTags);
  }, [effectiveAssignedTagIds, allTags]);

  useEffect(() => {
    // pruneOrphanAssignments
    if (isProjectNode) return;
    if (typeof setAssignedTagIds !== "function") return;
    if (allTags.length === 0) return;

    // If tags were deleted, remove orphan ids from store
    if (selectedTagIds.length !== effectiveAssignedTagIds.length) {
      setAssignedTagIds(data.projectId, data.id, selectedTagIds);

      if (backendAssignmentsWriteEnabled) {
        void svcRef.current
          .setProtocolTagIds(data.projectId as Id, data.id as Id, selectedTagIds)
          .catch(() => {
            // ignore
          });
      }
    }
  }, [
    allTags.length,
    backendAssignmentsWriteEnabled,
    data.id,
    data.projectId,
    effectiveAssignedTagIds,
    isProjectNode,
    selectedTagIds,
    setAssignedTagIds,
  ]);

  const selectedTagSet = useMemo(() => {
    // selectedTagSet
    return new Set(selectedTagIds.map((t) => String(t)));
  }, [selectedTagIds]);

  const tagsById = useMemo(() => {
    // tagsById
    return new Map(allTags.map((t) => [String(t.id), t]));
  }, [allTags]);

  const selectedTags = useMemo(() => {
    // selectedTags
    return selectedTagIds.map((id) => tagsById.get(String(id))).filter(Boolean) as ProtocolTag[];
  }, [selectedTagIds, tagsById]);

  const reactFlow = useReactFlow();

  type TagTarget = {
    protocolId: string;
    projectId: string | number | undefined;
    rawTags: unknown;
  };

  const getSelectedTagTargets = useCallback((): TagTarget[] => {
    // getSelectedTagTargets
    try {
      const nodes = reactFlow.getNodes?.() ?? [];
      const selectedNodes = nodes.filter((n) => (n as any)?.selected === true);

      const baseNodes = selectedNodes.length > 0 ? selectedNodes : nodes.filter((n) => String(n.id) === String(data.id));

      return baseNodes
        .filter((n) => String(n.id) !== "PROJECT")
        .map((n) => ({
          protocolId: String(n.id),
          projectId: (n as any)?.data?.projectId ?? data.projectId,
          rawTags: (n as any)?.data?.tags,
        }));
    } catch {
      return [
        {
          protocolId: String(data.id),
          projectId: data.projectId,
          rawTags: (data as any)?.tags,
        },
      ];
    }
  }, [reactFlow, data.id, data.projectId, data]);

  const getEffectiveAssignedForTarget = useCallback(
    (projectId: string | number | undefined, protocolId: string, rawTags: unknown): string[] => {
      // getEffectiveAssignedForTarget
      const storeHas = hasStoreAssignment(storeAssignments, projectId, protocolId);

      const stored =
        typeof getAssignedTagIds === "function" ? uniqStrings(getAssignedTagIds(projectId, protocolId) ?? []) : [];

      if (storeHas) return stored;

      const fromNode = normalizeTagIdsFromRaw(rawTags, allTags);
      return uniqStrings(fromNode);
    },
    [allTags, getAssignedTagIds, storeAssignments],
  );

  const toggleTagSelectionForSelection = useCallback(
    (tagId: string) => {
      // toggleTagSelectionForSelection
      if (isProjectNode) return;
      if (typeof setAssignedTagIds !== "function" && typeof setAssignedTagIdsBatch !== "function") return;

      const normalizedTagId = normalizeTagIdCandidate(tagId, allTags);
      if (!normalizedTagId) return;

      const targets = getSelectedTagTargets();
      if (targets.length === 0) return;

      const run = async () => {
        // run
        try {
          const currentByTarget = targets.map((t) => {
            // currentByTarget
            const current = getEffectiveAssignedForTarget(t.projectId, String(t.protocolId), t.rawTags);
            return { ...t, current };
          });

          const allHaveTag = currentByTarget.every((t) =>
            t.current.some((x) => String(x) === String(normalizedTagId)),
          );

          const updates = currentByTarget.map((t) => {
            const next = allHaveTag
              ? t.current.filter((x) => String(x) !== String(normalizedTagId))
              : uniqStrings([...t.current, normalizedTagId]);

            return {
              projectId: t.projectId,
              protocolId: String(t.protocolId),
              tagIds: next,
            };
          });

          // optimistic local update (this makes UI immediate)
          if (typeof setAssignedTagIdsBatch === "function") {
            setAssignedTagIdsBatch(updates);
          } else {
            for (const u of updates) {
              setAssignedTagIds?.(u.projectId, u.protocolId, u.tagIds);
            }
          }

          if (backendAssignmentsWriteEnabled) {
            await Promise.all(
              updates.map(async (u) => {
                await svcRef.current.setProtocolTagIds(u.projectId as Id, u.protocolId as Id, u.tagIds);
              }),
            );
          }
        } catch (e: any) {
          toast.error(typeof e?.message === "string" ? e.message : "Failed to update tags");
        }
      };

      void run();
    },
    [
      allTags,
      backendAssignmentsWriteEnabled,
      getEffectiveAssignedForTarget,
      getSelectedTagTargets,
      isProjectNode,
      setAssignedTagIds,
      setAssignedTagIdsBatch,
    ],
  );

  const handleManageTags = useCallback(() => {
    // openTagsManager
    if (isProjectNode) return;
    onManageTags?.(data.id, data.projectId, data.label);
  }, [data.id, data.projectId, data.label, isProjectNode, onManageTags]);

  const handleEdit = () => onEdit?.(data.id);
  const handleRename = () => onRename?.(data.id);
  const handleDuplicate = () => onDuplicate?.(data.id);
  const handleDelete = () => onDelete?.(data.id);
  const handleRestartAll = () => onRestartAll?.(data.id);
  const handleContinueAll = () => onContinueAll?.(data.id);
  const handleResetFrom = () => onResetFrom?.(data.id);

  const handleSelectFrom = () => {
    if (!isProjectNode) onSelectFrom?.(data.id);
  };

  const handleSelectTo = () => {
    if (!isProjectNode) onSelectTo?.(data.id);
  };

  const handleStop = () => {
    if (!isProjectNode) onStop?.(data.id);
  };

  const handleBrowse = () => {
    if (!isProjectNode) onBrowse?.(data.id, data.projectId, data.label);
  };

  const reduceMenus = pathSelectionActive || inPathSelection;

  const FromIcon = graphDirection === "TB" ? ArrowDown : ArrowRight;
  const ToIcon = graphDirection === "TB" ? ArrowUp : ArrowLeft;

  const forwardClickToRFNode = (e: ReactMouseEvent) => {
    // forwardClickToRFNode
    const doc = (e.target as HTMLElement | null)?.ownerDocument || document;
    const win = doc.defaultView || window;

    const nodeEl =
      (e.currentTarget as HTMLElement)?.closest(".react-flow__node") ??
      rootRef.current?.closest(".react-flow__node") ??
      doc.querySelector(`.react-flow__node[data-id="${CSS.escape(String(data.id))}"]`);

    if (!nodeEl) return;

    const opts: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: e.clientX,
      clientY: e.clientY,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      view: win,
    };

    nodeEl.dispatchEvent(new MouseEvent("pointerdown", opts));
    nodeEl.dispatchEvent(new MouseEvent("pointerup", opts));
    nodeEl.dispatchEvent(new MouseEvent("mousedown", opts));
    nodeEl.dispatchEvent(new MouseEvent("mouseup", opts));
    nodeEl.dispatchEvent(new MouseEvent("click", opts));
  };

  const getReactFlowNodeElement = useCallback(
    (e: ReactFlowSelectionEvent) => {
      // getReactFlowNodeElement
      const doc = (e.target as HTMLElement | null)?.ownerDocument || document;

      const nodeEl =
        (e.currentTarget as HTMLElement | null)?.closest(".react-flow__node") ??
        rootRef.current?.closest(".react-flow__node") ??
        doc.querySelector(`.react-flow__node[data-id="${CSS.escape(String(data.id))}"]`);

      return nodeEl as HTMLElement | null;
    },
    [data.id],
  );

  const isReactFlowNodeCurrentlySelected = useCallback(
    (e: ReactFlowSelectionEvent) => {
      // isReactFlowNodeCurrentlySelected
      const nodeEl = getReactFlowNodeElement(e);
      if (!nodeEl) return false;
      return nodeEl.classList.contains("selected");
    },
    [getReactFlowNodeElement],
  );

  const selectNodeExclusivelyInReactFlow = useCallback(
    (e: ReactFlowSelectionEvent) => {
      // selectNodeExclusivelyInReactFlow
      const doc = (e.target as HTMLElement | null)?.ownerDocument || document;
      const win = doc.defaultView || window;

      const nodeEl = getReactFlowNodeElement(e);
      if (!nodeEl) return;

      const clientX = (e as any).clientX ?? 0;
      const clientY = (e as any).clientY ?? 0;

      const opts: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        view: win,
      };

      nodeEl.dispatchEvent(new MouseEvent("pointerdown", opts));
      nodeEl.dispatchEvent(new MouseEvent("pointerup", opts));
      nodeEl.dispatchEvent(new MouseEvent("mousedown", opts));
      nodeEl.dispatchEvent(new MouseEvent("mouseup", opts));
      nodeEl.dispatchEvent(new MouseEvent("click", opts));
    },
    [getReactFlowNodeElement],
  );

  const ensureRightClickSelectionIsUnambiguous = useCallback(
    (e: ReactFlowSelectionEvent) => {
      // ensureRightClickSelectionIsUnambiguous
      const alreadySelected = isReactFlowNodeCurrentlySelected(e);
      if (alreadySelected) return;
      selectNodeExclusivelyInReactFlow(e);
    },
    [isReactFlowNodeCurrentlySelected, selectNodeExclusivelyInReactFlow],
  );

  const truncateLabel = (text: string = "", max: number = 120) => (text.length > max ? `${text.slice(0, max)}…` : text);

  const outputsArray = Array.isArray(data.outputs) ? data.outputs : [];
  const hasOutputs = outputsArray.length > 0;

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  const handleContextMenuCapture = useCallback(
    (e: ReactMouseEvent) => {
      // handleContextMenuCapture
      armSuppressNextMenuAction();

      // On macOS Ctrl+Click is treated as a secondary click (context menu).
      // We block it so Ctrl can be used for multi-selection in ReactFlow.
      if (isMac && e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // If user right-clicks a non-selected node, make it the only selection.
      ensureRightClickSelectionIsUnambiguous(e);
    },
    [isMac, armSuppressNextMenuAction, ensureRightClickSelectionIsUnambiguous],
  );

  const mod = isMac ? "⌘" : "Ctrl";
  const modShift = isMac ? "⌘⇧" : "Ctrl+Shift";

  const shortcuts = {
    edit: "Space / Db-Click",
    browse: `${mod} + B`,
    rename: "F2",
    delete: "Del",
    duplicate: `${mod} + D`,
    restartAll: `${modShift} + R`,
    continueAll: `${modShift} + C`,
    resetFrom: `${modShift} + F`,
    stop: `${modShift} + S`,
    selectFrom: "Alt + ↓",
    selectTo: "Alt + ↑",
  } as const;

  const ShortcutHint = ({ text }: { text?: string }) => (text ? <span className={styles.shortcutHint}>{text}</span> : null);

  const shouldRenderProtocolBody = !isProjectNode;
  const isContentExpanded = !isCompactView;

  const contentClassName = [styles.content, isContentExpanded ? styles.contentExpanded : styles.contentCollapsed].join(" ");

  const contentStyle: React.CSSProperties = {
    opacity: isContentExpanded ? 1 : 0,
    transition: "max-height 520ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 260ms ease-in-out",
    willChange: "max-height, opacity",
  };

  // Output viewer state
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeTarget, setAnalyzeTarget] = useState<{
    outputName: string;
    outputRaw: any;
  } | null>(null);

  const analyzeProjectId = useMemo(() => {
    const n = Number(data.projectId);
    return Number.isFinite(n) ? n : 0;
  }, [data.projectId]);

  const analyzeProtocolId = useMemo(() => {
    const n = Number(data.id);
    return Number.isFinite(n) ? n : 0;
  }, [data.id]);

  const canOpenViewer = !isProjectNode && data.projectId != null;

  const openOutputViewer = useCallback(
    async (outputName: string, outputRaw: any, normalized?: NormalizedOutput | null) => {
      // openOutputViewerWithBackendResolve
      if (!canOpenViewer) return;

      const maybeResolve = service?.resolveAnalyzeViewer;
      if (typeof maybeResolve === "function") {
        try {
          const ctx: AnalyzeViewerResolveContext = {
            projectId: data.projectId as string | number,
            protocolId: data.id,
            protocolLabel: data.label,
            outputName,
            pointerClass: normalized?.pointerClass,
            paramClass: normalized?.paramClass,
            info: normalized?.info,
            value: normalized?.value,
            parentId: normalized?.parentId as any,
          };

          const decision = await maybeResolve(ctx);
          if (decision?.handled === true) {
            const opened = openDecisionUrl(decision);
            if (opened) return; // handledByExternalViewer
          }
        } catch {
          // ignoreResolveErrorsAndFallbackToInternal
        }
      }

      setAnalyzeTarget({ outputName, outputRaw });
      setAnalyzeOpen(true);
    },
    [canOpenViewer, data.projectId, data.id, data.label, service],
  );

  return (
    <ContextMenu
      onOpenChange={(open) => {
        // onContextMenuOpenChange
        if (open) armContextMenuOpenGuard();
      }}
    >
      <ContextMenuTrigger asChild>
        <div
          ref={rootRef}
          className={classNames}
          style={nodeStyle}
          onContextMenuCapture={handleContextMenuCapture}
          onPointerDownCapture={(e: ReactPointerEvent<HTMLDivElement>) => {
            // suppressMenuMouseUpSelectingFirstItem
            if (e.button === 2) {
              ensureRightClickSelectionIsUnambiguous(e);
              armSuppressNextMenuAction();
            }
          }}
          onClick={(e) => {
            // avoidClickSideEffectsAfterContextMenuOpen
            if (suppressNextMenuActionRef.current) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onClick?.(e);
            if ((e as any).button === 2) armContextMenuOpenGuard();
          }}
          onDoubleClick={(e: ReactMouseEvent) => {
            e.stopPropagation();
            onDoubleClick?.();
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className={[styles.header, isProjectNode ? styles.headerProject : styles.headerProtocol].join(" ")}>
            <div className={styles.headerLeft}>
              {!isProjectNode && (
                <div
                  className={[styles.nodeIdBadge, data.status === "running" ? styles.glowBadge : ""].filter(Boolean).join(" ")}
                  style={isCompactView ? { fontSize: "2.4rem" } : { fontSize: "2.3rem" }}
                >
                  <span>{data.id}</span>
                </div>
              )}

              {isProjectNode ? (
                <div className={styles.projectLabelWrapper} style={isCompactView ? { fontSize: "2.8rem" } : {}}>
                  <div title={data.label}>{truncateLabel(data.label, 120)}</div>
                </div>
              ) : (
                <div
                  className={[styles.label, isCompactView ? styles.labelCompact : ""].filter(Boolean).join(" ")}
                  title={data.label}
                >
                  {truncateLabel(data.label, 120)}
                </div>
              )}
            </div>

            {!isProjectNode && (
              <div className={styles.headerRight}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`${styles.iconButton} nodrag`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      draggable={false}
                      data-nodrag
                      aria-label="Open node menu"
                    >
                      <MoreHorizontal className={styles.menuIcon} />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent className={styles.menuContent} onClick={(e) => e.stopPropagation()}>
                    {!reduceMenus && (
                      <>
                        <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleEdit)}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <Pencil className={styles.menuItemIcon} />
                              <span>Edit</span>
                            </span>
                            <ShortcutHint text={shortcuts.edit} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleBrowse)}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <FolderOpen className={styles.menuItemIcon} />
                              <span>Browse</span>
                            </span>
                            <ShortcutHint text={shortcuts.browse} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleRename)}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <Pencil className={styles.menuItemIcon} />
                              <span>Rename</span>
                            </span>
                            <ShortcutHint text={shortcuts.rename} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleSelectFrom)}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <FromIcon className={styles.menuItemIcon} />
                              <span>Select from</span>
                            </span>
                            <ShortcutHint text={shortcuts.selectFrom} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleSelectTo)}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <ToIcon className={styles.menuItemIcon} />
                              <span>Select to</span>
                            </span>
                            <ShortcutHint text={shortcuts.selectTo} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        {(data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
                          <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleStop)}>
                            <div className={styles.menuRow}>
                              <span className={styles.menuLeft}>
                                <Square className={styles.menuItemIcon} />
                                <span>Stop</span>
                              </span>
                              <ShortcutHint text={shortcuts.stop} />
                            </div>
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleRestartAll)}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <RefreshCw className={styles.menuItemIcon} />
                              <span>Restart all</span>
                            </span>
                            <ShortcutHint text={shortcuts.restartAll} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleContinueAll)}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <Play className={styles.menuItemIcon} />
                              <span>Continue all</span>
                            </span>
                            <ShortcutHint text={shortcuts.continueAll} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleResetFrom)}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <RotateCcw className={styles.menuItemIcon} />
                              <span>Reset from</span>
                            </span>
                            <ShortcutHint text={shortcuts.resetFrom} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                      </>
                    )}

                    {reduceMenus && (data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
                      <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleStop)}>
                        <div className={styles.menuRow}>
                          <span className={styles.menuLeft}>
                            <Square className={styles.menuItemIcon} />
                            <span>Stop selection</span>
                          </span>
                          <ShortcutHint text={shortcuts.stop} />
                        </div>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleDelete)}>
                      <div className={styles.menuRow}>
                        <span className={styles.menuLeft}>
                          <Trash2 className={styles.menuItemIcon} />
                          <span>Delete</span>
                        </span>
                        <ShortcutHint text={shortcuts.delete} />
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleDuplicate)}>
                      <div className={styles.menuRow}>
                        <span className={styles.menuLeft}>
                          <Copy className={styles.menuItemIcon} />
                          <span>Duplicate</span>
                        </span>
                        <ShortcutHint text={shortcuts.duplicate} />
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <div className={styles.menuRow}>
                          <span className={styles.menuLeft}>
                            <Tags className={styles.menuItemIcon} />
                            <span>Tags</span>
                          </span>
                        </div>
                      </DropdownMenuSubTrigger>

                      <DropdownMenuSubContent className={styles.menuContent} sideOffset={8}>
                        <DropdownMenuItem onSelect={(e) => runMenuAction(e, handleManageTags)}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <Plus className={styles.menuItemIcon} />
                              <span>Add new tag</span>
                            </span>
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        {allTags.length > 0 ? (
                          allTags.map((tag) => {
                            const isChecked = selectedTagSet.has(String(tag.id));
                            return (
                              <DropdownMenuItem
                                key={String(tag.id)}
                                onSelect={(e) => {
                                  // toggleTagSelectionKeepMenuOpen
                                  e.preventDefault();
                                  runMenuAction(e, () => toggleTagSelectionForSelection(String(tag.id)));
                                }}
                              >
                                <div className={styles.menuRow}>
                                  <span className={styles.menuLeft}>
                                    <span
                                      style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: 999,
                                        backgroundColor: tag.color,
                                        border: "1px solid rgba(15,23,42,0.22)",
                                        display: "inline-block",
                                        marginRight: 8,
                                      }}
                                    />
                                    <span>{tag.title}</span>
                                  </span>

                                  <span className={styles.menuRight}>
                                    {isChecked ? <Check className={styles.menuCheckIcon} /> : <span className={styles.menuCheckPlaceholder} />}
                                  </span>
                                </div>
                              </DropdownMenuItem>
                            );
                          })
                        ) : (
                          <DropdownMenuItem disabled>
                            <div className={styles.menuRow}>
                              <span className={styles.menuLeft}>
                                <span>No tags defined</span>
                              </span>
                            </div>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuItem>
                      <div className={styles.menuRow}>
                        <span className={styles.menuLeft}>
                          <FileUp className={styles.menuItemIcon} />
                          <span>Export</span>
                        </span>
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuItem>
                      <div className={styles.menuRow}>
                        <span className={styles.menuLeft}>
                          <Upload className={styles.menuItemIcon} />
                          <span>Export & upload</span>
                        </span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  type="button"
                  className={`${styles.iconButton} nodrag`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit();
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  draggable={false}
                  data-nodrag
                  aria-label="Edit protocol"
                >
                  <Scan className={styles.scanIcon} />
                </button>
              </div>
            )}
          </div>

          {isContentExpanded && selectedTags.length > 0 ? (
            <div className={styles.footerTagsRow} aria-label="Protocol tags">
              <Tags className={styles.tagsRowIcon} aria-hidden="true" />
              <div className={styles.tagsChipsWrap}>
                {selectedTags.map((t) => (
                  <span
                    key={String(t.id)}
                    className={styles.tagChip}
                    title={(t as any)?.description || t.title}
                    style={{ backgroundColor: t.color || "#9ca3af" }}
                  >
                    <span className={styles.tagChipText}>{t.title}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {shouldRenderProtocolBody && (
            <div className={contentClassName} style={contentStyle} aria-hidden={!isContentExpanded}>
              <div className={styles.cardContent}>
                <div className={styles.outputsReserved}>
                  {hasOutputs ? (
                    <div className={styles.outputsList}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Outputs</span>
                      </div>

                      <div className={styles.sectionContent} data-has-scroll>
                        {outputsArray.map((outputObj, idx) => {
                          const value = normalizeOutputItem(outputObj);
                          if (!value) return null;

                          const isDragging = draggingIdx === idx;

                          const labelText = value.info ?? value.name ?? value.pointerClass ?? value.paramClass ?? "Output";
                          const pillKey = value.value ?? `${String(value.parentId ?? "")}:${String(value.name ?? idx)}`;

                          const outputName = String(value.name ?? "");
                          const isViewerEnabled = canOpenViewer && !!outputName;

                          return (
                            <div
                              key={pillKey}
                              className={[styles.outputPill, isDragging ? styles.outputPillDragging : "", "nodrag"]
                                .filter(Boolean)
                                .join(" ")}
                              draggable
                              onMouseDown={(e: ReactMouseEvent<HTMLDivElement>) => {
                                if (e.ctrlKey || e.metaKey) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  forwardClickToRFNode(e);
                                }
                              }}
                              onClick={(e: ReactMouseEvent<HTMLDivElement>) => {
                                e.preventDefault();
                                e.stopPropagation();
                                forwardClickToRFNode(e);
                              }}
                              onDragStart={(e: ReactDragEvent<HTMLDivElement>) => {
                                e.stopPropagation();
                                setDraggingIdx(idx);

                                const inferredParamClass = value.paramClass || (value.pointerClass ? "PointerParam" : "");

                                const output = {
                                  paramClass: inferredParamClass,
                                  pointerClass: value.pointerClass ?? "",
                                  _expectedClass: value.pointerClass ?? "",
                                  value: value.value ?? "",
                                  info: value.info ?? "",
                                  parentId: value.parentId ?? "",
                                  name: value.name ?? "",
                                };

                                setCurrentDraggedOutput(output);
                                e.dataTransfer.setData("application/scipion-output", JSON.stringify(output));

                                const ghost = document.createElement("div");
                                ghost.style.position = "absolute";
                                ghost.style.top = "-1000px";
                                ghost.style.left = "-1000px";
                                ghost.style.padding = "6px 12px";
                                ghost.style.background = "white";
                                ghost.style.border = "1px solid #ccc";
                                ghost.style.color = "black";
                                ghost.style.borderRadius = "0.5rem";
                                ghost.innerText = `(${labelText})`;
                                document.body.appendChild(ghost);
                                e.dataTransfer.setDragImage(ghost, 0, 15);
                                setTimeout(() => document.body.removeChild(ghost), 0);
                              }}
                              onDragEnd={() => {
                                setDraggingIdx(null);
                                setCurrentDraggedOutput(null);
                              }}
                            >
                              <ArrowUpRight className={styles.outputIcon} />
                              <span className={styles.outputText}>{labelText}</span>

                              <button
                                type="button"
                                className={`${styles.outputActionBtn} nodrag`}
                                draggable={false}
                                data-nodrag
                                aria-label="View output"
                                title={isViewerEnabled ? "View output" : "Viewer not available"}
                                onPointerDown={(e) => {
                                  // preventDragStartFromViewerButton
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onMouseDown={(e) => {
                                  // preventDragStartFromViewerButtonMouse
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  // openViewerWithBackendResolve
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!isViewerEnabled) return;
                                  void openOutputViewer(outputName, outputObj, value);
                                }}
                                disabled={!isViewerEnabled}
                              >
                                <Eye className={styles.outputEyeIcon} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.outputsPlaceholder} aria-hidden="true" />
                  )}
                </div>
              </div>

              {data.status && (
                <div className={styles.footer}>
                  <div className={styles.footerTopRow}>
                    <span
                      className={styles.statusBadge}
                      style={{
                        backgroundColor: statusBadgeColors[data.status] || "#999",
                      }}
                    >
                      {data.status}

                      {(data.status === "running" || data.status === "failed" || data.status === "aborted") && (
                        <span className={styles.progress}>
                          <span className={styles.progressTrack}>
                            <span
                              className={styles.progressFill}
                              style={{
                                width: `${((data.stepsDone ?? 0) / (data.numberOfSteps ?? 1)) * 100}%`,
                              }}
                            />
                          </span>
                          <span className={styles.progressText}>
                            {data.stepsDone}/{data.numberOfSteps}
                          </span>
                        </span>
                      )}
                    </span>

                    <span className={styles.timeRow}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={styles.timeIcon}
                        fill="none"
                        viewBox="0 0 22 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>{formatCpuTime(data.tick ?? Number(data.elapsedTime) ?? 0)}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {showHandles && (
            <>
              <Handle
                type="target"
                position={graphDirection === "TB" ? Position.Top : Position.Left}
                style={graphDirection === "TB" ? {} : { top: "50%", transform: "translateY(-50%)" }}
              />
              <Handle
                type="source"
                position={graphDirection === "TB" ? Position.Bottom : Position.Right}
                style={graphDirection === "TB" ? {} : { top: "50%", transform: "translateY(-50%)" }}
              />
            </>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent
        className={styles.menuContent}
        style={{ marginLeft: 8, marginTop: 8 }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {!reduceMenus && (
          <>
            <ContextMenuItem onClick={handleEdit}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <Pencil className={styles.menuItemIcon} />
                  <span>Edit</span>
                </span>
                <ShortcutHint text={shortcuts.edit} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleBrowse}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <FolderOpen className={styles.menuItemIcon} />
                  <span>Browse</span>
                </span>
                <ShortcutHint text={shortcuts.browse} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleRename}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <Pencil className={styles.menuItemIcon} />
                  <span>Rename</span>
                </span>
                <ShortcutHint text={shortcuts.rename} />
              </div>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={handleSelectFrom}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <FromIcon className={styles.menuItemIcon} />
                  <span>Select from</span>
                </span>
                <ShortcutHint text={shortcuts.selectFrom} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleSelectTo}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <ToIcon className={styles.menuItemIcon} />
                  <span>Select to</span>
                </span>
                <ShortcutHint text={shortcuts.selectTo} />
              </div>
            </ContextMenuItem>

            <ContextMenuSeparator />

            {(data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
              <ContextMenuItem onClick={handleStop}>
                <div className={styles.menuRow}>
                  <span className={styles.menuLeft}>
                    <Square className={styles.menuItemIcon} />
                    <span>Stop</span>
                  </span>
                  <ShortcutHint text={shortcuts.stop} />
                </div>
              </ContextMenuItem>
            )}

            <ContextMenuItem onClick={handleRestartAll}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <RefreshCw className={styles.menuItemIcon} />
                  <span>Restart all</span>
                </span>
                <ShortcutHint text={shortcuts.restartAll} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleContinueAll}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <Play className={styles.menuItemIcon} />
                  <span>Continue all</span>
                </span>
                <ShortcutHint text={shortcuts.continueAll} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleResetFrom}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <RotateCcw className={styles.menuItemIcon} />
                  <span>Reset from</span>
                </span>
                <ShortcutHint text={shortcuts.resetFrom} />
              </div>
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        )}

        {reduceMenus && (data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
          <ContextMenuItem onClick={handleStop}>
            <div className={styles.menuRow}>
              <span className={styles.menuLeft}>
                <Square className={styles.menuItemIcon} />
                <span>Stop selection</span>
              </span>
              <ShortcutHint text={shortcuts.stop} />
            </div>
          </ContextMenuItem>
        )}

        <ContextMenuItem onClick={handleDelete}>
          <div className={styles.menuRow}>
            <span className={styles.menuLeft}>
              <Trash2 className={styles.menuItemIcon} />
              <span>Delete</span>
            </span>
            <ShortcutHint text={shortcuts.delete} />
          </div>
        </ContextMenuItem>

        <ContextMenuItem onClick={handleDuplicate}>
          <div className={styles.menuRow}>
            <span className={styles.menuLeft}>
              <Copy className={styles.menuItemIcon} />
              <span>Duplicate</span>
            </span>
            <ShortcutHint text={shortcuts.duplicate} />
          </div>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <div className={styles.menuRow}>
              <span className={styles.menuLeft}>
                <Tags className={styles.menuItemIcon} />
                <span>Tags</span>
              </span>
            </div>
          </ContextMenuSubTrigger>

          <ContextMenuSubContent className={styles.menuContent} sideOffset={8}>
            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleManageTags();
              }}
            >
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <Plus className={styles.menuItemIcon} />
                  <span>Add new tag</span>
                </span>
              </div>
            </ContextMenuItem>

            <ContextMenuSeparator />

            {allTags.length > 0 ? (
              allTags.map((tag) => {
                const isChecked = selectedTagSet.has(String(tag.id));
                return (
                  <ContextMenuItem
                    key={String(tag.id)}
                    onSelect={(e: any) => {
                      // toggleTagSelectionKeepMenuOpen
                      e.preventDefault();
                      e.stopPropagation();
                      toggleTagSelectionForSelection(String(tag.id));
                    }}
                  >
                    <div className={styles.menuRow}>
                      <span className={styles.menuLeft}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            backgroundColor: tag.color,
                            border: "1px solid rgba(15,23,42,0.22)",
                            display: "inline-block",
                            marginRight: 8,
                          }}
                        />
                        <span>{tag.title}</span>
                      </span>

                      <span className={styles.menuRight}>
                        {isChecked ? <Check className={styles.menuCheckIcon} /> : <span className={styles.menuCheckPlaceholder} />}
                      </span>
                    </div>
                  </ContextMenuItem>
                );
              })
            ) : (
              <ContextMenuItem disabled>
                <div className={styles.menuRow}>
                  <span className={styles.menuLeft}>
                    <span>No tags defined</span>
                  </span>
                </div>
              </ContextMenuItem>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem>
          <div className={styles.menuRow}>
            <span className={styles.menuLeft}>
              <FileUp className={styles.menuItemIcon} />
              <span>Export</span>
            </span>
          </div>
        </ContextMenuItem>

        <ContextMenuItem>
          <div className={styles.menuRow}>
            <span className={styles.menuLeft}>
              <Upload className={styles.menuItemIcon} />
              <span>Export & upload</span>
            </span>
          </div>
        </ContextMenuItem>
      </ContextMenuContent>

      {canOpenViewer && analyzeOpen && analyzeTarget ? (
        <AnalyzeOutputDialog
          open
          onClose={() => {
            // closeAnalyzeDialog
            setAnalyzeOpen(false);
            setAnalyzeTarget(null);
          }}
          projectId={analyzeProjectId}
          protocolId={analyzeProtocolId}
          protocolLabel={data.label}
          outputName={analyzeTarget.outputName}
          outputRaw={analyzeTarget.outputRaw}
        />
      ) : null}
    </ContextMenu>
  );
}
