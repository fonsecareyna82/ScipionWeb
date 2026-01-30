// src/components/RemoteFileDialog.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog/dialog";
import {
  File as FileIcon,
  FolderOpen,
  CornerUpLeft,
  RefreshCw,
  Home,
  Loader2,
  AlertCircle,
  Search,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

import styles from "./RemoteFileDialog.module.css";

export type RemoteEntry = {
  name: string;
  path: string; // item leaf (basename) in new backend contract; can be absolute in older modes
  isDir: boolean;
  size?: number;
  mime?: string;
};

type PreviewMeta = {
  mime?: string;
  width?: number;
  height?: number;
  depth?: number;
  sizeBytes?: number;
  voxelSize?: [number, number, number];
  note?: string;
};

type RemoteListResult = {
  cwd: string; // relative-to-root preferred, can be absolute in older modes
  dirName?: string; // absolute directory that contains returned items (older)
  absPath?: string; // backend alias (older)
  items: RemoteEntry[];
};

type ResolveBrowserPathsResult = {
  rootAbs?: string; // absolute root boundary; default "/home"
  startPath?: string; // relative-to-root preferred ("" means root); absolute allowed
  protocolRoot?: string; // relative preferred; absolute allowed
};

type RemoteFileDialogProps = {
  open: boolean;
  onClose: () => void;
  title?: string;

  projectId?: string | number;
  protocolId?: string | number;

  // initialPathRel: relative to root ("" means root)
  initialPath?: string;

  // resolveBrowserPaths: returns rootAbs + startPath (and optional protocolRoot)
  resolveBrowserPaths?: () => Promise<ResolveBrowserPathsResult>;

  // all paths are relative to root
  listRemoteDirectory: (relPath: string) => Promise<RemoteListResult | RemoteEntry[]>;
  previewRemoteText?: (relPath: string) => Promise<string | null>;
  fetchInlinePreviewBlob?: (relPath: string) => Promise<{ blob: Blob; meta: PreviewMeta }>;
  buildDownloadUrl?: (relPath: string, inline?: boolean) => string;

  // alwaysReceivesRelativePathToRootFileOrDirectory
  onPick?: (relativePath: string) => void;
};

type SortDir = "asc" | "desc";

export default function RemoteFileDialog({
  open,
  onClose,
  title = "Browse protocol files",
  initialPath = "",
  resolveBrowserPaths,
  listRemoteDirectory,
  previewRemoteText,
  fetchInlinePreviewBlob,
  buildDownloadUrl,
  onPick,
}: RemoteFileDialogProps) {
  // directoryState (cwdRel is relative to root; "" means root)
  const [cwdRel, setCwdRel] = useState<string>(initialPath);
  const [items, setItems] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // rootBoundaryAbsoluteOnceResolved
  const [rootAbs, setRootAbs] = useState<string>("/home");

  // protocolRootRelativeOnceResolved
  const [protocolRootRel, setProtocolRootRel] = useState<string>("");

  // selectionState
  const [selected, setSelected] = useState<RemoteEntry | null>(null);

  // search / sort state
  const [filterText, setFilterText] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // textPreviewState
  const [previewText, setPreviewText] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // imagePreviewState
  const [imgUrl, setImgUrl] = useState<string>("");
  const [imgMeta, setImgMeta] = useState<PreviewMeta>({});
  const [imgLoading, setImgLoading] = useState<boolean>(false);

  // portalContainer
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // hardening refs
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const refreshSeqRef = useRef<number>(0);
  const textPreviewSeqRef = useRef<number>(0);
  const imgPreviewSeqRef = useRef<number>(0);
  const imgUrlRef = useRef<string>("");

  // fixedLayoutSizes
  const dialogWidthClass = styles.dialogWidth;
  const dialogHeightClass = styles.dialogHeight;
  const browserHeightClass = styles.browserHeight;
  const previewHeightClass = styles.previewHeight;

  useEffect(() => {
    // ensureDialogPortalRootExists
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc) return;

    let host = doc.getElementById("projectpage-portal-root") as HTMLElement | null;

    if (!host) {
      host = doc.createElement("div");
      host.id = "projectpage-portal-root";

      // keepTailwindScopeForWidgetBuild
      host.classList.add("projectpage-widget-root");

      // avoidAffectingHostLayout
      host.style.position = "fixed";
      host.style.left = "0";
      host.style.top = "0";
      host.style.width = "0";
      host.style.height = "0";
      host.style.zIndex = "2147483647";

      doc.body.appendChild(host);
    } else {
      host.classList.add("projectpage-widget-root");
    }

    // keepDarkModeConsistentIfNeeded
    if (doc.documentElement.classList.contains("dark")) {
      host.classList.add("dark");
    } else {
      host.classList.remove("dark");
    }

    setPortalContainer(host);
  }, []);

  /** normalizePosixPath */
  const normalizePosixPath = (p: string) => (p || "").replace(/\\/g, "/").replace(/\/+/g, "/").trim();

  /** normalizeAbsPath */
  const normalizeAbsPath = (p: string) => {
    const n = normalizePosixPath(p || "");
    if (!n.startsWith("/")) return "";
    if (n === "/") return "/";
    return n.replace(/\/+$/g, "");
  };

  /** normalizeRelPath */
  const normalizeRelPath = (p: string) => {
    const raw = normalizePosixPath(p || "").replace(/^\/+/g, "");
    if (!raw) return "";

    const parts = raw.split("/").filter(Boolean);
    const out: string[] = [];

    for (const part of parts) {
      if (part === ".") continue;
      if (part === "..") {
        if (out.length > 0) out.pop();
        continue; // clamp: never go above root
      }
      out.push(part);
    }

    return out.join("/");
  };

  /** joinRelPaths */
  const joinRelPaths = (baseRel: string, leaf: string) => {
    const b = normalizeRelPath(baseRel || "");
    const l = normalizeRelPath(leaf || "");
    if (!b) return l;
    if (!l) return b;
    return normalizeRelPath(`${b}/${l}`);
  };

  /** absToRelIfInsideRoot */
  const absToRelIfInsideRoot = (absPath: string, rootPathAbs: string) => {
    const absNorm = normalizeAbsPath(absPath);
    const rootNorm = normalizeAbsPath(rootPathAbs);

    if (!absNorm || !rootNorm) return null;
    if (rootNorm === "/") return normalizeRelPath(absNorm.slice(1));

    if (absNorm === rootNorm) return "";
    if (absNorm.startsWith(`${rootNorm}/`)) {
      return normalizeRelPath(absNorm.slice(rootNorm.length + 1));
    }
    return null;
  };

  /** getParentRelPath */
  const getParentRelPath = (relPath: string): string | null => {
    const r = normalizeRelPath(relPath || "");
    if (!r) return null;
    const parts = r.split("/").filter(Boolean);
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/");
  };

  /** buildRelPathForEntry */
  const buildRelPathForEntry = (entry: RemoteEntry) => {
    const raw = normalizePosixPath(entry?.path || entry?.name || "");
    if (!raw) return "";

    // absolute path in older modes: convert if it is inside root; otherwise fallback to basename under cwdRel
    if (raw.startsWith("/")) {
      const rel = absToRelIfInsideRoot(raw, rootAbs);
      if (rel !== null) return rel;

      const parts = raw.split("/").filter(Boolean);
      const baseName = parts.length ? parts[parts.length - 1] : "";
      return joinRelPaths(cwdRel, baseName);
    }

    // new backend contract: entry.path is leaf
    return joinRelPaths(cwdRel, raw);
  };

  /** revokeObjectUrlSafe */
  const revokeObjectUrlSafe = (url: string) => {
    try {
      if (url) URL.revokeObjectURL(url);
    } catch {
      // ignoreRevokeErrors
    }
  };

  // decideIfTextLike
  const looksTextLike = (entry: RemoteEntry): boolean => {
    if (entry.isDir) return false;
    const mimeLower = (entry.mime || "").toLowerCase();
    if (
      mimeLower.startsWith("text/") ||
      mimeLower === "application/json" ||
      mimeLower === "application/xml" ||
      mimeLower === "application/x-yaml" ||
      mimeLower === "text/x-log"
    ) {
      return true;
    }
    const lowerName = entry.name.toLowerCase();
    const textExts = [
      ".txt",
      ".log",
      ".json",
      ".yaml",
      ".yml",
      ".md",
      ".csv",
      ".tsv",
      ".xml",
      ".star",
      ".coords",
      ".cbox",
      ".mdoc",
      ".tomostar",
      ".settings",
      ".com",
      ".tlt",
      ".xf",
      ".xtilt",
    ];
    return textExts.some((ext) => lowerName.endsWith(ext));
  };

  const isImageExt = (name: string | undefined) => !!name && /\.(mrc|mrcs|map|em|stk)$/i.test(name);

  // decideIfImageLike
  const looksImageLike = (entry: RemoteEntry): boolean => {
    if (entry.isDir) return false;
    if (entry.mime && entry.mime.startsWith("image/")) return true;
    if (isImageExt(entry.name)) return true;
    return false;
  };

  const humanBytes = (n?: number) => {
    if (!n && n !== 0) return undefined;
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  /** refresh */
  const refresh = async (relPath: string, rootAbsOverride?: string) => {
    const seq = ++refreshSeqRef.current;

    try {
      setLoading(true);
      setError(null);

      const effectiveRootAbs = normalizeAbsPath(rootAbsOverride || rootAbs) || "/home";
      const safeRel = normalizeRelPath(relPath || "");
      const listing = await listRemoteDirectory(safeRel);

      // ignoreStaleRefreshResults
      if (refreshSeqRef.current !== seq) return;

      let nextItems: RemoteEntry[] = [];
      let nextCwdRel = safeRel;

      if (Array.isArray(listing)) {
        // backwardCompatibleModeOnlyItems
        nextItems = listing;
      } else if (listing && Array.isArray((listing as RemoteListResult).items)) {
        const result = listing as RemoteListResult;
        nextItems = result.items;

        // prefer cwd as relative-to-root; accept absolute in older responses
        const maybeCwd = normalizePosixPath(result.cwd || "");
        if (maybeCwd.startsWith("/")) {
          const rel = absToRelIfInsideRoot(maybeCwd, effectiveRootAbs);
          nextCwdRel = rel !== null ? rel : safeRel;
        } else {
          nextCwdRel = normalizeRelPath(maybeCwd) || safeRel;
        }

        // if older returns only dirName/absPath as absolute, try to derive cwdRel from it
        if (!result.cwd) {
          const dn = normalizePosixPath((result.dirName || "").trim());
          const ap = normalizePosixPath((result.absPath || "").trim());
          const absGuess = dn || ap;
          if (absGuess.startsWith("/")) {
            const rel = absToRelIfInsideRoot(absGuess, effectiveRootAbs);
            if (rel !== null) nextCwdRel = rel;
          }
        }
      }

      setItems(nextItems);
      setCwdRel(nextCwdRel);

      // resetSelectionAndPreviewsOnDirectoryChange
      setSelected(null);
      setPreviewText("");
      setPreviewLoading(false);

      textPreviewSeqRef.current += 1;
      imgPreviewSeqRef.current += 1;

      revokeObjectUrlSafe(imgUrlRef.current);
      imgUrlRef.current = "";
      setImgUrl("");
      setImgMeta({});
      setImgLoading(false);
    } catch (e: unknown) {
      if (refreshSeqRef.current !== seq) return;
      const msg = e instanceof Error ? e.message : "Failed to list directory contents";
      setError(msg);
    } finally {
      if (refreshSeqRef.current === seq) setLoading(false);
    }
  };

  const enterDir = (entry: RemoteEntry) => {
    if (!entry.isDir) return;
    const nextRelDir = buildRelPathForEntry(entry);
    void refresh(nextRelDir);
  };

  const goUp = () => {
    const parentRel = getParentRelPath(cwdRel);
    if (parentRel === null) return;
    void refresh(parentRel);
  };

  const goRoot = () => {
    void refresh("");
  };

  const goProtocolRoot = () => {
    if (!protocolRootRel) return;
    void refresh(protocolRootRel);
  };

  const loadTextPreview = async (entry: RemoteEntry) => {
    if (!previewRemoteText) return;
    if (entry.isDir) return;
    if (!looksTextLike(entry)) return;

    const seq = ++textPreviewSeqRef.current;

    setPreviewText("");
    setPreviewLoading(true);
    try {
      const relPath = buildRelPathForEntry(entry);
      const text = await previewRemoteText(relPath);
      if (textPreviewSeqRef.current !== seq) return;
      setPreviewText(text || "");
    } catch {
      if (textPreviewSeqRef.current !== seq) return;
      setPreviewText("");
    } finally {
      if (textPreviewSeqRef.current === seq) setPreviewLoading(false);
    }
  };

  const loadImagePreview = async (entry: RemoteEntry) => {
    if (!looksImageLike(entry)) return;
    if (!fetchInlinePreviewBlob) {
      revokeObjectUrlSafe(imgUrlRef.current);
      imgUrlRef.current = "";
      setImgUrl("");
      setImgMeta({});
      return;
    }

    const seq = ++imgPreviewSeqRef.current;

    revokeObjectUrlSafe(imgUrlRef.current);
    imgUrlRef.current = "";
    setImgUrl("");
    setImgMeta({});
    setImgLoading(true);

    try {
      const relPath = buildRelPathForEntry(entry);
      const { blob, meta } = await fetchInlinePreviewBlob(relPath);
      if (imgPreviewSeqRef.current !== seq) return;

      const objUrl = URL.createObjectURL(blob);
      imgUrlRef.current = objUrl;

      setImgUrl(objUrl);
      setImgMeta(meta || {});
    } catch {
      if (imgPreviewSeqRef.current !== seq) return;
      revokeObjectUrlSafe(imgUrlRef.current);
      imgUrlRef.current = "";
      setImgUrl("");
      setImgMeta({});
    } finally {
      if (imgPreviewSeqRef.current === seq) setImgLoading(false);
    }
  };

  const handleSelectEntry = (entry: RemoteEntry) => {
    setSelected(entry);

    // textBranch
    if (!entry.isDir && looksTextLike(entry) && previewRemoteText) {
      void loadTextPreview(entry);
    } else {
      textPreviewSeqRef.current += 1;
      setPreviewText("");
      setPreviewLoading(false);
    }

    // imageBranch
    if (!entry.isDir && looksImageLike(entry)) {
      void loadImagePreview(entry);
    } else {
      imgPreviewSeqRef.current += 1;
      revokeObjectUrlSafe(imgUrlRef.current);
      imgUrlRef.current = "";
      setImgUrl("");
      setImgMeta({});
      setImgLoading(false);
    }
  };

  const handlePick = () => {
    if (!selected || !onPick) return;
    const relPath = buildRelPathForEntry(selected);
    onPick(relPath);
    onClose();
  };

  const handleDialogClick: React.MouseEventHandler = (e) => {
    e.stopPropagation();
  };

  /** isTextInputTarget */
  const isTextInputTarget = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return !!el.getAttribute?.("contenteditable");
  };

  /** moveSelectionBy */
  const moveSelectionBy = (delta: number, visibleList: RemoteEntry[]) => {
    if (!visibleList.length) return;

    const currIndex = selected
      ? visibleList.findIndex((e) => e.name === selected.name && e.path === selected.path)
      : -1;

    const baseIndex = currIndex >= 0 ? currIndex : delta > 0 ? -1 : visibleList.length;
    const nextIndex = Math.max(0, Math.min(visibleList.length - 1, baseIndex + delta));
    const next = visibleList[nextIndex];
    if (next) handleSelectEntry(next);
  };

  /** focusSearch */
  const focusSearch = () => {
    try {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    } catch {
      // ignoreFocusErrors
    }
  };

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      if (!open) {
        // resetStateWhenClosed
        refreshSeqRef.current += 1;
        textPreviewSeqRef.current += 1;
        imgPreviewSeqRef.current += 1;

        setItems([]);
        setCwdRel(normalizeRelPath(initialPath || ""));
        setSelected(null);
        setFilterText("");
        setPreviewText("");
        setPreviewLoading(false);

        revokeObjectUrlSafe(imgUrlRef.current);
        imgUrlRef.current = "";
        setImgUrl("");
        setImgMeta({});
        setImgLoading(false);
        setError(null);
        return;
      }

      let nextRootAbs = "/home";
      let startRel = normalizeRelPath(initialPath || "");
      let nextProtocolRootRel = "";

      if (resolveBrowserPaths) {
        try {
          const resolved = await resolveBrowserPaths();
          if (!mounted) return;

          const resolvedRootAbs = normalizeAbsPath(resolved?.rootAbs || "") || "/home";
          nextRootAbs = resolvedRootAbs;

          // normalizeStartPath (prefer relative; accept absolute inside root)
          const startRaw = normalizePosixPath(resolved?.startPath || "");
          if (startRaw.startsWith("/")) {
            const rel = absToRelIfInsideRoot(startRaw, resolvedRootAbs);
            startRel = rel !== null ? rel : "";
          } else {
            startRel = normalizeRelPath(startRaw);
          }

          // normalizeProtocolRoot (optional; fallback to startRel)
          const protoRaw = normalizePosixPath(resolved?.protocolRoot || "");
          if (protoRaw) {
            if (protoRaw.startsWith("/")) {
              const rel = absToRelIfInsideRoot(protoRaw, resolvedRootAbs);
              nextProtocolRootRel = rel !== null ? rel : startRel;
            } else {
              nextProtocolRootRel = normalizeRelPath(protoRaw);
            }
          } else {
            nextProtocolRootRel = startRel;
          }
        } catch {
          // ignoreResolveErrorsAndFallbackToInitialPath + defaultRoot
          nextRootAbs = "/home";
          startRel = normalizeRelPath(initialPath || "");
          nextProtocolRootRel = startRel;
        }
      } else {
        nextProtocolRootRel = startRel;
      }

      setRootAbs(nextRootAbs);
      setProtocolRootRel(nextProtocolRootRel);

      await refresh(startRel, nextRootAbs);
    };

    void boot();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parentRel = getParentRelPath(cwdRel);
  const showParentEntry = parentRel !== null && !loading && !error;

  const breadcrumbs = useMemo(() => {
    const rel = normalizeRelPath(cwdRel || "");
    const parts = rel ? rel.split("/").filter(Boolean) : [];
    const crumbs: { label: string; relPath: string }[] = [{ label: ".", relPath: "" }];

    let acc = "";
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      crumbs.push({ label: p, relPath: acc });
    }
    return crumbs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwdRel]);

  const visibleItems = useMemo(() => {
    const needle = (filterText || "").trim().toLowerCase();

    const filtered = !needle
      ? items
      : items.filter((e) => (e.name || "").toLowerCase().includes(needle));

    const dirMult = sortDir === "asc" ? 1 : -1;

    const sorted = [...filtered].sort((a, b) => {
      // foldersFirstAlways
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;

      // nameOnlySort
      const na = (a.name || "").toLowerCase();
      const nb = (b.name || "").toLowerCase();
      if (na === nb) return 0;
      return na < nb ? -1 * dirMult : 1 * dirMult;
    });

    return sorted;
  }, [items, filterText, sortDir]);

  useEffect(() => {
    // keepSelectionIfStillVisible
    if (!selected) return;
    const stillThere = visibleItems.some((e) => e.name === selected.name && e.path === selected.path);
    if (!stillThere) setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems]);

  const onKeyDown: React.KeyboardEventHandler = (e) => {
    if (!open) return;

    // doNotHijackTypingInInputs
    if (isTextInputTarget(e.target)) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        focusSearch();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      focusSearch();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      goUp();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelectionBy(1, visibleItems);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelectionBy(-1, visibleItems);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (!selected) return;
      if (selected.isDir) enterDir(selected);
      else handlePick();
    }
  };

  const toggleSortDir = () => setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  const SortDirIcon = sortDir === "asc" ? ArrowUp : ArrowDown;

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
        // preventCloseOnOutsideClick
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        onClick={handleDialogClick}
        className={[
          dialogWidthClass,
          dialogHeightClass,
          styles.dialogContent,
          styles.dialogLayout,
        ].join(" ")}
      >
        <DialogHeader className={styles.headerBar}>
          <DialogTitle className={styles.headerTitle}>
            <span className={styles.headerTitleText}>{title}</span>
          </DialogTitle>

          <DialogDescription className={styles.srOnly}>
            Remote file browser dialog. Use Enter/double-click to open folders, and Select to choose a file or folder.
          </DialogDescription>
        </DialogHeader>

        {/* toolbar */}
        <div className={styles.toolbar}>
          <button type="button" onClick={goUp} className={styles.ppChipBtn} disabled={parentRel === null}>
            <CornerUpLeft className={styles.iconSm} />
            Up
          </button>

          <button type="button" onClick={goRoot} className={styles.ppChipBtn}>
            <Home className={styles.iconSm} />
            Root
          </button>

          <button type="button" onClick={goProtocolRoot} className={styles.ppChipBtn} disabled={!protocolRootRel}>
            <FolderOpen className={styles.iconSm} />
            Protocol folder
          </button>

          <button
            type="button"
            onClick={() => void refresh(cwdRel || "")}
            disabled={loading}
            title="Refresh this directory"
            className={styles.ppChipBtn}
          >
            {loading ? <Loader2 className={styles.iconSpinSm} /> : <RefreshCw className={styles.iconSm} />}
            Refresh
          </button>
        </div>

        {/* body */}
        <div className={[styles.bodyGrid, browserHeightClass].join(" ")}>
          {/* left */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelHeaderLeft}>
                <div className={styles.panelHeaderTitle}>Directory</div>

                {/* breadcrumbs (compact, no chips) */}
                <div
                  className={styles.panelHeaderPath}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 0,
                    lineHeight: 1.2,
                  }}
                >
                  {breadcrumbs.map((c, idx) => {
                    const isLast = idx === breadcrumbs.length - 1;
                    return (
                      <React.Fragment key={`${c.relPath}-${idx}`}>
                        <button
                          type="button"
                          onClick={() => void refresh(c.relPath)}
                          disabled={loading || !!error || isLast}
                          title={c.relPath ? `Go to ./${c.relPath}` : "Go to root"}
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            margin: 0,
                            cursor: isLast ? "default" : "pointer",
                            color: "inherit",
                            opacity: isLast ? 0.9 : 0.7,
                            fontWeight: isLast ? 600 : 500,
                          }}
                        >
                          {c.label}
                        </button>

                        {!isLast && (
                          <span style={{ opacity: 0.55, padding: "0 2px", userSelect: "none" }}>/</span>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {error && (
                <span className={styles.panelError}>
                  <AlertCircle className={styles.iconXs} />
                  <span>Error</span>
                </span>
              )}
            </div>

            <div className={styles.panelBody}>
              {error && (
                <div className={styles.errorBox}>
                  <AlertCircle className={styles.iconSm} />
                  <span>{error}</span>
                </div>
              )}

              {!error && (
                <>
                  {/* listControls (filter + nameSortHeader) */}
                  <div
                    style={{
                      padding: "10px 10px 0 10px",
                      borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
                    }}
                  >
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <Search
                        className={styles.iconSm}
                        style={{ position: "absolute", left: 10, opacity: 0.7 }}
                      />
                      <input
                        ref={searchInputRef}
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        placeholder="Filter file names…"
                        aria-label="Filter file names"
                        style={{
                          width: "100%",
                          paddingLeft: 34,
                          paddingRight: 10,
                          height: 34,
                          borderRadius: 10,
                          border: "1px solid rgba(148, 163, 184, 0.35)",
                          background: "transparent",
                          color: "inherit",
                          outline: "none",
                          fontSize: 12, // smaller placeholder text (inherits)
                        }}
                      />
                    </div>

                    {/* nameSortHeader (table-like header, different color) */}
                    <div
                      style={{
                        marginTop: 10,
                        marginLeft: -10,
                        marginRight: -10,
                        padding: "8px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "rgba(148, 163, 184, 0.10)",
                        borderTop: "1px solid rgba(148, 163, 184, 0.14)",
                      }}
                    >
                      <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>Name</div>

                      <button
                        type="button"
                        onClick={toggleSortDir}
                        title={sortDir === "asc" ? "Ascending" : "Descending"}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 30,
                          height: 26,
                          borderRadius: 8,
                          border: "1px solid rgba(148, 163, 184, 0.25)",
                          background: "rgba(0,0,0,0)",
                          color: "inherit",
                          cursor: "pointer",
                          opacity: 0.9,
                        }}
                      >
                        <SortDirIcon className={styles.iconSm} />
                      </button>
                    </div>
                  </div>

                  <ul className={styles.list}>
                    {showParentEntry && (
                      <li className={styles.listItem} key="..">
                        <button className={styles.rowBtn} onClick={goUp} type="button">
                          <FolderOpen className={styles.iconSmMut} />
                          <span className={styles.truncate}>..</span>
                        </button>
                      </li>
                    )}

                    {loading && (
                      <li className={styles.loadingRow} key="loading">
                        <Loader2 className={styles.iconSpinSmMut} />
                        <span>Loading…</span>
                      </li>
                    )}

                    {!loading &&
                      visibleItems.map((entry) => {
                        const isSel = selected?.name === entry.name && selected?.path === entry.path;
                        return (
                          <li key={`${entry.path}-${entry.name}`} className={styles.listItem}>
                            <button
                              className={[styles.rowBtn, isSel ? styles.rowBtnSelected : ""].join(" ")}
                              onClick={() => handleSelectEntry(entry)}
                              onDoubleClick={() => enterDir(entry)}
                              type="button"
                            >
                              {entry.isDir ? (
                                <>
                                  <FolderOpen className={styles.iconSmMut} />
                                  <span className={styles.truncate}>{entry.name}</span>
                                </>
                              ) : (
                                <>
                                  <FileIcon className={styles.iconSmMut} />
                                  <span className={styles.truncate}>{entry.name}</span>
                                  <span className={styles.fileSize}>
                                    {typeof entry.size === "number" ? `${entry.size.toLocaleString()} bytes` : ""}
                                  </span>
                                </>
                              )}
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </>
              )}
            </div>
          </div>

          {/* right */}
          <div className={styles.panel}>
            <div className={styles.previewViewport + " " + previewHeightClass}>
              {!selected && <div className={styles.centerPlaceholder}>Select a file or folder.</div>}

              {selected && selected.isDir && (
                <div className={styles.centerPlaceholder}>
                  Double-click a folder to enter it. Select to pick this folder.
                </div>
              )}

              {selected && !selected.isDir && (
                <>
                  {/* textPreview */}
                  {looksTextLike(selected) && previewRemoteText && (
                    <div className={styles.previewCol}>
                      {previewLoading && (
                        <div className={styles.inlineLoading}>
                          <Loader2 className={styles.iconSpinSm} />
                          <span>Loading preview…</span>
                        </div>
                      )}

                      {!previewLoading && previewText && <div className={styles.textPreviewBox}>{previewText}</div>}

                      {!previewLoading && !previewText && (
                        <div className={styles.centerPlaceholder}>No text preview available.</div>
                      )}
                    </div>
                  )}

                  {/* imagePreview */}
                  {!looksTextLike(selected) && (
                    <div className={styles.previewRow}>
                      {(() => {
                        const seemsImage = looksImageLike(selected);
                        if (!seemsImage) {
                          return <div className={styles.centerPlaceholder}>No preview available.</div>;
                        }

                        return (
                          <>
                            <div className={styles.imageBlock}>
                              {imgLoading && (
                                <div className={styles.inlineLoading}>
                                  <Loader2 className={styles.iconSpinSm} />
                                  <span>Loading image…</span>
                                </div>
                              )}

                              {!imgLoading && imgUrl && (
                                <div className={styles.imageFrame}>
                                  <img src={imgUrl} alt={selected.name} className={styles.previewImage} />
                                </div>
                              )}

                              {!imgLoading && !imgUrl && (
                                <div className={styles.centerPlaceholder}>No image preview available.</div>
                              )}
                            </div>

                            <div className={styles.metaBox}>
                              <div className={styles.metaTitle}>{selected.name}</div>

                              {imgMeta.sizeBytes !== undefined && (
                                <div className={styles.metaRow}>
                                  <span className={styles.metaLabel}>Size:</span>
                                  <span className={styles.metaValue}>{humanBytes(imgMeta.sizeBytes)}</span>
                                </div>
                              )}

                              {(imgMeta.width !== undefined ||
                                imgMeta.height !== undefined ||
                                imgMeta.depth !== undefined) && (
                                <div className={styles.metaRow}>
                                  <span className={styles.metaLabel}>Dimensions:</span>
                                  <span className={styles.metaValue}>
                                    {imgMeta.width ?? "?"} × {imgMeta.height ?? "?"}
                                    {imgMeta.depth !== undefined ? ` × ${imgMeta.depth}` : ""}
                                  </span>
                                </div>
                              )}

                              {imgMeta.voxelSize && (
                                <div className={styles.metaRow}>
                                  <span className={styles.metaLabel}>Sampling rate:</span>
                                  <span className={styles.metaValue}>{imgMeta.voxelSize[0].toFixed(1)}</span>
                                </div>
                              )}

                              {imgMeta.note && (
                                <div className={styles.metaRow}>
                                  <span className={styles.metaLabel}>Note:</span>
                                  <span className={styles.metaValue}>{imgMeta.note}</span>
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className={styles.footer}>
          <button type="button" className={styles.ppDialogBtn} onClick={onClose}>
            Close
          </button>

          <button
            type="button"
            className={[styles.ppDialogBtn, styles.ppDialogBtnPrimary].join(" ")}
            onClick={handlePick}
            disabled={!selected}
          >
            Select
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
