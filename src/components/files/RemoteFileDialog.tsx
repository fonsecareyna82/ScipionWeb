// src/components/files/RemoteFileDialog.tsx
// Browses the server's files: a folder list (virtualized, sortable) and a preview of the selected file.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog/dialog";
import {
  File as FileIcon,
  FileSymlink,
  FolderOpen,
  FolderSymlink,
  CornerUpLeft,
  RefreshCw,
  Home,
  Loader2,
  AlertCircle,
  Search,
  ArrowUp,
  ArrowDown,
  Download,
  Eye,
  EyeOff,
  FolderTree,
} from "lucide-react";

import { fetchWithAuth } from "@/api/auth";
import styles from "./RemoteFileDialog.module.css";
import {
  PARENT_ENTRY,
  base64ToBlob,
  buildAbsPathForEntry,
  buildRelPathForEntry,
  absoluteToRelPath,
  entryKey,
  formatModified,
  getParentRelPath,
  humanBytes,
  isHiddenEntry,
  isParentEntry,
  joinAbs,
  normalizeMimeValue,
  normalizePosixPath,
  normalizeRelPath,
  sameEntry,
  sortEntries,
  type RemoteEntry,
  type SortDir,
  type SortKey,
} from "./remote-file-paths";
import {
  DatabasePreview,
  PreviewWithMeta,
  TablePreview,
  TextPreview,
  type PreviewMeta,
  type PreviewTableBlock,
  type RemoteDatabasePreview,
} from "./remote-preview-parts";

export type { RemoteEntry } from "./remote-file-paths";

export type RemotePreviewSource =
  | { sourceType: "url"; url: string }
  | { sourceType: "blob"; blob: Blob }
  | { sourceType: "base64"; dataBase64: string; mime?: string };

export type RemotePreview =
  | { kind: "none"; mime?: string; meta?: PreviewMeta; note?: string }
  | { kind: "text"; mime?: string; meta?: PreviewMeta; text: string; truncated?: boolean; language?: string }
  | { kind: "image"; mime?: string; meta?: PreviewMeta; source: RemotePreviewSource }
  | { kind: "volume"; mime?: string; meta?: PreviewMeta; source: RemotePreviewSource }
  | {
    kind: "table"; mime?: string; meta?: PreviewMeta; columns: string[];
    rows: Array<Array<string | number | null>>; truncated?: boolean;
    blocks?: PreviewTableBlock[]; format?: string;
  }
  | { kind: "database"; mime?: string; meta?: PreviewMeta; database: RemoteDatabasePreview; truncated?: boolean }
  | { kind: "error"; mime?: string; meta?: PreviewMeta; message: string };

type ResolveBrowserPathsResult = {
  rootAbs?: string; // absolute browser root
  startPath?: string; // relative to the root ("" means root)
  projectRootAbs?: string | null; // the project folder, when browsing for a project
};

/** Where a picked entry is, for callers that need more than the root-relative path. */
export type RemotePickInfo = {
  absPath: string;
  rootAbs: string;
  projectRootAbs?: string | null;
};

type RemoteFileDialogMode = "select" | "save";

type RemoteFileDialogProps = {
  open: boolean;
  onClose: () => void;
  title?: string;

  protocolId?: string | number | null | undefined;

  // initialPathRel: relative to root ("" means root)
  initialPath?: string;
  resolveBrowserPaths?: () => Promise<ResolveBrowserPathsResult>;
  listRemoteDirectory: (relPath: string) => Promise<RemoteEntry[]>;
  previewRemoteEntry?: (relPath: string, opts?: { signal?: AbortSignal }) => Promise<RemotePreview | null>;
  /** URL of a file (root-relative path); enables the Download button. */
  buildDownloadUrl?: (relPath: string, inline?: boolean) => string;

  mode?: RemoteFileDialogMode;
  defaultFilename?: string;
  filenameLabel?: string;
  confirmLabel?: string;
  closeOnPick?: boolean;
  busy?: boolean;

  portalContainer?: HTMLElement | null;

  onPick?: (path: string, entry: RemoteEntry, filename?: string, info?: RemotePickInfo) => void;
};

