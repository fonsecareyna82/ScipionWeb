// src/components/files/RemoteFileDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog/dialog";
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
import { Input } from "@mui/material";

/** Entrada genérica de un directorio remoto */
export type RemoteEntry = {
  name: string;
  path: string;          // relativo al root del protocolo
  isDir: boolean;
  size?: number;
  mime?: string;         // opcional, usado para detectar imágenes
};

type RemoteFileDialogProps = {
  open: boolean;
  onClose: () => void;
  title?: string;

  projectId?: string | number;   // opcionales (solo útiles si usas buildDownloadUrl)
  protocolId?: string | number;

  /** Ruta inicial relativa en el protocolo (si no se pasa, se resolverá con resolveStartPath si existe) */
  initialPath?: string;

  /** Devuelve la ruta inicial absoluta/relativa dentro del protocolo (si no la conoces de antemano) */
  resolveStartPath?: () => Promise<string>;

  /** Lista el contenido de un directorio remoto */
  listRemoteDirectory: (absOrRelPath: string) => Promise<RemoteEntry[]>;

  /** (Opcional) Devuelve un texto de previsualización para rutas de texto; si no se proporciona, no habrá preview de texto */
  previewRemoteText?: (absOrRelPath: string) => Promise<string | null>;

  /** (Opcional) Construye una URL de descarga/visualización inline */
  buildDownloadUrl?: (absOrRelPath: string, inline?: boolean) => string;

  /** Se dispara cuando el usuario selecciona un archivo (ruta relativa) */
  onPick?: (relativePath: string) => void;
};

export default function RemoteFileDialog({
  open,
  onClose,
  title = "Browse server files",
  projectId,
  protocolId,
  initialPath = "",
  resolveStartPath,
  listRemoteDirectory,
  previewRemoteText,
  buildDownloadUrl,
  onPick,
}: RemoteFileDialogProps) {
  const [cwd, setCwd] = useState<string>(initialPath);
  const [items, setItems] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<RemoteEntry | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

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

  const refresh = async (path: string) => {
    try {
      setLoading(true);
      setError(null);
      const listing = await listRemoteDirectory(path);
      setItems(listing);
      setCwd(path);
      setSelected(null);
      setPreview("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to list directory";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      if (!open) {
        // Reset al cerrar
        setItems([]);
        setCwd(initialPath || "");
        setSelected(null);
        setPreview("");
        setError(null);
        return;
      }
      // Resolver ruta inicial si no nos pasan initialPath o queremos forzar el servidor
      const start = resolveStartPath ? await resolveStartPath() : initialPath;
      if (!mounted) return;
      await refresh(start || "");
    };
    void boot();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const enter = (entry: RemoteEntry) => {
    if (entry.isDir) void refresh(entry.path);
  };

  const goUp = () => {
    if (!cwd) return;
    const up = cwd.includes("/") ? cwd.split("/").slice(0, -1).join("/") : "";
    void refresh(up);
  };

  const tryPreview = async (entry: RemoteEntry) => {
    if (entry.isDir) return;
    setPreview("");
    if (!previewRemoteText) return; // no hay preview si no te lo pasan
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

  const handleDialogClick: React.MouseEventHandler = (e) => {
    // Evitar que clicks burbujeen al canvas de React Flow
    e.stopPropagation();
  };

  const handleCwdChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setCwd(e.currentTarget.value);
  };

  const handleCwdKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") void refresh(cwd);
  };

  const canShowImage =
    !!selected && !selected.isDir && !!selected.mime && selected.mime.startsWith("image/");
  const inlineImageUrl =
    selected && !selected.isDir && buildDownloadUrl
      ? buildDownloadUrl(selected.path, true)
      : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[960px]" onClick={handleDialogClick}>
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={goUp} className="gap-2">
            <CornerUpLeft className="h-4 w-4" /> Up
          </Button>

          <Button
            variant="outline"
            onClick={() => void refresh(cwd)}
            className="gap-2"
            disabled={loading}
            title="Refresh"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>

          <div className="flex flex-wrap items-center gap-1 text-sm">
            {breadcrumbs.map((b, i) => (
              <button
                key={`${b.path}-${i}`}
                className="underline decoration-dotted hover:decoration-solid"
                onClick={() => void refresh(b.path)}
              >
                {b.name}{i < breadcrumbs.length - 1 ? " / " : ""}
              </button>
            ))}
          </div>

        </div>

        {/* Body */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          {/* Left — Listing */}
          <div className="border rounded-2xl overflow-hidden">
            <div className="px-3 py-2 border-b text-sm">Directory</div>

            <div className="h-96 overflow-auto">
              {error && (
                <div className="p-3 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              {!error && (
                <ul className="divide-y">
                  {loading && (
                    <li className="p-3 text-sm flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading…
                    </li>
                  )}
                  {!loading &&
                    items.map((entry) => {
                      const isSelected = selected?.path === entry.path;
                      return (
                        <li key={entry.path}>
                          <button
                            className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-100 ${isSelected ? "bg-gray-100" : ""}`}
                            onClick={() => {
                              setSelected(entry);
                              if (!entry.isDir) void tryPreview(entry);
                            }}
                            onDoubleClick={() => enter(entry)}
                          >
                            {entry.isDir ? (
                              <>
                                <FolderOpen className="h-4 w-4" />
                                <span className="truncate">{entry.name}</span>
                              </>
                            ) : (
                              <>
                                <FileIcon className="h-4 w-4" />
                                <span className="truncate">{entry.name}</span>
                                <span className="ml-auto text-xs opacity-60">
                                  {entry.size?.toLocaleString()} bytes
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

          {/* Right — Preview */}
          <div className="border rounded-2xl overflow-hidden">
            <div className="px-3 py-2 border-b text-sm flex items-center justify-between">
              <span>Preview</span>
              {selected && !selected.isDir && (
                <div className="flex items-center gap-2">
                  {buildDownloadUrl && (
                    <Button size="sm" variant="outline" onClick={handleDownload} className="gap-2">
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  )}
                  <Button size="sm" onClick={handlePick} disabled={!selected || selected.isDir} className="gap-2">
                    <FileText className="h-4 w-4" />
                    Select
                  </Button>
                </div>
              )}
            </div>

            <div className="h-96 overflow-auto">
              <div className="p-3 text-sm">
                {!selected && <div>Select a file to preview.</div>}
                {selected && selected.isDir && <div>Double-click a folder to enter.</div>}

                {selected && !selected.isDir && (
                  <>
                    {previewRemoteText && previewLoading && (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading preview…
                      </div>
                    )}

                    {previewRemoteText && !previewLoading && preview && (
                      <pre className="whitespace-pre-wrap break-words text-xs sm:text-sm">
                        {preview}
                      </pre>
                    )}

                    {(!previewRemoteText || (!previewLoading && !preview)) && (
                      <div className="flex flex-col items-start gap-2">
                        {canShowImage && inlineImageUrl ? (
                          <>
                            <div className="flex items-center gap-2 opacity-70 text-xs">
                              <ImageIcon className="h-4 w-4" />
                              <span>{selected.mime}</span>
                            </div>
                            <img
                              src={inlineImageUrl}
                              alt={selected.name}
                              className="max-h-80 max-w-full rounded-md border"
                            />
                          </>
                        ) : (
                          <div className="opacity-70">No preview available.</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handlePick} disabled={!selected || !!selected?.isDir}>
            Select
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
