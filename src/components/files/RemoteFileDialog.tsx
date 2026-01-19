import React, { useEffect, useMemo, useState } from "react";
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
  cwd: string;
  dirName?: string; // absolute directory that contains returned items
  absPath?: string; // backend alias (older)
  items: RemoteEntry[];
};

type RemoteFileDialogProps = {
  open: boolean;
  onClose: () => void;
  title?: string;

  projectId?: string | number;
  protocolId?: string | number;

  initialPath?: string;
  resolveStartPath?: () => Promise<string>;

  listRemoteDirectory: (absOrRelPath: string) => Promise<RemoteListResult | RemoteEntry[]>;

  previewRemoteText?: (absOrRelPath: string) => Promise<string | null>;

  fetchInlinePreviewBlob?: (absOrRelPath: string) => Promise<{ blob: Blob; meta: PreviewMeta }>;

  buildDownloadUrl?: (absOrRelPath: string, inline?: boolean) => string;

  // alwaysReceivesAbsolutePathFileOrDirectory
  onPick?: (absolutePath: string) => void;
};

export default function RemoteFileDialog({
  open,
  onClose,
  title = "Browse protocol files",
  initialPath = "",
  resolveStartPath,
  listRemoteDirectory,
  previewRemoteText,
  fetchInlinePreviewBlob,
  buildDownloadUrl,
  onPick,
}: RemoteFileDialogProps) {
  // directoryState
  const [cwd, setCwd] = useState<string>(initialPath);
  const [dirName, setDirName] = useState<string>("");
  const [items, setItems] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // protocolRootAbsoluteOnceResolved
  const [protocolRoot, setProtocolRoot] = useState<string>("");

  // selectionState
  const [selected, setSelected] = useState<RemoteEntry | null>(null);

  // textPreviewState
  const [previewText, setPreviewText] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // imagePreviewState
  const [imgUrl, setImgUrl] = useState<string>("");
  const [imgMeta, setImgMeta] = useState<PreviewMeta>({});
  const [imgLoading, setImgLoading] = useState<boolean>(false);

  // portalContainer
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // fixedLayoutSizes
  const dialogWidthClass = "w-[1300px] max-w-[1300px]";
  const dialogHeightClass = "h-[700px] max-h-[700px]";
  const browserHeightClass = "h-[420px]";
  const previewHeightClass = "h-[360px]";

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
  const normalizePosixPath = (p: string) => (p || "").replace(/\\/g, "/").replace(/\/+/g, "/");

  /** joinPosixPaths */
  const joinPosixPaths = (base: string, leaf: string) => {
    const b = normalizePosixPath(base).replace(/\/+$/g, "");
    const l = normalizePosixPath(leaf).replace(/^\/+/g, "");
    if (!b) return l;
    if (!l) return b;
    return normalizePosixPath(`${b}/${l}`);
  };

  /** getCurrentDirAbs */
  const getCurrentDirAbs = () => {
    const dn = normalizePosixPath(dirName || "");
    if (dn.startsWith("/")) return dn;

    const c = normalizePosixPath(cwd || "");
    if (c.startsWith("/")) return c;

    const pr = normalizePosixPath(protocolRoot || "");
    if (pr.startsWith("/")) return joinPosixPaths(pr, c);

    return "";
  };

  /** buildAbsolutePathForEntry */
  const buildAbsolutePathForEntry = (entry: RemoteEntry) => {
    const p = normalizePosixPath(entry?.path || entry?.name || "");
    if (!p) return "";

    // keepAbsolutePathIfProvided
    if (p.startsWith("/")) return p;

    // newBackendContract: item.pathIsLeafSoJoin(dirName, item.path)
    const baseAbs = getCurrentDirAbs();
    if (baseAbs) return joinPosixPaths(baseAbs, p);

    // fallbackIfNoDirNameYet
    const c = normalizePosixPath(cwd || "");
    if (c.startsWith("/")) return joinPosixPaths(c, p);

    const pr = normalizePosixPath(protocolRoot || "");
    if (pr.startsWith("/")) return joinPosixPaths(joinPosixPaths(pr, c), p);

    return joinPosixPaths(c, p);
  };

  /** getParentAbsPath */
  const getParentAbsPath = (absDir: string): string | null => {
    const normalized = normalizePosixPath(absDir);
    if (!normalized || !normalized.startsWith("/")) return null;
    if (normalized === "/") return null;

    if (normalized.startsWith("/home")) {
      if (normalized === "/home") return null;
      const parts = normalized.split("/").filter(Boolean);
      if (parts.length <= 1) return null;
      return "/" + parts.slice(0, -1).join("/");
    }

    const parts = normalized.split("/").filter(Boolean);
    if (parts.length <= 1) return "/";
    return "/" + parts.slice(0, -1).join("/");
  };

  /** inferProjectFolderFromKnownPath */
  const inferProjectFolderFromKnownPath = (p: string) => {
    const norm = normalizePosixPath(p || "");
    if (!norm) return "";

    const runsMarker = "/Runs/";
    if (norm.includes(runsMarker)) return norm.split(runsMarker)[0] || "";

    if (norm.endsWith("/Runs")) return norm.slice(0, -"/Runs".length) || "";

    return norm;
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
  const refresh = async (pathAbsOrRel: string) => {
    try {
      setLoading(true);
      setError(null);

      const listing = await listRemoteDirectory(pathAbsOrRel);

      let nextItems: RemoteEntry[] = [];
      let nextCwd = "";
      let nextDirName = "";

      if (Array.isArray(listing)) {
        // backwardCompatibleModeOnlyItems
        nextItems = listing;
        nextCwd = pathAbsOrRel || "";

        const req = normalizePosixPath(pathAbsOrRel || "");
        if (req.startsWith("/") && req !== "/") nextDirName = req;
      } else if (listing && Array.isArray((listing as RemoteListResult).items)) {
        const result = listing as RemoteListResult;
        nextItems = result.items;
        nextCwd = typeof result.cwd === "string" ? result.cwd : pathAbsOrRel || "";

        const dn = (result.dirName || "").trim();
        const ap = (result.absPath || "").trim();

        if (dn) nextDirName = normalizePosixPath(dn);
        else if (ap) nextDirName = normalizePosixPath(ap);
        else {
          const req = normalizePosixPath(pathAbsOrRel || "");
          if (req.startsWith("/") && req !== "/") nextDirName = req;
        }
      }

      setItems(nextItems);
      setCwd(nextCwd);
      setDirName(nextDirName);

      // resetSelectionAndPreviewsOnDirectoryChange
      setSelected(null);
      setPreviewText("");
      setPreviewLoading(false);

      if (imgUrl) URL.revokeObjectURL(imgUrl);
      setImgUrl("");
      setImgMeta({});
      setImgLoading(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to list directory contents";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const enterDir = (entry: RemoteEntry) => {
    if (!entry.isDir) return;
    const nextAbsDir = buildAbsolutePathForEntry(entry);
    void refresh(nextAbsDir);
  };

  const goUp = () => {
    const baseAbs = getCurrentDirAbs();
    const parentAbs = getParentAbsPath(baseAbs);
    if (!parentAbs) return;
    void refresh(parentAbs);
  };

  const goHome = () => {
    void refresh("/home");
  };

  const goProjectRoot = () => {
    const baseAbs = getCurrentDirAbs();
    const projectPath = inferProjectFolderFromKnownPath(baseAbs);
    void refresh(projectPath || baseAbs || "");
  };

  const goProtocolRoot = () => {
    void refresh(protocolRoot || "");
  };

  const loadTextPreview = async (entry: RemoteEntry) => {
    if (!previewRemoteText) return;
    if (entry.isDir) return;
    if (!looksTextLike(entry)) return;

    setPreviewText("");
    setPreviewLoading(true);
    try {
      const absPath = buildAbsolutePathForEntry(entry);
      const text = await previewRemoteText(absPath);
      setPreviewText(text || "");
    } catch {
      setPreviewText("");
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadImagePreview = async (entry: RemoteEntry) => {
    if (!looksImageLike(entry)) return;
    if (!fetchInlinePreviewBlob) {
      setImgUrl("");
      setImgMeta({});
      return;
    }

    if (imgUrl) URL.revokeObjectURL(imgUrl);

    setImgUrl("");
    setImgMeta({});
    setImgLoading(true);

    try {
      const absPath = buildAbsolutePathForEntry(entry);
      const { blob, meta } = await fetchInlinePreviewBlob(absPath);
      const objUrl = URL.createObjectURL(blob);
      setImgUrl(objUrl);
      setImgMeta(meta || {});
    } catch {
      setImgUrl("");
      setImgMeta({});
    } finally {
      setImgLoading(false);
    }
  };

  const handleSelectEntry = (entry: RemoteEntry) => {
    setSelected(entry);

    // textBranch
    if (!entry.isDir && looksTextLike(entry) && previewRemoteText) {
      void loadTextPreview(entry);
    } else {
      setPreviewText("");
      setPreviewLoading(false);
    }

    // imageBranch
    if (!entry.isDir && looksImageLike(entry)) {
      void loadImagePreview(entry);
    } else {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
      setImgUrl("");
      setImgMeta({});
      setImgLoading(false);
    }
  };

  const handlePick = () => {
    if (!selected || !onPick) return;
    const absPath = buildAbsolutePathForEntry(selected);
    if (!absPath) return;
    onPick(absPath);
    onClose();
  };

  const handleDownload = () => {
    if (!selected || selected.isDir || !buildDownloadUrl) return;
    const absPath = buildAbsolutePathForEntry(selected);
    if (!absPath) return;
    const url = buildDownloadUrl(absPath, false);
    window.open(url, "_blank");
  };

  const handleDialogClick: React.MouseEventHandler = (e) => {
    e.stopPropagation();
  };

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      if (!open) {
        // resetStateWhenClosed
        setItems([]);
        setCwd(initialPath || "");
        setDirName("");
        setSelected(null);
        setPreviewText("");
        setPreviewLoading(false);

        if (imgUrl) URL.revokeObjectURL(imgUrl);
        setImgUrl("");
        setImgMeta({});
        setImgLoading(false);
        setError(null);
        return;
      }

      let startPath = initialPath || "";

      // resolveProtocolRootOnce
     
      if (resolveStartPath) {
        try {
          const resolved = await resolveStartPath();
           console.log(resolved)
          if (!mounted) return;
          if (resolved) {
            startPath = resolved;
            setProtocolRoot(resolved);

            // setInitialDirNameOptimisticallyForBetterHeader
            const resolvedNorm = normalizePosixPath(resolved);
            if (resolvedNorm.startsWith("/") && resolvedNorm !== "/") {
              setDirName(resolvedNorm);
            }
          }
        } catch {
          // ignoreResolveErrorsAndFallbackToInitialPath
        }
      } else {
        // setInitialDirNameOptimisticallyIfAbsolute
        const startNorm = normalizePosixPath(startPath);
        if (startNorm.startsWith("/") && startNorm !== "/") {
          setDirName(startNorm);
        }
      }

      await refresh(startPath);
    };

    void boot();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const baseAbs = getCurrentDirAbs();
  const parentAbs = getParentAbsPath(baseAbs);
  const showParentEntry = !!parentAbs && !loading && !error;

  const directoryLabel = useMemo(() => {
    const d = baseAbs || dirName || "";
    if (d && d !== "/") return d;
    if (protocolRoot) return protocolRoot;
    return cwd && cwd !== "/" ? cwd : "";
  }, [baseAbs, dirName, protocolRoot, cwd]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        container={portalContainer}
        // preventCloseOnOutsideClick
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        onClick={handleDialogClick}
        className={[
          dialogWidthClass,
          dialogHeightClass,
          "flex flex-col overflow-hidden",
          styles.dialogContent,
        ].join(" ")}
      >
        <DialogHeader
          className={[
            "-mx-6 -mt-6 px-6 py-4 bg-gray-300 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 rounded-t-lg",
            "flex-none",
          ].join(" ")}
        >
          <DialogTitle className="text-lg font-medium text-gray-700 dark:text-gray-100 dark:bg-gray-800 flex flex-col bg-gray-300">
            <span className="truncate">{title}</span>
          </DialogTitle>

          <DialogDescription className="sr-only">
            Remote file browser dialog. Use Enter/double-click to open folders, and Select to choose a file or folder.
          </DialogDescription>
        </DialogHeader>

        {/* toolbar */}
        <div
          className={[
            "flex flex-wrap items-center gap-2 mt-4 bg-gray-100 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm",
            "flex-none",
          ].join(" ")}
        >
          <button type="button" onClick={goUp} className="pp-chipBtn" disabled={!parentAbs}>
            <CornerUpLeft className="h-4 w-4" />
            Up
          </button>

          <button type="button" onClick={goHome} className="pp-chipBtn">
            <Home className="h-4 w-4" />
            Home
          </button>

          {/* 
          <button type="button" onClick={goProjectRoot} className="pp-chipBtn" disabled={!baseAbs}>
            <FolderOpen className="h-4 w-4" />
            Project folder
          </button>

          */}

          <button type="button" onClick={goProtocolRoot} className="pp-chipBtn" disabled={!protocolRoot}>
            <FolderOpen className="h-4 w-4" />
            Protocol folder
          </button>

          <button
            type="button"
            onClick={() => void refresh(baseAbs || cwd || "")}
            disabled={loading}
            title="Refresh this directory"
            className="pp-chipBtn"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>

        </div>

        {/* body */}
        <div className={["grid grid-cols-2 gap-4 mt-4", browserHeightClass, "flex-none"].join(" ")}>
          {/* left */}
          <div className="h-full border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-gray-900">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-300 dark:bg-gray-800 text-[13px] font-medium text-gray-700 dark:text-gray-200 flex items-start justify-between flex-none">
              <div className="min-w-0">
                <div>Directory</div>
                <div className="mt-0.5 text-[11px] font-normal text-gray-600 dark:text-gray-300 truncate">
                  {directoryLabel}
                </div>
              </div>

              {error && (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-[11px] font-normal">
                  <AlertCircle className="h-3 w-3" />
                  <span>Error</span>
                </span>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {error && (
                <div className="p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              {!error && (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700 text-sm text-gray-800 dark:text-gray-100">
                  {showParentEntry && (
                    <li key="..">
                      <button
                        className={[
                          "w-full text-left px-3 py-2 flex items-center gap-2",
                          "hover:bg-gray-100 dark:hover:bg-gray-800/70",
                        ].join(" ")}
                        onClick={goUp}
                      >
                        <FolderOpen className="h-4 w-4 flex-shrink-0 text-gray-600 dark:text-gray-300" />
                        <span className="truncate">..</span>
                      </button>
                    </li>
                  )}

                  {loading && (
                    <li className="p-3 flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading…</span>
                    </li>
                  )}

                  {!loading &&
                    items.map((entry) => {
                      const isSel = selected?.name === entry.name && selected?.path === entry.path;
                      return (
                        <li key={`${entry.path}-${entry.name}`}>
                          <button
                            className={[
                              "w-full text-left px-3 py-2 flex items-center gap-2",
                              "hover:bg-gray-100 dark:hover:bg-gray-800/70",
                              isSel ? "bg-gray-100 dark:bg-gray-800/70" : "",
                            ].join(" ")}
                            onClick={() => handleSelectEntry(entry)}
                            onDoubleClick={() => enterDir(entry)}
                          >
                            {entry.isDir ? (
                              <>
                                <FolderOpen className="h-4 w-4 flex-shrink-0 text-gray-600 dark:text-gray-300" />
                                <span className="truncate">{entry.name}</span>
                              </>
                            ) : (
                              <>
                                <FileIcon className="h-4 w-4 flex-shrink-0 text-gray-600 dark:text-gray-300" />
                                <span className="truncate">{entry.name}</span>
                                <span className="ml-auto text-[11px] leading-none opacity-60">
                                  {typeof entry.size === "number" ? `${entry.size.toLocaleString()} bytes` : ""}
                                </span>
                              </>
                            )}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          </div>

          {/* right */}
          <div className="h-full border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-gray-900">
            <div
              className={[
                "flex-1 px-3 py-3 text-sm text-gray-800 dark:text-gray-100 overflow-hidden",
                previewHeightClass,
              ].join(" ")}
            >
              {!selected && (
                <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-center text-[13px]">
                  Select a file or folder.
                </div>
              )}

              {selected && selected.isDir && (
                <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-center text-[13px]">
                  Double-click a folder to enter it. Select to pick this folder.
                </div>
              )}

              {selected && !selected.isDir && (
                <>
                  {/* textPreview */}
                  {looksTextLike(selected) && previewRemoteText && (
                    <div className="w-full h-full flex flex-col">
                      {previewLoading && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-[13px]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading preview…</span>
                        </div>
                      )}

                      {!previewLoading && previewText && (
                        <div className="flex-1 overflow-auto rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-3 text-[12px] leading-relaxed text-gray-800 dark:text-gray-100 font-mono whitespace-pre-wrap break-words">
                          {previewText}
                        </div>
                      )}

                      {!previewLoading && !previewText && (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-[13px] text-center">
                          No text preview available.
                        </div>
                      )}
                    </div>
                  )}

                  {/* imagePreview */}
                  {!looksTextLike(selected) && (
                    <div className="w-full h-full flex flex-col md:flex-row gap-4 overflow-hidden">
                      {(() => {
                        const seemsImage = looksImageLike(selected);
                        if (!seemsImage) {
                          return (
                            <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-[13px] text-center">
                              No preview available.
                            </div>
                          );
                        }

                        return (
                          <>
                            <div className="flex-shrink-0 flex flex-col items-center justify-center">
                              {imgLoading && (
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-[13px]">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span>Loading image…</span>
                                </div>
                              )}

                              {!imgLoading && imgUrl && (
                                <div className="w-[320px] h-[320px] max-w-full max-h-[320px] rounded-md border border-gray-300 dark:border-gray-600 bg-black flex items-center justify-center overflow-hidden">
                                  <img src={imgUrl} alt={selected.name} className="object-contain w-full h-full" />
                                </div>
                              )}

                              {!imgLoading && !imgUrl && (
                                <div className="text-gray-500 dark:text-gray-400 text-[13px] text-center">
                                  No image preview available.
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">
                              <div className="font-medium text-gray-900 dark:text-gray-100 break-words">{selected.name}</div>

                              {imgMeta.sizeBytes !== undefined && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <span className="font-medium">Size:</span>
                                  <span>{humanBytes(imgMeta.sizeBytes)}</span>
                                </div>
                              )}

                              {(imgMeta.width !== undefined || imgMeta.height !== undefined || imgMeta.depth !== undefined) && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <span className="font-medium">Dimensions:</span>
                                  <span>
                                    {imgMeta.width ?? "?"} × {imgMeta.height ?? "?"}
                                    {imgMeta.depth !== undefined ? ` × ${imgMeta.depth}` : ""}
                                  </span>
                                </div>
                              )}

                              {imgMeta.voxelSize && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <span className="font-medium">Sampling rate:</span>
                                  <span>{imgMeta.voxelSize[0].toFixed(1)}</span>
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
        <div className={["flex justify-end gap-2 mt-4", "flex-none"].join(" ")}>
          <button type="button" className="pp-dialogBtn" onClick={onClose}>
            Close
          </button>

          <button type="button" className="pp-dialogBtn pp-dialogBtnPrimary" onClick={handlePick} disabled={!selected}>
            Select
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
