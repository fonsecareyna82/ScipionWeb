import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { X, UserPlus2 } from "lucide-react";
import { BASE_URL } from "@/config";
import { fetchWithAuth } from "@/api/auth";

import {
  CalendarIcon,
  FolderIcon,
  StorageIcon,
  OpenFolderIcon,
  RenameIcon,
  TrashBinIcon,
} from "../../icons";
import ProjectAction from "./ProjectActions";
import { useProjectService } from "@/ProjectServiceContext";

interface ProjectCardProps {
  id: string | number;
  label: string;
  value: string | number;
  badgeValue?: string;
  icon?: React.ReactNode;
  createdAt?: string;
  updatedAt?: string;
  diskUsage?: string;
  isSelected?: boolean;
  onSelect?: () => void;

  isExpanded?: boolean;
  onToggleExpand?: () => void;

  description?: string;
  status?: string;
  onDelete?: (id: number | string) => void;
  onRename?: (id: number | string, newLabel: string, newDescription: string) => void;
  onShare?: (id: number | string) => void;

  projectOwnerId: string | number | null;
  isShared?: boolean | string | number;
  isOwner?: boolean | string | number;
  permission?: string;

  thumbnailUrl?: string | null;
  thumbnailRebuildUrl?: string | null;
  thumbnailItemsUrl?: string | null;
}

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
};

type ProtocolThumbnailItem = {
  protocolId: string | number;
  label?: string;
  status?: string;
  outputName?: string | null;
  outputClassName?: string | null;
  priority?: number | null;
  exists?: boolean;
  thumbnailUrl?: string | null;
  thumbnailRebuildUrl?: string | null;
};

type HydratedProtocolThumbnailItem = ProtocolThumbnailItem & {
  src: string | null;
  hasError: boolean;
};

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

function normalizeBooleanFlag(value: boolean | string | number | undefined | null): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "owner" || v === "yes";
  }
  return false;
}

function formatDateShort(raw?: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function getStatusToneClasses(raw?: string): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (!value) {
    return classNames(
      "border-gray-300/80 bg-white/90 text-gray-700",
      "dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200",
    );
  }

  if (
    value.includes("done") ||
    value.includes("finished") ||
    value.includes("complete") ||
    value.includes("success")
  ) {
    return classNames(
      "border-emerald-300/80 bg-emerald-50 text-emerald-800",
      "dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200",
    );
  }

  if (
    value.includes("run") ||
    value.includes("active") ||
    value.includes("progress") ||
    value.includes("queue")
  ) {
    return classNames(
      "border-sky-300/80 bg-sky-50 text-sky-800",
      "dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200",
    );
  }

  if (
    value.includes("warn") ||
    value.includes("hold") ||
    value.includes("pending") ||
    value.includes("pause")
  ) {
    return classNames(
      "border-amber-300/80 bg-amber-50 text-amber-800",
      "dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200",
    );
  }

  if (
    value.includes("fail") ||
    value.includes("error") ||
    value.includes("stopped") ||
    value.includes("abort")
  ) {
    return classNames(
      "border-rose-300/80 bg-rose-50 text-rose-800",
      "dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-200",
    );
  }

  return classNames(
    "border-violet-300/80 bg-violet-50 text-violet-800",
    "dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-200",
  );
}

