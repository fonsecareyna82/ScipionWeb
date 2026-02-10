import "./ProjectPage.css";
import { useParams } from "react-router-dom";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  JSX
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
  MarkerType,
  MiniMap,
} from "reactflow";
import "reactflow/dist/style.css";
import { createStatusNodeWrapper } from "../../../components/protocol/ProtocolNodeCardWrapper";
import { ProtocolsDrawer } from "@/components/protocol/ProtocolsDrawer";
import { ProjectWorkflowsPanel, ProjectWorkflow } from "@/components/projects/workflows-panel";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog/dialog";

import { Button } from "@/components/ui/button";

import {
  MinusIcon,
  PlusIcon,
  RefreshCw,
  XCircle,
  LayoutGrid,
  MapIcon,
  FocusIcon,
  TagsIcon
} from "lucide-react";
import { FitViewIcon, TableIcon, TreeIcon } from "../../../icons";

import { useProjectService } from "@/ProjectServiceContext";
import { Project } from "@/types/project";
import Label from "@/components/form/Label";
import { Input, Typography, Link } from "@mui/material";
import toast from "react-hot-toast";
import RemoteFileDialog from "@/components/files/RemoteFileDialog";
import type { ExternalAnalyzeViewerService } from "@/components/protocol/ProtocolNodeCard";

import TagPicker from "@/components/tags/TagPicker";
import TagManager from "@/components/tags/TagManager";
import type { ProtocolTag } from "@/components/tags/tagTypes";
import TagsDialog from "@/components/tags/TagsDialog";


/* --------------------- Types --------------------- */
interface StatusNodeData {
  label: string;
  title: string;
  status?: string;
  id: string;

  // Used by ProtocolNodeCard
  projectId?: string | number;
  outputs?: unknown[];
  inputs?: unknown[];

  // Progress/timing
  cpuTime?: string;
  elapsedTime?: string;
  tick?: number;
  numberOfSteps?: number;
  stepsDone?: number;

  // Selection/path
  parents?: string[];
  children?: string[];
  __pathVer?: number;

  // Optional color cache
  color?: string;
  tagIds?: string[];
}

interface ContextMenuState {
  visible: boolean;
  x: number; // pane-relative
  y: number; // pane-relative
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
  onManageTags?: () => void;
};

type OpenForm = { key: string; id: string; details: any; isClosing?: boolean };

type SearchResult = { id: string; label: string; status?: string };

type ProtocolHelpState = {
  open: boolean;
  title: string;
  text: string;
  loading: boolean;
  error: string | null;
};

function normalizeHelpText(raw: unknown): string {
  // normalizeHelpText
  return String(raw ?? "").replace(/\\n/g, "\n");
}

function sanitizeHref(rawUrl: string): string {
  // sanitizeHref
  let hrefToken = String(rawUrl ?? "").trim();
  while (/[.,;:!?)]$/.test(hrefToken)) hrefToken = hrefToken.slice(0, -1);
  if (!hrefToken) return "";
  if (hrefToken.startsWith("http://") || hrefToken.startsWith("https://")) return hrefToken;
  return `https://${hrefToken}`;
}

function parseOrgLinkToken(token: string): { href: string; label: string } | null {
  // parseOrgLinkToken
  const orgRegex = /^\[\[([^\]]+)\](?:\[([^\]]+)\])?\]$/;
  const match = orgRegex.exec(token);
  if (!match) return null;

  const rawUrl = match[1] ?? "";
  const rawLabel = match[2];

  const href = sanitizeHref(rawUrl);
  if (!href) return null;

  return { href, label: String(rawLabel ?? rawUrl) };
}

function extractHelpText(payload: unknown): string | null {
  // extractHelpText
  if (payload == null) return null;
  if (typeof payload === "string") return payload;

  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;

    const directCandidates = [
      obj.help,
      obj.helpText,
      obj.doc,
      obj.documentation,
      obj.description,
      obj._help,
      obj._doc,
    ];

    for (const v of directCandidates) {
      if (typeof v === "string" && v.trim().length > 0) return v;
    }

    // backendShapeSupport: { form: { help: "..." } }
    const nestedCandidates = [obj.form, obj.protocol, obj.data, obj.result, obj.payload];

    for (const nested of nestedCandidates) {
      const found = extractHelpText(nested);
      if (found) return found;
    }
  }

  return null;
}

function sanitizeUrlToken(token: string): { display: string; href: string } {
  // sanitizeUrlToken
  const display = token;

  let hrefToken = token;
  while (/[.,;:!?)]$/.test(hrefToken)) {
    hrefToken = hrefToken.slice(0, -1);
  }

  const href = sanitizeHref(hrefToken);
  return { display, href };
}

