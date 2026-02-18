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
  path: string; // leaf (basename) in new backend contract
  isDir: boolean;
  size?: number;
  mime?: string;
};

type PreviewMeta = {
  name?: string;
  mime?: string;
  width?: number;
  height?: number;
  depth?: number;
  thumbWidth?: number;
  thumbHeight?: number;
  sizeBytes?: number;
  voxelSize?: [number, number, number];
  note?: string;
};

export type RemotePreviewSource =
  | { sourceType: "url"; url: string }
  | { sourceType: "blob"; blob: Blob }
  | { sourceType: "base64"; dataBase64: string; mime?: string };

export type RemotePreview =
  | { kind: "none"; mime?: string; meta?: PreviewMeta; note?: string }
  | { kind: "text"; mime?: string; meta?: PreviewMeta; text: string; truncated?: boolean; language?: string }
  | { kind: "image"; mime?: string; meta?: PreviewMeta; source: RemotePreviewSource }
  | { kind: "table"; mime?: string; meta?: PreviewMeta; columns: string[]; rows: Array<Array<string | number | null>>; truncated?: boolean }
  | { kind: "error"; mime?: string; meta?: PreviewMeta; message: string };

type ResolveBrowserPathsResult = {
  rootAbs?: string; // provided by backend, not needed by the new frontend contract
  startPath?: string; // relative-to-root preferred ("" means root)
};