function resolveApiUrl(raw?: string | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${BASE_URL}${value}`;

  return `${BASE_URL}/${value}`;
}

function appendQueryParams(
  url: string,
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const parsed = new URL(url, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    const text = String(value).trim();
    if (!text) return;
    parsed.searchParams.set(key, text);
  });

  return parsed.toString();
}

function normalizeThumbnailItems(raw: any): ProtocolThumbnailItem[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];

  return list
    .map((item: any) => {
      const protocolId = item?.protocolId ?? item?.protocol_id ?? item?.id ?? null;
      if (protocolId === null || protocolId === undefined) return null;

      return {
        protocolId,
        label:
          item?.protocolLabel ??
          item?.protocol_label ??
          item?.label ??
          item?.name ??
          `Protocol ${String(protocolId)}`,
        status: item?.status ?? undefined,
        outputName: item?.outputName ?? item?.output_name ?? null,
        outputClassName: item?.outputClassName ?? item?.output_class_name ?? null,
        priority:
          typeof item?.priority === "number"
            ? item.priority
            : item?.priority != null
              ? Number(item.priority)
              : null,
        exists: item?.exists !== undefined ? Boolean(item.exists) : true,
        thumbnailUrl: item?.thumbnailUrl ?? item?.thumbnail_url ?? null,
        thumbnailRebuildUrl: item?.thumbnailRebuildUrl ?? item?.thumbnail_rebuild_url ?? null,
      } satisfies ProtocolThumbnailItem;
    })
    .filter(Boolean) as ProtocolThumbnailItem[];
}

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

export default function ProjectCard(props: ProjectCardProps) {
  const {
    id,
    label,
    badgeValue,
    createdAt,
    updatedAt,
    diskUsage,
    isSelected,
    onSelect,
    description = "",
    status,
    icon = <FolderIcon className="h-5 w-5 text-gray-900 dark:text-white" />,
    onDelete,
    onRename,
    onShare,
    isShared,
    isOwner,
    permission,
    thumbnailUrl,
    thumbnailRebuildUrl,
    thumbnailItemsUrl,
  } = props;

  const navigate = useNavigate();
  const svc = useProjectService();

  const [isRenaming, setIsRenaming] = useState(false);
  const [newLabel, setNewLabel] = useState(label);
  const [newDescription, setNewDescription] = useState(description);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
  });
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const contextItemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const portalRoot = typeof document !== "undefined" ? document.body : null;

  const normalizedIsOwner = normalizeBooleanFlag(isOwner);
  const normalizedIsShared = normalizeBooleanFlag(isShared);
  const showGuestBadge = Boolean(normalizedIsShared && !normalizedIsOwner);
  const canModify = normalizedIsOwner;

  const [galleryItems, setGalleryItems] = useState<HydratedProtocolThumbnailItem[]>([]);
  const [galleryMetaLoading, setGalleryMetaLoading] = useState(false);
  const [galleryImagesLoading, setGalleryImagesLoading] = useState(false);
  const [galleryError, setGalleryError] = useState(false);

  const [projectThumbnailSrc, setProjectThumbnailSrc] = useState<string | null>(null);
  const [projectThumbnailLoading, setProjectThumbnailLoading] = useState(false);
  const [projectThumbnailError, setProjectThumbnailError] = useState(false);

  const galleryObjectUrlsRef = useRef<string[]>([]);
  const projectObjectUrlRef = useRef<string | null>(null);

  const clearGalleryObjectUrls = useCallback(() => {
    galleryObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    galleryObjectUrlsRef.current = [];
  }, []);

  const clearProjectObjectUrl = useCallback(() => {
    if (projectObjectUrlRef.current) {
      URL.revokeObjectURL(projectObjectUrlRef.current);
      projectObjectUrlRef.current = null;
    }
  }, []);

  const resolvedThumbnailUrl = useMemo(() => resolveApiUrl(thumbnailUrl), [thumbnailUrl]);

  const resolvedThumbnailItemsUrl = useMemo(
    () => resolveApiUrl(thumbnailItemsUrl),
    [thumbnailItemsUrl],
  );

  const projectIdLabel = useMemo(() => `P${String(id)}`, [id]);

  const accessLabel = useMemo(() => {
    if (showGuestBadge) {
      return permission?.trim() ? `Shared · ${permission}` : "Shared";
    }
    if (permission?.trim()) return permission;
    return normalizedIsOwner ? "Owner" : "Private";
  }, [showGuestBadge, permission, normalizedIsOwner]);

  const statusLabel = useMemo(() => {
    const raw = String(status ?? badgeValue ?? "").trim();
    return raw || null;
  }, [status, badgeValue]);

  useEffect(() => {
    setNewLabel(label);
    setNewDescription(description || "");
  }, [label, description]);

  useEffect(() => {
    return () => {
      clearGalleryObjectUrls();
      clearProjectObjectUrl();
    };
  }, [clearGalleryObjectUrls, clearProjectObjectUrl]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadGalleryItems() {
      if (!resolvedThumbnailItemsUrl) {
        clearGalleryObjectUrls();
        setGalleryItems([]);
        setGalleryMetaLoading(false);
        setGalleryImagesLoading(false);
        setGalleryError(false);
        return;
      }

      setGalleryMetaLoading(true);
      setGalleryImagesLoading(false);
      setGalleryError(false);

      try {
        const listUrl = appendQueryParams(resolvedThumbnailItemsUrl, {
          size: 320,
          maxProtocols: 12,
        });

        const response = await fetchWithAuth(listUrl, {
          method: "GET",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch thumbnail items: ${response.status}`);
        }

        const payload = await response.json();
        const items = normalizeThumbnailItems(payload);

        if (cancelled) return;

        if (items.length === 0) {
          clearGalleryObjectUrls();
          setGalleryItems([]);
          setGalleryError(false);
          return;
        }

        setGalleryImagesLoading(true);

        const createdUrls: string[] = [];
        const hydrated = await Promise.all(
          items.map(async (item): Promise<HydratedProtocolThumbnailItem> => {
            const itemUrl = resolveApiUrl(item.thumbnailUrl);

            if (!itemUrl) {
              return { ...item, src: null, hasError: true };
            }

            try {
              const imageUrl = appendQueryParams(itemUrl, { size: 320 });
              const imageResponse = await fetchWithAuth(imageUrl, {
                method: "GET",
                signal: controller.signal,
              });

              if (!imageResponse.ok) {
                throw new Error(`Failed to fetch protocol thumbnail: ${imageResponse.status}`);
              }

              const blob = await imageResponse.blob();
              const objectUrl = URL.createObjectURL(blob);
              createdUrls.push(objectUrl);

              return {
                ...item,
                src: objectUrl,
                hasError: false,
              };
            } catch {
              return {
                ...item,
                src: null,
                hasError: true,
              };
            }
          }),
        );

        if (cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        clearGalleryObjectUrls();
        galleryObjectUrlsRef.current = createdUrls;
        setGalleryItems(hydrated);
      } catch {
        if (controller.signal.aborted || cancelled) return;

        clearGalleryObjectUrls();
        setGalleryItems([]);
        setGalleryError(true);
      } finally {
        if (!cancelled) {
          setGalleryMetaLoading(false);
          setGalleryImagesLoading(false);
        }
      }
    }

    void loadGalleryItems();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [resolvedThumbnailItemsUrl, clearGalleryObjectUrls]);

  const shouldLoadProjectFallback = useMemo(() => {
    if (!resolvedThumbnailUrl) return false;
    if (galleryMetaLoading || galleryImagesLoading) return false;
    if (galleryItems.length > 0) return false;
    return true;
  }, [resolvedThumbnailUrl, galleryMetaLoading, galleryImagesLoading, galleryItems.length]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadProjectThumbnailFallback() {
      if (!shouldLoadProjectFallback || !resolvedThumbnailUrl) {
        clearProjectObjectUrl();
        setProjectThumbnailSrc(null);
        setProjectThumbnailLoading(false);
        setProjectThumbnailError(false);
        return;
      }

      setProjectThumbnailLoading(true);
      setProjectThumbnailError(false);

      try {
        const response = await fetchWithAuth(
          appendQueryParams(resolvedThumbnailUrl, { size: 960 }),
          {
            method: "GET",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Thumbnail request failed: ${response.status}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        if (!cancelled) {
          clearProjectObjectUrl();
          projectObjectUrlRef.current = objectUrl;
          setProjectThumbnailSrc(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        if (!cancelled) {
          clearProjectObjectUrl();
          setProjectThumbnailSrc(null);
          setProjectThumbnailError(true);
        }
      } finally {
        if (!cancelled) {
          setProjectThumbnailLoading(false);
        }
      }
    }

    void loadProjectThumbnailFallback();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [resolvedThumbnailUrl, shouldLoadProjectFallback, clearProjectObjectUrl]);

  const handleOpen = useCallback(() => {
    if (isRenaming) return;
    navigate(`/project/load/${id}`);
  }, [id, isRenaming, navigate]);

  const handleDoubleClick = useCallback(() => {
    handleOpen();
  }, [handleOpen]);

  const handleRename = useCallback(() => {
    setNewLabel(label);
    setNewDescription(description || "");
    setIsRenaming(true);
    setErrorMessage("");
  }, [label, description]);

  const handleRemove = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleShare = useCallback(() => {
    if (!canModify) return;
    onShare?.(id);
  }, [canModify, id, onShare]);

  const confirmRemove = useCallback(async () => {
    try {
      await svc.deleteProject(String(id));
      toast.success(`Project "${label}" deleted successfully`);
      setShowDeleteModal(false);
      onDelete?.(id);
    } catch (error: any) {
      toast.error(error?.message || "Error deleting project");
    }
  }, [svc, id, label, onDelete]);

  const handleRenameSubmit = useCallback(async () => {
    if (!newLabel.trim()) {
      setErrorMessage("Project name cannot be empty.");
      return;
    }

    if (newDescription && newDescription.trim().length > 0 && newDescription.trim().length < 3) {
      setErrorMessage("Description must be at least 3 characters.");
      return;
    }

    try {
      await svc.renameProject(String(id), newLabel.trim(), (newDescription || "").trim());
      toast.success("Project renamed successfully");
      setIsRenaming(false);
      setErrorMessage("");
      onRename?.(id, newLabel.trim(), (newDescription || "").trim());
    } catch (error: any) {
      toast.error(error?.message || "Failed to rename project");
      setErrorMessage("Failed to update project.");
    }
  }, [svc, id, newLabel, newDescription, onRename]);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  const openContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isRenaming || showDeleteModal) return;

      e.preventDefault();
      e.stopPropagation();
      onSelect?.();

      const pad = 8;
      const menuW = 192;
      const menuH = 196;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const rawX = e.clientX;
      const rawY = e.clientY;

      const x = Math.max(pad, Math.min(rawX, vw - menuW - pad));
      const y = Math.max(pad, Math.min(rawY, vh - menuH - pad));

      setContextMenu({ open: true, x, y });
    },
    [isRenaming, showDeleteModal, onSelect],
  );

  const setContextItemRef = useCallback(
    (idx: number) => (el: HTMLLIElement | null) => {
      contextItemRefs.current[idx] = el;
    },
    [],
  );

  const focusOnHoverIfEnabled =
    (disabled: boolean) => (e: React.PointerEvent<HTMLLIElement>) => {
      if (disabled) return;
      const el = e.currentTarget;
      if (document.activeElement !== el) el.focus();
    };

  const runContextItem =
    (disabled: boolean, fn?: () => void) =>
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        fn?.();
        closeContextMenu();
      };

  const onContextMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const items = contextItemRefs.current.filter(Boolean) as HTMLLIElement[];
      if (!items.length) return;

      const isDisabled = (el: HTMLLIElement | null) => el?.dataset.disabled === "true";
      const currentIndex = items.findIndex((el) => el === document.activeElement);

      const moveFocus = (direction: 1 | -1) => {
        let idx = currentIndex;
        for (let i = 0; i < items.length; i++) {
          idx = (idx + direction + items.length) % items.length;
          if (!isDisabled(items[idx])) {
            items[idx].focus();
            break;
          }
        }
      };

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveFocus(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          moveFocus(-1);
          break;
        case "Home": {
          e.preventDefault();
          const first = items.find((el) => !isDisabled(el));
          first?.focus();
          break;
        }
        case "End": {
          e.preventDefault();
          for (let i = items.length - 1; i >= 0; i--) {
            if (!isDisabled(items[i])) {
              items[i].focus();
              break;
            }
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          closeContextMenu();
          break;
      }
    },
    [closeContextMenu],
  );

  useEffect(() => {
    if (isRenaming || showDeleteModal) closeContextMenu();
  }, [isRenaming, showDeleteModal, closeContextMenu]);

  useEffect(() => {
    if (!contextMenu.open) return;

    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        closeContextMenu();
      }
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeContextMenu();
    };

    const onAnyScroll = () => closeContextMenu();

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onAnyScroll, true);
    window.addEventListener("wheel", onAnyScroll, true);
    window.addEventListener("touchmove", onAnyScroll, true);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onAnyScroll, true);
      window.removeEventListener("wheel", onAnyScroll, true);
      window.removeEventListener("touchmove", onAnyScroll, true);
    };
  }, [contextMenu.open, closeContextMenu]);

  useEffect(() => {
    if (!contextMenu.open) return;

    queueMicrotask(() => {
      const items = contextItemRefs.current.filter(Boolean) as HTMLLIElement[];
      const firstEnabled = items.find((el) => el.dataset.disabled !== "true");
      firstEnabled?.focus();
    });
  }, [contextMenu.open]);

  const cardClass = classNames(
    crispText,
    "relative min-h-[290px] cursor-pointer overflow-hidden rounded-[15px] border p-5 transition md:p-6",
    "border-gray-300/85 bg-gradient-to-br from-white via-white to-indigo-50/45",
    "shadow-[0_10px_35px_rgba(15,23,42,0.05)]",
    "dark:border-gray-700 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900 dark:to-slate-950",
    !isSelected ? "hover:border-gray-400 dark:hover:border-gray-600" : "",
    !isRenaming && !isSelected ? "hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(15,23,42,0.09)]" : "",
    "active:border-indigo-500/40 active:ring-2 active:ring-inset active:ring-indigo-500/15",
    isSelected ? "border-indigo-500/55 ring-2 ring-inset ring-indigo-500/16" : "",
  );

  const showGallery = galleryItems.length > 0;
  const showGalleryLoading = galleryMetaLoading || galleryImagesLoading;
  const showProjectFallback = !showGallery && Boolean(projectThumbnailSrc);

  const galleryCountLabel = useMemo(() => {
    if (showGallery) return `${galleryItems.length} items`;
    if (showGalleryLoading) return "loading";
    if (thumbnailRebuildUrl) return "preview available";
    return "";
  }, [showGallery, galleryItems.length, showGalleryLoading, thumbnailRebuildUrl]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="relative"
      >
        <div
          tabIndex={0}
          onClick={onSelect}
          onDoubleClick={handleDoubleClick}
          onContextMenu={openContextMenu}
          className={cardClass}
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-1 opacity-80" />
            <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-indigo-100/90 blur-3xl dark:bg-indigo-900/20" />
            <div className="absolute -left-10 bottom-2 h-24 w-24 rounded-full bg-cyan-100/70 blur-3xl dark:bg-cyan-900/10" />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white/70 to-transparent dark:from-slate-950/25 dark:to-transparent" />
          </div>

          <div className="relative flex h-full flex-col">
            <div
              className={classNames(
                "-mx-2 -mt-2 mb-2 rounded-t-[24px] border-b px-5 pb-4 pt-5 md:-mx-6 md:-mt-6 md:px-6 md:pt-6",
                "border-gray-200/90 bg-gradient-to-br from-slate-50 via-white to-indigo-50/70",
                "dark:border-gray-800 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/25",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3.5">
                  <div
                    className={classNames(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-sm",
                      "border-white/80 bg-gradient-to-br from-white to-indigo-50",
                      "dark:border-slate-700 dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900",
                    )}
                  >
                    {icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.08em]",
                          "border-indigo-300/80 bg-indigo-50 text-indigo-800",
                          "dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200",
                        )}
                      >
                        {projectIdLabel}
                      </span>

                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                          "border-gray-300/80 bg-white/90 text-gray-700",
                          "dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200",
                        )}
                      >
                        {accessLabel}
                      </span>

                      {showGuestBadge ? (
                        <span className="shrink-0 rounded-full border border-sky-300/80 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200">
                          Guest
                        </span>
                      ) : null}

                      {statusLabel ? (
                        <span
                          className={classNames(
                            "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                            getStatusToneClasses(statusLabel),
                          )}
                        >
                          {statusLabel}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 items-start gap-2">
                      <span
                        className="truncate text-[17px] font-semibold leading-6 tracking-[0.01em] text-gray-950 dark:text-white"
                        title={label}
                      >
                        {newLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 pt-0.5">
                  <ProjectAction
                    icon={null}
                    label=""
                    onOpen={handleOpen}
                    onRename={canModify ? handleRename : undefined}
                    onRemove={canModify ? handleRemove : undefined}
                    onShare={canModify ? handleShare : undefined}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div
                className={classNames(
                  "overflow-hidden rounded-2xl border",
                  "border-gray-200/90 bg-white/85",
                  "dark:border-gray-800 dark:bg-slate-950/30",
                )}
              >
                <div className="relative h-[280px] w-full bg-gray-50 dark:bg-slate-900">
                  {showGalleryLoading ? (
                    <div className="h-full overflow-hidden px-3 py-3">
                      <div className="flex h-full min-w-max items-stretch gap-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div
                            key={index}
                            className={classNames(
                              "h-full w-[244px] shrink-0 overflow-hidden rounded-[20px] border",
                              "border-gray-200/80 bg-white/90",
                              "dark:border-slate-800 dark:bg-slate-950/80",
                            )}
                          >
                            <div className="h-[38px] border-b border-gray-200/80 bg-gray-100 dark:border-slate-800 dark:bg-slate-900" />
                            <div className="h-[calc(100%-38px)] animate-pulse bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : showGallery ? (
                    <>
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-8 bg-gradient-to-r from-gray-50 via-gray-50/90 to-transparent dark:from-slate-900 dark:via-slate-900/90 dark:to-transparent" />
                      <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-8 bg-gradient-to-l from-gray-50 via-gray-50/90 to-transparent dark:from-slate-900 dark:via-slate-900/90 dark:to-transparent" />

                      <div className="h-full overflow-x-auto overflow-y-hidden px-3 py-3 [scrollbar-width:thin]">
                        <div className="flex h-full min-w-max items-stretch gap-3">
                          {galleryItems.map((item) => (
                            <div
                              key={String(item.protocolId)}
                              className="group h-full w-[284px] shrink-0"
                              title={item.label ?? `Protocol ${String(item.protocolId)}`}
                            >
                              <div
                                className={classNames(
                                  "grid h-full grid-rows-[auto,1fr,auto] overflow-hidden rounded-[20px] border transition",
                                  "border-gray-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]",
                                  "dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_8px_24px_rgba(0,0,0,0.26)]",
                                  "group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_30px_rgba(15,23,42,0.14)]",
                                )}
                              >
                                <div
                                  className={classNames(
                                    "flex items-center justify-between gap-2 border-b px-3 py-1.5",
                                    "border-gray-200/80 bg-gray-50",
                                    "dark:border-slate-800 dark:bg-slate-900",
                                  )}
                                >
                                  <span className="inline-flex items-center rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold tracking-[0.04em] text-white shadow-sm">
                                    Protocol {String(item.protocolId)}
                                  </span>

                                  {item.status ? (
                                    <span
                                      className={classNames(
                                        "inline-flex max-w-[96px] items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                        getStatusToneClasses(item.status),
                                      )}
                                    >
                                      {item.status}
                                    </span>
                                  ) : null}
                                </div>

                                <div className="min-h-0 p-1.5">
                                  <div
                                    className={classNames(
                                      "flex h-full w-full items-center justify-center overflow-hidden rounded-[12px] border",
                                      "border-gray-200 bg-gray-50",
                                      "dark:border-slate-800 dark:bg-slate-900",
                                    )}
                                  >
                                    {item.src ? (
                                      <img
                                        src={item.src}
                                        alt={item.label ?? `Protocol ${String(item.protocolId)}`}
                                        className="block h-full w-full object-contain"
                                        draggable={false}
                                      />
                                    ) : (
                                      <div className="px-4 text-center text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                        Preview not available
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div
                                  className={classNames(
                                    "border-t px-3 py-1.5",
                                    "border-gray-200/80 bg-white",
                                    "dark:border-slate-800 dark:bg-slate-950",
                                  )}
                                >
                                  <div className="truncate text-[11px] font-semibold text-gray-800 dark:text-slate-200">
                                    {item.label ?? `Protocol ${String(item.protocolId)}`}
                                  </div>

                                  
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : showProjectFallback ? (
                    <>
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-8 bg-gradient-to-r from-gray-50 via-gray-50/90 to-transparent dark:from-slate-900 dark:via-slate-900/90 dark:to-transparent" />
                      <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-8 bg-gradient-to-l from-gray-50 via-gray-50/90 to-transparent dark:from-slate-900 dark:via-slate-900/90 dark:to-transparent" />

                      <div className="h-full overflow-x-auto overflow-y-hidden px-3 py-3 [scrollbar-width:thin]">
                        <div className="h-full min-w-max">
                          <img
                            src={projectThumbnailSrc ?? undefined}
                            alt={`${label} thumbnail`}
                            className="block h-full w-auto max-w-none rounded-[18px]"
                            draggable={false}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      {projectThumbnailLoading
                        ? "Loading preview..."
                        : galleryError || projectThumbnailError
                          ? "Preview not available"
                          : "No thumbnails yet"}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-auto pt-5">
              <div
                className={classNames(
                  "flex flex-wrap items-center justify-between gap-3 border-t pt-4",
                  "border-gray-200/90 dark:border-gray-800",
                )}
              >
                <div className="flex flex-wrap items-center gap-2.5 text-sm">
                  {updatedAt ? (
                    <span
                      className={classNames(
                        "inline-flex items-center gap-2 rounded-full px-3 py-1.5",
                        "bg-white/80 text-gray-700",
                        "dark:bg-slate-900 dark:text-gray-300",
                      )}
                    >
                      <CalendarIcon className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                      <span className="text-gray-600 dark:text-gray-400">Updated</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatDateShort(updatedAt)}
                      </span>
                    </span>
                  ) : createdAt ? (
                    <span
                      className={classNames(
                        "inline-flex items-center gap-2 rounded-full px-3 py-1.5",
                        "bg-white/80 text-gray-700",
                        "dark:bg-slate-900 dark:text-gray-300",
                      )}
                    >
                      <CalendarIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                      <span className="text-gray-600 dark:text-gray-400">Created</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatDateShort(createdAt)}
                      </span>
                    </span>
                  ) : null}

                  {diskUsage ? (
                    <span
                      className={classNames(
                        "inline-flex items-center gap-2 rounded-full px-3 py-1.5",
                        "bg-white/80 text-gray-700",
                        "dark:bg-slate-900 dark:text-gray-300",
                      )}
                    >
                      <StorageIcon className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                      <span className="font-semibold text-gray-900 dark:text-white">{diskUsage}</span>
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpen();
                  }}
                  className={classNames(
                    "inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm transition",
                    "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600 text-white shadow-sm",
                    "hover:brightness-[0.98] hover:shadow-md",
                  )}
                >
                  <OpenFolderIcon className="h-4 w-4" />
                  Open project
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {isRenaming && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={classNames(
                  crispText,
                  "absolute inset-0 z-20 overflow-hidden rounded-[28px] border",
                  "border-gray-300/90 bg-white",
                  "dark:border-gray-700 dark:bg-slate-900",
                )}
                role="dialog"
                aria-modal="true"
                onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Escape") setIsRenaming(false);
                  const tag = (e.target as HTMLElement)?.tagName;
                  if (e.key === "Enter" && tag !== "TEXTAREA") {
                    e.preventDefault();
                    handleRenameSubmit();
                  }
                }}
              >
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-300/80 px-4 py-3 dark:border-gray-700">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-300/80 bg-gray-100 dark:border-gray-700 dark:bg-slate-800">
                        {icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-950 dark:text-white">
                          Rename project
                        </div>
                        <div className="truncate text-sm text-gray-700 dark:text-gray-300">
                          {label}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsRenaming(false)}
                      className={classNames(
                        "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition",
                        "border-gray-300/80 bg-white text-gray-800 hover:shadow-sm",
                        "dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200",
                      )}
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
                    <div className="flex flex-col gap-3">
                      <label className="text-sm font-medium text-gray-800 dark:text-gray-300">
                        Name
                        <input
                          type="text"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          placeholder="Project name"
                          className={classNames(
                            crispText,
                            "mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-medium outline-none",
                            "border-gray-300/80 bg-white text-gray-950",
                            "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                            "dark:border-gray-700 dark:bg-slate-900 dark:text-white",
                          )}
                          autoFocus
                        />
                      </label>

                      <label className="text-sm font-medium text-gray-800 dark:text-gray-300">
                        Description
                        <textarea
                          value={newDescription}
                          onChange={(e) => setNewDescription(e.target.value)}
                          placeholder="Project description"
                          rows={4}
                          className={classNames(
                            crispText,
                            "mt-1 w-full rounded-xl border px-3 py-2.5 text-sm leading-6 outline-none",
                            "border-gray-300/80 bg-white text-gray-950",
                            "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                            "dark:border-gray-700 dark:bg-slate-900 dark:text-white",
                          )}
                        />
                      </label>

                      {errorMessage ? (
                        <div className="rounded-xl border border-red-200/80 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                          {errorMessage}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-gray-300/80 bg-white px-4 py-3 dark:border-gray-700 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => setIsRenaming(false)}
                      className={classNames(
                        "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                        "border-gray-300/80 bg-white text-gray-800 hover:shadow-sm",
                        "dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200",
                      )}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={handleRenameSubmit}
                      className="rounded-xl bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-[0.98] hover:shadow-md"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {contextMenu.open && portalRoot
        ? createPortal(
          <div
            className="fixed inset-0 z-[9999]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              closeContextMenu();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              closeContextMenu();
            }}
          >
            <div
              ref={contextMenuRef}
              role="menu"
              tabIndex={-1}
              onKeyDown={onContextMenuKeyDown}
              className="fixed w-48 overflow-hidden rounded-xl border border-gray-300/90 bg-white shadow-2xl dark:border-gray-700 dark:bg-slate-900"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {(() => {
                const openDisabled = false;
                const renameDisabled = !canModify;
                const shareDisabled = !canModify;
                const removeDisabled = !canModify;

                const baseItemClass = "flex items-center gap-2 px-4 py-2.5 outline-none text-sm";
                const enabledItemClass =
                  "cursor-pointer transition hover:bg-gray-50 focus:bg-gray-100 dark:hover:bg-slate-800/70 dark:focus:bg-slate-800/70";
                const disabledItemClass =
                  "cursor-not-allowed opacity-50 text-gray-400 dark:text-gray-500";

                const itemClass = (disabled: boolean) =>
                  classNames(baseItemClass, disabled ? disabledItemClass : enabledItemClass);

                return (
                  <ul className="py-1 text-gray-800 dark:text-gray-200">
                    <li
                      ref={setContextItemRef(0)}
                      tabIndex={-1}
                      role="menuitem"
                      aria-disabled={openDisabled}
                      data-disabled={openDisabled ? "true" : "false"}
                      className={itemClass(openDisabled)}
                      onPointerMove={focusOnHoverIfEnabled(openDisabled)}
                      onClick={runContextItem(openDisabled, handleOpen)}
                    >
                      <OpenFolderIcon className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                      <span>Open</span>
                    </li>

                    <li
                      ref={setContextItemRef(1)}
                      tabIndex={-1}
                      role="menuitem"
                      aria-disabled={renameDisabled}
                      data-disabled={renameDisabled ? "true" : "false"}
                      className={itemClass(renameDisabled)}
                      onPointerMove={focusOnHoverIfEnabled(renameDisabled)}
                      onClick={runContextItem(renameDisabled, handleRename)}
                    >
                      <RenameIcon
                        className={classNames(
                          "h-5 w-5",
                          renameDisabled
                            ? "text-gray-400 dark:text-gray-500"
                            : "text-gray-700 dark:text-gray-200",
                        )}
                      />
                      <span>Rename</span>
                    </li>

                    <li
                      ref={setContextItemRef(2)}
                      tabIndex={-1}
                      role="menuitem"
                      aria-disabled={shareDisabled}
                      data-disabled={shareDisabled ? "true" : "false"}
                      className={itemClass(shareDisabled)}
                      onPointerMove={focusOnHoverIfEnabled(shareDisabled)}
                      onClick={runContextItem(shareDisabled, handleShare)}
                    >
                      <UserPlus2
                        className={classNames(
                          "h-4 w-4",
                          shareDisabled
                            ? "text-gray-400 dark:text-gray-500"
                            : "text-gray-700 dark:text-gray-200",
                        )}
                      />
                      <span>Share</span>
                    </li>

                    <li
                      ref={setContextItemRef(3)}
                      tabIndex={-1}
                      role="menuitem"
                      aria-disabled={removeDisabled}
                      data-disabled={removeDisabled ? "true" : "false"}
                      className={classNames(
                        itemClass(removeDisabled),
                        !removeDisabled
                          ? "hover:bg-red-50 focus:bg-red-50 dark:hover:bg-red-950/20 dark:focus:bg-red-950/20"
                          : "",
                      )}
                      onPointerMove={focusOnHoverIfEnabled(removeDisabled)}
                      onClick={runContextItem(removeDisabled, handleRemove)}
                    >
                      <TrashBinIcon
                        className={classNames(
                          "h-5 w-5",
                          removeDisabled
                            ? "text-gray-400 dark:text-gray-500"
                            : "text-red-700 dark:text-red-300",
                        )}
                      />
                      <span className={!removeDisabled ? "text-red-700 dark:text-red-300" : undefined}>
                        Remove
                      </span>
                    </li>
                  </ul>
                );
              })()}
            </div>
          </div>,
          portalRoot,
        )
        : null}

      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/35"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-sm rounded-2xl border border-gray-300/90 bg-white p-6 shadow-2xl subpixel-antialiased dark:border-gray-700 dark:bg-slate-900"
              onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            >
              <h2 className="mb-4 text-lg font-semibold text-gray-950 dark:text-white">
                Delete project?
              </h2>
              <p className="mb-6 text-sm leading-6 text-gray-800 dark:text-gray-200">
                This action cannot be undone. Are you sure you want to delete <strong>{label}</strong>?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-xl border border-gray-300/80 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:shadow-sm dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRemove}
                  className="rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-[0.98] hover:shadow-md"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}