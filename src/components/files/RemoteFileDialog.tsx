// src/components/RemoteFileDialog.tsx
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
          styles.dialogContent,
          styles.dialogLayout,
        ].join(" ")}
      >
        <DialogHeader className={styles.headerBar}>
          <DialogTitle className={styles.headerTitle}>
            <span className={styles.truncate}>{title}</span>
          </DialogTitle>

          <DialogDescription className={styles.srOnly}>
            Remote file browser dialog. Use Enter/double-click to open folders, and Select to choose a file or folder.
          </DialogDescription>
        </DialogHeader>

        {/* toolbar */}
        <div className={styles.toolbar}>
          <button type="button" onClick={goUp} className={styles.ppChipBtn} disabled={!parentAbs}>
            <CornerUpLeft className={styles.iconSm} />
            Up
          </button>

          <button type="button" onClick={goHome} className={styles.ppChipBtn}>
            <Home className={styles.iconSm} />
            Home
          </button>

          {/*
          <button type="button" onClick={goProjectRoot} className={styles.ppChipBtn} disabled={!baseAbs}>
            <FolderOpen className={styles.iconSm} />
            Project folder
          </button>
          */}

          <button type="button" onClick={goProtocolRoot} className={styles.ppChipBtn} disabled={!protocolRoot}>
            <FolderOpen className={styles.iconSm} />
            Protocol folder
          </button>

          <button
            type="button"
            onClick={() => void refresh(baseAbs || cwd || "")}
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
                <div className={styles.panelHeaderPath}>{directoryLabel}</div>
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
                    items.map((entry) => {
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
