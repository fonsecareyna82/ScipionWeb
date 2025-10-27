// src/components/files/RemoteFileDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";
import { Button } from "@/components/ui/button";
import {
  File as FileIcon,
  FolderOpen,
  Download,
  CornerUpLeft,
  RefreshCw,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  FileText,
} from "lucide-react";

/** Single remote entry returned by listRemoteDirectory */
export type RemoteEntry = {
  name: string;
  path: string; // path relative to the protocol root
  isDir: boolean;
  size?: number;
  mime?: string; // detected mime type if known
};

type RemoteFileDialogProps = {
  open: boolean;
  onClose: () => void;
  title?: string;

  projectId?: string | number; // kept for symmetry/debug; not directly used here
  protocolId?: string | number;

  /** Optional initial directory path relative to protocol root */
  initialPath?: string;

  /** Optional lazy resolver for the starting path (server is source of truth) */
  resolveStartPath?: () => Promise<string>;

  /** List directory contents at the given relative/absolute path */
  listRemoteDirectory: (absOrRelPath: string) => Promise<RemoteEntry[]>;

  /**
   * Optional text preview loader.
   * Should return a short string (<=1MB) for text-like files,
   * or null/"" if not previewable as text.
   *
   * Must already include auth (use your svc).
   */
  previewRemoteText?: (absOrRelPath: string) => Promise<string | null>;

  /**
   * Optional URL builder.
   *
   * If inline=true you return the /fs/download?...&inline=1 URL.
   * If inline=false you return the /fs/download?... URL.
   *
   * NOTE: This raw URL will NOT carry auth headers if we drop it
   * straight into <img src>. So for protected resources we still
   * need fetchInlineBlob (see below).
   */
  buildDownloadUrl?: (absOrRelPath: string, inline?: boolean) => string;

  /**
   * Fetches a binary preview (PNG/JPG/etc.) as a Blob for the given file path,
   * using authenticated fetch/axios under the hood.
   *
   * This must:
   *   - hit the same backend endpoint you use for inline previews
   *     (inline=true, which returns either the real image/* OR
   *     an auto-generated PNG slice for .mrc/.map, etc.)
   *   - include Authorization token so we don't get 401
   *   - return the Blob
   *
   * We'll turn that Blob into an object URL for <img src>.
   *
   * If you don't pass this prop, we'll fall back to buildDownloadUrl(..., true)
   * and you'll still get 401 for protected routes.
   */
  fetchInlineBlob?: (absOrRelPath: string) => Promise<Blob>;

  /** Called when the user confirms "Select" on a file */
  onPick?: (relativePath: string) => void;
};