// Every row of the list has this height: the list draws only the rows in view.
const ROW_HEIGHT = 32;
const OVERSCAN_ROWS = 8;
// A preview starts this long after the selection settles (arrow keys, typing).
const PREVIEW_DELAY_MS = 160;
// Files above this size are previewed when chosen, not when selected automatically.
const AUTO_PREVIEW_MAX_BYTES = 16 * 1024 * 1024;
const TYPEAHEAD_RESET_MS = 700;
const SHOW_HIDDEN_KEY = "scipionweb.remoteFiles.showHidden";

function readShowHidden(): boolean {
  try {
    return window.localStorage.getItem(SHOW_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function isTextInputTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return !!el.getAttribute?.("contenteditable");
}

function revokeObjectUrlSafe(url: string) {
  try {
    if (url) URL.revokeObjectURL(url);
  } catch {
    // ignoreRevokeErrors
  }
}

/** The portal host of the dialog (one per page, also used by the project page widget build). */
function usePortalHost(override: HTMLElement | null | undefined): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (override) {
      setHost(override);
      return;
    }
    if (typeof document === "undefined") return;
    let element = document.getElementById("projectpage-portal-root") as HTMLElement | null;
    if (!element) {
      element = document.createElement("div");
      element.id = "projectpage-portal-root";
      // Out of the page layout, above everything.
      Object.assign(element.style, { position: "fixed", left: "0", top: "0", width: "0", height: "0", zIndex: "2147483647" });
      document.body.appendChild(element);
    }
    // Keeps the widget build's Tailwind scope and the page's dark mode.
    element.classList.add("projectpage-widget-root");
    element.classList.toggle("dark", document.documentElement.classList.contains("dark"));
    setHost(element);
  }, [override]);
  return host;
}

