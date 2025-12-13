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
  CornerUpLeft,
  RefreshCw,
  Home,
  Loader2,
  AlertCircle,
} from "lucide-react";

export type RemoteEntry = {
  name: string;
  path: string;      // relative path inside protocol root or absolute path (for /home)
  isDir: boolean;
  size?: number;
  mime?: string;     // guessed mime
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

  // Backend should return:
  // - { cwd, items } (preferred, matches listProtocolDir)
  // - or an array of RemoteEntry[] (backward compatible)
  listRemoteDirectory: (
    absOrRelPath: string
  ) => Promise<RemoteListResult | RemoteEntry[]>;

  previewRemoteText?: (absOrRelPath: string) => Promise<string | null>;

  fetchInlinePreviewBlob?: (
    absOrRelPath: string
  ) => Promise<{ blob: Blob; meta: PreviewMeta }>;

  buildDownloadUrl?: (absOrRelPath: string, inline?: boolean) => string;

  onPick?: (relativeOrAbsolutePath: string) => void;
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
  // Directory state
  const [cwd, setCwd] = useState<string>(initialPath);
  const [items, setItems] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Protocol root (used by "Protocol folder" button)
  const [protocolRoot, setProtocolRoot] = useState<string>("");

  // Selection state
  const [selected, setSelected] = useState<RemoteEntry | null>(null);

  // Text preview state
  const [previewText, setPreviewText] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // Image / volume preview state
  const [imgUrl, setImgUrl] = useState<string>("");        // blob URL
  const [imgMeta, setImgMeta] = useState<PreviewMeta>({}); // width/height/depth/etc
  const [imgLoading, setImgLoading] = useState<boolean>(false);

  // Fixed layout sizes
  const dialogWidthClass = "w-[1300px] max-w-[1300px]";
  const dialogHeightClass = "h-[700px] max-h-[700px]";
  const browserHeightClass = "h-[420px]";
  const previewHeightClass = "h-[360px]";

  // Build breadcrumbs from cwd
  const breadcrumbs = useMemo(() => {
    const normalizedCwd = (cwd || "").replace(/\\/g, "/");

    const crumbs: { name: string; path: string }[] = [
      { name: "root", path: "" },
    ];

    if (!normalizedCwd) {
      return crumbs;
    }

    const isAbsolute = normalizedCwd.startsWith("/");
    const parts = normalizedCwd.split("/").filter(Boolean);
    let acc = isAbsolute ? "" : "";

    for (const part of parts) {
      if (isAbsolute) {
        acc = `${acc}/${part}`;
      } else {
        acc = acc ? `${acc}/${part}` : part;
      }
      crumbs.push({ name: part, path: acc || "" });
    }

    return crumbs;
  }, [cwd]);

  // Decide if an entry is text-like
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

  const isImageExt = (name: string | undefined) =>
    !!name && /\.(mrc|mrcs|map|em|stk)$/i.test(name);

  // Decide if an entry is image/volume-like
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

  // Compute parent path for Up / ".."
  // - For protocol-relative paths: stops at "" (protocol root).
  // - For /home absolute paths: stops at "/home".
  const getParentPath = (current: string): string | null => {
    if (!current) {
      // Already at protocol root
      return null;
    }

    const normalized = current.replace(/\\/g, "/");

    // Absolute paths: currently only /home and /home/... are allowed by backend.
    if (normalized.startsWith("/home")) {
      if (normalized === "/home") {
        // Do not go above /home (backend restriction)
        return null;
      }
      const parts = normalized.split("/").filter(Boolean);
      if (parts.length <= 1) {
        return null;
      }
      return "/" + parts.slice(0, -1).join("/");
    }

    // Relative path inside protocol root
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length <= 1) {
      // Parent is protocol root
      return "";
    }
    return parts.slice(0, -1).join("/");
  };

  // Load directory from backend, harmonized with {cwd, items}
  const refresh = async (path: string) => {
    try {
      setLoading(true);
      setError(null);

      const listing = await listRemoteDirectory(path);

      let nextItems: RemoteEntry[] = [];
      let nextCwd = "";

      if (Array.isArray(listing)) {
        // Backward compatible mode (only items)
        nextItems = listing;
        nextCwd = path || "";
      } else if (listing && Array.isArray((listing as RemoteListResult).items)) {
        const result = listing as RemoteListResult;
        nextItems = result.items;
        nextCwd = typeof result.cwd === "string" ? result.cwd : path || "";
      }

      setItems(nextItems);
      setCwd(nextCwd);

      // Reset selection and previews on directory change
      setSelected(null);
      setPreviewText("");
      setPreviewLoading(false);

      if (imgUrl) {
        URL.revokeObjectURL(imgUrl);
      }
      setImgUrl("");
      setImgMeta({});
      setImgLoading(false);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to list directory contents";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const enterDir = (entry: RemoteEntry) => {
    if (!entry.isDir) return;
    void refresh(entry.path);
  };

  const goUp = () => {
    const parent = getParentPath(cwd);
    if (parent === null || parent === cwd) return;
    void refresh(parent);
  };

  const goHome = () => {
    void refresh("/home");
  };

  const goProtocolRoot = () => {
    // If protocolRoot was resolved (absolute), use it; otherwise use ""
    void refresh(protocolRoot || "");
  };

  // Load text preview for selected entry
  const loadTextPreview = async (entry: RemoteEntry) => {
    if (!previewRemoteText) return;
    if (entry.isDir) return;
    if (!looksTextLike(entry)) return;

    setPreviewText("");
    setPreviewLoading(true);
    try {
      const text = await previewRemoteText(entry.path);
      setPreviewText(text || "");
    } catch {
      setPreviewText("");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Load image/volume preview for selected entry
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
      const { blob, meta } = await fetchInlinePreviewBlob(entry.path);
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

    // Text branch
    if (!entry.isDir && looksTextLike(entry) && previewRemoteText) {
      void loadTextPreview(entry);
    } else {
      setPreviewText("");
      setPreviewLoading(false);
    }

    // Image/volume branch
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
    if (selected && !selected.isDir && onPick) {
      onPick(selected.path);
      onClose();
    }
  };

  const handleDownload = () => {
    if (!selected || selected.isDir || !buildDownloadUrl) return;
    const url = buildDownloadUrl(selected.path, false);
    window.open(url, "_blank");
  };

  // Prevent clicks inside dialog from bubbling to underlying canvas
  const handleDialogClick: React.MouseEventHandler = (e) => {
    e.stopPropagation();
  };

  // Boot and cleanup when dialog opens/closes
  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      if (!open) {
        // Reset state when closed
        setItems([]);
        setCwd(initialPath || "");
        setSelected(null);
        setPreviewText("");
        setPreviewLoading(false);

        if (imgUrl) {
          URL.revokeObjectURL(imgUrl);
        }
        setImgUrl("");
        setImgMeta({});
        setImgLoading(false);
        setError(null);
        return;
      }

      let startPath = initialPath || "";

      // Resolve protocol root once (used by "Protocol folder")
      if (resolveStartPath) {
        try {
          const resolved = await resolveStartPath();
          if (!mounted) return;
          if (resolved) {
            startPath = resolved;
            setProtocolRoot(resolved);
          }
        } catch {
          // Ignore resolve errors and fallback to initialPath
        }
      }

      await refresh(startPath || "");
    };

    void boot();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parentForCwd = getParentPath(cwd);
  const showParentEntry =
    parentForCwd !== null && parentForCwd !== cwd && !loading && !error;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        // Prevent close on outside click
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        onClick={handleDialogClick}
        className={[
          dialogWidthClass,
          dialogHeightClass,
          "flex flex-col overflow-hidden",
        ].join(" ")}
      >
        {/* Header */}
        <DialogHeader
          className={[
            "-mx-6 -mt-6 px-6 py-4 bg-gray-300 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 rounded-t-lg",
            "flex-none",
          ].join(" ")}
        >
          <DialogTitle className="text-lg font-medium text-gray-700 dark:text-gray-100 dark:bg-gray-800 flex flex-col bg-gray-300">
            <span className="truncate">{title}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div
          className={[
            "flex flex-wrap items-center gap-2 mt-4 bg-gray-100 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm",
            "flex-none",
          ].join(" ")}
        >
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
            onClick={goHome}
            className="gap-2 h-8 text-xs leading-none"
          >
            <Home className="h-4 w-4" />
            Home
          </Button>

          <Button
            variant="outline"
            onClick={goProtocolRoot}
            className="gap-2 h-8 text-xs leading-none"
          >
            <FolderOpen className="h-4 w-4" />
            Protocol folder
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

        {/* Body: Directory + Preview */}
        <div
          className={[
            "grid grid-cols-2 gap-4 mt-4",
            browserHeightClass,
            "flex-none",
          ].join(" ")}
        >
          {/* Left: Directory list */}
          <div className="h-full border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-gray-900">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-300 dark:bg-gray-800 text-[13px] font-medium text-gray-700 dark:text-gray-200 flex items-center justify-between flex-none">
              <span>Directory</span>
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
                      const isSel = selected?.path === entry.path;
                      return (
                        <li key={entry.path}>
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

          {/* Right: Preview panel */}
          <div className="h-full border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-gray-900">
            {/* Preview viewport */}
            <div
              className={[
                "flex-1 px-3 py-3 text-sm text-gray-800 dark:text-gray-100 overflow-hidden",
                previewHeightClass,
              ].join(" ")}
            >
              {!selected && (
                <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-center text-[13px]">
                  Select a file to preview.
                </div>
              )}

              {selected && selected.isDir && (
                <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-center text-[13px]">
                  Double-click a folder to enter it.
                </div>
              )}

              {selected && !selected.isDir && (
                <>
                  {/* Text preview */}
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

                  {/* Image / volume preview */}
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
                            {/* Image block */}
                            <div className="flex-shrink-0 flex flex-col items-center justify-center">
                              {imgLoading && (
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-[13px]">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span>Loading image…</span>
                                </div>
                              )}

                              {!imgLoading && imgUrl && (
                                <div className="w-[320px] h-[320px] max-w-full max-h-[320px] rounded-md border border-gray-300 dark:border-gray-600 bg-black flex items-center justify-center overflow-hidden">
                                  <img
                                    src={imgUrl}
                                    alt={selected.name}
                                    className="object-contain w-full h-full"
                                  />
                                </div>
                              )}

                              {!imgLoading && !imgUrl && (
                                <div className="text-gray-500 dark:text-gray-400 text-[13px] text-center">
                                  No image preview available.
                                </div>
                              )}
                            </div>

                            {/* Metadata block */}
                            <div className="flex-1 min-w-0 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">
                              <div className="font-medium text-gray-900 dark:text-gray-100 break-words">
                                {selected.name}
                              </div>

                              {imgMeta.sizeBytes !== undefined && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <span className="font-medium">Size:</span>
                                  <span>{humanBytes(imgMeta.sizeBytes)}</span>
                                </div>
                              )}

                              {(imgMeta.width !== undefined ||
                                imgMeta.height !== undefined ||
                                imgMeta.depth !== undefined) && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <span className="font-medium">
                                    Dimensions:
                                  </span>
                                  <span>
                                    {imgMeta.width ?? "?"} ×{" "}
                                    {imgMeta.height ?? "?"}
                                    {imgMeta.depth !== undefined
                                      ? ` × ${imgMeta.depth}`
                                      : ""}
                                  </span>
                                </div>
                              )}

                              {imgMeta.voxelSize && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <span className="font-medium">
                                    Sampling rate:
                                  </span>
                                  <span>
                                    {imgMeta.voxelSize[0].toFixed(1)}
                                  </span>
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

        {/* Footer */}
        <div
          className={[
            "flex justify-end gap-2 mt-4",
            "flex-none",
          ].join(" ")}
        >
          <Button
            variant="outline"
            onClick={onClose}
            className="px-5 py-2 rounded-md text-sm min-w-[100px] bg-gray-200 hover:bg-gray-300 text-gray-800 dark:text-gray-300"
          >
            Close
          </Button>
          <Button
            onClick={handlePick}
            disabled={!selected || !!selected?.isDir}
            className="px-5 py-2 rounded-md text-sm min-w-[100px] bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Select
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