export default function RemoteFileDialog({
  open,
  onClose,
  title = "Browse protocol files",
  projectId, // eslint-disable-line @typescript-eslint/no-unused-vars
  protocolId, // eslint-disable-line @typescript-eslint/no-unused-vars
  initialPath = "",
  resolveStartPath,
  listRemoteDirectory,
  previewRemoteText,
  buildDownloadUrl,
  fetchInlineBlob,
  onPick,
}: RemoteFileDialogProps) {
  const [cwd, setCwd] = useState<string>(initialPath);
  const [items, setItems] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // currently selected entry in the directory list
  const [selected, setSelected] = useState<RemoteEntry | null>(null);

  // preview of text-like files
  const [preview, setPreview] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // preview for image / mrc: we store a blob URL here
  const [imgUrl, setImgUrl] = useState<string>(""); // object URL for <img src>
  const [imgLoading, setImgLoading] = useState<boolean>(false);

  /**
   * Build breadcrumb segments for cwd like:
   *   root / subdir / subdir2
   */
  const breadcrumbs = useMemo(() => {
    const parts = (cwd || "").split("/").filter(Boolean);
    const crumbs = [{ name: "root", path: "" }];
    let acc = "";
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      crumbs.push({ name: p, path: acc });
    }
    return crumbs;
  }, [cwd]);

  /**
   * Return true if this entry is likely "text-like"
   * so we should try previewRemoteText() for it.
   */
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
    ];
    return textExts.some((ext) => lowerName.endsWith(ext));
  };

  /**
   * Return true if this entry can be visualized as an image,
   * including MRC / MAP volumes (server should convert
   * to PNG if inline=true).
   */
  const isMrcExt = (name: string | undefined) =>
    !!name && /\.(mrc|mrcs|map)$/i.test(name);

  const looksImageLike = (entry: RemoteEntry): boolean => {
    if (entry.isDir) return false;
    if (entry.mime && entry.mime.startsWith("image/")) return true;
    if (isMrcExt(entry.name)) return true;
    return false;
  };

  /**
   * Load directory contents and reset state.
   */
  const refresh = async (path: string) => {
    try {
      setLoading(true);
      setError(null);

      const listing = await listRemoteDirectory(path);

      setItems(listing);
      setCwd(path);
      setSelected(null);
      setPreview("");
      setPreviewLoading(false);

      // clear any image object URL
      if (imgUrl) {
        URL.revokeObjectURL(imgUrl);
      }
      setImgUrl("");
      setImgLoading(false);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to list directory contents";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Enter a directory on double click.
   * No-op for files.
   */
  const enter = (entry: RemoteEntry) => {
    if (!entry.isDir) return;
    void refresh(entry.path);
  };

  /**
   * Go one directory up (..). If already at root => no-op.
   */
  const goUp = () => {
    if (!cwd) return;
    const up = cwd.includes("/") ? cwd.split("/").slice(0, -1).join("/") : "";
    void refresh(up);
  };

  /**
   * Load textual preview for a file (logs, json, etc.)
   * using previewRemoteText() which already has auth.
   */
  const loadTextPreview = async (entry: RemoteEntry) => {
    if (!previewRemoteText) return;
    if (entry.isDir) return;
    if (!looksTextLike(entry)) return;

    setPreview("");
    setPreviewLoading(true);
    try {
      const text = await previewRemoteText(entry.path);
      setPreview(text || "");
    } catch {
      setPreview("");
    } finally {
      setPreviewLoading(false);
    }
  };

  /**
   * Load binary preview for an image / mrc entry.
   *
   * We prefer fetchInlineBlob() because that can include Authorization
   * and return a Blob directly. Then we make a blob URL for <img>.
   *
   * If fetchInlineBlob() is not provided, we fall back to
   * buildDownloadUrl(..., true). BUT that will likely 401 if the
   * backend is protected and the browser can't send auth headers.
   */
  const loadImagePreview = async (entry: RemoteEntry) => {
    if (!looksImageLike(entry)) return;

    // Revoke any previous blob URL
    if (imgUrl) {
      URL.revokeObjectURL(imgUrl);
      setImgUrl("");
    }

    // If caller didn't provide fetchInlineBlob, we can't auth XHR ourselves.
    // We'll just try the raw inline URL (may 401 on protected servers).
    if (!fetchInlineBlob) {
      if (buildDownloadUrl) {
        const inlineUrl = buildDownloadUrl(entry.path, true);
        setImgUrl(inlineUrl); // <img> will hit server directly (unauthenticated)
      } else {
        setImgUrl("");
      }
      return;
    }

    // Authenticated path: ask for Blob
    try {
      setImgLoading(true);
      const blob = await fetchInlineBlob(entry.path); // caller must auth
      const objUrl = URL.createObjectURL(blob);
      setImgUrl(objUrl);
    } catch {
      // couldn't fetch/preview
      setImgUrl("");
    } finally {
      setImgLoading(false);
    }
  };

  /**
   * Handle row click:
   * - mark selected entry
   * - if text-like => load text preview
   * - else clear text preview
   * - if image-like => load image blob preview
   * - else clear image preview
   */
  const handleSelectEntry = (entry: RemoteEntry) => {
    setSelected(entry);

    // manage text preview
    if (!entry.isDir && looksTextLike(entry) && previewRemoteText) {
      void loadTextPreview(entry);
    } else {
      setPreview("");
      setPreviewLoading(false);
    }

    // manage image preview
    if (!entry.isDir && looksImageLike(entry)) {
      void loadImagePreview(entry);
    } else {
      // clear previous image preview
      if (imgUrl) {
        URL.revokeObjectURL(imgUrl);
      }
      setImgUrl("");
      setImgLoading(false);
    }
  };

  /**
   * The user confirms "Select".
   */
  const handlePick = () => {
    if (selected && !selected.isDir && onPick) {
      onPick(selected.path);
      onClose();
    }
  };

  /**
   * Download button in the preview panel:
   * open non-inline URL in new tab (Content-Disposition: attachment).
   */
  const handleDownload = () => {
    if (!selected || selected.isDir || !buildDownloadUrl) return;
    const url = buildDownloadUrl(selected.path, false);
    window.open(url, "_blank");
  };

  /**
   * Stop click propagation so ReactFlow behind doesn't get events.
   */
  const handleDialogClick: React.MouseEventHandler = (e) => {
    e.stopPropagation();
  };

  /**
   * When dialog opens:
   * - resolve initial path
   * - list directory
   *
   * When dialog closes:
   * - reset state for next open
   * - revoke any blob URL we created
   */
  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      if (!open) {
        // cleanup on close
        setItems([]);
        setCwd(initialPath || "");
        setSelected(null);

        setPreview("");
        setPreviewLoading(false);

        if (imgUrl) {
          URL.revokeObjectURL(imgUrl);
        }
        setImgUrl("");
        setImgLoading(false);

        setError(null);
        return;
      }

      const start = resolveStartPath
        ? await resolveStartPath()
        : initialPath;

      if (!mounted) return;
      await refresh(start || "");
    };

    void boot();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[960px] max-h-[90vh] overflow-hidden"
        onClick={handleDialogClick}
      >
        {/* Header with subtle background */}
        <DialogHeader className="-mx-6 -mt-6 px-6 py-4 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 rounded-t-lg">
          <DialogTitle className="text-lg font-medium text-gray-900 dark:text-gray-100 flex flex-col">
            <span className="truncate">{title}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal leading-tight">
              {cwd ? `/${cwd}` : "/"}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar row */}
        <div className="flex flex-wrap items-center gap-2 mt-4 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
          <Button
            variant="outline"
            onClick={goUp}
            className="gap-2 h-8 text-xs leading-none"
          >
            <CornerUpLeft className="h-4 w-4" />
            Up
          </Button>

          <Button
            variant="outline"
            onClick={() => void refresh(cwd)}
            className="gap-2 h-8 text-xs leading-none"
            disabled={loading}
            title="Refresh this directory"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>

          <div className="flex flex-wrap items-center gap-1 text-[12px] leading-none text-gray-700 dark:text-gray-300">
            {breadcrumbs.map((b, i) => (
              <button
                key={`${b.path}-${i}`}
                className="underline decoration-dotted hover:decoration-solid"
                onClick={() => void refresh(b.path)}
              >
                {b.name}
                {i < breadcrumbs.length - 1 ? " / " : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Main body: 2-column layout */}
        <div className="grid grid-cols-2 gap-4 mt-4 max-h-[55vh]">
          {/* LEFT COLUMN: directory listing */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-gray-900">
            {/* Panel header with background */}
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-[13px] font-medium text-gray-700 dark:text-gray-200 flex items-center justify-between">
              <span>Directory</span>
              {error && (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-[11px] font-normal">
                  <AlertCircle className="h-3 w-3" />
                  <span>Error</span>
                </span>
              )}
            </div>

            {/* Scrollable list region */}
            <div className="flex-1 overflow-auto">
              {error && (
                <div className="p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              {!error && (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700 text-sm text-gray-800 dark:text-gray-100">
                  {loading && (
                    <li className="p-3 flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading…</span>
                    </li>
                  )}

                  {!loading &&
                    items.map((entry) => {
                      const isSelected = selected?.path === entry.path;

                      return (
                        <li key={entry.path}>
                          <button
                            className={[
                              "w-full text-left px-3 py-2 flex items-center gap-2",
                              "hover:bg-gray-100 dark:hover:bg-gray-800/70",
                              isSelected
                                ? "bg-gray-100 dark:bg-gray-800/70"
                                : "",
                            ].join(" ")}
                            onClick={() => handleSelectEntry(entry)}
                            onDoubleClick={() => enter(entry)}
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
                                  {typeof entry.size === "number"
                                    ? `${entry.size.toLocaleString()} bytes`
                                    : ""}
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

          {/* RIGHT COLUMN: preview panel */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-gray-900">
            {/* Panel header with background */}
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-[13px] font-medium text-gray-700 dark:text-gray-200 flex items-center justify-between">
              <span>Preview</span>

              {/*
              {selected && !selected.isDir && (
                <div className="flex items-center gap-2">
                  {buildDownloadUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDownload}
                      className="gap-2 h-7 text-[11px] leading-none"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  )}

                  <Button
                    size="sm"
                    onClick={handlePick}
                    disabled={!selected || selected.isDir}
                    className="gap-2 h-7 text-[11px] leading-none"
                  >
                    <FileText className="h-4 w-4" />
                    Select
                  </Button>
                </div>
              )}
                */}
            </div>

            {/* Scrollable preview body */}
            <div className="flex-1 overflow-auto">
              <div className="p-3 text-sm text-gray-800 dark:text-gray-100">
                {!selected && (
                  <div className="text-gray-500 dark:text-gray-400">
                    Select a file to preview.
                  </div>
                )}

                {selected && selected.isDir && (
                  <div className="text-gray-500 dark:text-gray-400">
                    Double-click a folder to enter it.
                  </div>
                )}

                {selected && !selected.isDir && (
                  <>
                    {/* ===== TEXT PREVIEW BRANCH ===== */}
                    {looksTextLike(selected) && previewRemoteText && (
                      <>
                        {previewLoading && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Loading preview…</span>
                          </div>
                        )}

                        {!previewLoading && preview && (
                          <pre className="whitespace-pre-wrap break-words text-xs sm:text-[13px] leading-relaxed text-gray-800 dark:text-gray-100">
                            {preview}
                          </pre>
                        )}

                        {!previewLoading && !preview && (
                          <div className="opacity-70 text-gray-500 dark:text-gray-400 text-[13px]">
                            No text preview available.
                          </div>
                        )}
                      </>
                    )}

                    {/* ===== IMAGE / VOLUME PREVIEW BRANCH ===== */}
                    {!looksTextLike(selected) && (
                      <div className="flex flex-col items-start gap-2">
                        {looksImageLike(selected) ? (
                          <>
                            {imgLoading && (
                              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-[13px]">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Loading image…</span>
                              </div>
                            )}

                            {!imgLoading && imgUrl ? (
                              <>
                                <div className="flex items-center gap-2 opacity-70 text-[11px] text-gray-600 dark:text-gray-400">
                                  <ImageIcon className="h-4 w-4" />
                                  <span>
                                    {selected.mime || "generated/preview"}
                                  </span>
                                </div>
                                <img
                                  src={imgUrl}
                                  alt={selected.name}
                                  className="max-h-80 max-w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                                />
                              </>
                            ) : null}

                            {!imgLoading && !imgUrl && (
                              <div className="opacity-70 text-gray-500 dark:text-gray-400 text-[13px]">
                                No image preview available.
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="opacity-70 text-gray-500 dark:text-gray-400 text-[13px]">
                            No preview available.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-8 px-4 text-xs leading-none"
          >
            Close
          </Button>
          <Button
            onClick={handlePick}
            disabled={!selected || !!selected?.isDir}
            className="h-8 px-4 text-xs leading-none"
          >
            Select
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