export default function RemoteFileDialog({
  open,
  onClose,
  title = "Browse protocol files",
  initialPath = "",
  resolveBrowserPaths,
  listRemoteDirectory,
  previewRemoteEntry,
  protocolId,
  buildDownloadUrl,
  onPick,
  mode = "select",
  defaultFilename = "",
  filenameLabel = "File name",
  confirmLabel,
  closeOnPick = true,
  busy = false,
  portalContainer: portalContainerOverride,
}: RemoteFileDialogProps) {
  // Folder state (cwdRel is relative to the root; "" is the root).
  const [cwdRel, setCwdRel] = useState<string>(initialPath);
  const [items, setItems] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rootAbs, setRootAbs] = useState<string>("");
  const [projectRootAbs, setProjectRootAbs] = useState<string | null>(null);
  const [protocolRootRel, setProtocolRootRel] = useState<string>("");

  const [selected, setSelected] = useState<RemoteEntry | null>(null);
  const [filterText, setFilterText] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showHidden, setShowHidden] = useState<boolean>(readShowHidden);

  // Preview state.
  const [preview, setPreview] = useState<RemotePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewDeferred, setPreviewDeferred] = useState<RemoteEntry | null>(null);
  const [previewImageSrc, setPreviewImageSrc] = useState<string>("");
  const previewObjectUrlRef = useRef<string>("");
  const previewTimerRef = useRef<number | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  const [saveFilename, setSaveFilename] = useState<string>(defaultFilename);
  const [downloading, setDownloading] = useState(false);

  // List viewport (virtualization).
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const refreshSeqRef = useRef<number>(0);
  const typeaheadRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  const portalContainer = usePortalHost(portalContainerOverride);

  useEffect(() => {
    if (open) setSaveFilename(defaultFilename || "");
  }, [open, defaultFilename]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_HIDDEN_KEY, showHidden ? "1" : "0");
    } catch {
      // Without storage the choice lasts the session.
    }
  }, [showHidden]);

  // -- preview ---------------------------------------------------------------

  const cancelPendingPreview = useCallback(() => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
  }, []);

  const clearPreviewState = useCallback(() => {
    cancelPendingPreview();
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewDeferred(null);
  }, [cancelPendingPreview]);

  const relPathOf = useCallback(
    (entry: RemoteEntry) => buildRelPathForEntry(entry, cwdRel, rootAbs),
    [cwdRel, rootAbs],
  );

  /** Preview a file, a moment after the selection settles; earlier requests are cancelled. */
  const requestPreview = useCallback((entry: RemoteEntry, automatic: boolean) => {
    cancelPendingPreview();
    setPreviewError(null);
    setPreviewDeferred(null);
    if (!previewRemoteEntry || entry.isDir || isParentEntry(entry)) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    if (automatic && typeof entry.size === "number" && entry.size > AUTO_PREVIEW_MAX_BYTES) {
      // A big file is only rendered when the user asks for it.
      setPreview(null);
      setPreviewLoading(false);
      setPreviewDeferred(entry);
      return;
    }
    setPreview(null);
    setPreviewLoading(true);
    const relPath = relPathOf(entry);
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      const controller = new AbortController();
      previewAbortRef.current = controller;
      previewRemoteEntry(relPath, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setPreview(result || { kind: "none", note: "No preview available." });
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          const message = e instanceof Error ? e.message : "Failed to load preview";
          setPreviewError(message);
        })
        .finally(() => {
          if (previewAbortRef.current === controller) {
            previewAbortRef.current = null;
            setPreviewLoading(false);
          }
        });
    }, PREVIEW_DELAY_MS);
  }, [cancelPendingPreview, previewRemoteEntry, relPathOf]);

  useEffect(() => () => cancelPendingPreview(), [cancelPendingPreview]);

  // Image sources (object URLs are released with their preview).
  useEffect(() => {
    if (!preview || (preview.kind !== "image" && preview.kind !== "volume")) {
      setPreviewImageSrc("");
      return;
    }
    const src = preview.source as RemotePreviewSource | undefined;
    if (src?.sourceType === "url" && typeof src.url === "string") {
      setPreviewImageSrc(src.url);
      return;
    }
    let blob: Blob | null = null;
    if (src?.sourceType === "blob" && src.blob instanceof Blob) blob = src.blob;
    if (src?.sourceType === "base64" && typeof src.dataBase64 === "string") {
      try {
        blob = base64ToBlob(src.dataBase64, normalizeMimeValue(String(src.mime || preview.mime || "image/png")) || "image/png");
      } catch {
        blob = null;
      }
    }
    if (!blob) {
      setPreviewImageSrc("");
      return;
    }
    const url = URL.createObjectURL(blob);
    previewObjectUrlRef.current = url;
    setPreviewImageSrc(url);
    return () => {
      revokeObjectUrlSafe(url);
      if (previewObjectUrlRef.current === url) previewObjectUrlRef.current = "";
    };
  }, [preview]);

  // -- folders ---------------------------------------------------------------

  const refresh = useCallback(async (relPath: string) => {
    const seq = ++refreshSeqRef.current;
    try {
      setLoading(true);
      setError(null);
      const safeRel = normalizeRelPath(relPath || "");
      const listing = await listRemoteDirectory(safeRel);
      if (refreshSeqRef.current !== seq) return;
      setItems(Array.isArray(listing) ? listing : []);
      setCwdRel(safeRel);
      setSelected(null);
      clearPreviewState();
      setScrollTop(0);
      if (listRef.current) listRef.current.scrollTop = 0;
    } catch (e: unknown) {
      if (refreshSeqRef.current !== seq) return;
      setError(e instanceof Error ? e.message : "Failed to list directory contents");
    } finally {
      if (refreshSeqRef.current === seq) setLoading(false);
    }
  }, [clearPreviewState, listRemoteDirectory]);

  const goUp = useCallback(() => {
    const parentRel = getParentRelPath(cwdRel);
    if (parentRel !== null) void refresh(parentRel);
  }, [cwdRel, refresh]);

  const enterDir = useCallback((entry: RemoteEntry) => {
    if (!entry.isDir) return;
    if (isParentEntry(entry)) {
      goUp();
      return;
    }
    void refresh(relPathOf(entry));
  }, [goUp, refresh, relPathOf]);

  // Open: where to start; closed: everything back to its initial state.
  useEffect(() => {
    let mounted = true;
    if (!open) {
      refreshSeqRef.current += 1;
      setItems([]);
      setCwdRel(normalizeRelPath(initialPath || ""));
      setProtocolRootRel("");
      setRootAbs("");
      setProjectRootAbs(null);
      setSelected(null);
      setFilterText("");
      clearPreviewState();
      setError(null);
      return;
    }
    const boot = async () => {
      let startRel = normalizeRelPath(initialPath || "");
      let root = "";
      let projectRoot: string | null = null;
      if (resolveBrowserPaths) {
        try {
          const resolved = await resolveBrowserPaths();
          if (!mounted) return;
          startRel = normalizeRelPath(normalizePosixPath(resolved?.startPath || ""));
          root = normalizePosixPath(resolved?.rootAbs || "");
          projectRoot = resolved?.projectRootAbs ? normalizePosixPath(resolved.projectRootAbs) : null;
        } catch (e: unknown) {
          if (!mounted) return;
          setError(e instanceof Error ? e.message : "The server did not say where to browse");
          return;
        }
      }
      setRootAbs(root);
      setProjectRootAbs(projectRoot);
      setProtocolRootRel(startRel);
      await refresh(startRel);
    };
    void boot();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // -- visible rows ------------------------------------------------------------

  const hiddenCount = useMemo(() => items.filter(isHiddenEntry).length, [items]);

  const visibleItems = useMemo(() => {
    const needle = (filterText || "").trim().toLowerCase();
    const shown = items.filter((entry) => (showHidden || !isHiddenEntry(entry))
      && (!needle || (entry.name || "").toLowerCase().includes(needle)));
    return sortEntries(shown, sortKey, sortDir);
  }, [items, filterText, showHidden, sortKey, sortDir]);

  const parentRel = getParentRelPath(cwdRel);
  const showParentEntry = parentRel !== null && !loading && !error;
  const rows = useMemo(
    () => (showParentEntry ? [PARENT_ENTRY, ...visibleItems] : visibleItems),
    [showParentEntry, visibleItems],
  );
  const selectedIndex = selected ? rows.findIndex((entry) => sameEntry(entry, selected) || (isParentEntry(selected) && isParentEntry(entry))) : -1;

  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const measure = () => setViewportHeight(element.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, error]);

  // Rows in view (all of them while the list has no size yet, e.g. before layout).
  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const rowsInView = viewportHeight > 0 ? Math.ceil(viewportHeight / ROW_HEIGHT) + 2 * OVERSCAN_ROWS : 60;
  const lastRow = Math.min(rows.length, firstRow + rowsInView);

  const scrollRowIntoView = useCallback((index: number) => {
    const element = listRef.current;
    if (!element || index < 0) return;
    const top = index * ROW_HEIGHT;
    const height = element.clientHeight || viewportHeight;
    let next = element.scrollTop;
    if (top < next || !height) next = top; // Not measured yet: the row goes to the top.
    else if (top + ROW_HEIGHT > next + height) next = top + ROW_HEIGHT - height;
    element.scrollTop = next;
    // What the list draws follows the scroll even where the browser does not report it.
    setScrollTop(next);
  }, [viewportHeight]);

  // -- selection ---------------------------------------------------------------

  const selectEntry = useCallback((entry: RemoteEntry, automatic = false) => {
    setSelected(entry);
    if (mode === "save" && !entry.isDir && entry.name) setSaveFilename(entry.name);
    requestPreview(entry, automatic);
  }, [mode, requestPreview]);

  // The first entry is selected when a folder opens or the filter hides the selection.
  useEffect(() => {
    if (!open || loading || error) return;
    const first = visibleItems[0] ?? null;
    if (!first) {
      if (selected && !isParentEntry(selected)) {
        setSelected(null);
        clearPreviewState();
      }
      return;
    }
    const stillThere = selected ? isParentEntry(selected) || visibleItems.some((e) => sameEntry(e, selected)) : false;
    if (!stillThere) selectEntry(first, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, error, visibleItems]);

  const pickInfo = useCallback((entry: RemoteEntry): RemotePickInfo => ({
    absPath: buildAbsPathForEntry(entry, cwdRel, rootAbs),
    rootAbs,
    projectRootAbs,
  }), [cwdRel, projectRootAbs, rootAbs]);

  const currentDirAbs = useCallback(() => joinAbs(rootAbs, cwdRel), [cwdRel, rootAbs]);

  const saveDirectoryPath = useCallback(() => {
    if (!selected) return currentDirAbs();
    if (isParentEntry(selected)) return joinAbs(rootAbs, getParentRelPath(cwdRel) ?? "");
    const picked = buildAbsPathForEntry(selected, cwdRel, rootAbs);
    if (selected.isDir) return picked;
    const parent = normalizePosixPath(picked).replace(/\/+$/g, "").replace(/\/[^/]+$/g, "");
    return parent || currentDirAbs();
  }, [currentDirAbs, cwdRel, rootAbs, selected]);

  const handlePick = useCallback(() => {
    if (!onPick) return;
    if (mode === "save") {
      const filename = String(saveFilename ?? "").trim();
      if (!filename) return;
      const parts = normalizeRelPath(cwdRel || "").split("/").filter(Boolean);
      const entry = selected ?? { name: parts[parts.length - 1] || ".", path: cwdRel || "", absPath: currentDirAbs(), isDir: true };
      onPick(saveDirectoryPath(), entry, filename);
      if (closeOnPick) onClose();
      return;
    }
    if (!selected) return;
    onPick(relPathOf(selected), selected, undefined, pickInfo(selected));
    if (closeOnPick) onClose();
  }, [closeOnPick, currentDirAbs, cwdRel, mode, onClose, onPick, pickInfo, relPathOf, saveDirectoryPath, saveFilename, selected]);

  const handleEntryDoubleClick = useCallback((entry: RemoteEntry) => {
    if (entry.isDir) {
      enterDir(entry);
      return;
    }
    selectEntry(entry);
    if (mode !== "select" || !onPick) return;
    onPick(relPathOf(entry), entry, undefined, pickInfo(entry));
    if (closeOnPick) onClose();
  }, [closeOnPick, enterDir, mode, onClose, onPick, pickInfo, relPathOf, selectEntry]);

  const moveSelectionTo = useCallback((index: number) => {
    if (!rows.length) return;
    const next = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!next) return;
    selectEntry(next);
    scrollRowIntoView(rows.indexOf(next));
  }, [rows, scrollRowIntoView, selectEntry]);

  const downloadSelected = useCallback(async () => {
    if (!buildDownloadUrl || !selected || selected.isDir) return;
    setDownloading(true);
    try {
      const response = await fetchWithAuth(buildDownloadUrl(relPathOf(selected), false));
      if (!response.ok) throw new Error(`The file could not be downloaded (${response.status})`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = selected.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => revokeObjectUrlSafe(url), 30000);
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : "The file could not be downloaded");
    } finally {
      setDownloading(false);
    }
  }, [buildDownloadUrl, relPathOf, selected]);

  // -- keyboard ---------------------------------------------------------------

  const onKeyDown: React.KeyboardEventHandler = (e) => {
    if (!open) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      return;
    }
    if (isTextInputTarget(e.target)) return;
    const pageRows = Math.max(1, Math.floor((viewportHeight || ROW_HEIGHT * 10) / ROW_HEIGHT) - 1);
    const handled = (() => {
      switch (e.key) {
        case "Backspace": goUp(); return true;
        case "ArrowDown": moveSelectionTo(selectedIndex < 0 ? 0 : selectedIndex + 1); return true;
        case "ArrowUp": moveSelectionTo(selectedIndex < 0 ? rows.length - 1 : selectedIndex - 1); return true;
        case "PageDown": moveSelectionTo(Math.max(0, selectedIndex) + pageRows); return true;
        case "PageUp": moveSelectionTo(Math.max(0, selectedIndex) - pageRows); return true;
        case "Home": moveSelectionTo(0); return true;
        case "End": moveSelectionTo(rows.length - 1); return true;
        case "Enter":
          if (!selected) return true;
          if (selected.isDir) enterDir(selected);
          else handlePick();
          return true;
        default:
          break;
      }
      // Typing a name jumps to it, as in a file manager.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") {
        const now = Date.now();
        const typed = now - typeaheadRef.current.at > TYPEAHEAD_RESET_MS ? e.key : typeaheadRef.current.text + e.key;
        typeaheadRef.current = { text: typed, at: now };
        const match = rows.findIndex((entry) => !isParentEntry(entry) && entry.name.toLowerCase().startsWith(typed.toLowerCase()));
        if (match >= 0) moveSelectionTo(match);
        return true;
      }
      return false;
    })();
    if (handled) e.preventDefault();
  };

  // -- toolbar and breadcrumbs ----------------------------------------------------

  const projectRootRel = projectRootAbs && rootAbs ? absoluteToRelPath(projectRootAbs, rootAbs) : "";
  const showProjectButton = !!projectRootAbs && !!rootAbs && normalizePosixPath(projectRootAbs) !== normalizePosixPath(rootAbs)
    && (projectRootRel !== "" || rootAbs === "/");

  const breadcrumbs = useMemo(() => {
    const parts = cwdRel ? normalizeRelPath(cwdRel).split("/").filter(Boolean) : [];
    const rootLabel = rootAbs === "/" ? "/" : (normalizePosixPath(rootAbs).split("/").filter(Boolean).pop() || ".");
    const crumbs = [{ label: rootLabel, relPath: "" }];
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      crumbs.push({ label: part, relPath: acc });
    }
    return crumbs;
  }, [cwdRel, rootAbs]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // Newest and biggest first is what one usually looks for.
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const SortIcon = sortDir === "asc" ? ArrowUp : ArrowDown;
  const sortHeader = (key: SortKey, label: string, className: string) => (
    <button
      type="button"
      className={[styles.fileColumnButton, className, sortKey === key ? styles.fileColumnActive : ""].join(" ")}
      onClick={() => toggleSort(key)}
      aria-label={`Sort by ${label.toLowerCase()}`}
      aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{label}</span>
      {sortKey === key && <SortIcon className={styles.iconXs} />}
    </button>
  );

  // -- preview body ---------------------------------------------------------------

  const renderPreviewBody = () => {
    if (!selected) return <div className={styles.centerPlaceholder}>Select a file or folder.</div>;
    if (selected.isDir) {
      return (
        <div className={styles.centerPlaceholder}>
          {isParentEntry(selected) ? "The folder above." : "Double-click or press Enter to open the folder; Select picks it."}
        </div>
      );
    }
    if (previewDeferred && sameEntry(previewDeferred, selected)) {
      return (
        <div className={styles.centerPlaceholder}>
          <div>{selected.name} is {humanBytes(selected.size) ?? "large"}.</div>
          <button type="button" className={styles.ppChipBtn} onClick={() => requestPreview(selected, false)}>
            Preview it
          </button>
        </div>
      );
    }
    if (previewLoading) {
      return (
        <div className={styles.inlineLoading}>
          <Loader2 className={styles.iconSpinSm} />
          <span>Loading preview…</span>
        </div>
      );
    }
    if (previewError) {
      return (
        <div className={styles.errorBox}>
          <AlertCircle className={styles.iconSm} />
          <span>{previewError}</span>
        </div>
      );
    }
    if (!preview || preview.kind === "none") {
      const note = (preview as { note?: string } | null)?.note || "No preview available.";
      return <PreviewWithMeta meta={preview?.meta}><div className={styles.centerPlaceholder}>{note}</div></PreviewWithMeta>;
    }
    if (preview.kind === "error") {
      return (
        <div className={styles.errorBox}>
          <AlertCircle className={styles.iconSm} />
          <span>{preview.message}</span>
        </div>
      );
    }
    if (preview.kind === "text") {
      return (
        <PreviewWithMeta meta={preview.meta}>
          <TextPreview preview={preview} entry={selected} truncated={preview.truncated}
            note={typeof preview.meta?.note === "string" ? preview.meta.note : undefined} />
        </PreviewWithMeta>
      );
    }
    if (preview.kind === "table") {
      const blocks: PreviewTableBlock[] = preview.blocks?.length
        ? preview.blocks
        : [{ name: preview.format || "table", kind: "loop", columns: preview.columns, rows: preview.rows, totalRows: null }];
      return (
        <PreviewWithMeta meta={preview.meta}>
          <TablePreview key={entryKey(selected)} blocks={blocks} format={preview.format} />
        </PreviewWithMeta>
      );
    }
    if (preview.kind === "database") {
      return (
        <PreviewWithMeta meta={preview.meta}>
          <DatabasePreview database={preview.database || {}} meta={preview.meta} />
        </PreviewWithMeta>
      );
    }
    if (preview.kind === "image" || preview.kind === "volume") {
      return (
        <PreviewWithMeta meta={preview.meta}>
          <div className={styles.imageCanvas}>
            {previewImageSrc ? (
              <div className={styles.imageFrameResponsive}>
                <img src={previewImageSrc} alt={selected.name} className={styles.previewImage} />
              </div>
            ) : (
              <div className={styles.centerPlaceholder}>No image preview available.</div>
            )}
          </div>
        </PreviewWithMeta>
      );
    }
    return <div className={styles.centerPlaceholder}>No preview available.</div>;
  };

  // -- layout -----------------------------------------------------------------------

  const dialogHeightClass = mode === "save" ? `${styles.dialogHeight} ${styles.dialogHeightSave}` : styles.dialogHeight;
  const browserHeightClass = mode === "save" ? `${styles.browserHeight} ${styles.browserHeightSave}` : styles.browserHeight;
  const previewHeightClass = mode === "save" ? `${styles.previewHeight} ${styles.previewHeightSave}` : styles.previewHeight;
  const canDownload = !!buildDownloadUrl && !!selected && !selected.isDir;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        container={portalContainer}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onInteractOutside={(e) => e.preventDefault()}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className={[styles.dialogWidth, dialogHeightClass, styles.dialogContent, styles.dialogLayout].join(" ")}
      >
        <DialogHeader className={styles.headerBar}>
          <DialogTitle className={styles.headerTitle}>
            <span className={styles.headerTitleText}>{title}</span>
          </DialogTitle>
          <DialogDescription className={styles.srOnly}>
            Remote file browser. Arrow keys move, Enter opens a folder or picks a file, Backspace goes up,
            typing a name jumps to it.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.toolbar}>
          <button type="button" onClick={goUp} className={styles.ppChipBtn} disabled={parentRel === null}>
            <CornerUpLeft className={styles.iconSm} />
            Up
          </button>

          <button type="button" onClick={() => void refresh("")} className={styles.ppChipBtn}>
            <Home className={styles.iconSm} />
            Root
          </button>

          {showProjectButton && (
            <button type="button" onClick={() => void refresh(projectRootRel)} className={styles.ppChipBtn}
              title="Go to the project folder">
              <FolderTree className={styles.iconSm} />
              Project folder
            </button>
          )}

          {protocolId !== null && protocolId !== undefined && !!protocolRootRel && (
            <button type="button" onClick={() => void refresh(protocolRootRel)} className={styles.ppChipBtn}
              title="Back to the protocol start directory">
              <FolderOpen className={styles.iconSm} />
              Protocol folder
            </button>
          )}

          <button type="button" onClick={() => void refresh(cwdRel || "")} disabled={loading}
            title="Refresh this directory" className={styles.ppChipBtn}>
            {loading ? <Loader2 className={styles.iconSpinSm} /> : <RefreshCw className={styles.iconSm} />}
            Refresh
          </button>

          {buildDownloadUrl && (
            <button type="button" onClick={() => void downloadSelected()} disabled={!canDownload || downloading}
              title={canDownload ? `Download ${selected?.name}` : "Select a file to download it"}
              className={[styles.ppChipBtn, styles.toolbarEnd].join(" ")}>
              {downloading ? <Loader2 className={styles.iconSpinSm} /> : <Download className={styles.iconSm} />}
              Download
            </button>
          )}
        </div>

        <div className={[styles.bodyGrid, browserHeightClass].join(" ")}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelHeaderLeft}>
                <div className={styles.panelHeaderTitle}>Directory</div>
                <nav className={styles.breadcrumbs} aria-label="Location">
                  {breadcrumbs.map((crumb, idx) => {
                    const isLast = idx === breadcrumbs.length - 1;
                    return (
                      <React.Fragment key={`${crumb.relPath}-${idx}`}>
                        <button
                          type="button"
                          onClick={() => void refresh(crumb.relPath)}
                          disabled={loading || isLast}
                          title={crumb.relPath ? joinAbs(rootAbs, crumb.relPath) : rootAbs || "Root"}
                          className={[styles.breadcrumb, isLast ? styles.breadcrumbCurrent : ""].join(" ")}
                        >
                          {crumb.label}
                        </button>
                        {!isLast && <span className={styles.breadcrumbSeparator}>/</span>}
                      </React.Fragment>
                    );
                  })}
                </nav>
              </div>
              {error && (
                <span className={styles.panelError}>
                  <AlertCircle className={styles.iconXs} />
                  <span>Error</span>
                </span>
              )}
            </div>

            {!error && (
              <div className={styles.fileListControls}>
                <div className={styles.fileFilterRow}>
                  <Search className={styles.fileFilterIcon} />
                  <input
                    ref={searchInputRef}
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Filter file names…"
                    aria-label="Filter file names"
                    className={styles.fileFilterInput}
                  />
                  <button
                    type="button"
                    className={[styles.fileHiddenToggle, showHidden ? styles.fileHiddenToggleOn : ""].join(" ")}
                    onClick={() => setShowHidden((current) => !current)}
                    aria-pressed={showHidden}
                    aria-label={showHidden ? "Hide hidden files" : "Show hidden files"}
                    title={showHidden ? "Hide hidden files" : `Show hidden files${hiddenCount ? ` (${hiddenCount})` : ""}`}
                  >
                    {showHidden ? <Eye className={styles.iconSm} /> : <EyeOff className={styles.iconSm} />}
                  </button>
                </div>

                <div className={styles.fileListHeader}>
                  {sortHeader("name", "Name", styles.fileColumnName)}
                  {sortHeader("size", "Size", styles.fileColumnSize)}
                  {sortHeader("mtime", "Modified", styles.fileColumnDate)}
                </div>
              </div>
            )}

            <div className={styles.panelBody}>
              {error ? (
                <div className={styles.errorBox}>
                  <AlertCircle className={styles.iconSm} />
                  <span>{error}</span>
                </div>
              ) : loading ? (
                <div className={styles.loadingRow}>
                  <Loader2 className={styles.iconSpinSmMut} />
                  <span>Loading…</span>
                </div>
              ) : (
                <div
                  ref={listRef}
                  className={styles.virtualList}
                  role="listbox"
                  aria-label="Files"
                  tabIndex={0}
                  aria-activedescendant={selectedIndex >= 0 ? `remote-entry-${selectedIndex}` : undefined}
                  onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                >
                  {rows.length === 0 ? (
                    <div className={styles.centerPlaceholder}>
                      {filterText ? "No file matches the filter." : hiddenCount && !showHidden ? "Only hidden files here." : "Empty folder."}
                    </div>
                  ) : (
                    <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
                      {rows.slice(firstRow, lastRow).map((entry, offset) => {
                        const index = firstRow + offset;
                        const isSel = index === selectedIndex;
                        const parent = isParentEntry(entry);
                        const Icon = entry.isDir ? (entry.isLink ? FolderSymlink : FolderOpen) : entry.isLink ? FileSymlink : FileIcon;
                        return (
                          <div
                            key={parent ? ".." : entryKey(entry)}
                            id={`remote-entry-${index}`}
                            role="option"
                            aria-selected={isSel}
                            className={[styles.fileRow, isSel ? styles.rowBtnSelected : "", isHiddenEntry(entry) ? styles.fileRowHidden : ""].join(" ")}
                            style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                            onClick={() => selectEntry(entry)}
                            onDoubleClick={() => (parent ? goUp() : handleEntryDoubleClick(entry))}
                            title={parent ? "Double-click to go up" : entry.isLink ? `${entry.name} (link)` : entry.name}
                          >
                            <Icon className={styles.iconSmMut} />
                            <span className={[styles.truncate, styles.fileColumnName].join(" ")}>{entry.name}</span>
                            <span className={styles.fileColumnSize}>
                              {!entry.isDir && typeof entry.size === "number" ? humanBytes(entry.size) ?? "" : ""}
                            </span>
                            <span className={styles.fileColumnDate}>{parent ? "" : formatModified(entry.mtime)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.previewViewport + " " + previewHeightClass}>{renderPreviewBody()}</div>
          </div>
        </div>

        {mode === "save" && (
          <div className={styles.saveBar}>
            <label className={styles.saveLabel}>{filenameLabel}</label>
            <input
              value={saveFilename}
              onChange={(e) => setSaveFilename(e.target.value)}
              placeholder="protocols_export.json"
              className={styles.saveInput}
              aria-label={filenameLabel}
              disabled={busy}
            />
          </div>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.ppDialogBtn} onClick={onClose} disabled={busy}>
            Close
          </button>
          <button
            type="button"
            className={[styles.ppDialogBtn, styles.ppDialogBtnPrimary].join(" ")}
            onClick={handlePick}
            disabled={busy || (mode === "save" ? !String(saveFilename ?? "").trim() : !selected)}
          >
            {confirmLabel ?? (mode === "save" ? "Save" : "Select")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
