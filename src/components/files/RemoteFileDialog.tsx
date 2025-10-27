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
  Loader2,
  AlertCircle,
} from "lucide-react";

export type RemoteEntry = {
  name: string;
  path: string;      // relative path inside protocol root
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

type RemoteFileDialogProps = {
  open: boolean;
  onClose: () => void;
  title?: string;

  projectId?: string | number;
  protocolId?: string | number;

  initialPath?: string;
  resolveStartPath?: () => Promise<string>;

  listRemoteDirectory: (absOrRelPath: string) => Promise<RemoteEntry[]>;

  previewRemoteText?: (absOrRelPath: string) => Promise<string | null>;

  /**
   * fetchInlinePreviewBlob MUST:
   *  - call GET /fs/download?inline=1 with auth
   *  - return { blob, meta } where meta comes from X-Preview-* headers
   */
  fetchInlinePreviewBlob?: (
    absOrRelPath: string
  ) => Promise<{ blob: Blob; meta: PreviewMeta }>;

  /**
   * Optional download URL builder for the "Select" / "Download" use case.
   * We still keep it for final download, but we don't rely on it for preview.
   */
  buildDownloadUrl?: (absOrRelPath: string, inline?: boolean) => string;

  onPick?: (relativePath: string) => void;
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
  // directory state
  const [cwd, setCwd] = useState<string>(initialPath);
  const [items, setItems] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // selection state
  const [selected, setSelected] = useState<RemoteEntry | null>(null);

  // text preview state
  const [previewText, setPreviewText] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // image / volume preview state
  const [imgUrl, setImgUrl] = useState<string>("");     // blob URL
  const [imgMeta, setImgMeta] = useState<PreviewMeta>({}); // width, height, depth...
  const [imgLoading, setImgLoading] = useState<boolean>(false);

  // build breadcrumbs for cwd
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

  // helper: does this look text-like?
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

  // helper: does this look image-like? (including .mrc / .map)
  const isMrcExt = (name: string | undefined) =>
    !!name && /\.(mrc|mrcs|map|em)$/i.test(name);

  const looksImageLike = (entry: RemoteEntry): boolean => {
    if (entry.isDir) return false;
    if (entry.mime && entry.mime.startsWith("image/")) return true;
    if (isMrcExt(entry.name)) return true;
    return false;
  };

  // load directory list
  const refresh = async (path: string) => {
    try {
      setLoading(true);
      setError(null);

      const listing = await listRemoteDirectory(path);

      setItems(listing);
      setCwd(path);

      // reset selection/preview
      setSelected(null);

      setPreviewText("");
      setPreviewLoading(false);

      if (imgUrl) URL.revokeObjectURL(imgUrl);
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

  // enter dir on double click
  const enterDir = (entry: RemoteEntry) => {
    if (!entry.isDir) return;
    void refresh(entry.path);
  };

  // go up one level
  const goUp = () => {
    if (!cwd) return;
    const up = cwd.includes("/") ? cwd.split("/").slice(0, -1).join("/") : "";
    void refresh(up);
  };

  // load text preview
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

  // load image / volume preview (blob + meta headers)
  const loadImagePreview = async (entry: RemoteEntry) => {
    if (!looksImageLike(entry)) return;
    if (!fetchInlinePreviewBlob) {
      // no fetcher provided => we can't auth-load the blob
      setImgUrl("");
      setImgMeta({});
      return;
    }

    // revoke previous blob URL
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

  // handle click in the directory list
  const handleSelectEntry = (entry: RemoteEntry) => {
    setSelected(entry);

    // text branch
    if (!entry.isDir && looksTextLike(entry) && previewRemoteText) {
      void loadTextPreview(entry);
    } else {
      setPreviewText("");
      setPreviewLoading(false);
    }

    // image/volume branch
    if (!entry.isDir && looksImageLike(entry)) {
      void loadImagePreview(entry);
    } else {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
      setImgUrl("");
      setImgMeta({});
      setImgLoading(false);
    }
  };

  // final "Select" action
  const handlePick = () => {
    if (selected && !selected.isDir && onPick) {
      onPick(selected.path);
      onClose();
    }
  };

  // full download (optional)
  const handleDownload = () => {
    if (!selected || selected.isDir || !buildDownloadUrl) return;
    const url = buildDownloadUrl(selected.path, false);
    window.open(url, "_blank");
  };

  // stop bubbling to canvas behind
  const handleDialogClick: React.MouseEventHandler = (e) => {
    e.stopPropagation();
  };

  // open/close effect
  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      if (!open) {
        // cleanup on close
        setItems([]);
        setCwd(initialPath || "");

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

  // helper to pretty-print file size
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

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[1100px] max-h-[90vh] overflow-hidden"
        onClick={handleDialogClick}
      >
        {/* header */}
        <DialogHeader className="-mx-6 -mt-6 px-6 py-4 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 rounded-t-lg">
          <DialogTitle className="text-lg font-medium text-gray-900 dark:text-gray-100 flex flex-col">
            <span className="truncate">{title}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal leading-tight">
              {cwd ? `/${cwd}` : "/"}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* toolbar */}
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

        {/* body: 2 columns */}
        <div className="grid grid-cols-2 gap-4 mt-4 max-h-[55vh]">
          {/* left: directory listing */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-gray-900">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-[13px] font-medium text-gray-700 dark:text-gray-200 flex items-center justify-between">
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

          {/* right: preview panel */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-gray-900">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-[13px] font-medium text-gray-700 dark:text-gray-200 flex items-center justify-between">
              <span>Preview</span>

              {selected && !selected.isDir && (
                <div className="flex items-center gap-2">
                  {buildDownloadUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDownload}
                      className="gap-2 h-7 text-[11px] leading-none"
                    >
                      Download
                    </Button>
                  )}

                  <Button
                    size="sm"
                    onClick={handlePick}
                    disabled={!selected || selected.isDir}
                    className="gap-2 h-7 text-[11px] leading-none"
                  >
                    Select
                  </Button>
                </div>
              )}
            </div>

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
                    {/* TEXT PREVIEW */}
                    {looksTextLike(selected) && previewRemoteText && (
                      <>
                        {previewLoading && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Loading preview…</span>
                          </div>
                        )}

                        {!previewLoading && previewText && (
                          <pre className="whitespace-pre-wrap break-words text-xs sm:text-[13px] leading-relaxed text-gray-800 dark:text-gray-100">
                            {previewText}
                          </pre>
                        )}

                        {!previewLoading && !previewText && (
                          <div className="opacity-70 text-gray-500 dark:text-gray-400 text-[13px]">
                            No text preview available.
                          </div>
                        )}
                      </>
                    )}

                    {/* IMAGE / VOLUME PREVIEW */}
                    {!looksTextLike(selected) && (
                      <>
                        {looksImageLike(selected) ? (
                          <>
                            {imgLoading && (
                              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-[13px]">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Loading image…</span>
                              </div>
                            )}

                            {!imgLoading && imgUrl ? (
                              <div className="flex flex-row items-start gap-4">
                                {/* big preview box */}
                                <div className="max-w-[642rem] max-h-[32rem] rounded-md border border-gray-300 dark:border-gray-600 bg-black flex items-center justify-center overflow-hidden">
                                  <img
                                    src={imgUrl}
                                    alt={selected.name}
                                    className="object-contain max-w-full max-h-[32rem]"
                                  />
                                </div>

                                {/* metadata panel */}
                                <div className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 min-w-[12rem] max-w-[16rem]">
                                  <div className="font-medium text-gray-900 dark:text-gray-100 break-words">
                                    {selected.name}
                                  </div>

                                  {imgMeta.sizeBytes !== undefined && (
                                    <div className="mt-2">
                                      <span className="font-medium">Size: </span>
                                      <span>{humanBytes(imgMeta.sizeBytes)}</span>
                                    </div>
                                  )}

                                  {(imgMeta.width !== undefined ||
                                    imgMeta.height !== undefined) && (
                                    <div className="mt-2">
                                      <span className="font-medium">
                                        Dimensions:
                                      </span>{" "}
                                      <span>
                                        {imgMeta.width ?? "?"} ×{" "}
                                        {imgMeta.height ?? "?"} ×{" "}
                                        {imgMeta.depth  ?? "?"}

                                      </span>
                                    </div>
                                  )}

                                  {imgMeta.depth !== undefined && (
                                    <div className="mt-2">
                                      <span className="font-medium">Depth: </span>
                                      <span>{imgMeta.depth} slices</span>
                                    </div>
                                  )}

                                  {imgMeta.voxelSize && (
                                    <div className="mt-2">
                                      <span className="font-medium">
                                        Voxel size:
                                      </span>{" "}
                                      <span>
                                        {imgMeta.voxelSize[0].toFixed(1)} ×{" "}
                                        {imgMeta.voxelSize[1].toFixed(1)} ×{" "}
                                        {imgMeta.voxelSize[2].toFixed(1)}
                                      </span>
                                    </div>
                                  )}

                                  
                                </div>
                              </div>
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
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
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