type RemoteFileDialogProps = {
  open: boolean;
  onClose: () => void;
  title?: string;

  projectId?: string | number;
  protocolId?: string | number | null | undefined;

  // initialPathRel: relative to root ("" means root)
  initialPath?: string;

  // resolveBrowserPaths: returns startPath (rootAbs ignored in this minimal contract)
  resolveBrowserPaths?: () => Promise<ResolveBrowserPathsResult>;

  // new backend: returns items only
  listRemoteDirectory: (relPath: string) => Promise<RemoteEntry[]>;

  // unifiedPreviewContract
  previewRemoteEntry?: (relPath: string) => Promise<RemotePreview | null>;

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
  previewRemoteEntry,
  protocolId,
  buildDownloadUrl,
  onPick,
}: RemoteFileDialogProps) {
  // directoryState (cwdRel is relative to root; "" means root)
  const [cwdRel, setCwdRel] = useState<string>(initialPath);
  const [items, setItems] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // protocolRootRelativeOnceResolved (in the new backend contract it is just startPath)
  const [protocolRootRel, setProtocolRootRel] = useState<string>("");

  // selectionState
  const [selected, setSelected] = useState<RemoteEntry | null>(null);

  // search / sort state
  const [filterText, setFilterText] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // unifiedPreviewState
  const [preview, setPreview] = useState<RemotePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // computedImageSrcForBlob
  const [previewImageSrc, setPreviewImageSrc] = useState<string>("");
  const previewObjectUrlRef = useRef<string>("");

  // portalContainer
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // hardening refs
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const refreshSeqRef = useRef<number>(0);
  const previewSeqRef = useRef<number>(0);

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
        continue; // clampNeverGoAboveRoot
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

    // newBackendContract: entry.path is leaf (basename)
    const safe = normalizeRelPath(raw);
    const leaf = safe.split("/").filter(Boolean).pop() || "";
    return joinRelPaths(cwdRel, leaf);
  };

  /** revokeObjectUrlSafe */
  const revokeObjectUrlSafe = (url: string) => {
    try {
      if (url) URL.revokeObjectURL(url);
    } catch {
      // ignoreRevokeErrors
    }
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

  // buildMetaSummaryLine
  const buildMetaSummaryLine = (meta: PreviewMeta | undefined, fallbackMime?: string, truncated?: boolean) => {
    const m = meta || {};
    const parts: string[] = [];

    const sizeStr = m.sizeBytes !== undefined ? humanBytes(m.sizeBytes) : undefined;
    const mimeStr = m.mime || fallbackMime;

    if (sizeStr) parts.push(sizeStr);
    if (mimeStr) parts.push(mimeStr);

    const hasDims = m.width !== undefined || m.height !== undefined || m.depth !== undefined;
    if (hasDims) {
      const w = m.width ?? "?";
      const h = m.height ?? "?";
      const d = m.depth;
      parts.push(d !== undefined ? `${w}×${h}×${d}` : `${w}×${h}`);
    }

    if (m.voxelSize && m.voxelSize.length === 3) {
      const [vx, vy, vz] = m.voxelSize;
      if ([vx, vy, vz].every((x) => typeof x === "number" && Number.isFinite(x))) {
        parts.push(`sr ${vx.toFixed(1)}×${vy.toFixed(1)}×${vz.toFixed(1)}`);
      }
    }

    if (truncated) parts.push("truncated");

    return parts.join(" • ");
  };

  // renderMetaInlineFooter
  const renderMetaInlineFooter = (meta: PreviewMeta | undefined, fileName: string, mime?: string, truncated?: boolean) => {
    const summary = buildMetaSummaryLine(meta, mime, truncated);
    const note = meta?.note;

    if (!summary && !note) return null;

    return (
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid rgba(148, 163, 184, 0.18)",
          fontSize: 12,
          opacity: 0.85,
          lineHeight: 1.35,
        }}
      >
        <div style={{ fontWeight: 600, opacity: 0.9 }}>{fileName}</div>
        {!!summary && <div style={{ opacity: 0.8 }}>{summary}</div>}
        {!!note && <div style={{ marginTop: 6, opacity: 0.75 }}>{note}</div>}
      </div>
    );
  };


  /** clearPreviewState */
  const clearPreviewState = () => {
    previewSeqRef.current += 1;
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);

    revokeObjectUrlSafe(previewObjectUrlRef.current);
    previewObjectUrlRef.current = "";
    setPreviewImageSrc("");
  };

  /** refresh */
  const refresh = async (relPath: string) => {
    const seq = ++refreshSeqRef.current;

    try {
      setLoading(true);
      setError(null);

      const safeRel = normalizeRelPath(relPath || "");
      const listing = await listRemoteDirectory(safeRel);

      // ignoreStaleRefreshResults
      if (refreshSeqRef.current !== seq) return;

      setItems(Array.isArray(listing) ? listing : []);
      setCwdRel(safeRel);

      // resetSelectionAndPreviewOnDirectoryChange
      setSelected(null);
      clearPreviewState();
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

  /** loadUnifiedPreview */
  const loadUnifiedPreview = async (entry: RemoteEntry) => {
    if (!previewRemoteEntry) {
      clearPreviewState();
      return;
    }
    if (entry.isDir) {
      clearPreviewState();
      return;
    }

    const seq = ++previewSeqRef.current;

    setPreview(null);
    setPreviewLoading(true);
    setPreviewError(null);

    revokeObjectUrlSafe(previewObjectUrlRef.current);
    previewObjectUrlRef.current = "";
    setPreviewImageSrc("");

    try {
      const relPath = buildRelPathForEntry(entry);
      const p = await previewRemoteEntry(relPath);

      // ignoreStalePreviewResults
      if (previewSeqRef.current !== seq) return;

      setPreview(p || { kind: "none", note: "No preview available." });
    } catch (e: unknown) {
      if (previewSeqRef.current !== seq) return;
      const msg = e instanceof Error ? e.message : "Failed to load preview";
      setPreviewError(msg);
      setPreview({ kind: "error", message: msg });
    } finally {
      if (previewSeqRef.current === seq) setPreviewLoading(false);
    }
  };

  const handleSelectEntry = (entry: RemoteEntry) => {
    setSelected(entry);
    void loadUnifiedPreview(entry);
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
        previewSeqRef.current += 1;

        setItems([]);
        setCwdRel(normalizeRelPath(initialPath || ""));
        setProtocolRootRel("");
        setSelected(null);
        setFilterText("");

        clearPreviewState();
        setError(null);
        return;
      }

      let startRel = normalizeRelPath(initialPath || "");

      if (resolveBrowserPaths) {
        try {
          const resolved = await resolveBrowserPaths();
          if (!mounted) return;

          const startRaw = normalizePosixPath(resolved?.startPath || "");
          startRel = normalizeRelPath(startRaw);
        } catch {
          // ignoreResolveErrorsAndFallbackToInitialPath
          startRel = normalizeRelPath(initialPath || "");
        }
      }

      setProtocolRootRel(startRel);
      await refresh(startRel);
    };

    void boot();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    // syncPreviewImageSrcFromModel
    if (!preview || preview.kind !== "image") {
      revokeObjectUrlSafe(previewObjectUrlRef.current);
      previewObjectUrlRef.current = "";
      setPreviewImageSrc("");
      return;
    }

    const src = preview.source as any;

    // urlSource
    if (src?.sourceType === "url" && typeof src.url === "string") {
      revokeObjectUrlSafe(previewObjectUrlRef.current);
      previewObjectUrlRef.current = "";
      setPreviewImageSrc(src.url);
      return;
    }

    // blobSource
    if (src?.sourceType === "blob" && src.blob instanceof Blob) {
      revokeObjectUrlSafe(previewObjectUrlRef.current);
      const objUrl = URL.createObjectURL(src.blob);
      previewObjectUrlRef.current = objUrl;
      setPreviewImageSrc(objUrl);

      return () => {
        revokeObjectUrlSafe(objUrl);
        if (previewObjectUrlRef.current === objUrl) previewObjectUrlRef.current = "";
      };
    }

    // base64Source
    if (src?.sourceType === "base64" && typeof src.dataBase64 === "string") {
      const effectiveMime =
        normalizeMimeValue(String(src.mime || preview.mime || "image/png")) || "image/png";

      try {
        const blob = base64ToBlob(src.dataBase64, effectiveMime);

        revokeObjectUrlSafe(previewObjectUrlRef.current);
        const objUrl = URL.createObjectURL(blob);
        previewObjectUrlRef.current = objUrl;
        setPreviewImageSrc(objUrl);

        return () => {
          revokeObjectUrlSafe(objUrl);
          if (previewObjectUrlRef.current === objUrl) previewObjectUrlRef.current = "";
        };
      } catch (e) {
        // keepUiStableOnBadPayload
        revokeObjectUrlSafe(previewObjectUrlRef.current);
        previewObjectUrlRef.current = "";
        setPreviewImageSrc("");
        return;
      }
    }

    // unknownSourceTypeFallback
    revokeObjectUrlSafe(previewObjectUrlRef.current);
    previewObjectUrlRef.current = "";
    setPreviewImageSrc("");
  }, [preview]);


  function normalizeMimeValue(v: string): string {
    // normalizeMimeLikeHeaderValue
    const raw = (v || "").trim().toLowerCase();
    if (!raw) return "";
    return raw.split(";")[0].trim();
  }

  function base64ToBlob(dataBase64OrDataUrl: string, mime: string): Blob {
    // extractBase64Payload
    let base64 = (dataBase64OrDataUrl || "").trim();

    // handleDataUrlPrefix
    if (base64.startsWith("data:")) {
      const commaIndex = base64.indexOf(",");
      if (commaIndex >= 0) base64 = base64.slice(commaIndex + 1);
    }

    // normalizeUrlSafeBase64
    base64 = base64.replace(/-/g, "+").replace(/_/g, "/");

    // addPaddingIfNeeded
    const mod = base64.length % 4;
    if (mod === 2) base64 += "==";
    else if (mod === 3) base64 += "=";

    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime || "application/octet-stream" });
  }


  const parentRel = getParentRelPath(cwdRel);
  const showParentEntry = parentRel !== null && !loading && !error;
  const parentEntry = useMemo<RemoteEntry>(() => ({ name: "..", path: "..", isDir: true }), []);

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

    const filtered = !needle ? items : items.filter((e) => (e.name || "").toLowerCase().includes(needle));

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
    if (!stillThere) {
      setSelected(null);
      clearPreviewState();
    }
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

  const renderMetaBox = (meta: PreviewMeta | undefined, fileName: string) => {
    const m = meta || {};
    const hasAny =
      m.sizeBytes !== undefined ||
      m.width !== undefined ||
      m.height !== undefined ||
      m.depth !== undefined ||
      !!m.voxelSize ||
      !!m.note;

    if (!hasAny) return null;

    return (
      <div className={styles.metaBox}>
        <div className={styles.metaTitle}>{fileName}</div>

        {m.sizeBytes !== undefined && (
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Size:</span>
            <span className={styles.metaValue}>{humanBytes(m.sizeBytes)}</span>
          </div>
        )}

        {(m.width !== undefined || m.height !== undefined || m.depth !== undefined) && (
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Dimensions:</span>
            <span className={styles.metaValue}>
              {m.width ?? "?"} × {m.height ?? "?"}
              {m.depth !== undefined ? ` × ${m.depth}` : ""}
            </span>
          </div>
        )}

        {m.voxelSize && (
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Sampling rate:</span>
            <span className={styles.metaValue}>
              {m.voxelSize[0].toFixed(1)} × {m.voxelSize[1].toFixed(1)} × {m.voxelSize[2].toFixed(1)}
            </span>
          </div>
        )}

        {m.note && (
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Note:</span>
            <span className={styles.metaValue}>{m.note}</span>
          </div>
        )}
      </div>
    );
  };

  const renderPreviewBody = () => {
    if (!selected) return <div className={styles.centerPlaceholder}>Select a file or folder.</div>;

    if (selected.isDir) {
      return (
        <div className={styles.centerPlaceholder}>
          Double-click a folder to enter it. Select to pick this folder.
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
      return <div className={styles.centerPlaceholder}>No preview available.</div>;
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
        <div className={styles.previewCol}>
          {preview.text ? (
            <div
              className={styles.textPreviewBox}
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {preview.text}
              </div>

              {renderMetaInlineFooter(preview.meta, selected.name, preview.mime, preview.truncated)}
            </div>
          ) : (
            <div className={styles.centerPlaceholder}>No text preview available.</div>
          )}
        </div>
      );
    }


    if (preview.kind === "table") {
      return (
        <div className={styles.previewCol}>
          <div
            className={styles.textPreviewBox}
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              padding: 0,
            }}
          >
            <div style={{ flex: 1, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {preview.columns.map((c) => (
                      <th
                        key={c}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
                          position: "sticky",
                          top: 0,
                          background: "rgba(15, 23, 42, 0.25)",
                          backdropFilter: "blur(6px)",
                          zIndex: 1,
                        }}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, idx) => (
                    <tr key={idx}>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          style={{
                            padding: "8px 10px",
                            borderBottom: "1px solid rgba(148, 163, 184, 0.10)",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                            maxWidth: 240,
                          }}
                          title={cell === null ? "" : String(cell)}
                        >
                          {cell === null ? "" : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "10px 12px" }}>
              {renderMetaInlineFooter(preview.meta, selected.name, preview.mime, preview.truncated)}
            </div>
          </div>
        </div>
      );
    }


    if (preview.kind === "image") {
      return (
        <div className={styles.previewRow}>
          <div className={styles.imageBlock}>
            {!previewImageSrc && <div className={styles.centerPlaceholder}>No image preview available.</div>}

            {!!previewImageSrc && (
              <div className={styles.imageFrame}>
                <img src={previewImageSrc} alt={selected.name} className={styles.previewImage} />
              </div>
            )}
          </div>

          {renderMetaBox(preview.meta, selected.name)}
        </div>
      );
    }

    return <div className={styles.centerPlaceholder}>No preview available.</div>;
  };

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
        className={[dialogWidthClass, dialogHeightClass, styles.dialogContent, styles.dialogLayout].join(" ")}
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

          {protocolId !== null && protocolId !== undefined && (
            <button
              type="button"
              onClick={goProtocolRoot}
              className={styles.ppChipBtn}
              title="Back to the protocol start directory"
            >
              <FolderOpen className={styles.iconSm} />
              Protocol folder
            </button>
          )}

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

                        {!isLast && <span style={{ opacity: 0.55, padding: "0 2px", userSelect: "none" }}>/</span>}
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
                      <Search className={styles.iconSm} style={{ position: "absolute", left: 10, opacity: 0.7 }} />
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
                          fontSize: 12,
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
                        {(() => {
                          const isSel = selected?.name === ".." && selected?.path === "..";
                          return (
                            <button
                              className={[styles.rowBtn, isSel ? styles.rowBtnSelected : ""].join(" ")}
                              onClick={() => handleSelectEntry(parentEntry)} // singleClickSelectOnly
                              onDoubleClick={goUp} // doubleClickToGoUp
                              type="button"
                              title="Double-click to go up"
                            >
                              <FolderOpen className={styles.iconSmMut} />
                              <span className={styles.truncate}>..</span>
                            </button>
                          );
                        })()}
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
            <div className={styles.previewViewport + " " + previewHeightClass}>{renderPreviewBody()}</div>
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