function renderBoldInline(text: string, keyPrefix: string): Array<JSX.Element | string> {
  // renderBoldInline
  const parts: Array<JSX.Element | string> = [];
  const boldRegex = /\*[^*]+\*/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let segIndex = 0;

  while ((match = boldRegex.exec(text)) !== null) {
    const token = match[0];
    const start = match.index;

    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }

    const boldText = token.slice(1, -1);
    parts.push(<strong key={`${keyPrefix}-b-${segIndex++}`}>{boldText}</strong>);

    lastIndex = boldRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function renderHelpText(helpText: string): JSX.Element {
  // renderHelpText
  const normalized = normalizeHelpText(helpText);
  const lines = normalized.split("\n");

  const tokenPattern =
    /(\[\[[^\]]+\](?:\[[^\]]+\])?\]|\*[^*]+\*|https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)/g;

  const renderLine = (line: string, lineIndex: number) => {
    // renderLine
    const parts: JSX.Element[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyIndex = 0;

    const tokenRegex = new RegExp(tokenPattern.source, "g");

    while ((match = tokenRegex.exec(line)) !== null) {
      const token = match[0];
      const start = match.index;

      if (start > lastIndex) {
        const text = line.slice(lastIndex, start);
        parts.push(<span key={`t-${lineIndex}-${keyIndex++}`}>{text}</span>);
      }

      if (token.startsWith("[[")) {
        const orgLink = parseOrgLinkToken(token);

        if (orgLink) {
          const linkKey = `ol-${lineIndex}-${keyIndex++}`;
          parts.push(
            <Link
              key={linkKey}
              href={orgLink.href}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ wordBreak: "break-word", fontWeight: 600 }}
            >
              {renderBoldInline(orgLink.label, linkKey)}
            </Link>
          );
        } else {
          parts.push(<span key={`ot-${lineIndex}-${keyIndex++}`}>{token}</span>);
        }
      } else if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
        const boldText = token.slice(1, -1);
        parts.push(<strong key={`b-${lineIndex}-${keyIndex++}`}>{boldText}</strong>);
      } else {
        const { display, href } = sanitizeUrlToken(token);

        if (!href) {
          parts.push(<span key={`u-${lineIndex}-${keyIndex++}`}>{display}</span>);
        } else {
          parts.push(
            <Link
              key={`l-${lineIndex}-${keyIndex++}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ wordBreak: "break-word" }}
            >
              {display}
            </Link>
          );
        }
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push(<span key={`t-${lineIndex}-${keyIndex++}`}>{line.slice(lastIndex)}</span>);
    }

    return parts;
  };

  return (
    <Typography
      variant="body2"
      component="div"
      sx={{
        lineHeight: 1.6,
        mt: 2,
        whiteSpace: "normal",
        wordBreak: "break-word",
      }}
    >
      {lines.map((line, i) => (
        <span key={`hl-${i}`}>
          {renderLine(line, i)}
          {i < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </Typography>
  );
}


// Tags

const tagsStorageKey = "scipion.tags.v2";
const tagsCatalogStorageKey = tagsStorageKey;

type ProtocolTagAssignments = Record<string, string[]>;

// tagsStorageV2Shape: { version, updatedAt, tags: ProtocolTag[], assignments: { [projectKey]: { [protocolId]: string[] } } }
type TagsStorageV2 = {
  version?: number;
  updatedAt?: number;
  tags?: unknown;
  assignments?: unknown;
};

function safeParseJsonValue<T = unknown>(raw: string | null): T | null {
  // safeParseJsonValue
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeTagIds(raw: unknown): string[] {
  // normalizeTagIds
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];

  const ids = arr
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object" && typeof (x as any).id === "string") return String((x as any).id);
      return "";
    })
    .map((s) => s.trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function normalizeProtocolTagAssignments(raw: unknown): ProtocolTagAssignments {
  // normalizeProtocolTagAssignments
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ProtocolTagAssignments = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[String(k)] = normalizeTagIds(v);
  }
  return out;
}

function looksLikeFlatAssignments(raw: unknown): boolean {
  // looksLikeFlatAssignments
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const values = Object.values(raw as Record<string, unknown>);
  return values.some((v) => Array.isArray(v) || typeof v === "string");
}

function uniqueNonEmptyStrings(items: unknown[]): string[] {
  // uniqueNonEmptyStrings
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const s = String(it ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function loadTagsCatalogFromStorage(): ProtocolTag[] {
  // loadTagsCatalogFromStorage
  if (typeof window === "undefined") return [];

  const parsed = safeParseJsonValue<TagsStorageV2 | unknown>(localStorage.getItem(tagsCatalogStorageKey));

  // legacyArraySupport: scipion.tags.v1 could have been ProtocolTag[]
  if (Array.isArray(parsed)) return parsed as ProtocolTag[];

  // v2ShapeSupport: { tags: [...] }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).tags)) {
    return (parsed as any).tags as ProtocolTag[];
  }

  return [];
}

function loadTagsFromStorage(): ProtocolTag[] {
  // loadTagsFromStorage
  return loadTagsCatalogFromStorage();
}

function saveTagsToStorage(tags: ProtocolTag[]): void {
  // saveTagsToStorage
  try {
    if (typeof window === "undefined") return;

    const prev = safeParseJsonValue<TagsStorageV2>(localStorage.getItem(tagsStorageKey));
    const prevAssignments =
      prev && typeof prev === "object" && prev.assignments && typeof prev.assignments === "object" && !Array.isArray(prev.assignments)
        ? prev.assignments
        : {};

    const nextPayload = {
      version: 2,
      updatedAt: Date.now(),
      tags: Array.isArray(tags) ? tags : [],
      assignments: prevAssignments,
    };

    localStorage.setItem(tagsStorageKey, JSON.stringify(nextPayload));

    // notifySameTabListeners
    window.dispatchEvent(new Event("scipionTagsChanged"));
  } catch {
    // ignoreStorageErrors
  }
}

function readAssignmentsFromTagsStoreV2(projectKeys: string[]): ProtocolTagAssignments | null {
  // readAssignmentsFromTagsStoreV2
  if (typeof window === "undefined") return null;

  const keys = uniqueNonEmptyStrings(projectKeys ?? []);
  if (!keys.length) return null;

  const parsed = safeParseJsonValue<TagsStorageV2>(localStorage.getItem(tagsStorageKey));
  if (!parsed || typeof parsed !== "object") return null;

  const assignmentsRaw = (parsed as any).assignments;
  if (!assignmentsRaw || typeof assignmentsRaw !== "object" || Array.isArray(assignmentsRaw)) return null;

  // tryNestedByProjectKey: assignments[projectKey] -> { protocolId: tagIds[] }
  for (const k of keys) {
    const maybePerProject = (assignmentsRaw as any)[k];
    if (maybePerProject && typeof maybePerProject === "object" && !Array.isArray(maybePerProject)) {
      const normalized = normalizeProtocolTagAssignments(maybePerProject);
      if (Object.keys(normalized).length) return normalized;
    }
  }

  // fallbackToFlatIfNeeded: assignments could be directly { protocolId: tagIds[] }
  if (looksLikeFlatAssignments(assignmentsRaw)) {
    const normalized = normalizeProtocolTagAssignments(assignmentsRaw);
    if (Object.keys(normalized).length) return normalized;
  }

  return null;
}

// legacyFallbackKeys (kept for backward compatibility)
const globalAssignmentsStorageKeyV2 = "scipion.protocolTagAssignments.v2";
const globalAssignmentsStorageKeyV1 = "scipion.protocolTagAssignments.v1";

function loadTagAssignments(projectKeys: string[]): ProtocolTagAssignments {
  // loadTagAssignments
  const keys = uniqueNonEmptyStrings(projectKeys ?? []);
  if (!keys.length) return {};

  // preferV2Store: scipion.tags.v2.assignments
  const v2 = readAssignmentsFromTagsStoreV2(keys);
  if (v2) return v2;

  // legacyGlobals
  const globalRaw =
    safeParseJsonValue<any>(localStorage.getItem(globalAssignmentsStorageKeyV2)) ??
    safeParseJsonValue<any>(localStorage.getItem(globalAssignmentsStorageKeyV1));

  if (globalRaw && typeof globalRaw === "object" && !Array.isArray(globalRaw)) {
    for (const k of keys) {
      const maybeNested = (globalRaw as any)[k];
      if (maybeNested && typeof maybeNested === "object" && !Array.isArray(maybeNested)) {
        const normalized = normalizeProtocolTagAssignments(maybeNested);
        if (Object.keys(normalized).length) return normalized;
      }
    }

    if (looksLikeFlatAssignments(globalRaw)) {
      return normalizeProtocolTagAssignments(globalRaw);
    }
  }

  // legacyPerProjectKey
  for (const k of keys) {
    const legacyKeyV2 = `project-${k}-protocol-tags.v2`;
    const legacyKeyV1 = `project-${k}-protocol-tags.v1`;
    const legacyRaw =
      safeParseJsonValue<any>(localStorage.getItem(legacyKeyV2)) ??
      safeParseJsonValue<any>(localStorage.getItem(legacyKeyV1));
    if (legacyRaw && typeof legacyRaw === "object") {
      const normalized = normalizeProtocolTagAssignments(legacyRaw);
      if (Object.keys(normalized).length) return normalized;
    }
  }

  return {};
}

function saveTagAssignments(projectKeys: string[], map: ProtocolTagAssignments): void {
  // saveTagAssignments
  const keys = uniqueNonEmptyStrings(projectKeys ?? []);
  if (!keys.length) return;

  try {
    const prev = safeParseJsonValue<TagsStorageV2>(localStorage.getItem(tagsStorageKey));
    const prevTags = Array.isArray((prev as any)?.tags) ? ((prev as any).tags as ProtocolTag[]) : loadTagsCatalogFromStorage();

    const prevAssignments =
      prev && typeof prev === "object" && prev.assignments && typeof prev.assignments === "object" && !Array.isArray(prev.assignments)
        ? { ...(prev.assignments as any) }
        : {};

    for (const k of keys) {
      (prevAssignments as any)[k] = map;
    }

    const nextPayload = {
      version: 2,
      updatedAt: Date.now(),
      tags: prevTags,
      assignments: prevAssignments,
    };

    localStorage.setItem(tagsStorageKey, JSON.stringify(nextPayload));
  } catch {
    // ignoreStorageErrors
  }

  // notifySameTabListeners
  try {
    window.dispatchEvent(new Event("scipionProtocolTagAssignmentsChanged"));
    window.dispatchEvent(new Event("scipionTagsChanged"));
  } catch {
    // ignoreDispatchErrors
  }
}

/** * Try to read tag assignments from backend project payload if present. * Accepts shapes like protocol.tagIds, protocol.tags (string[] or {id}[]). */
function pickFirstNonEmptyTagIds(...candidates: unknown[]): string[] {
  // pickFirstNonEmptyTagIds 
  for (const c of candidates) {
    const ids = normalizeTagIds(c);
    if (ids.length) return ids;
  }
  return [];
}

export default function ProjectPage() {
  const hostIsDark = useHostDarkMode();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  const { projectName } = useParams<{ projectName: string }>();
  const svc = useProjectService();

  const [project, setProject] = useState<Project | undefined>(undefined);
  const [isLoadingProject, setIsLoadingProject] = useState(true);

  // Tags states
  const [allTags, setAllTags] = useState<ProtocolTag[]>(() => loadTagsCatalogFromStorage());
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [assignTagsOpen, setAssignTagsOpen] = useState(false);
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([]);
  const [tagAssignments, setTagAssignments] = useState<ProtocolTagAssignments>({});
  const [assignDraftTagIds, setAssignDraftTagIds] = useState<string[]>([]);

  const refreshTags = useCallback(() => {
    // refreshTags
    setAllTags(loadTagsCatalogFromStorage());
  }, []);

  const getTagAssignmentScopeKeys = useCallback((): string[] => {
    // getTagAssignmentScopeKeys
    const p: any = project as any;

    return uniqueNonEmptyStrings([
      p?.id,
      p?.projectId,
      p?.shortName,
      projectName,
    ]);
  }, [project, projectName]);

  const tagsRawRef = useRef<string | null>(null);
  const assignmentsFingerprintRef = useRef<string>("");

  useEffect(() => {
    // syncTagsFromLocalStorageSameTab
    const readTags = () => {
      try {
        const raw = localStorage.getItem(tagsCatalogStorageKey);
        if (raw === tagsRawRef.current) return;
        tagsRawRef.current = raw;
        setAllTags(loadTagsCatalogFromStorage());
      } catch {
        // ignoreLocalStorageErrors
      }
    };

    readTags();

    const onCustom = () => readTags();
    const onStorage = (e: StorageEvent) => {
      if (e.key === tagsCatalogStorageKey) readTags();
    };

    window.addEventListener("scipionTagsChanged", onCustom);
    window.addEventListener("storage", onStorage);

    const timerId = window.setInterval(readTags, 500);

    return () => {
      window.removeEventListener("scipionTagsChanged", onCustom);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    // syncAssignmentsFromLocalStorageSameTab
    if (!projectName) return;

    const readAssignments = () => {
      try {
        const scopeKeys = getTagAssignmentScopeKeys();

        // computeAssignmentsFingerprint
        const parts: string[] = [];
        parts.push(localStorage.getItem(tagsStorageKey) ?? ""); // includeTagsV2StoreBecauseItContainsAssignments
        parts.push(localStorage.getItem(globalAssignmentsStorageKeyV2) ?? "");
        parts.push(localStorage.getItem(globalAssignmentsStorageKeyV1) ?? "");

        for (const k of uniqueNonEmptyStrings(scopeKeys)) {
          parts.push(localStorage.getItem(`project-${k}-protocol-tags.v2`) ?? "");
          parts.push(localStorage.getItem(`project-${k}-protocol-tags.v1`) ?? "");
        }

        const fingerprint = parts.join("|#|");
        if (fingerprint === assignmentsFingerprintRef.current) return;
        assignmentsFingerprintRef.current = fingerprint;

        setTagAssignments(loadTagAssignments(scopeKeys));
      } catch {
        // ignoreLocalStorageErrors
      }
    };

    readAssignments();

    const onCustom = () => readAssignments();
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key === globalAssignmentsStorageKeyV2 ||
        e.key === globalAssignmentsStorageKeyV1 ||
        e.key.startsWith("project-")
      ) {
        readAssignments();
      }
      if (
        e.key === tagsStorageKey ||
        e.key === globalAssignmentsStorageKeyV2 ||
        e.key === globalAssignmentsStorageKeyV1 ||
        e.key.startsWith("project-")
      ) {
        readAssignments();
      }

    };

    window.addEventListener("scipionProtocolTagAssignmentsChanged", onCustom);
    window.addEventListener("storage", onStorage);

    const timerId = window.setInterval(readAssignments, 500);

    return () => {
      window.removeEventListener("scipionProtocolTagAssignmentsChanged", onCustom);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timerId);
    };
  }, [projectName, getTagAssignmentScopeKeys]);


  const tagPopperContainer = useMemo(() => {
    // tagPopperContainer
    if (typeof document === "undefined") return null;
    return document.body;
  }, []);

  useEffect(() => {
    // syncTagsCatalog
    const syncTags = () => {
      try {
        setAllTags(loadTagsCatalogFromStorage());
      } catch {
        setAllTags([]);
      }
    };

    syncTags();

    const onCustom = () => syncTags();
    const onStorage = (e: StorageEvent) => {
      if (e.key === tagsCatalogStorageKey) syncTags();
    };

    window.addEventListener("scipionTagsChanged", onCustom);
    window.addEventListener("storage", onStorage);

    // optionalPollingSameTabSafetyNet
    const timerId = window.setInterval(syncTags, 750);

    return () => {
      window.removeEventListener("scipionTagsChanged", onCustom);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timerId);
    };
  }, []);

  function extractAssignmentsFromProjectProtocols(protocols: any): ProtocolTagAssignments {
    // extractAssignmentsFromProjectProtocols 
    const out: ProtocolTagAssignments = {};
    if (!protocols || typeof protocols !== "object")
      return out;
    for (const [protocolId, proto] of Object.entries(protocols)) {
      const p: any = proto ?? {};
      const tagIds = pickFirstNonEmptyTagIds(p.tagIds, p.tags, p.tag_ids);
      if (tagIds.length) out[String(protocolId)] = tagIds;
    }
    return out;
  }


  // Workflows loaded from API (lazy)
  const [workflows, setWorkflows] = useState<ProjectWorkflow[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [workflowsError, setWorkflowsError] = useState<string | null>(null);
  const [workflowsLoadedOnce, setWorkflowsLoadedOnce] = useState(false);
  const [miniMapEnabled, setMiniMapEnabled] = useState(true);

  // focusModeState
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);

  const analyzeViewerService = useMemo<ExternalAnalyzeViewerService>(() => {
    return {
      resolveAnalyzeViewer: svc.resolveAnalyzeViewer,
    };
  }, [svc]);

  const getAnalyzeViewerService = () => analyzeViewerService;

  const helpCacheRef = useRef<Record<string, string>>({});

  const [protocolHelp, setProtocolHelp] = useState<ProtocolHelpState>({
    open: false,
    title: "Protocol help",
    text: "",
    loading: false,
    error: null,
  });

  const openProtocolHelp = useCallback(
    async (protocolClass: string, protocolLabel?: string) => {
      // openProtocolHelp
      if (!projectName) return;

      const cacheKey = `${projectName}:${protocolClass}`;
      const title = protocolLabel ? `Help — ${protocolLabel}` : "Protocol help";

      setProtocolHelp({
        open: true,
        title,
        text: "",
        loading: true,
        error: null,
      });

      const cached = helpCacheRef.current[cacheKey];
      if (cached) {
        setProtocolHelp({
          open: true,
          title,
          text: cached,
          loading: false,
          error: null,
        });
        return;
      }

      try {
        const details = await svc.fetchNewProtocolDetails(projectName, protocolClass);
        const extracted = extractHelpText(details);
        const finalText =
          extracted && extracted.trim().length > 0
            ? normalizeHelpText(extracted)
            : "No help available for this protocol.";

        helpCacheRef.current[cacheKey] = finalText;

        setProtocolHelp({
          open: true,
          title,
          text: finalText,
          loading: false,
          error: null,
        });
      } catch (err) {
        console.error("openProtocolHelp failed", err);
        setProtocolHelp({
          open: true,
          title,
          text: "",
          loading: false,
          error: "Failed to load help for this protocol.",
        });
      }
    },
    [projectName, svc]
  );


  useEffect(() => {
    // loadFocusModeFromStorage
    if (!projectName) return;
    try {
      const raw = localStorage.getItem(`project-${projectName}-focus-mode`);
      if (raw == null) return;
      setFocusModeEnabled(Boolean(JSON.parse(raw)));
    } catch {
      // noOp
    }
  }, [projectName]);

  useEffect(() => {
    // persistFocusModeToStorage
    if (!projectName) return;
    try {
      localStorage.setItem(
        `project-${projectName}-focus-mode`,
        JSON.stringify(focusModeEnabled)
      );
    } catch {
      // noOp
    }
  }, [projectName, focusModeEnabled]);

  // unifiedSelectionState
  const [unifiedSelectedIdsState, setUnifiedSelectedIdsState] = useState<Set<string>>(
    () => new Set<string>()
  );

  const syncUnifiedSelectedIds = useCallback(() => {
    // syncUnifiedSelectedIds
    setUnifiedSelectedIdsState(new Set(getUnifiedSelectedIds()));
  }, []);


  // Multi-form dock state
  const [openForms, setOpenForms] = useState<OpenForm[]>([]);
  // inFlightFormOpenIdsRef
  const openingFormIdsRef = useRef<Set<string>>(new Set());

  // dockEpochRef: prevents reopening forms after global close while a fetch is in-flight
  const dockEpochRef = useRef(0);


  const closeAllDockedForms = useCallback(() => {
    // closeAllDockedForms
    if (!openForms.length) return;

    captureDockPositions();
    pendingFlipRef.current = true;

    // Invalidate any in-flight opens so they can't re-add forms later
    dockEpochRef.current += 1;
    openingFormIdsRef.current.clear();

    setOpenForms([]);
  }, [openForms.length]);


  // --- Smooth dock animations (FLIP) ---
  const dockRef = useRef<HTMLDivElement | null>(null);
  const lastPositionsRef = useRef<Record<string, DOMRect>>({});
  const pendingFlipRef = useRef(false);

  /** Measure current positions of panels before changing state (add/remove/reorder). */
  const captureDockPositions = () => {
    const root = dockRef.current;
    if (!root) return;
    const map: Record<string, DOMRect> = {};
    root.querySelectorAll<HTMLElement>("[data-dock-key]").forEach((el) => {
      const key = el.dataset.dockKey!;
      map[key] = el.getBoundingClientRect();
    });
    lastPositionsRef.current = map;
  };

  /** Animate from previous positions to the new ones (FLIP). */
  const playDockFlip = () => {
    const root = dockRef.current;
    if (!root) return;
    const prev = lastPositionsRef.current;

    // Honor reduced motion
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const D_MOVE = prefersReduced ? 0 : 300;
    const D_FADE = prefersReduced ? 0 : 240;

    root.querySelectorAll<HTMLElement>("[data-dock-key]").forEach((el) => {
      const key = el.dataset.dockKey!;
      const oldRect = prev[key];
      const newRect = el.getBoundingClientRect();

      if (oldRect) {
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;
        if (dx !== 0 || dy !== 0) {
          (el as any).animate?.(
            [
              { transform: `translate(${dx}px, ${dy}px)`, opacity: 0.92 },
              { transform: "translate(0, 0)", opacity: 1 },
            ],
            { duration: D_MOVE, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
          );
        }
      } else {
        (el as any).animate?.(
          [{ opacity: 0, transform: "translateX(12px)" }, { opacity: 1, transform: "translateX(0)" }],
          { duration: D_FADE, easing: "ease-out" }
        );
      }
    });

    lastPositionsRef.current = {};
  };

  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const [dialogContainer, setDialogContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setDialogContainer(portalRootRef.current);
  }, []);

  useLayoutEffect(() => {
    if (!pendingFlipRef.current) return;
    pendingFlipRef.current = false;
    requestAnimationFrame(() => playDockFlip());
  }, [openForms]);

  const [nodes, setNodes, onNodesChange] = useNodesState<StatusNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const sortedTableData = useMemo(() => {
    if (!Array.isArray(tableData)) return [];
    return [...tableData].sort((a, b) => {
      const aId = Number(a?.id);
      const bId = Number(b?.id);
      if (!Number.isNaN(aId) && !Number.isNaN(bId)) return bId - aId;
      return String(b?.id ?? "").localeCompare(String(a?.id ?? ""));
    });
  }, [tableData]);
  const filteredTableData = useMemo(() => {
    // filteredTableData
    if (!tagFilterIds.length) return sortedTableData;

    const filterSet = new Set(tagFilterIds);
    return sortedTableData.filter((row) => {
      const pid = String(row?.id ?? "");
      const assigned = pickFirstNonEmptyTagIds(
        tagAssignments[pid],
        (row as any)?.tagIds,
        (row as any)?.tags
      );
      return assigned.some((tid) => filterSet.has(tid));
    });
  }, [sortedTableData, tagFilterIds, tagAssignments]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const delayedRefreshTimerRef = useRef<number | null>(null);

  const [previousNodeId, setPreviousNodeId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = previousNodeId; }, [previousNodeId]);

  const [viewMode, setViewMode] = useState<"hierarchical" | "grid" | "table">("hierarchical");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [nodeTicks, setNodeTicks] = useState<Record<string, number>>({});
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [graphDirection, setGraphDirection] = useState<"TB" | "LR">("TB");

  const [_, setHideGraphDuringCenter] = useState(false);
  const [, startTransition] = useTransition();
  const disablePersistenceRef = useRef(false);

  const projectIdRef = useRef<string | number | undefined>(undefined);

  // pendingNewNodesRef tracks node ids before an operation that creates new nodes (duplicate/add)
  const pendingNewNodesRef = useRef<{
    beforeIds: Set<string>;
  } | null>(null);


  useEffect(() => {
    const raw = (project as any)?.projectId ?? (project as any)?.id;
    if (raw == null) return;
    const asNumber = typeof raw === "number" ? raw : Number(raw);
    projectIdRef.current = Number.isNaN(asNumber) ? String(raw) : asNumber;
  }, [project]);

  const getProjectId = () => projectIdRef.current;

  //Tags 
  const tagById = useMemo(() => {
    // tagById
    return new Map(allTags.map((t) => [t.id, t]));
  }, [allTags]);

  useEffect(() => {
    // loadTagsCatalogOnMount
    try {
      setAllTags(loadTagsCatalogFromStorage());
    } catch {
      setAllTags([]);
    }
  }, []);

  useEffect(() => {
    // loadTagAssignmentsOnProjectScopeChange
    if (!projectName) return;

    try {
      const keys = getTagAssignmentScopeKeys();
      setTagAssignments(loadTagAssignments(keys));
    } catch {
      setTagAssignments({});
    }
  }, [projectName, project?.id, project?.shortName, getTagAssignmentScopeKeys]);


  useEffect(() => {
    // syncAssignmentsOnCustomEvent
    if (!projectName) return;

    const onAssignmentsChanged = () => {
      try {
        const keys = getTagAssignmentScopeKeys();
        setTagAssignments(loadTagAssignments(keys));
      } catch {
        setTagAssignments({});
      }
    };

    window.addEventListener("scipionProtocolTagAssignmentsChanged", onAssignmentsChanged);
    return () =>
      window.removeEventListener("scipionProtocolTagAssignmentsChanged", onAssignmentsChanged);
  }, [projectName, getTagAssignmentScopeKeys]);


  useEffect(() => {
    // mergeAssignmentsFromProjectPayloadIfPresent
    if (!projectName || !project?.protocols) return;

    const fromApi = extractAssignmentsFromProjectProtocols(project.protocols);
    const hasAny = Object.keys(fromApi).length > 0;
    if (!hasAny) return;

    setTagAssignments((prev) => {
      const merged: ProtocolTagAssignments = { ...prev, ...fromApi };
      try {
        const keys = getTagAssignmentScopeKeys();
        saveTagAssignments(keys, merged);
      } catch { /* noOp */ }
      return merged;
    });
  }, [projectName, project?.protocols]);

  useEffect(() => {
    // refreshCatalogAfterClosingManager
    if (tagManagerOpen) return;
    try {
      setAllTags(loadTagsCatalogFromStorage());
    } catch {
      // noOp
    }
  }, [tagManagerOpen]);

  const selectedProtocolIds = useMemo(() => {
    // selectedProtocolIds
    return Array.from(unifiedSelectedIdsState)
      .map(String)
      .filter((id) => id && id !== "PROJECT");
  }, [unifiedSelectedIdsState]);

  const unionSelectedTagIds = useMemo(() => {
    // unionSelectedTagIds
    const s = new Set<string>();
    for (const pid of selectedProtocolIds) {
      for (const tid of (tagAssignments[pid] ?? [])) s.add(tid);
    }
    return Array.from(s);
  }, [selectedProtocolIds, tagAssignments]);

  useEffect(() => {
    // seedAssignDraftOnOpen
    if (!assignTagsOpen) return;
    setAssignDraftTagIds(unionSelectedTagIds);
  }, [assignTagsOpen, unionSelectedTagIds]);

  // Viewport state (used for hierarchical/table; grid uses fixed zoom)
  const [viewport, setViewport] = useState<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 0.3464 });
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });

  // Wrapper ref
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

  const contentPortalRef = useRef<HTMLDivElement | null>(null);
  // drawerPortalContainer
  const [drawerPortalContainer, setDrawerPortalContainer] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    // syncDrawerPortalContainer
    setDrawerPortalContainer(contentPortalRef.current);
  }, []);

  // Add near your state declarations
  const handleProtocolsDrawerOpenChange = useCallback((open: boolean) => {
    setDrawerOpen(open);

    // Ensure mutual exclusivity: opening Protocols closes Workflows
    if (open) setWorkflowsOpen(false);
  }, []);


  // Last RF point for context menu placement
  const lastPaneRFPointRef = useRef<{ x: number; y: number } | null>(null);

  // Pending placement point for newly created protocol
  const pendingPlacementRef = useRef<{
    point: { x: number; y: number };
    beforeIds: Set<string>;
  } | null>(null);

  const TIME_TO_REFRESH = 15000;
  const localStorageKey = `project-${projectName}-node-positions`;

  const [, setIsSwitchingLayout] = useState(false);
  const [, setTableVisible] = useState(viewMode === "table");
  const [nodesLoadedOnce, setNodesLoadedOnce] = useState(false);
  const firstLoadRef = useRef(true);

  // Zoom rules
  const GRID_ZOOM = 0.347;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 0.6;
  const clampZoom = (z: number | undefined | null) => {
    const num = typeof z === "number" && !Number.isNaN(z) ? z : 0.347;
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, num));
  };
  const getEffectiveZoom = () => (viewMode === "grid" ? GRID_ZOOM : viewportRef.current.zoom);

  const nodesRef = useRef<Node[]>(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const edgesRef = useRef<Edge[]>(edges);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const isRunningNode = (n: Node) => (n as any).data?.status === "running";

  // Workflows
  const [workflowsOpen, setWorkflowsOpen] = useState(false);

  useEffect(() => {
    // closeDockWhenExclusivePanelsOpen
    if (!drawerOpen && !workflowsOpen) return;

    captureDockPositions();
    pendingFlipRef.current = true;

    // Invalidate any in-flight opens so they can't re-add forms later
    dockEpochRef.current += 1;
    openingFormIdsRef.current.clear();

    setOpenForms([]);
  }, [drawerOpen, workflowsOpen]);


  const handleOpenWorkflows = useCallback(async () => {
    if (!projectName) return;

    // Ensure mutual exclusivity: opening Workflows closes Protocols
    setDrawerOpen(false);
    setWorkflowsOpen(true);
    closeAllDockedForms();

    // Avoid refetch if already loaded or currently loading
    if (workflowsLoading || workflowsLoadedOnce) {
      return;
    }

    try {
      setWorkflowsLoading(true);
      setWorkflowsError(null);

      const data = await svc.fetchWorkflows();

      const normalized: ProjectWorkflow[] = Array.isArray(data)
        ? data.map((wf: any, idx: number) => ({
          id: String(wf.id ?? wf.name ?? `wf-${idx}`),
          name: wf.name ?? String(wf.id ?? `Workflow ${idx + 1}`),
          description: wf.description ?? "",
        }))
        : [];

      setWorkflows(normalized);
      setWorkflowsLoadedOnce(true);
    } catch (err: any) {
      console.error("fetchWorkflows error:", err);
      setWorkflows([]);
      const msg = err?.message || "Failed to load workflows.";
      setWorkflowsError(msg);
      toast.error(msg);
    } finally {
      setWorkflowsLoading(false);
    }
  }, [projectName, svc, workflowsLoading, workflowsLoadedOnce]);




  /* ------------------------ Centering / viewport helpers ------------------------ */
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
        const x = (n.position!.x ?? 0);
        const y = (n.position!.y ?? 0);
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

  const snapViewportToTopLeft = useCallback((zoomOverride?: number) => {
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    const current = inst.getViewport();
    const zoom = typeof zoomOverride === "number" ? zoomOverride : clampZoom(current.zoom);
    inst.setViewport({ x: 0, y: 0, zoom });
    setViewport({ x: 0, y: 0, zoom });
  }, []);

  /* --------------------- Grid container width observer --------------------- */
  const [gridWidth, setGridWidth] = useState<number>(0);
  const lastObservedWidthRef = useRef<number>(-1);

  useLayoutEffect(() => {
    const el = flowWrapperRef.current;
    if (!el) return;

    // Set initial width and seed the ref to avoid a recenter on height-only changes
    const initialWidth = Math.max(0, Math.floor(el.clientWidth || 0));
    lastObservedWidthRef.current = initialWidth;
    setGridWidth(initialWidth);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextWidth = Math.max(0, Math.floor(entry.contentRect.width));

      // Ignore height-only changes (e.g., TagPicker chips wrapping)
      if (nextWidth === lastObservedWidthRef.current) return;

      lastObservedWidthRef.current = nextWidth;
      setGridWidth(nextWidth);

      requestAnimationFrame(() => {
        const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
        if (!inst) return;

        if (viewModeRef.current === "grid") {
          snapViewportToTopLeft(GRID_ZOOM);
        } else if (viewModeRef.current === "hierarchical") {
          centerLikeButton(undefined, true, viewportRef.current.zoom);
        }
      });
    });

    ro.observe(el);

    return () => {
      try { ro.disconnect(); } catch { /* ignore */ }
    };
  }, [centerLikeButton, snapViewportToTopLeft]);


  /* --------------------- Keep latest layout params in refs to avoid refetch on view switch --------------------- */
  const viewModeRef = useRef(viewMode);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  const graphDirectionRef2 = useRef(graphDirection);
  useEffect(() => { graphDirectionRef2.current = graphDirection; }, [graphDirection]);

  const gridWidthRef = useRef(gridWidth);
  useEffect(() => { gridWidthRef.current = gridWidth; }, [gridWidth]);

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

  // Colors
  const SELECT_COLOR = "#0070f3";
  const PATH_COLOR = "#0ea5e9";

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
    pathEdgeModeRef.current = 'all';
    syncUnifiedSelectedIds();
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
            delete newStyle.strokeWidth;
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
  }, [SELECT_COLOR]);

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
  }, [PATH_COLOR]);

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

  /* --------------------- Directional path edge mode + helpers --------------------- */
  const pathEdgeModeRef = useRef<'all' | 'outgoing' | 'incoming'>('all');

  const computeOutgoingEdgesFromSet = useCallback((nodeSet: Set<string>) => {
    const edgeIds: string[] = [];
    for (const e of edgesRef.current) {
      if (nodeSet.has(String(e.source))) edgeIds.push(e.id);
    }
    return new Set(edgeIds);
  }, []);

  const computeIncomingEdgesToSet = useCallback((nodeSet: Set<string>) => {
    const edgeIds: string[] = [];
    for (const e of edgesRef.current) {
      if (nodeSet.has(String(e.target))) edgeIds.push(e.id);
    }
    return new Set(edgeIds);
  }, []);

  const computeEdgesForMode = useCallback(
    (nodeSet: Set<string>, mode: 'all' | 'outgoing' | 'incoming') => {
      if (!nodeSet.size) return new Set<string>();
      if (mode === 'outgoing') return computeOutgoingEdgesFromSet(nodeSet);
      if (mode === 'incoming') return computeIncomingEdgesToSet(nodeSet);
      return computeEdgesTouchingNodes(nodeSet);
    },
    [computeEdgesTouchingNodes, computeOutgoingEdgesFromSet, computeIncomingEdgesToSet]
  );

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

    setEdges((eds) => {
      let out = paintEdgeHighlight(eds, null);
      out = paintPathHighlight(out, nextEdges);
      return out;
    });

    bumpNodesForPath();
    syncUnifiedSelectedIds();
  }, [computeEdgesTouchingNodes, paintPathHighlight, paintEdgeHighlight, setNodes, setEdges, bumpNodesForPath]);

  const clearPathSelection = useCallback(() => {
    if (pathSelRef.current.nodes.size === 0 && pathSelRef.current.edges.size === 0) return;
    pathSelRef.current = { nodes: new Set(), edges: new Set() };
    setPathNodeIds([]);
    setPathEdgeIds([]);
    setEdges((eds) => paintPathHighlight(eds, new Set()));
    bumpNodesForPath();
    syncUnifiedSelectedIds();
  }, [paintPathHighlight, bumpNodesForPath]);

  const applyEdgeHighlight = useCallback((selectedId: string | null) => {
    setEdges((eds) => {
      let out = paintEdgeHighlight(eds, selectedId);
      if (pathSelRef.current.edges.size) {
        out = paintPathHighlight(out, pathSelRef.current.edges);
        return out;
      }
      return out;
    });
  }, [paintEdgeHighlight, paintPathHighlight, setEdges]);


  useEffect(() => {
    // focusNodesMatchingTagFilter
    if (!tagFilterIds.length) return;

    // tableModeAlreadyFiltersRows; optional: scroll to first match
    if (viewMode === "table") {
      const filterSet = new Set(tagFilterIds);
      const first = filteredTableData.find((row) => {
        const pid = String(row?.id ?? "");
        const assigned = pickFirstNonEmptyTagIds(
          tagAssignments[pid],
          (row as any)?.tagIds,
          (row as any)?.tags
        );
        return assigned.some((tid) => filterSet.has(tid));
      });
      if (first) scrollToProtocol(String(first.id));
      return;
    }

    const filterSet = new Set(tagFilterIds);

    const matches = nodesRef.current.filter((n) => {
      const nodeId = String(n.id);
      if (nodeId === "PROJECT") return false;

      const dataAny: any = (n as any).data ?? {};

      // readAssignedTagIdsConsistently
      const assigned = pickFirstNonEmptyTagIds(
        tagAssignments[nodeId],
        dataAny.tagIds,
        dataAny.tags
      );

      return assigned.some((tid) => filterSet.has(tid));
    });

    if (!matches.length) return;

    // selectAllMatchesSoTheyAreVisuallyFocused
    applyPathSelection(matches.map((n) => String(n.id)));
  }, [
    tagFilterIds,
    tagAssignments,
    viewMode,
    filteredTableData,
    applyPathSelection,
  ]);


  useEffect(() => {
    // pruneTagFilterAndAssignmentsAgainstCatalog
    const valid = new Set(allTags.map((t) => t.id));
    if (valid.size === 0) return;

    setTagFilterIds((prev) => prev.filter((id) => valid.has(id)));

    setTagAssignments((prev) => {
      let changed = false;
      const next: ProtocolTagAssignments = {};

      for (const [pid, ids] of Object.entries(prev)) {
        const cleaned = (ids ?? []).filter((id) => valid.has(id));
        if (cleaned.length !== (ids ?? []).length) changed = true;
        if (cleaned.length) next[pid] = cleaned;
      }

      return changed ? next : prev;
    });
  }, [allTags]);



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
    syncUnifiedSelectedIds();
  };

  // Open or focus a form for a node; fetch details only when needed
  // openFormForNode
  const openFormForNode = useCallback(
    async (nodeId: string, fetcher: () => Promise<any>) => {
      if (!projectName) return;

      setDrawerOpen(false);
      setWorkflowsOpen(false);

      // snapshot epoch to avoid reopening if dock was globally closed while fetching

      const id = String(nodeId);

      selectedIdRef.current = id;
      syncUnifiedSelectedIds();
      setPreviousNodeId(id);
      setHighlightedId(id);
      applyEdgeHighlight(id);

      // preventDuplicateOpensInFlight
      if (openingFormIdsRef.current.has(id)) {
        // bringToFrontIfAlreadyInDock
        setOpenForms((prev) => {
          const hitIndex = prev.findIndex((f) => f.id === id);
          if (hitIndex < 0) return prev;
          const hit = prev[hitIndex];
          return [hit, ...prev.filter((_, i) => i !== hitIndex)];
        });
        return;
      }

      openingFormIdsRef.current.add(id);

      // bringToFrontIfAlreadyOpen
      let wasAlreadyOpen = false;
      setOpenForms((prev) => {
        const hitIndex = prev.findIndex((f) => f.id === id);
        if (hitIndex >= 0) {
          wasAlreadyOpen = true;
          const hit = prev[hitIndex];
          return [hit, ...prev.filter((_, i) => i !== hitIndex)];
        }
        return prev;
      });

      if (wasAlreadyOpen) {
        openingFormIdsRef.current.delete(id);
        return;
      }

      const dockEpoch = dockEpochRef.current;

      try {
        const details = await fetcher();

        if (dockEpochRef.current !== dockEpoch) {
          // dockWasGloballyClosedWhileFetching
          return;
        }

        captureDockPositions();
        pendingFlipRef.current = true;

        // useStableKeyToGuaranteeUniquenessPerId
        setOpenForms((prev) => [
          { key: id, id, details },
          ...prev.filter((f) => f.id !== id),
        ]);
      } catch (err) {
        console.error("openFormForNode failed", err);
      } finally {
        openingFormIdsRef.current.delete(id);
      }
    },
    [projectName, applyEdgeHighlight, syncUnifiedSelectedIds]
  );


  const handleNodeDoubleClick = useCallback(
    async (nodeData: any) => {
      if (!projectName) return;
      await openFormForNode(String(nodeData.id), () =>
        svc.fetchProtocolDetails(projectName, nodeData.id)
      );
    },
    [projectName, openFormForNode, svc]
  );

  const closeFormByKey = useCallback((key: string) => {
    captureDockPositions();
    pendingFlipRef.current = true;
    setOpenForms((prev) => prev.filter((f) => f.key !== key));
  }, []);

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
    pathEdgeModeRef.current = 'all';
    applyPathSelection(Array.from(ids));
  }, [applyPathSelection]);

  const handleSelectFrom = useCallback((id: string) => {
    const nodesSet = collectDescendants(id);
    if (id !== "PROJECT") nodesSet.add(String(id));
    pathEdgeModeRef.current = 'outgoing';
    const edgeIds = Array.from(computeOutgoingEdgesFromSet(nodesSet));
    applyPathSelection(Array.from(nodesSet), edgeIds);
  }, [collectDescendants, computeOutgoingEdgesFromSet, applyPathSelection]);

  const handleSelectTo = useCallback((id: string) => {
    const nodesSet = collectAncestors(id);
    if (id !== "PROJECT") nodesSet.add(String(id));
    pathEdgeModeRef.current = 'incoming';
    const edgeIds = Array.from(computeIncomingEdgesToSet(nodesSet));
    applyPathSelection(Array.from(nodesSet), edgeIds);
  }, [collectAncestors, computeIncomingEdgesToSet, applyPathSelection]);

  const handleAddProtocolFromDrawer = useCallback(
    async (
      protocolClass: string,
      opts?: { mode?: "add" | "help"; protocolLabel?: string }
    ) => {
      // handleAddProtocolFromDrawer
      if (!projectName) return;

      if (opts?.mode === "help") {
        await openProtocolHelp(protocolClass, opts.protocolLabel);
        return;
      }

      setDrawerOpen(false);

      await openFormForNode(String(protocolClass), () =>
        svc.fetchNewProtocolDetails(projectName, protocolClass)
      );
    },
    [projectName, openFormForNode, svc, openProtocolHelp]
  );


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
      onSelectFrom: handleSelectFrom,
      onSelectTo: handleSelectTo,
      onStop: openStop,
      onManageTags: () => setTagManagerOpen(true),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSelectFrom, handleSelectTo, handleNodeDoubleClick]);


  /** State and handler for RemoteFileDialog */
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [fileDialogCtx, setFileDialogCtx] = useState<{ protocolId?: string; protocolLabel?: string }>({});
  const canOpenFileDialog = fileDialogOpen && fileDialogCtx.protocolId != null && project?.id != null;
  const pid = fileDialogCtx.protocolId as string | number;
  const projId = project?.id as string | number;
  const plabel = fileDialogCtx.protocolLabel
    ? `( ${pid} ) ${fileDialogCtx.protocolLabel}`
    : String(pid);

  const openBrowse = useCallback((
    protocolId: string,
    _projectId?: string | number,
    protocolLabel?: string
  ) => {
    setFileDialogCtx({ protocolId, protocolLabel });
    setFileDialogOpen(true);
  }, []);

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
        () => viewModeRef.current,
        () => nodeActionsRef.current,
        () => getSelectedPathIds(),
        (protocolId: string, projectId?: string | number, protocolLabel?: string) =>
          openBrowse(protocolId, projectId, protocolLabel),
        () => getProjectId(),
        () => getAnalyzeViewerService(),
      ),
    };

  }
  const nodeTypes = nodeTypesRef.current;

  /* --------------------- Persistence of positions --------------------- */
  /* --------------------- Persistence of positions --------------------- */
  type PersistedNodePositionsV2 = {
    version: 2;
    direction: "TB" | "LR";
    positions: Array<{ id: string; position: { x: number; y: number } }>;
  };

  const nodePositionsVersion = 2;

  const storageKeyHier = `${localStorageKey}-${graphDirection}-hier`;

  const safeParseJson = (raw: string | null): unknown => {
    // safeParseJson
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const isValidPosItem = (v: any): v is { id: string; position: { x: number; y: number } } => {
    // isValidPosItem
    const idOk = typeof v?.id === "string" && v.id.length > 0;
    const xOk = typeof v?.position?.x === "number" && Number.isFinite(v.position.x);
    const yOk = typeof v?.position?.y === "number" && Number.isFinite(v.position.y);
    return idOk && xOk && yOk;
  };

  const readPersistedPositions = (
    key: string,
    expectedDirection: "TB" | "LR"
  ): Array<{ id: string; position: { x: number; y: number } }> => {
    // readPersistedPositions
    const parsed = safeParseJson(localStorage.getItem(key));
    if (!parsed) return [];

    // Legacy format: Array<{id, position}>
    // Important: ignore legacy arrays in LR to prevent TB positions being applied in LR.
    if (Array.isArray(parsed)) {
      if (expectedDirection !== "TB") return [];
      return parsed.filter(isValidPosItem);
    }

    // V2 format: {version, direction, positions}
    if (typeof parsed === "object" && parsed !== null) {
      const obj: any = parsed;
      const versionOk = obj.version === nodePositionsVersion;
      const dirOk = obj.direction === expectedDirection;
      const posArr = Array.isArray(obj.positions) ? obj.positions : null;

      if (versionOk && dirOk && posArr) {
        return posArr.filter(isValidPosItem);
      }
    }

    return [];
  };

  const writePersistedPositions = (
    key: string,
    direction: "TB" | "LR",
    positions: Array<{ id: string; position: { x: number; y: number } }>
  ) => {
    // writePersistedPositions
    const payload: PersistedNodePositionsV2 = {
      version: nodePositionsVersion,
      direction,
      positions,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  };


  const handleNodesChangeWithPersistence = (changes: NodeChange[]) => {
    if (disablePersistenceRef.current || viewMode !== "hierarchical") {
      return onNodesChange(changes);
    }

    setNodes((nds) => {
      const updated = applyNodeChanges(changes, nds);
      const positions = updated.map((n) => ({ id: n.id, position: n.position }));

      try {
        writePersistedPositions(storageKeyHier, graphDirection, positions);
      } catch {
        // noOp
      }

      return updated;
    });
  };

  const loadNodesWithPositions = (loadedNodes: Node[]) => {
    const saved = readPersistedPositions(storageKeyHier, graphDirection);
    if (!saved.length) return loadedNodes;

    const byId = new Map<string, { x: number; y: number }>();
    for (const p of saved) byId.set(p.id, p.position);

    return loadedNodes.map((n) => {
      const pos = byId.get(n.id);
      return pos ? { ...n, position: pos } : n;
    });
  };



  const mergeEdges = (newEdges: Edge[]) => {
    const oldEdgesMap = new Map(edges.map((e) => [e.id, e]));
    return newEdges.map((e) => (oldEdgesMap.get(e.id) ? { ...oldEdgesMap.get(e.id)!, ...e } : e));
  };


  // persistPositionsBulk writes multiple node positions in a single localStorage write
  const persistPositionsBulk = (direction: "TB" | "LR", items: Array<{ id: string; position: { x: number; y: number } }>) => {
    try {
      const key = storageKeyHier;
      const saved = readPersistedPositions(key, direction);
      const byId = new Map(saved.map((p) => [p.id, p.position]));

      for (const it of items) byId.set(it.id, it.position);

      const merged = Array.from(byId.entries()).map(([id, position]) => ({ id, position }));
      writePersistedPositions(key, direction, merged);
    } catch {
      // noOp
    }
  };



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
              const x = (n.position?.x), y = (n.position?.y);
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

  /* ------------------------ Fetch & load (NO refetch on view change) ------------------------ */
  const fetchAndLoadProject = useCallback(async () => {
    if (!projectName) return;
    setIsRefreshing(true);
    try {
      const data = await svc.fetchProject(projectName);
      setProject(data);

      if (data.protocols) {
        const mode = viewModeRef.current;
        const dir = graphDirectionRef2.current;
        const width = gridWidthRef.current || flowWrapperRef.current?.clientWidth;
        const effectiveZoom = mode === "grid" ? GRID_ZOOM : viewportRef.current.zoom;

        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(
          data.shortName, data.protocols, mode, dir, width, effectiveZoom
        );

        if (mode === "table") {
          startTransition(() => setTableData(table ?? []));
          setIsLoadingProject(false);
          setIsRefreshing(false);
          return;
        }

        const nodesWithPositions =
          mode === "hierarchical"
            ? loadNodesWithPositions(loadedNodes)
            : loadedNodes;

        const initialTicks: Record<string, number> = {};
        nodesWithPositions.forEach((n) => {
          if (isRunningNode(n)) {
            initialTicks[n.id] = Number((n as any).data?.elapsedTime) ?? 0;
          }
        });

        const nodesWithTick = nodesWithPositions.map((n) =>
          isRunningNode(n)
            ? { ...n, data: { ...(n as any).data, tick: initialTicks[n.id] ?? Number((n as any).data?.elapsedTime) ?? 0 } }
            : n
        );

        const unifiedSelectedIds = getUnifiedSelectedIds();
        const recomputedEdgeSet = unifiedSelectedIds.size
          ? computeEdgesForMode(unifiedSelectedIds, pathEdgeModeRef.current)
          : new Set<string>();
        pathSelRef.current.edges = recomputedEdgeSet;

        startTransition(() => {
          setNodes(nodesWithTick.map((n) => ({ ...n, selected: unifiedSelectedIds.has(n.id) })));
          setEdges((_) => {
            let base = mode === "grid" ? [] : loadedEdges;
            base = paintEdgeHighlight(base, selectedIdRef.current ?? null);
            if (recomputedEdgeSet.size) base = paintPathHighlight(base, recomputedEdgeSet);
            return base;
          });
          setTableData(table ?? []);
        });

        setNodeTicks(initialTicks);
        setNodesLoadedOnce(true);

        if (mode === "grid") {
          requestAnimationFrame(() => snapViewportToTopLeft(GRID_ZOOM));
        }
      }
    } catch (err) {
      console.error("fetchAndLoadProject error:", err);
    } finally {
      setIsRefreshing(false);
      setIsLoadingProject(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName, svc, paintEdgeHighlight, paintPathHighlight, computeEdgesForMode, snapViewportToTopLeft]);

  useEffect(() => {
    setIsLoadingProject(true);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchAndLoadProject();
    // only reload when changing project
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  /* ------------------------ Refresh ------------------------ */
  const handleRefresh = useCallback(async () => {
    if (!projectName) return;
    setIsRefreshing(true);
    try {
      const data = await svc.fetchProject(projectName);
      setProject(data);

      if (data.protocols) {
        const { nodes: loadedNodes, edges: loadedEdges, table } = buildGraphElements(
          data.shortName, data.protocols, viewMode, graphDirection,
          gridWidth || flowWrapperRef.current?.clientWidth,
          getEffectiveZoom()
        );

        if (viewMode === "table") {
          startTransition(() => setTableData(table ?? []));
          setIsRefreshing(false);
          return;
        }

        const nodesWithPositions =
          viewMode === "hierarchical"
            ? loadNodesWithPositions(loadedNodes)
            : loadedNodes;

        const edgesMerged = viewMode === "grid" ? [] : mergeEdges(loadedEdges);

        const unifiedSelectedIds = getUnifiedSelectedIds();
        const nodesSeed = nodesWithPositions.map((n) =>
          isRunningNode(n)
            ? { ...n, data: { ...(n as any).data, tick: (nodeTicks[n.id] ?? Number((n as any).data?.elapsedTime) ?? 0) }, selected: unifiedSelectedIds.has(n.id) }
            : { ...n, selected: unifiedSelectedIds.has(n.id) }
        );

        const recomputedEdgeSet = unifiedSelectedIds.size
          ? computeEdgesForMode(unifiedSelectedIds, pathEdgeModeRef.current)
          : new Set<string>();
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

        if (viewMode === "grid") {
          requestAnimationFrame(() => snapViewportToTopLeft(GRID_ZOOM));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);

      if (pendingPlacementRef.current) {
        setTimeout(() => tryPlaceNewlyCreatedNode(), 50);
        setTimeout(() => tryPlaceNewlyCreatedNode(), 400);
        setTimeout(() => tryPlaceNewlyCreatedNode(), 1200);
      }

      if (pendingNewNodesRef.current) {
        setTimeout(() => tryResolveNewNodesCollisions(), 80);
        setTimeout(() => tryResolveNewNodesCollisions(), 420);
        setTimeout(() => tryResolveNewNodesCollisions(), 1250);
      }
    }

  }, [projectName, viewMode, graphDirection, nodeTicks, svc, paintEdgeHighlight, paintPathHighlight, computeEdgesForMode, gridWidth]);

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

  // --- Double refresh helper (immediate + delayed) ---
  const scheduleDoubleRefresh = (delayMs = 5000, alsoPlace = false) => {
    handleRefreshRef.current?.();
    if (alsoPlace) setTimeout(() => tryPlaceNewlyCreatedNode(), 100);

    if (delayedRefreshTimerRef.current !== null) clearTimeout(delayedRefreshTimerRef.current);
    delayedRefreshTimerRef.current = window.setTimeout(() => {
      handleRefreshRef.current?.();
      if (alsoPlace) setTimeout(() => tryPlaceNewlyCreatedNode(), 100);
    }, delayMs);
  };


  /* ------------------------ Reflow on grid width change ------------------------ */
  useEffect(() => {
    if (viewMode !== "grid") return;
    if (!project?.protocols) return;

    const { nodes: newNodes } = buildGraphElements(
      project.shortName,
      project.protocols,
      "grid",
      graphDirection,
      gridWidth || flowWrapperRef.current?.clientWidth,
      GRID_ZOOM
    );

    const sel = getUnifiedSelectedIds();
    const seeded = newNodes.map((n) => ({ ...n, selected: sel.has(n.id) }));

    setNodes(seeded);
    setEdges([]); // grid has no edges

    requestAnimationFrame(() => snapViewportToTopLeft(GRID_ZOOM));
  }, [gridWidth, viewMode, project, graphDirection, snapViewportToTopLeft]);

  /* ------------------------ Reorganize ------------------------ */
  const handleReorganize = useCallback(
    async (opts?: { preserveZoom?: boolean }) => {
      if (!projectName) return;
      try {
        try { localStorage.removeItem(storageKeyHier); } catch { }
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
          data.shortName, data.protocols, viewMode, graphDirection,
          gridWidth || flowWrapperRef.current?.clientWidth,
          getEffectiveZoom()
        );

        if (viewMode === "table") {
          startTransition(() => setTableData(table ?? []));
          disablePersistenceRef.current = false;
          setHideGraphDuringCenter(false);
          return;
        }

        const nodesWithPositions =
          viewMode === "hierarchical"
            ? loadNodesWithPositions(loadedNodes)
            : loadedNodes;

        const unifiedSelectedIds = getUnifiedSelectedIds();
        const nodesSeeded = nodesWithPositions.map((n) => ({ ...n, selected: unifiedSelectedIds.has(n.id) }));
        const recomputedEdgeSet = unifiedSelectedIds.size
          ? computeEdgesForMode(unifiedSelectedIds, pathEdgeModeRef.current)
          : new Set<string>();
        pathSelRef.current.edges = recomputedEdgeSet;

        startTransition(() => {
          setNodes(nodesSeeded);
          setEdges((_) => {
            let out = viewMode === "grid" ? [] : paintEdgeHighlight(loadedEdges, selectedIdRef.current ?? null);
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
            snapViewportToTopLeft(GRID_ZOOM);
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
    [projectName, viewMode, graphDirection, centerLikeButton, svc, paintEdgeHighlight, paintPathHighlight, computeEdgesForMode, gridWidth]
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
    if (!project?.protocols) {
      prevLayout.current = { viewMode, graphDirection };
      return;
    }

    if (viewMode === "table") {
      const { table } = buildGraphElements(
        project.shortName,
        project.protocols,
        "table",
        graphDirection,
        gridWidth || flowWrapperRef.current?.clientWidth,
        getEffectiveZoom()
      );

      startTransition(() => setTableData(table ?? []));
      setIsSwitchingLayout(true);

      requestAnimationFrame(() => {
        setTimeout(() => setIsSwitchingLayout(false), 60);
      });

      if (pathSelRef.current.nodes.size === 0) {
        setHighlightedId(selectedIdRef.current ?? null);
      }

      prevLayout.current = { viewMode, graphDirection };
      return;
    }

    const instance = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!instance) {
      prevLayout.current = { viewMode, graphDirection };
      return;
    }

    const { nodes: loadedNodes, edges: loadedEdges } =
      buildGraphElements(
        project.shortName,
        project.protocols,
        viewMode,
        graphDirection,
        gridWidth || flowWrapperRef.current?.clientWidth,
        getEffectiveZoom()
      );

    const nodesWithPositions =
      viewMode === "hierarchical" ? loadNodesWithPositions(loadedNodes) : loadedNodes;

    const unifiedSelectedIds = getUnifiedSelectedIds();
    const nodesSeeded = nodesWithPositions.map((n) => ({ ...n, selected: unifiedSelectedIds.has(n.id) }));
    const recomputedEdgeSet = unifiedSelectedIds.size
      ? computeEdgesForMode(unifiedSelectedIds, pathEdgeModeRef.current)
      : new Set<string>();
    pathSelRef.current.edges = recomputedEdgeSet;

    disablePersistenceRef.current = true;
    setIsSwitchingLayout(true);

    startTransition(() => {
      setNodes(nodesSeeded);
      setEdges((_) => {
        let out = viewMode === "grid" ? [] : paintEdgeHighlight(loadedEdges, selectedIdRef.current ?? null);
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

        if (viewMode === "hierarchical") {
          centerLikeButton(nodesWithPositions, true);
        } else {
          snapViewportToTopLeft(GRID_ZOOM);
        }

        requestAnimationFrame(() => {
          setTimeout(() => {
            disablePersistenceRef.current = false;
            setIsSwitchingLayout(false);
            prevLayout.current = { viewMode, graphDirection };
          }, 60);
        });
      });
    });
  }, [graphDirection, viewMode, project, paintEdgeHighlight, paintPathHighlight, computeEdgesForMode, gridWidth, centerLikeButton, snapViewportToTopLeft]);

  /* ------------------------ First-center ONLY once after initial load ------------------------ */
  useEffect(() => {
    if (!nodesLoadedOnce || !firstLoadRef.current) return;

    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;

    let cancelled = false;

    (async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      if (cancelled) return;

      if (viewModeRef.current === "grid") {
        inst.setViewport({ x: 0, y: 0, zoom: GRID_ZOOM });
        setViewport({ x: 0, y: 0, zoom: GRID_ZOOM });
      } else if (viewModeRef.current === "hierarchical") {
        centerLikeButton(nodesRef.current, true, viewportRef.current.zoom);
      }

      firstLoadRef.current = false;
    })();

    return () => { cancelled = true; };
  }, [nodesLoadedOnce, centerLikeButton]);


  /* ============================================================
     Table helpers (unchanged)
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
      root: "#D9F1FA",
      scheduled: "#f7f3bf",
      new: "#1E90FF",
    };
    return { backgroundColor: colorMap[status ?? ""] ?? "#eee" };
  };

  const statusColorMap: Record<string, string> = {
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

  const getMiniMapNodeColor = useCallback(
    (node: Node<StatusNodeData>) => {
      const dataAny: any = (node as any).data ?? {};
      const nodeStyleAny: any = (node as any).style ?? {};

      const dataColor = typeof dataAny.color === "string" ? dataAny.color.trim() : "";
      if (dataColor) return dataColor;

      const styleBg =
        (typeof nodeStyleAny.background === "string" && nodeStyleAny.background.trim()) ||
        (typeof nodeStyleAny.backgroundColor === "string" && nodeStyleAny.backgroundColor.trim()) ||
        "";
      if (styleBg) return styleBg;

      const status = String(dataAny.status ?? "").toLowerCase();
      const byStatus = statusColorMap[status];
      if (byStatus) return byStatus;

      return hostIsDark ? "#1f2937" : "#e5e7eb";
    },
    [hostIsDark]
  );

  const getMiniMapNodeStroke = useCallback(
    (node: Node<StatusNodeData>) => {
      if ((node as any).selected) return "#0070f3";
      return hostIsDark ? "rgba(148,163,184,0.55)" : "rgba(15,23,42,0.35)";
    },
    [hostIsDark]
  );


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
          const zoom = viewMode === "grid" ? GRID_ZOOM : clampZoom(currentViewport.zoom);
          inst.setCenter(centerX, centerY, { zoom, duration: 300 });
          const vp = inst.getViewport();
          setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
        } else {
          const clamped = { x: currentViewport.x, y: currentViewport.y, zoom: viewMode === "grid" ? GRID_ZOOM : clampZoom(currentViewport.zoom) };
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
      const zoom = viewMode === "grid" ? GRID_ZOOM : clampZoom(inst2.getViewport().zoom);
      inst2.setCenter((match as any).position.x, (match as any).position.y, { zoom, duration: 500 });
      const vp = inst2.getViewport();
      setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
    }
  };


  // searchUiState
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  const searchResults = useMemo<SearchResult[]>(() => {
    // buildSearchResults
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const limit = 12;
    const results: Array<{ item: SearchResult; score: number; numId: number }> = [];

    const pushIfMatch = (idRaw: any, labelRaw: any, statusRaw?: any) => {
      const id = String(idRaw ?? "");
      if (!id || id === "PROJECT") return;

      const label = String(labelRaw ?? id);
      const status = statusRaw != null ? String(statusRaw) : undefined;

      const idL = id.toLowerCase();
      const labelL = label.toLowerCase();

      const idExact = idL === q;
      const idStarts = idL.startsWith(q);
      const labelStarts = labelL.startsWith(q);
      const idIncludes = idL.includes(q);
      const labelIncludes = labelL.includes(q);

      if (!(idIncludes || labelIncludes)) return;

      let score = 0;
      if (idExact) score = 100;
      else if (idStarts) score = 90;
      else if (labelStarts) score = 80;
      else if (idIncludes) score = 70;
      else score = 60;

      const numId = Number.parseInt(id, 10);
      results.push({
        item: { id, label, status },
        score,
        numId: Number.isNaN(numId) ? Number.NEGATIVE_INFINITY : numId,
      });
    };

    if (viewMode === "table") {
      for (const row of filteredTableData) {
        pushIfMatch(row?.id, row?.label, row?.status);
      }
    } else {
      for (const n of nodes) {
        const d: any = (n as any).data ?? {};
        pushIfMatch(n.id, d.label ?? n.id, d.status);
      }
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.numId !== a.numId) return b.numId - a.numId;
      return a.item.id.localeCompare(b.item.id);
    });

    return results.slice(0, limit).map((x) => x.item);
  }, [searchQuery, viewMode, filteredTableData, nodes]);

  const jumpToSearchResult = useCallback(
    async (res: SearchResult, opts?: { openForm?: boolean }) => {
      // jumpToSearchResult
      const id = String(res.id);
      if (!id) return;

      setSearchOpen(false);

      if (viewMode === "table") {
        scrollToProtocol(id);

        selectedIdRef.current = id;
        setPreviousNodeId(id);
        setHighlightedId(id);
        applyEdgeHighlight(id);

        suppressOneFrame();
        setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === id })));
        syncUnifiedSelectedIds();
        return;
      }

      const match = nodesRef.current.find((n) => String(n.id) === id);
      if (!match) return;

      selectedIdRef.current = id;
      setPreviousNodeId(id);
      setHighlightedId(id);
      applyEdgeHighlight(id);

      suppressOneFrame();
      setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === id })));

      const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
      if (inst) {
        const zoom = viewMode === "grid" ? GRID_ZOOM : clampZoom(inst.getViewport().zoom);
        inst.setCenter((match as any).position.x, (match as any).position.y, { zoom, duration: 350 });
        const vp = inst.getViewport();
        setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
      }

      syncUnifiedSelectedIds();

      if (opts?.openForm && projectName) {
        await openFormForNode(id, () => svc.fetchProtocolDetails(projectName, id));
      }
    },
    [
      viewMode,
      GRID_ZOOM,
      projectName,
      svc,
      applyEdgeHighlight,
      openFormForNode,
      scrollToProtocol,
      suppressOneFrame,
      setNodes,
      syncUnifiedSelectedIds,
    ]
  );

  const handleSearchInputChange = useCallback(
    (value: string) => {
      // handleSearchInputChange
      setSearchQuery(value);
      const trimmed = value.trim();

      if (!trimmed) {
        setSearchOpen(false);
        setSearchActiveIndex(0);
        handleSearch("");
        return;
      }

      setSearchOpen(true);
      setSearchActiveIndex(0);
    },
    [handleSearch]
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // handleSearchKeyDown
      if (!searchOpen) {
        if (e.key === "Enter" && searchResults.length > 0) {
          e.preventDefault();
          void jumpToSearchResult(searchResults[0], { openForm: e.altKey });
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setSearchOpen(false);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSearchActiveIndex((i) => Math.min(i + 1, Math.max(0, searchResults.length - 1)));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSearchActiveIndex((i) => Math.max(0, i - 1));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const hit = searchResults[searchActiveIndex] ?? searchResults[0];
        if (hit) void jumpToSearchResult(hit, { openForm: e.altKey });
        return;
      }
    },
    [searchOpen, searchResults, searchActiveIndex, jumpToSearchResult]
  );

  useEffect(() => {
    // closeSearchOnOutsideClick
    const onDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) {
        setSearchOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);



  const handleRowDoubleClick = async (id: string) => {
    if (!projectName) return;
    await openFormForNode(String(id), () => svc.fetchProtocolDetails(projectName, id));
  };

  const findNodeLabel = (id: string) => {
    const n = nodesRef.current.find((m) => m.id === id);
    return ((n as any)?.data?.label as string) ?? id;
  };

  // layoutConstantsForHierarchical
  const hierSpacingX = (dir: "TB" | "LR") => (dir === "TB" ? 300 : 1150);
  const hierSpacingY = (dir: "TB" | "LR") => (dir === "TB" ? 580 : 380);

  // minGapBetweenSiblings is intentionally small; packing should be compact
  const minGapBetweenSiblings = 40;
  const getLevelCoord = (dir: "TB" | "LR", pos: { x: number; y: number }) => (dir === "TB" ? pos.y : pos.x);
  const setLevelCoord = (dir: "TB" | "LR", pos: { x: number; y: number }, v: number) =>
    dir === "TB" ? { x: pos.x, y: v } : { x: v, y: pos.y };

  const getAxisCoord = (dir: "TB" | "LR", pos: { x: number; y: number }) => (dir === "TB" ? pos.x : pos.y);
  const setAxisCoord = (dir: "TB" | "LR", pos: { x: number; y: number }, v: number) =>
    dir === "TB" ? { x: v, y: pos.y } : { x: pos.x, y: v };


  const getAxisSize = (dir: "TB" | "LR", n: Node<any>) => {
    const anyN: any = n as any;
    const mw = Number(anyN.measured?.width ?? anyN.width);
    const mh = Number(anyN.measured?.height ?? anyN.height);

    // fallBackSize is intentionally conservative to avoid visual overlaps
    const width = Number.isFinite(mw) && mw > 0 ? Math.ceil(mw) : 900;
    const height = Number.isFinite(mh) && mh > 0 ? Math.ceil(mh) : 520;

    // addPadding to be safer with card shadows/margins
    return (dir === "TB" ? width : height) + 40;
  };

  const getLevelStep = (dir: "TB" | "LR") => (dir === "TB" ? hierSpacingY(dir) : hierSpacingX(dir));

  // inferNearestLevelKey snaps a raw point to the closest existing level among current nodes
  const inferNearestLevelKey = (dir: "TB" | "LR", point: { x: number; y: number }, nodesList: Node<any>[]) => {
    const step = getLevelStep(dir);
    const p = getLevelCoord(dir, point);

    let bestKey = Math.round(p / step);
    let bestDist = Number.POSITIVE_INFINITY;

    for (const n of nodesList) {
      const k = Math.round(getLevelCoord(dir, n.position) / step);
      const levelPos = k * step;
      const dist = Math.abs(levelPos - p);
      if (dist < bestDist) {
        bestDist = dist;
        bestKey = k;
      }
    }

    return bestKey;
  };

  // resolveOverlapsInLevel keeps anchorId fixed and packs siblings left/right to avoid overlaps
  const resolveOverlapsInLevel = (
    dir: "TB" | "LR",
    nodesList: Node<any>[],
    anchorId: string,
    levelKey: number
  ): Node<any>[] => {
    const step = getLevelStep(dir);
    const levelPos = levelKey * step;

    // collect nodes in the same level (snap tolerance: half step)
    const sameLevel = nodesList.filter((n) => {
      const k = Math.round(getLevelCoord(dir, n.position) / step);
      return k === levelKey;
    });

    if (sameLevel.length <= 1) {
      // snap anchor level coord anyway for stability
      return nodesList.map((n) => {
        if (n.id !== anchorId) return n;
        const snapped = setLevelCoord(dir, n.position, levelPos);
        return (snapped.x === n.position.x && snapped.y === n.position.y) ? n : { ...n, position: snapped };
      });
    }

    // sort by axis coordinate
    const sorted = [...sameLevel].sort((a, b) => getAxisCoord(dir, a.position) - getAxisCoord(dir, b.position));

    const idx = sorted.findIndex((n) => n.id === anchorId);
    if (idx < 0) return nodesList;

    // snap all nodes to exact level coord (prevents drift across levels)
    const posMap = new Map<string, { x: number; y: number }>();
    for (const n of sorted) posMap.set(n.id, setLevelCoord(dir, n.position, levelPos));

    // anchor stays fixed on axis (but snapped in level coord)
    const anchorPos = posMap.get(anchorId)!;
    const anchorAxis = getAxisCoord(dir, anchorPos);
    posMap.set(anchorId, setAxisCoord(dir, anchorPos, anchorAxis));

    // pass to the right
    for (let i = idx + 1; i < sorted.length; i++) {
      const prevId = sorted[i - 1].id;
      const curId = sorted[i].id;

      const prevPos = posMap.get(prevId)!;
      const curPos = posMap.get(curId)!;

      const prevAxis = getAxisCoord(dir, prevPos);
      const prevSize = getAxisSize(dir, sorted[i - 1]);
      const curAxis = getAxisCoord(dir, curPos);
      const curSize = getAxisSize(dir, sorted[i]);

      const prevRight = prevAxis + prevSize / 2;
      const minCenter = prevRight + minGapBetweenSiblings + curSize / 2;

      if (curAxis < minCenter) {
        posMap.set(curId, setAxisCoord(dir, curPos, minCenter));
      }
    }

    // pass to the left
    for (let i = idx - 1; i >= 0; i--) {
      const nextId = sorted[i + 1].id;
      const curId = sorted[i].id;

      const nextPos = posMap.get(nextId)!;
      const curPos = posMap.get(curId)!;

      const nextAxis = getAxisCoord(dir, nextPos);
      const nextSize = getAxisSize(dir, sorted[i + 1]);
      const curAxis = getAxisCoord(dir, curPos);
      const curSize = getAxisSize(dir, sorted[i]);

      const nextLeft = nextAxis - nextSize / 2;
      const maxCenter = nextLeft - minGapBetweenSiblings - curSize / 2;

      if (curAxis > maxCenter) {
        posMap.set(curId, setAxisCoord(dir, curPos, maxCenter));
      }
    }

    // apply back to full list (only same-level nodes changed)
    const changedIds = new Set(sorted.map((n) => n.id));
    return nodesList.map((n) => {
      if (!changedIds.has(n.id)) return n;
      const np = posMap.get(n.id)!;
      return (np.x === n.position.x && np.y === n.position.y) ? n : { ...n, position: np };
    });
  };


  // Try to find the newly created node and place it at pending point
  const tryPlaceNewlyCreatedNode = () => {
    const pending = pendingPlacementRef.current;
    if (!pending) return;

    if (viewModeRef.current !== "hierarchical") return;

    const { beforeIds, point } = pending;

    const currentIds = new Set(nodesRef.current.map((n) => String(n.id)));
    const candidates = Array.from(currentIds).filter((id) => !beforeIds.has(id) && id !== "PROJECT");
    if (candidates.length === 0) return;

    let pick = candidates[0];
    let bestNum = Number.NEGATIVE_INFINITY;
    for (const id of candidates) {
      const n = parseInt(id, 10);
      if (!Number.isNaN(n) && n > bestNum) {
        bestNum = n;
        pick = id;
      }
    }

    const dir = graphDirRef.current;

    setNodes((prev) => {
      const levelKey = inferNearestLevelKey(dir, point, prev);
      const levelPos = levelKey * getLevelStep(dir);

      // placeNewNodeAtPointButSnapToLevel
      const desiredPos = setLevelCoord(dir, { x: point.x, y: point.y }, levelPos);

      const placed = prev.map((n) => (n.id === pick ? { ...n, position: desiredPos } : n));

      // resolveOverlapsOnlyInThatLevel
      const resolved = resolveOverlapsInLevel(dir, placed, pick, levelKey);

      // persistUpdatedLevelPositions
      const levelIds = resolved
        .filter((n) => Math.round(getLevelCoord(dir, n.position) / getLevelStep(dir)) === levelKey)
        .map((n) => ({ id: n.id, position: n.position }));

      // note: side effect inside setState is acceptable here because it is idempotent and tied to user action
      persistPositionsBulk(dir, levelIds);

      return resolved;
    });

    pendingPlacementRef.current = null;
  };

  const tryResolveNewNodesCollisions = () => {
    const pending = pendingNewNodesRef.current;
    if (!pending) return;

    if (viewModeRef.current !== "hierarchical") return;

    const currentIds = new Set(nodesRef.current.map((n) => String(n.id)));
    const newIds = Array.from(currentIds).filter(
      (id) => !pending.beforeIds.has(id) && id !== "PROJECT"
    );

    if (newIds.length === 0) return;

    const dir = graphDirRef.current;

    setNodes((prev) => {
      const step = getLevelStep(dir);

      // groupNewNodesByLevelKey
      const newIdsByLevel = new Map<number, string[]>();
      for (const id of newIds) {
        const node = prev.find((n) => String(n.id) === id);
        if (!node) continue;

        const levelKey = Math.round(getLevelCoord(dir, node.position) / step);
        const arr = newIdsByLevel.get(levelKey) ?? [];
        arr.push(id);
        newIdsByLevel.set(levelKey, arr);
      }

      // ifNodesNotReadyYetKeepPendingForNextRetry
      if (newIdsByLevel.size === 0) return prev;

      // processLevelsInStableOrder
      const levelKeys = Array.from(newIdsByLevel.keys()).sort((a, b) => a - b);

      let nodesAcc = prev;
      const changedMap = new Map<string, { x: number; y: number }>();

      for (const levelKey of levelKeys) {
        const idsInLevel = newIdsByLevel.get(levelKey) ?? [];
        if (idsInLevel.length === 0) continue;

        // pickAnchorForThisLevel: highestNumericIdForStability
        let anchorId = idsInLevel[0];
        let bestNum = Number.NEGATIVE_INFINITY;
        for (const id of idsInLevel) {
          const n = parseInt(id, 10);
          if (!Number.isNaN(n) && n > bestNum) {
            bestNum = n;
            anchorId = id;
          }
        }

        // snapshotPositionsInThisLevelBefore
        const beforePos = new Map<string, { x: number; y: number }>();
        for (const n of nodesAcc) {
          const k = Math.round(getLevelCoord(dir, n.position) / step);
          if (k === levelKey) beforePos.set(String(n.id), n.position);
        }

        // resolveOverlapsForThisLevel
        nodesAcc = resolveOverlapsInLevel(dir, nodesAcc, anchorId, levelKey);

        // collectChangesForPersistence
        for (const n of nodesAcc) {
          const k = Math.round(getLevelCoord(dir, n.position) / step);
          if (k !== levelKey) continue;

          const prevP = beforePos.get(String(n.id));
          if (!prevP) continue;

          if (prevP.x !== n.position.x || prevP.y !== n.position.y) {
            changedMap.set(String(n.id), n.position);
          }
        }
      }

      const changedItems = Array.from(changedMap.entries()).map(([id, position]) => ({
        id,
        position,
      }));

      if (changedItems.length) {
        // note: side effect inside setState is acceptable here because it is idempotent and tied to user action
        persistPositionsBulk(dir, changedItems);
      }

      // clearPendingOnceApplied (only if we actually processed at least one level)
      pendingNewNodesRef.current = null;

      return nodesAcc;
    });
  };




  const handleContextMenu = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    const isNode = !!target.closest(".react-flow__node");
    if (isNode) return;

    // preventCtrlClickContextMenuOnMac
    if (isMac && event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const inst = reactFlowInstanceRef.current;
    const wrapper = flowWrapperRef.current;
    if (inst && wrapper) {
      const bounds = wrapper.getBoundingClientRect();
      const px = event.clientX - bounds.left;
      const py = event.clientY - bounds.top;

      const rfPoint = inst.project({ x: px, y: py });
      lastPaneRFPointRef.current = rfPoint;

      const MENU_W = 230;
      const MENU_H = 150;
      const clampedX = Math.max(0, Math.min(px, bounds.width - MENU_W));
      const clampedY = Math.max(0, Math.min(py, bounds.height - MENU_H));

      setContextMenu({ visible: true, x: clampedX, y: clampedY, nodeId: null });
    } else {
      lastPaneRFPointRef.current = null;
      setContextMenu({ visible: true, x: event.clientX, y: event.clientY, nodeId: null });
    }
  };

  const handleCloseMenu = () => setContextMenu((prev) => ({ ...prev, visible: false }));

  useEffect(() => {
    if (!contextMenu.visible) return;
    const onWindowMouseDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest?.("#canvas-context-menu")) handleCloseMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") handleCloseMenu(); };
    window.addEventListener("mousedown", onWindowMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onWindowMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu.visible]);

  const handleAddProtocolFromContext = () => {
    handleCloseMenu();

    // Ensure mutual exclusivity: opening Protocols closes Workflows
    setWorkflowsOpen(false);
    closeAllDockedForms();
    setDrawerOpen(true);

    const point = lastPaneRFPointRef.current;
    if (!point) {
      const inst = reactFlowInstanceRef.current;
      if (inst) {
        const vp = inst.getViewport();
        lastPaneRFPointRef.current = { x: -vp.x / vp.zoom, y: -vp.y / vp.zoom };
      }
    }

    const beforeIds = new Set(nodesRef.current.map((n) => String(n.id)));
    pendingPlacementRef.current = {
      point: lastPaneRFPointRef.current ?? { x: 0, y: 0 },
      beforeIds,
    };

    setDrawerOpen(true);
  };

  /* ------------------------ ReactFlow init / move / selection ------------------------ */
  const handleOnInit = useCallback((inst: ReactFlowInstance) => {
    reactFlowInstanceRef.current = inst;
    try {
      const current = inst.getViewport();
      const desiredZoom = viewMode === "grid" ? GRID_ZOOM : clampZoom(viewportRef.current.zoom ?? current.zoom);
      if (viewMode === "grid") {
        inst.setViewport({ x: 0, y: 0, zoom: GRID_ZOOM });
        setViewport({ x: 0, y: 0, zoom: GRID_ZOOM });
      } else {
        inst.setViewport({ x: current.x, y: current.y, zoom: desiredZoom });
        const vp = inst.getViewport();
        setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
        if (firstLoadRef.current) {
          const expected = nodesRef.current?.length ?? 0;
          if (expected > 0) {
            (async () => {
              const ok = await waitForNodesReady(expected, 2000);
              if (ok && firstLoadRef.current && viewModeRef.current === "hierarchical") {
                centerLikeButton(nodesRef.current, true, viewportRef.current.zoom);
                firstLoadRef.current = false;
              }
            })();
          }
        }
      }
    } catch { }
  }, [viewMode]);

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
      syncUnifiedSelectedIds();
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
      syncUnifiedSelectedIds();
      return;
    }

    selectedIdRef.current = null;
    setPreviousNodeId(null);
    setHighlightedId(null);
    clearPathSelection();
    applyEdgeHighlight(null);
    setNodes((prev) => (prev.some((n) => n.selected) ? prev.map((n) => ({ ...n, selected: false })) : prev));
    syncUnifiedSelectedIds();
  }, [setNodes, applyGenericSelectionFromSet, clearPathSelection, applyEdgeHighlight]);


  /* ------------------------ Dialogs + API ------------------------ */
  const [dlgRename, setDlgRename] = useState<{ open: boolean; id: string | null; value: string }>({
    open: false, id: null, value: "",
  });
  const [dlgResetFrom, setDlgResetFrom] = useState<{ open: boolean; id: string | null }>({
    open: false, id: null,
  });

  // deleteDialogState
  const [dlgDelete, setDlgDelete] = useState<{ open: boolean; ids: string[] }>({
    open: false,
    ids: [],
  });

  // restartAllDialogState
  const [dlgRestartAll, setDlgRestartAll] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  // continueAllDialogState
  const [dlgContinueAll, setDlgContinueAll] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  // stopDialogState
  const [dlgStop, setDlgStop] = useState<{ open: boolean; ids: string[] }>({
    open: false,
    ids: [],
  });

  const [deleteBusy, setDeleteBusy] = useState(false);
  const [restartAllBusy, setRestartAllBusy] = useState(false);
  const [continueAllBusy, setContinueAllBusy] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);


  type ApiWorkflowResponse = {
    status: number;
    errors: string[];
    workflow: unknown[];
  };

  const showApiErrorsToast = (errors: unknown, fallbackMessage: string) => {
    const list = Array.isArray(errors) ? errors.map((x) => String(x)).filter(Boolean) : [];
    const msg = list.length ? list : [fallbackMessage];

    toast.error(
      <div style={{ maxWidth: 520 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Operation failed</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {msg.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    );
  };

  const ensureApiOk = (res: ApiWorkflowResponse, fallbackMessage: string): boolean => {
    const status = Number(res.status);

    if (!Number.isFinite(status)) {
      toast.error(fallbackMessage);
      return false;
    }

    if (status !== 0) {
      showApiErrorsToast(res.errors, fallbackMessage);
      return false;
    }

    return true;
  };


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

    // snapshotIdsBeforeDuplicate
    pendingNewNodesRef.current = {
      beforeIds: new Set(nodesRef.current.map((n) => String(n.id))),
    };

    try {
      const items = cleanIds.map((id) => ({ id, name: genCopyName(id) }));
      await svc.duplicateProtocol(projectName, items);
      toast.success(cleanIds.length > 1 ? "Protocols duplicated successfully." : "Protocol duplicated successfully.");

      clearAllSelectionHard();
      await Promise.resolve(handleRefreshRef.current?.());
    } catch (e) {
      console.error(e);
      toast.error(getErrorMsg(e));
      pendingNewNodesRef.current = null;
    }
  };


  const openRename = (id: string) => setDlgRename({ open: true, id, value: findNodeLabel(id) });

  const openDelete = (id: string) => {
    const selected =
      pathSelRef.current.nodes.size > 0
        ? Array.from(pathSelRef.current.nodes).map(String).filter((x) => x !== "PROJECT")
        : [String(id)];

    setDlgDelete({ open: true, ids: selected });
  };

  const openRestartAll = (id: string) => setDlgRestartAll({ open: true, id: String(id) });

  const openContinueAll = (id: string) => setDlgContinueAll({ open: true, id: String(id) });

  const openStop = (id: string) => {
    const ids =
      pathSelRef.current.nodes.size > 0
        ? Array.from(pathSelRef.current.nodes).map(String).filter((x) => x !== "PROJECT")
        : [String(id)];

    setDlgStop({ open: true, ids });
  };




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
    if (viewMode === "grid") return;
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    const vp = inst.getViewport();
    const newZoom = Math.min(vp.zoom * ZOOM_FACTOR, MAX_ZOOM);
    inst.setViewport({ x: vp.x, y: vp.y, zoom: newZoom });
    const newVp = inst.getViewport();
    setViewport({ x: newVp.x, y: newVp.y, zoom: newVp.zoom });
  }, [viewMode]);
  const handleZoomOut = useCallback(() => {
    if (viewMode === "grid") return;
    const inst = reactFlowInstanceRef.current ?? (window as any).reactFlowInstance;
    if (!inst) return;
    const vp = inst.getViewport();
    const newZoom = Math.max(vp.zoom / ZOOM_FACTOR, MIN_ZOOM);
    inst.setViewport({ x: vp.x, y: vp.y, zoom: newZoom });
    const newVp = inst.getViewport();
    setViewport({ x: newVp.x, y: newVp.y, zoom: newVp.zoom });
  }, [viewMode]);
  const handleFitView = useCallback(() => {
    if (viewMode === "grid") {
      snapViewportToTopLeft(GRID_ZOOM);
      return;
    }
    centerLikeButton(undefined, true);
  }, [viewMode, centerLikeButton, snapViewportToTopLeft]);

  /* ------------------------ Wrapper plumbing (unchanged) ------------------------ */
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


  // --- Global node keyboard shortcuts ---
  useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const modPressed = (ev: KeyboardEvent) => (isMac ? ev.metaKey : ev.ctrlKey);

    const isTypingTarget = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      return !!t.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
      );
    };

    const getSelectedIds = (): string[] => {
      if (pathSelRef.current.nodes.size > 0) {
        return Array.from(pathSelRef.current.nodes)
          .map(String)
          .filter((id) => id !== "PROJECT");
      }
      const id = selectedIdRef.current;
      return id && id !== "PROJECT" ? [id] : [];
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const anyActionDialogOpen =
        dlgDelete.open || dlgRestartAll.open || dlgContinueAll.open || dlgStop.open;

      if (
        dlgRename.open ||
        anyActionDialogOpen ||
        dlgResetFrom.open ||
        fileDialogOpen ||
        drawerOpen ||
        contextMenu.visible ||
        isTypingTarget(e.target)
      ) {
        return;
      }

      const ids = getSelectedIds();
      const selectedId = selectedIdRef.current;

      if ((e.key === " " || e.key === "Enter" || e.code === "Space" || e.key === "Spacebar") && selectedId) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        handleNodeDoubleClick({ id: selectedId });
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && ids.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        openDelete(ids[0]);
        return;
      }

      if (e.key === "F2" && selectedId) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        openRename(selectedId);
        return;
      }

      if (modPressed(e) && !e.shiftKey && e.key.toLowerCase() === "d" && ids.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        duplicateNow(ids);
        return;
      }

      if (modPressed(e) && !e.shiftKey && e.key.toLowerCase() === "b" && selectedId) {
        e.preventDefault();
        openBrowse(selectedId, project?.id, findNodeLabel(selectedId));
        return;
      }

      if (modPressed(e) && e.shiftKey && e.key.toLowerCase() === "r" && selectedId) {
        e.preventDefault();
        openRestartAll(selectedId);
        return;
      }

      if (modPressed(e) && e.shiftKey && e.key.toLowerCase() === "c" && selectedId) {
        e.preventDefault();
        openContinueAll(selectedId);
        return;
      }

      if (modPressed(e) && e.shiftKey && e.key.toLowerCase() === "f" && selectedId) {
        e.preventDefault();
        return;
      }

      if (modPressed(e) && e.shiftKey && e.key.toLowerCase() === "s" && selectedId) {
        e.preventDefault();
        openStop(selectedId);
        return;
      }

      if (!modPressed(e) && e.altKey && e.key === "ArrowDown" && selectedId) {
        e.preventDefault();
        handleSelectFrom(selectedId);
        return;
      }

      if (!modPressed(e) && e.altKey && e.key === "ArrowUp" && selectedId) {
        e.preventDefault();
        handleSelectTo(selectedId);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
  }, [
    project?.id,
    drawerOpen,
    fileDialogOpen,
    contextMenu.visible,
    dlgRename.open,
    dlgResetFrom.open,
    dlgDelete.open,
    dlgRestartAll.open,
    dlgContinueAll.open,
    dlgStop.open,
    handleNodeDoubleClick,
    openDelete,
    openRename,
    openRestartAll,
    openContinueAll,
    openStop,
    handleSelectFrom,
    handleSelectTo,
  ]);

  function getHostIsDark() {
    const html = document.documentElement;
    const body = document.body;

    const htmlDark = html.classList.contains("dark") || html.getAttribute("data-theme") === "dark";
    const bodyDark = body?.classList.contains("dark") || body?.getAttribute("data-theme") === "dark";

    return Boolean(htmlDark || bodyDark);
  }

  function useHostDarkMode() {
    const [isDark, setIsDark] = useState<boolean>(() => {
      if (typeof document === "undefined") return false;
      return getHostIsDark();
    });

    useEffect(() => {
      // syncThemeFromHost
      const sync = () => setIsDark(getHostIsDark());
      sync();

      const obs = new MutationObserver(() => sync());

      try {
        obs.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class", "data-theme"],
        });
        if (document.body) {
          obs.observe(document.body, {
            attributes: true,
            attributeFilter: ["class", "data-theme"],
          });
        }
      } catch {
        // noOp
      }

      return () => obs.disconnect();
    }, []);

    return isDark;
  }


  // focusModeDerivedGraph
  const focusActive =
    focusModeEnabled &&
    unifiedSelectedIdsState.size > 0 &&
    viewMode !== "table";

  const renderNodes = useMemo(() => {
    // deriveRenderNodes
    const tagFilterSet = new Set(tagFilterIds);
    const tagFilterActive = tagFilterSet.size > 0;

    const dimOpacity = 0.18;

    let anyChanged = false;

    const next = nodes.map((n) => {
      const nodeId = String(n.id);

      // keepProjectNodeAsIs
      if (nodeId === "PROJECT") return n;

      const dataAny: any = (n as any).data ?? {};
      const assignedTagIds = pickFirstNonEmptyTagIds(
        tagAssignments[nodeId],
        dataAny.tagIds,
        dataAny.tags
      );


      const matchesTagFilter = !tagFilterActive
        ? true
        : assignedTagIds.some((tid) => tagFilterSet.has(tid));

      const tagColor = assignedTagIds.length ? tagById.get(assignedTagIds[0])?.color : undefined;

      const inFocus = focusActive ? unifiedSelectedIdsState.has(nodeId) : true;

      const shouldDim = (focusActive && !inFocus) || (tagFilterActive && !matchesTagFilter);
      const desiredOpacity = shouldDim ? dimOpacity : 1;

      const baseStyle: any = (n as any).style ?? {};
      const curOpacity = typeof baseStyle.opacity === "number" ? baseStyle.opacity : 1;

      const curColor = typeof dataAny.color === "string" ? dataAny.color : undefined;


      const curTagIds = normalizeTagIds((dataAny as any).tagIds);
      const sameTags =
        curTagIds.length === assignedTagIds.length &&
        curTagIds.every((x) => assignedTagIds.includes(x)) &&
        assignedTagIds.every((x) => curTagIds.includes(x));

      const nextDataWithTags = sameTags
        ? dataAny
        : { ...dataAny, tagIds: assignedTagIds }; // keepNodeDataInSyncWithAssignments


      const nextStyle =
        curOpacity === desiredOpacity && (!focusActive || baseStyle.zIndex === (inFocus ? 10 : 0))
          ? baseStyle
          : {
            ...baseStyle,
            opacity: desiredOpacity,
            zIndex: focusActive ? (inFocus ? 10 : 0) : baseStyle.zIndex,
          };

      const baseData = nextDataWithTags;

      const nextData =
        tagColor && curColor !== tagColor
          ? { ...baseData, color: tagColor }
          : baseData; // deriveColorFromFirstTagIfPresent

      const styleChanged = nextStyle !== baseStyle;
      const dataChanged = nextData !== dataAny;

      if (!styleChanged && !dataChanged) return n;

      anyChanged = true;
      return { ...n, style: nextStyle, data: nextData };
    });

    return anyChanged ? next : nodes;
  }, [nodes, focusActive, unifiedSelectedIdsState, tagFilterIds, tagAssignments, tagById]);


  const renderEdges = useMemo(() => {
    // deriveRenderEdges
    if (!focusActive) return edges;

    const dimOpacity = 0.1;

    // keepContextEdges
    const focusEdgeIds = new Set<string>();
    const hasPathEdges = pathSelRef.current.edges.size > 0;

    if (hasPathEdges) {
      for (const id of pathSelRef.current.edges) focusEdgeIds.add(String(id));
    } else {
      for (const e of edges) {
        const s = String(e.source);
        const t = String(e.target);
        if (unifiedSelectedIdsState.has(s) || unifiedSelectedIdsState.has(t)) {
          focusEdgeIds.add(String(e.id));
        }
      }
    }

    return edges.map((e) => {
      const inFocus = focusEdgeIds.has(String(e.id));
      const baseStyle: any = (e as any).style ?? {};
      const desiredOpacity = inFocus ? 1 : dimOpacity;

      const currentOpacity =
        typeof baseStyle.opacity === "number" ? baseStyle.opacity : 1;

      if (currentOpacity === desiredOpacity) return e;

      return {
        ...e,
        style: {
          ...baseStyle,
          opacity: desiredOpacity,
        },
      };
    });
  }, [edges, focusActive, unifiedSelectedIdsState]);


  /* ------------------------ Render ------------------------ */
  const isGrid = viewMode === "grid";
  return (
    <div className={`projectpage-widget-root ${hostIsDark ? "dark" : ""}`}>
      <div className="h-app min-h-0 flex flex-col relative overflow-hidden bg-background text-foreground">

        {/* Header */}
        <div className="pp-headerRow">
          <div className="pp-headerLeft">
            <div ref={searchBoxRef} className="pp-searchBox">
              <div className="pp-searchIconWrap" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="pp-searchIcon"
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
                value={searchQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => {
                  if (searchQuery.trim()) setSearchOpen(true);
                }}
                className="pp-searchInput"
              />

              {searchOpen && searchQuery.trim() && (
                <div className="pp-searchDropdown" role="listbox" aria-label="Search results">
                  {searchResults.length === 0 ? (
                    <div className="pp-searchEmpty" role="status">
                      No matches
                    </div>
                  ) : (
                    searchResults.map((r, idx) => (
                      <button
                        key={r.id}
                        type="button"
                        role="option"
                        aria-selected={idx === searchActiveIndex}
                        className={[
                          "pp-searchItem",
                          idx === searchActiveIndex ? "is-active" : "",
                        ].join(" ")}
                        onMouseDown={(ev) => {
                          // preventInputBlurBeforeClick
                          ev.preventDefault();
                        }}
                        onMouseEnter={() => setSearchActiveIndex(idx)}
                        onClick={() => {
                          void jumpToSearchResult(r);
                        }}
                        title={`${r.id} — ${r.label}`}
                      >
                        <div className="pp-searchItemMain">
                          <span className="pp-searchItemId">{r.id}</span>
                          <span className="pp-searchItemLabel">{r.label}</span>
                        </div>

                        <span
                          className="pp-searchItemStatus"
                          style={getStatusStyle(r.status)}
                        >
                          {r.status ?? "—"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="pp-headerCard pp-tagsCard">
              <div className="pp-tagsActions">
                <button
                  type="button"
                  onClick={() => setTagManagerOpen(true)}
                  className="pp-chipBtn"
                  title="Manage tags"
                >
                  <TagsIcon className="pp-btnIcon" />
                  <span>Tags</span>
                </button>

              </div>
              <div className="pp-tagsPicker">
                <TagPicker
                  allTags={allTags}
                  selectedTagIds={tagFilterIds}
                  onChange={setTagFilterIds}
                  disablePortal={false}
                />
              </div>
            </div>
          </div>

          <div className="pp-headerCenter">

            <div className="pp-headerCard pp-actionsCard">
              <div className="pp-protocolsTrigger">
                <ProtocolsDrawer
                  projectId={project?.id ? Number(project.id) : null}
                  open={drawerOpen}
                  onOpenChange={handleProtocolsDrawerOpenChange}
                  onProtocolDoubleClick={handleAddProtocolFromDrawer}
                  onProtocolHelpClick={(protocolClass, protocolLabel) => {
                    // openProtocolHelpFromDrawer
                    void openProtocolHelp(protocolClass, protocolLabel);
                  }}
                  portalContainer={drawerPortalContainer}
                />
              </div>

              <button
                type="button"
                onClick={handleOpenWorkflows}
                disabled={workflowsLoading || !projectName}
                className="pp-chipBtn"
              >
                <TreeIcon className="pp-btnIcon" />
                <span>{workflowsLoading ? "Loading..." : "Workflows"}</span>
              </button>
            </div>
          </div>

          <div className="pp-headerRight">
            <div className="pp-headerCard pp-viewCard">
              <span className="pp-viewLabel">View modes</span>

              <div className="pp-toggleGroup" role="group" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("hierarchical");
                    setGraphDirection("TB");
                  }}
                  aria-pressed={viewMode === "hierarchical" && graphDirection === "TB"}
                  data-active={viewMode === "hierarchical" && graphDirection === "TB"}
                  className="pp-toggleBtn"
                  title="Tree TB"
                >
                  <TreeIcon className="pp-btnIcon" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode("hierarchical");
                    setGraphDirection("LR");
                  }}
                  aria-pressed={viewMode === "hierarchical" && graphDirection === "LR"}
                  data-active={viewMode === "hierarchical" && graphDirection === "LR"}
                  className="pp-toggleBtn"
                  title="Tree LR"
                >
                  <TreeIcon className="pp-btnIcon pp-rotateLeft" />
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-pressed={viewMode === "grid"}
                  data-active={viewMode === "grid"}
                  className="pp-toggleBtn"
                  title="Grid"
                >
                  <LayoutGrid className="pp-btnIcon" />
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  aria-pressed={viewMode === "table"}
                  data-active={viewMode === "table"}
                  className="pp-toggleBtn"
                  title="Table"
                >
                  <TableIcon className="pp-btnIcon" />
                </button>
              </div>
            </div>

          </div>
        </div>


        {/* Content wrapper */}
        <div ref={contentPortalRef} className="flex-1 relative min-h-0 overflow-hidden" style={{ contain: "paint" }}>
          {/* removed switching overlay to avoid flicker */}

          {isLoadingProject && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 z-[80] flex flex-col items-center justify-center bg-white/75 dark:bg-gray-900/75 backdrop-blur-[2px]"
              style={{ pointerEvents: "auto" }}
            >
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
          {/* TABLE */}
          <div
            ref={tableContainerRef}
            className={viewMode === "table" ? "pp-tableShell" : "pp-tableShell pp-hidden"}
            aria-hidden={viewMode !== "table"}
          >
            <div className="pp-tableToolbar">
              <button
                type="button"
                className="pp-iconBtn"
                title="Refresh project"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`pp-icon ${isRefreshing ? "pp-spin" : ""}`} />
              </button>
            </div>

            <div className="pp-tableCard">
              <table className="pp-table" role="grid">
                <thead className="pp-thead">
                  <tr className="pp-trHead">
                    <th className="pp-th">Id</th>
                    <th className="pp-th">Protocol</th>
                    <th className="pp-th">State</th>
                    <th className="pp-th">Elapsed</th>
                    <th className="pp-th">Dependent</th>
                  </tr>
                </thead>

                <tbody className="pp-tbody">
                  {filteredTableData.map((row) => (
                    <tr
                      key={row.id}
                      ref={(el) => {
                        rowRefs.current[row.id] = el;
                      }}
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
                              ? n.selected
                                ? n
                                : { ...n, selected: true }
                              : n.selected
                                ? { ...n, selected: false }
                                : n
                          )
                        );

                        selectedIdRef.current = row.id;
                        setPreviousNodeId(row.id);
                        setHighlightedId(row.id);
                        applyEdgeHighlight(row.id);
                      }}
                      onDoubleClick={() => handleRowDoubleClick(row.id)}
                      className={[
                        "pp-tr",
                        highlightedId === row.id ? "pp-trHighlighted" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td className="pp-td">
                        <div className="pp-idPill">{row.id}</div>
                      </td>

                      <td className="pp-td">
                        <div className="pp-protocolCell">{row.label}</div>
                      </td>

                      <td className="pp-td">
                        <div className="pp-stateCell">
                          <span
                            className={[
                              "pp-statusBadge",
                              row.status === "running" ? "pp-statusPulse" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={getStatusStyle(row.status)}
                          >
                            {row.status ?? "—"}
                          </span>

                          {(row.status === "running" ||
                            row.status === "failed" ||
                            row.status === "aborted") && (
                              <div className="pp-progressWrap" data-status={row.status}>
                                <div className="pp-progressTrack">
                                  <div
                                    className="pp-progressFill"
                                    style={{
                                      width: `${((row.stepsDone ?? 0) / (row.numberOfSteps ?? 1)) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="pp-progressText">
                                  {row.stepsDone}/{row.numberOfSteps}
                                </span>
                              </div>
                            )}
                        </div>
                      </td>

                      <td className="pp-td">
                        <span className="pp-elapsedText">
                          {formatCpuTime(row.tick ?? Number(row.elapsedTime) ?? 0)}
                        </span>
                      </td>

                      <td className="pp-td">
                        <div className="pp-deps">
                          {row.children?.map((childId: string) => (
                            <button
                              key={childId}
                              type="button"
                              className="pp-linkBtn"
                              onClick={() => scrollToProtocol(childId)}
                              title={`Go to ${childId}`}
                            >
                              {childId}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>


          {/* ReactFlow */}
          <div
            ref={flowWrapperRef}
            className={`absolute inset-0 border ${viewMode !== "table" ? "" : "hidden"}`}
            data-view-mode={viewMode}
            aria-hidden={viewMode === "table"}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* === Canvas context menu === */}
            {contextMenu.visible && (
              <div
                id="canvas-context-menu"
                className="pp-canvasMenu"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <button className="pp-canvasMenuItem" onClick={handleAddProtocolFromContext}>
                  <PlusIcon className="pp-canvasMenuIcon" />
                  <span className="text-sm mb-1">Add protocol</span>
                </button>

                <div className="pp-canvasMenuSep" />

                <button
                  className="pp-canvasMenuItem"
                  onClick={() => { handleRefresh(); handleCloseMenu(); }}
                >
                  <RefreshCw className="pp-canvasMenuIcon" />
                  <span className="text-sm mb-2">Refresh graph</span>
                </button>

                <button
                  className="pp-canvasMenuItem"
                  onClick={() => { clearAllSelectionHard(); applyEdgeHighlight(null); handleCloseMenu(); }}
                >
                  <XCircle className="pp-canvasMenuIcon" />
                  <span className="text-sm">Clear selection</span>
                </button>
              </div>
            )}


            <div className="pp-flowControlsWrap">
              <div className="pp-flowControls">
                <button
                  type="button"
                  title={isGrid ? "Zoom disabled in Grid" : "Zoom in"}
                  onClick={handleZoomIn}
                  disabled={isGrid}
                  className="pp-flowControlBtn"
                >
                  <PlusIcon className="pp-btnIcon" />
                </button>

                <button
                  type="button"
                  title={isGrid ? "Zoom disabled in Grid" : "Zoom out"}
                  onClick={handleZoomOut}
                  disabled={isGrid}
                  className="pp-flowControlBtn"
                >
                  <MinusIcon className="pp-btnIcon" />
                </button>

                <button
                  type="button"
                  title={isGrid ? "Fixed zoom (Grid)" : "Fit view (preserve zoom)"}
                  onClick={handleFitView}
                  className="pp-flowControlBtn"
                >
                  <FitViewIcon className="pp-btnIcon" />
                </button>

                <button
                  type="button"
                  title="Reorganize project"
                  onClick={() => handleReorganize({ preserveZoom: true })}
                  className="pp-flowControlBtn"
                >
                  <TreeIcon className="pp-btnIcon" />
                </button>

                <button
                  type="button"
                  title="Refresh project"
                  onClick={handleRefresh}
                  className="pp-flowControlBtn"
                >
                  <RefreshCw className={`pp-btnIcon ${isRefreshing ? "animate-spin" : ""}`} />
                </button>

                <button
                  type="button"
                  title={miniMapEnabled ? "Hide minimap" : "Show minimap"}
                  onClick={() => setMiniMapEnabled((v) => !v)}
                  className="pp-flowControlBtn"
                  aria-pressed={miniMapEnabled}
                >
                  <MapIcon className="pp-btnIcon" />
                </button>

                <button
                  type="button"
                  onClick={() => setFocusModeEnabled((v) => !v)}
                  aria-pressed={focusModeEnabled}
                  className="pp-flowControlBtn"
                  title={focusModeEnabled ? "Focus selection: Off" : "Focus selection: On"}
                >
                  <FocusIcon className="pp-btnIcon" />
                </button>

              </div>
            </div>


            <ReactFlowProvider>
              <ReactFlow
                nodes={renderNodes}
                edges={renderEdges}
                // preventReactFlowDefaultDeleteeKeyCode is set to null to allow global handling of delete key for both nodes and edges without interference from React Flow's internal handling, enabling custom delete logic that can consider both nodes and edges together.
                deleteKeyCode={null}
                onNodesChange={handleNodesChangeWithPersistence}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                minZoom={isGrid ? GRID_ZOOM : MIN_ZOOM}
                maxZoom={isGrid ? GRID_ZOOM : MAX_ZOOM}
                zoomOnScroll={!isGrid}
                zoomOnPinch={!isGrid}
                zoomOnDoubleClick={false}
                onInit={handleOnInit}
                onMoveEnd={handleOnMoveEnd}
                onPaneClick={() => {
                  handleCloseMenu();
                  clearAllSelectionHard();
                  applyEdgeHighlight(null);
                }}
                onSelectionChange={onSelectionChange}
                onPaneContextMenu={handleContextMenu}
                defaultViewport={viewport}
                defaultEdgeOptions={{
                  type: "default",
                  style: { stroke: "#999", strokeWidth: 2 },
                  markerEnd: { type: MarkerType.ArrowClosed },
                }}
                onNodeDoubleClick={(_, node) => handleNodeDoubleClick(node)}
                onNodeClick={(evt, node) => handleNodeClick(node, evt)}
                multiSelectionKeyCode={isMac ? "Meta" : "Control"}
                selectionKeyCode="Shift"
                selectionOnDrag
                style={{ width: "100%", height: "100%" }}
                proOptions={{ hideAttribution: true }}
                nodesConnectable={viewMode !== "grid"}
                connectOnClick={viewMode !== "grid"}
              >
                {miniMapEnabled && (
                  <MiniMap
                    position="bottom-left"
                    nodeColor={getMiniMapNodeColor}
                    nodeStrokeColor={getMiniMapNodeStroke}
                    nodeStrokeWidth={2}
                    pannable
                    zoomable
                    zoomStep={1.2}
                    maskColor={hostIsDark ? "rgba(15,23,42,0.55)" : "rgba(0,0,0,0.18)"}
                    style={{
                      background: hostIsDark ? "rgba(2,6,23,0.85)" : "rgba(255,255,255,0.92)",
                      border: hostIsDark ? "1px solid rgba(148,163,184,0.22)" : "1px solid rgba(0,0,0,0.12)",
                      borderRadius: 10,
                      boxShadow: hostIsDark ? "0 10px 26px rgba(0,0,0,0.45)" : "0 10px 26px rgba(0,0,0,0.16)",
                    }}
                  />
                )}
                <Background />
              </ReactFlow>
            </ReactFlowProvider>
          </div>

          {/* ===== Multi-Form Dock (right side) ===== */}
          <div className="dock-wrapper" style={{ zIndex: 60 }}>

            <div
              ref={dockRef}
              className={openForms.length ? "dock-scroll custom-scrollbar" : "hidden"}
            >
              {openForms.map((f) => (
                <div
                  key={f.key}
                  role="dialog"
                  aria-label={`Protocol ${f.id}`}
                  data-dock-key={f.key}
                  className="dock-panel"
                >
                  <ProtocolForm
                    data={f.details}
                    projectProtocols={project?.protocols ?? {}}
                    variant="docked"
                    onClose={() => {
                      handleRefreshRef.current?.();
                      setTimeout(() => handleRefreshRef.current?.(), 800);

                      setTimeout(() => tryPlaceNewlyCreatedNode(), 50);
                      setTimeout(() => tryPlaceNewlyCreatedNode(), 400);

                      closeFormByKey(f.key);
                    }}
                    onExecuted={() => {
                      scheduleDoubleRefresh(5000, true);
                    }}
                  />
                </div>
              ))}
            </div>

          </div>

          <ProjectWorkflowsPanel
            open={workflowsOpen}
            onClose={() => setWorkflowsOpen(false)}
            workflows={workflows}
            loading={workflowsLoading}
            errorMessage={workflowsError}
            projectId={Number(project?.id)}
            onRetry={handleOpenWorkflows}
          />

        </div>

        {/* --- Dialogs --- */}
        <Dialog open={dlgRename.open} onOpenChange={(open: boolean) => { if (!open) setDlgRename({ open: false, id: null, value: "" }); }}>
          <DialogContent container={dialogContainer ?? undefined} className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Rename protocol</DialogTitle>
              <DialogDescription>Set a new name for this protocol.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <Label htmlFor="rename">New name</Label>
              <Input id="rename" value={dlgRename.value} onChange={(e) => setDlgRename((s) => ({ ...s, value: (e.target as any).value }))} placeholder="e.g. motioncorr_02" />
            </div>
            <DialogFooter>
              <Button onClick={() => setDlgRename({ open: false, id: null, value: "" })} className="pp-dialogBtn">
                Cancel
              </Button>
              <Button onClick={submitRename} disabled={!dlgRename.value.trim()} className="pp-dialogBtn pp-dialogBtnPrimary">
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        <Dialog open={dlgResetFrom.open} onOpenChange={(open: boolean) => { if (!open) setDlgResetFrom({ open: false, id: null }); }}>
          <DialogContent container={dialogContainer ?? undefined} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset from this protocol?</DialogTitle>
              <DialogDescription>Downstream steps may be invalidated. You can re-run them later.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button onClick={() => setDlgResetFrom({ open: false, id: null })}
                className="pp-dialogBtn">
                Cancel
              </button>
              <button
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
                className="pp-dialogBtn pp-dialogBtnPrimary"
              >
                Reset from here
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={protocolHelp.open}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setProtocolHelp((s) => ({ ...s, open: false, loading: false, error: null }));
            }
          }}
        >
          <DialogContent
            container={dialogContainer ?? undefined}
            className="sm:max-w-2xl p-0 overflow-hidden border border-border bg-background shadow-xl rounded-xl pp-helpDialog"
          >
            {/* Header */}
            <div
              className="border-b border-border"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#333d49",
                color: "white",
                padding: "12px 16px",
                boxSizing: "border-box",
              }}
            >
              <div className="min-w-0 pr-3 mb-4">
                <DialogTitle className="text-base font-semibold leading-6 text-white truncate">
                  {protocolHelp.title}
                </DialogTitle>

              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-1">
              <div className="max-h-[60vh] overflow-auto pr-1">
                {protocolHelp.loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-700 border-t-gray-700 dark:border-t-gray-200 animate-spin" />
                    <span>Loading…</span>
                  </div>
                ) : protocolHelp.error ? (
                  <div className="text-sm">{protocolHelp.error}</div>
                ) : (
                  renderHelpText(protocolHelp.text)
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border bg-background">
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setProtocolHelp((s) => ({ ...s, open: false }))}
                  className="min-w-28"
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={dlgDelete.open}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setDeleteBusy(false);
              setDlgDelete({ open: false, ids: [] });
            }
          }}
        >
          <DialogContent container={dialogContainer ?? undefined}>
            <DialogHeader>
              <DialogTitle className="mb-6">Delete protocol(s)?</DialogTitle>
              <DialogDescription className="mb-5 text-sm text-muted-foreground">
                This action cannot be undone. This will permanently remove the selected protocol(s) and outputs not used elsewhere.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDlgDelete({ open: false, ids: [] });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="pp-dialogBtn"
                disabled={deleteBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={async (e) => {
                  // preventDefaultAndStopPropagation
                  e.preventDefault();
                  e.stopPropagation();

                  if (!projectName || deleteBusy) return;

                  const ids = Array.from(new Set((dlgDelete.ids ?? []).map(String)))
                    .filter((x) => x && x !== "PROJECT");

                  if (ids.length === 0) {
                    setDlgDelete({ open: false, ids: [] });
                    return;
                  }

                  setDeleteBusy(true);
                  try {
                    const res = await svc.deleteProtocol(projectName, ids);
                    if (!ensureApiOk(res, "Delete failed.")) return;

                    clearAllSelectionHard();
                    toast.success(ids.length > 1 ? "Protocols deleted successfully." : "Protocol deleted successfully.");

                    setDlgDelete({ open: false, ids: [] });
                    await handleRefresh();
                  } catch (err) {
                    console.error(err);
                    toast.error(getErrorMsg(err));
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                disabled={deleteBusy}
                className="pp-dialogBtn pp-dialogBtnPrimary"
              >
                Delete
              </button>
            </div>
          </DialogContent>
        </Dialog>


        <Dialog
          open={dlgRestartAll.open}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setRestartAllBusy(false);
              setDlgRestartAll({ open: false, id: null });
            }
          }}
        >
          <DialogContent container={dialogContainer ?? undefined}>
            <DialogHeader>
              <DialogTitle className="mb-6">Restart all protocol(s)?</DialogTitle>
              <DialogDescription className="mb-5 text-sm text-muted-foreground">
                All protocols will be restarted from this protocol, so the previous results will be deleted
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDlgRestartAll({ open: false, id: null });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="pp-dialogBtn"
                disabled={restartAllBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={async (e) => {
                  // preventDefaultAndStopPropagation
                  e.preventDefault();
                  e.stopPropagation();

                  if (!projectName || !dlgRestartAll.id || restartAllBusy) return;

                  setRestartAllBusy(true);
                  try {
                    const res = await svc.restartAll(projectName, dlgRestartAll.id);
                    if (!ensureApiOk(res, "Restart failed.")) return;

                    toast.success("Restart started.");
                    setDlgRestartAll({ open: false, id: null });

                    scheduleDoubleRefresh(5000, true);
                  } catch (err) {
                    console.error(err);
                    toast.error(getErrorMsg(err));
                  } finally {
                    setRestartAllBusy(false);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                disabled={restartAllBusy}
                className="pp-dialogBtn pp-dialogBtnPrimary"
              >
                Restart
              </button>
            </div>
          </DialogContent>
        </Dialog>


        <Dialog
          open={dlgContinueAll.open}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setContinueAllBusy(false);
              setDlgContinueAll({ open: false, id: null });
            }
          }}
        >
          <DialogContent container={dialogContainer ?? undefined}>
            <DialogHeader>
              <DialogTitle className="mb-6">Continue all protocol(s)?</DialogTitle>
              <DialogDescription className="mb-5 text-sm text-muted-foreground">
                All protocols will continue for this protocol, so the previous results will be affected
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDlgContinueAll({ open: false, id: null });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="pp-dialogBtn"
                disabled={continueAllBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={async (e) => {
                  // preventDefaultAndStopPropagation
                  e.preventDefault();
                  e.stopPropagation();

                  if (!projectName || !dlgContinueAll.id || continueAllBusy) return;

                  setContinueAllBusy(true);
                  try {
                    const res = await svc.continueAll(projectName, dlgContinueAll.id);
                    if (!ensureApiOk(res, "Continue failed.")) return;

                    toast.success("Continue started.");
                    setDlgContinueAll({ open: false, id: null });

                    await handleRefresh();
                  } catch (err) {
                    console.error(err);
                    toast.error(getErrorMsg(err));
                  } finally {
                    setContinueAllBusy(false);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                disabled={continueAllBusy}
                className="pp-dialogBtn pp-dialogBtnPrimary"
              >
                Continue
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={dlgStop.open}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setStopBusy(false);
              setDlgStop({ open: false, ids: [] });
            }
          }}
        >
          <DialogContent container={dialogContainer ?? undefined}>
            <DialogHeader>
              <DialogTitle className="mb-6">Stop protocol(s)?</DialogTitle>
              <DialogDescription className="mb-5 text-sm text-muted-foreground">
                This will attempt to gracefully stop the selected protocol(s). Running work may be interrupted.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDlgStop({ open: false, ids: [] });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="pp-dialogBtn"
                disabled={stopBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={async (e) => {
                  // preventDefaultAndStopPropagation
                  e.preventDefault();
                  e.stopPropagation();

                  if (!projectName || stopBusy) return;

                  const ids = Array.from(new Set((dlgStop.ids ?? []).map(String)))
                    .filter((x) => x && x !== "PROJECT");

                  if (ids.length === 0) {
                    setDlgStop({ open: false, ids: [] });
                    return;
                  }

                  setStopBusy(true);
                  try {
                    const res = await svc.stopProtocol(projectName, ids);
                    if (!ensureApiOk(res, "Stop failed.")) return;

                    toast.success(ids.length > 1 ? `Stop requested for ${ids.length} protocols.` : "Stop requested.");

                    clearAllSelectionHard();
                    setDlgStop({ open: false, ids: [] });
                    await handleRefresh();
                  } catch (err) {
                    console.error(err);
                    toast.error(getErrorMsg(err));
                  } finally {
                    setStopBusy(false);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                disabled={stopBusy}
                className="pp-dialogBtn pp-dialogBtnPrimary"
              >
                Stop
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* tagsManagerDialog */}
        <TagsDialog
          open={tagManagerOpen}
          onClose={() => setTagManagerOpen(false)}
          title="Manage tags"
        >
          <div style={{ paddingTop: 8 }}>
            <TagManager />
          </div>
        </TagsDialog>

        {/* ================= RemoteFileDialog ================= */}
        {canOpenFileDialog && (
          <RemoteFileDialog
            open={fileDialogOpen}
            onClose={() => setFileDialogOpen(false)}
            title={`Browsing — ${plabel}`}
            projectId={projId}
            protocolId={pid}
            resolveBrowserPaths={() => svc.resolveBrowserPaths(projId, pid.toString())}
            listRemoteDirectory={(p) => svc.listRemoteDirectory(projId, pid.toString(), p)}
            previewRemoteText={(p) => svc.previewProtocolText(projId, pid.toString(), p)}
            buildDownloadUrl={(p, inline) => svc.buildProtocolDownloadUrl(projId.toString(), pid.toString(), p, !!inline)}
            fetchInlinePreviewBlob={(p) => svc.fetchProtocolInlinePreviewBlob(projId.toString(), pid.toString(), p)}
            onPick={() => {
              setFileDialogOpen(false);
            }}
          />
        )}
      </div>
      {/* portalRootInsideWidgetSoDialogsInheritWidgetStyles */}
      <div ref={portalRootRef} id="projectpage-portal-root" className="pp-portalRoot" />
    </div>
  );
}
