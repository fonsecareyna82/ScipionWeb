import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { X, UserPlus2 } from "lucide-react";

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

type ProtocolThumbnailOutputItem = {
  outputName?: string | null;
  outputClassName?: string | null;
  exists?: boolean;
  thumbnailUrl?: string | null;
  thumbnailRebuildUrl?: string | null;
};

type HydratedProtocolThumbnailOutputItem = ProtocolThumbnailOutputItem & {
  src: string | null;
  hasError: boolean;
};

type ProtocolThumbnailGroup = {
  protocolId: string | number;
  label?: string;
  status?: string;
  outputs: ProtocolThumbnailOutputItem[];
};

type HydratedProtocolThumbnailGroup = Omit<ProtocolThumbnailGroup, "outputs"> & {
  outputs: HydratedProtocolThumbnailOutputItem[];
};

type ThumbnailItemsCacheEntry = {
  ts: number;
  data: ProtocolThumbnailGroup[];
};

type ThumbnailObjectUrlCacheEntry = {
  url: string;
  touchedAt: number;
};

const THUMBNAIL_ITEMS_TTL_MS = 20_000;
const THUMBNAIL_ITEMS_CACHE = new Map<string, ThumbnailItemsCacheEntry>();

const THUMBNAIL_OBJECT_URL_CACHE_MAX = 180;
const THUMBNAIL_OBJECT_URL_CACHE = new Map<string, ThumbnailObjectUrlCacheEntry>();
const THUMBNAIL_PENDING_REQUESTS = new Map<string, Promise<string | null>>();

function getCachedThumbnailObjectUrl(key: string): string | null {
  const entry = THUMBNAIL_OBJECT_URL_CACHE.get(key);
  if (!entry) return null;

  entry.touchedAt = Date.now();
  return entry.url;
}

function setCachedThumbnailObjectUrl(key: string, objectUrl: string): void {
  THUMBNAIL_OBJECT_URL_CACHE.set(key, {
    url: objectUrl,
    touchedAt: Date.now(),
  });

  while (THUMBNAIL_OBJECT_URL_CACHE.size > THUMBNAIL_OBJECT_URL_CACHE_MAX) {
    let oldestKey: string | null = null;
    let oldestTs = Number.POSITIVE_INFINITY;

    for (const [cacheKey, entry] of THUMBNAIL_OBJECT_URL_CACHE.entries()) {
      if (entry.touchedAt < oldestTs) {
        oldestTs = entry.touchedAt;
        oldestKey = cacheKey;
      }
    }

    if (!oldestKey) break;

    const oldestEntry = THUMBNAIL_OBJECT_URL_CACHE.get(oldestKey);
    if (oldestEntry?.url) {
      URL.revokeObjectURL(oldestEntry.url);
    }
    THUMBNAIL_OBJECT_URL_CACHE.delete(oldestKey);
  }
}



async function runWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return;

  let nextIndex = 0;

  async function consume(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) return;
      await worker(items[currentIndex]);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => consume(),
  );

  await Promise.all(workers);
}

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
    value.includes("running") ||
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
    value.includes("aborted") ||
    value.includes("failed") ||
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

function normalizeThumbnailItems(raw: any): ProtocolThumbnailGroup[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];

  return list
    .map((group: any) => {
      const protocolId = group?.protocolId ?? group?.protocol_id ?? group?.id ?? null;
      if (protocolId === null || protocolId === undefined) return null;

      const outputs = Array.isArray(group?.outputs)
        ? group.outputs
          .map((output: any) => ({
            outputName: output?.outputName ?? output?.output_name ?? null,
            outputClassName: output?.outputClassName ?? output?.output_class_name ?? null,
            exists: output?.exists !== undefined ? Boolean(output.exists) : true,
            thumbnailUrl: output?.thumbnailUrl ?? output?.thumbnail_url ?? null,
            thumbnailRebuildUrl:
              output?.thumbnailRebuildUrl ?? output?.thumbnail_rebuild_url ?? null,
          }))
          .filter(Boolean)
        : [];

      return {
        protocolId,
        label:
          group?.protocolLabel ??
          group?.protocol_label ??
          group?.label ??
          group?.name ??
          `Protocol ${String(protocolId)}`,
        status: group?.status ?? undefined,
        outputs,
      } satisfies ProtocolThumbnailGroup;
    })
    .filter(Boolean) as ProtocolThumbnailGroup[];
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

  const [galleryItems, setGalleryItems] = useState<HydratedProtocolThumbnailGroup[]>([]);
  const [galleryMetaLoading, setGalleryMetaLoading] = useState(false);
  const [galleryImagesLoading, setGalleryImagesLoading] = useState(false);
  const [galleryError, setGalleryError] = useState(false);

  const [projectThumbnailSrc, setProjectThumbnailSrc] = useState<string | null>(null);
  const [projectThumbnailLoading, setProjectThumbnailLoading] = useState(false);
  const [projectThumbnailError, setProjectThumbnailError] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isInViewport, setIsInViewport] = useState(false);

  const resolvedThumbnailUrl = useMemo(
    () => svc.resolveBackendUrl(thumbnailUrl),
    [svc, thumbnailUrl],
  );

  const resolvedThumbnailItemsUrl = useMemo(
    () => svc.resolveBackendUrl(thumbnailItemsUrl),
    [svc, thumbnailItemsUrl],
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


  const fetchThumbnailObjectUrl = useCallback(
    async (url: string): Promise<string | null> => {
      const cached = getCachedThumbnailObjectUrl(url);
      if (cached) return cached;

      const pending = THUMBNAIL_PENDING_REQUESTS.get(url);
      if (pending) return pending;

      const promise = svc
        .fetchBlobObjectUrl(url, {
          cache: "default",
        })
        .then((objectUrl) => {
          setCachedThumbnailObjectUrl(url, objectUrl);
          return objectUrl;
        })
        .catch(() => null)
        .finally(() => {
          THUMBNAIL_PENDING_REQUESTS.delete(url);
        });

      THUMBNAIL_PENDING_REQUESTS.set(url, promise);
      return promise;
    },
    [svc],
  );

  useEffect(() => {
    setNewLabel(label);
    setNewDescription(description || "");
  }, [label, description]);


  useEffect(() => {
    if (isInViewport) return;
    if (!cardRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some(
          (entry) => entry.isIntersecting || entry.intersectionRatio > 0,
        );
        if (visible) {
          setIsInViewport(true);
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin: "240px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(cardRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isInViewport]);


  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadGalleryItems() {
      if (!isInViewport || !resolvedThumbnailItemsUrl) {
        return;
      }

      setGalleryMetaLoading(true);
      setGalleryError(false);

      try {

        setProjectThumbnailSrc(null);
        setProjectThumbnailError(false);

        const listUrl = appendQueryParams(resolvedThumbnailItemsUrl, {
          size: 320,
          maxProtocols: 12,
          maxOutputsPerProtocol: 4,
        });

        let groups: ProtocolThumbnailGroup[] = [];
        const cachedEntry = THUMBNAIL_ITEMS_CACHE.get(listUrl);

        if (cachedEntry && Date.now() - cachedEntry.ts < THUMBNAIL_ITEMS_TTL_MS) {
          groups = cachedEntry.data;
        } else {

          const payload = await svc.fetchJsonUrl(listUrl, {
            signal: controller.signal,
            cache: "default",
          });

          groups = normalizeThumbnailItems(payload);
          THUMBNAIL_ITEMS_CACHE.set(listUrl, {
            ts: Date.now(),
            data: groups,
          });
        }

        if (cancelled) return;

        if (!groups.length) {
          setGalleryItems([]);
          setGalleryImagesLoading(false);
          setGalleryError(false);
          return;
        }

        const initialGroups: HydratedProtocolThumbnailGroup[] = groups.map((group) => ({
          ...group,
          outputs: (group.outputs || []).map((output) => {
            const rawImageUrl = svc.resolveBackendUrl(output.thumbnailUrl);
            const requestUrl = rawImageUrl
              ? appendQueryParams(rawImageUrl, { size: 320 })
              : null;
            const cachedSrc = requestUrl ? getCachedThumbnailObjectUrl(requestUrl) : null;

            return {
              ...output,
              src: cachedSrc,
              hasError: !requestUrl,
            };
          }),
        }));

        setGalleryItems(initialGroups);
        setGalleryImagesLoading(true);

        const tasks = initialGroups.flatMap((group, groupIndex) =>
          group.outputs.map((output, outputIndex) => ({
            groupIndex,
            outputIndex,
            requestUrl: output.thumbnailUrl
              ? appendQueryParams(svc.resolveBackendUrl(output.thumbnailUrl) ?? "", { size: 320 })
              : null,
          })),
        );

        await runWithConcurrencyLimit(tasks, 6, async (task) => {
          if (!task.requestUrl) {
            if (cancelled) return;

            setGalleryItems((prev) =>
              prev.map((group, groupIndex) =>
                groupIndex !== task.groupIndex
                  ? group
                  : {
                    ...group,
                    outputs: group.outputs.map((output, outputIndex) =>
                      outputIndex !== task.outputIndex
                        ? output
                        : { ...output, src: null, hasError: true },
                    ),
                  },
              ),
            );
            return;
          }

          const objectUrl = await fetchThumbnailObjectUrl(task.requestUrl);
          if (cancelled) return;

          setGalleryItems((prev) =>
            prev.map((group, groupIndex) =>
              groupIndex !== task.groupIndex
                ? group
                : {
                  ...group,
                  outputs: group.outputs.map((output, outputIndex) =>
                    outputIndex !== task.outputIndex
                      ? output
                      : {
                        ...output,
                        src: objectUrl,
                        hasError: !objectUrl,
                      },
                  ),
                },
            ),
          );
        });
      } catch {
        if (controller.signal.aborted || cancelled) return;

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
  }, [isInViewport, resolvedThumbnailItemsUrl, svc]);


  const shouldLoadProjectFallback = useMemo(() => {
    if (!resolvedThumbnailUrl) return false;
    if (galleryMetaLoading || galleryImagesLoading) return false;
    if (galleryItems.length > 0) return false;
    return true;
  }, [resolvedThumbnailUrl, galleryMetaLoading, galleryImagesLoading, galleryItems.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectThumbnailFallback() {
      if (!isInViewport || !shouldLoadProjectFallback || !resolvedThumbnailUrl) {
        return;
      }

      setProjectThumbnailLoading(true);
      setProjectThumbnailError(false);

      try {
        const requestUrl = appendQueryParams(resolvedThumbnailUrl, { size: 960 });
        const objectUrl = await fetchThumbnailObjectUrl(requestUrl);

        if (!cancelled) {
          setProjectThumbnailSrc(objectUrl);
        }
      } catch {
        if (!cancelled) {
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
    };
  }, [isInViewport, resolvedThumbnailUrl, shouldLoadProjectFallback, fetchThumbnailObjectUrl]);

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
    "relative min-h-[248px] cursor-pointer overflow-hidden rounded-[22px] border p-4 transition-all duration-300 md:p-5",
    "border-slate-200/90 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.10),transparent_26%),linear-gradient(145deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))]",
    "shadow-[0_12px_40px_rgba(15,23,42,0.07)] border-slate-300 hover:border-slate-500",
    "dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_24%),linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))]",
    !isSelected ? "hover:border-slate-300 dark:hover:border-slate-700 " : "",
    !isRenaming && !isSelected
      ? "hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(15,23,42,0.12)]"
      : "",
    "active:border-indigo-500/45 active:ring-2 active:ring-inset active:ring-indigo-500/12",
    isSelected ? "border-indigo-500/55 ring-2 ring-inset ring-indigo-500/14" : "",
  );

  const galleryHasImages = useMemo(
    () =>
      galleryItems.some((group) =>
        (group.outputs || []).some((output) => Boolean(output.src)),
      ),
    [galleryItems],
  );

  const hasGalleryStructure = galleryItems.length > 0;

  const showGallery = hasGalleryStructure;

  const showProjectFallback =
    Boolean(projectThumbnailSrc) &&
    !hasGalleryStructure &&
    !galleryMetaLoading &&
    !galleryImagesLoading;

  const showGalleryLoading = !hasGalleryStructure && galleryMetaLoading;

  const galleryCountLabel = useMemo(() => {
    if (showGallery) {
      const totalOutputs = galleryItems.reduce(
        (acc, group) => acc + (group.outputs?.length ?? 0),
        0,
      );
      return `${galleryItems.length} protocols · ${totalOutputs} outputs`;
    }
    if (showGalleryLoading) return "loading";
    if (thumbnailRebuildUrl) return "preview available";
    return "";
  }, [showGallery, galleryItems, showGalleryLoading, thumbnailRebuildUrl]);

  const getProtocolCardWidth = useCallback((outputCount: number) => {
    const count = Math.max(1, outputCount);

    if (count === 1) return 240;
    if (count === 2) return 480;
    if (count === 3) return 624;
    if (count === 4) return 880;

    return 1188 + (count - 4) * 260;
  }, []);

  return (
    <>
      <motion.div
        ref={cardRef}
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
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />
            <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-500/12" />
            <div className="absolute -left-8 bottom-4 h-24 w-24 rounded-full bg-cyan-200/30 blur-3xl dark:bg-cyan-500/10" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/55 to-transparent dark:from-slate-950/20 dark:to-transparent" />
          </div>

          <div className="relative flex h-full flex-col">
            <div
              className={classNames(
                "-mx-4 -mt-4 mb-0 rounded-t-[22px] border-b px-4 pb-3.5 pt-4 md:-mx-5 md:-mt-7 md:px-5 md:pt-5",
                "border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))]",
                "dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.78))]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div
                    className={classNames(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border shadow-sm",
                      "border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,1),rgba(238,242,255,0.95))]",
                      "dark:border-slate-700 dark:bg-[linear-gradient(145deg,rgba(30,41,59,0.96),rgba(15,23,42,0.96))]",
                    )}
                  >
                    {icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em]",
                          "border-indigo-300/80 bg-indigo-50 text-indigo-800",
                          "dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200",
                        )}
                      >
                        {projectIdLabel}
                      </span>

                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                          "border-slate-300/80 bg-white/90 text-slate-700",
                          "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
                        )}
                      >
                        {accessLabel}
                      </span>

                      {showGuestBadge ? (
                        <span className="shrink-0 rounded-full border border-sky-300/80 bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200">
                          Guest
                        </span>
                      ) : null}

                      {statusLabel ? (
                        <span
                          className={classNames(
                            "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                            getStatusToneClasses(statusLabel),
                          )}
                        >
                          {statusLabel}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="truncate text-[16px] font-semibold leading-5 tracking-[0.01em] text-slate-950 dark:text-white"
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

            <div className="mt-3">
              <div
                className={classNames(
                  "overflow-hidden rounded-[20px] border",
                  "border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.96))]",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_10px_24px_rgba(15,23,42,0.06)]",
                  "dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.56),rgba(2,6,23,0.82))]",
                )}
              >
                <div className="relative h-[268px] w-full bg-slate-50/80 dark:bg-slate-900/70">
                  {showGalleryLoading ? (
                    <div className="h-full overflow-hidden px-2.5 py-2.5">
                      <div className="flex h-full min-w-max items-stretch gap-2.5">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div
                            key={index}
                            className={classNames(
                              "h-full w-[284px] shrink-0 overflow-hidden rounded-[18px] border",
                              "border-slate-200/80 bg-white/95",
                              "dark:border-slate-800 dark:bg-slate-950/90",
                            )}
                          >
                            <div className="h-[34px] border-b border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" />
                            <div className="h-[calc(100%-34px)] animate-pulse bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800" />
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
                          {galleryItems.map((group) => {
                            const outputs = group.outputs ?? [];
                            const outputCount = outputs.length;

                            return (
                              <div
                                key={String(group.protocolId)}
                                className="group h-full shrink-0"
                                style={{ width: `${getProtocolCardWidth(outputCount)}px` }}
                                title={group.label ?? `Protocol ${String(group.protocolId)}`}
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
                                    <div className="truncate text-[11px] font-semibold text-gray-800 dark:text-slate-200">
                                      {group.label ?? `Protocol ${String(group.protocolId)}`}
                                    </div>
                                  </div>

                                  <div className="min-h-0 p-2">
                                    <div className="flex h-full items-stretch gap-2">
                                      {outputs.map((output, index) => (
                                        <div
                                          key={`${String(group.protocolId)}-${output.outputName ?? index}`}
                                          className={classNames(
                                            "min-w-0 flex-1 overflow-hidden rounded-[14px] border",
                                            "border-gray-200 bg-gray-50",
                                            "dark:border-slate-800 dark:bg-slate-900",
                                          )}
                                          title={output.outputName ?? output.outputClassName ?? "Output"}
                                        >
                                          {output.src ? (
                                            <img
                                              src={output.src}
                                              alt={output.outputName ?? output.outputClassName ?? "Output"}
                                              className="block h-full w-full object-contain"
                                              draggable={false}
                                            />
                                          ) : galleryImagesLoading ? (
                                            <div className="h-full w-full animate-pulse bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800" />
                                          ) : (
                                            <div className="flex h-full items-center justify-center px-3 text-center text-[10px] font-medium text-gray-500 dark:text-gray-400">
                                              Preview not available
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div
                                    className={classNames(
                                      "border-t px-3 py-1.5",
                                      "border-gray-200/80 bg-white",
                                      "dark:border-slate-800 dark:bg-slate-950",
                                    )}
                                  >

                                    {group.status ? (
                                      <span
                                        className={classNames(
                                          "inline-flex max-w-[96px] items-center truncate rounded-full border px-2 py-0.5 text-[12px]",
                                          getStatusToneClasses(group.status),
                                        )}
                                      >
                                        {group.status}
                                      </span>
                                    ) : null}

                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : showProjectFallback ? (
                    <>
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-8 bg-gradient-to-r from-slate-50 via-slate-50/90 to-transparent dark:from-slate-900 dark:via-slate-900/90 dark:to-transparent" />
                      <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-8 bg-gradient-to-l from-slate-50 via-slate-50/90 to-transparent dark:from-slate-900 dark:via-slate-900/90 dark:to-transparent" />

                      <div className="h-full overflow-x-auto overflow-y-hidden px-2.5 py-2.5 [scrollbar-width:thin]">
                        <div className="flex h-full min-w-max items-stretch">
                          <div
                            className={classNames(
                              "h-full overflow-hidden rounded-[18px] border",
                              "border-slate-200/90 bg-white/95 shadow-[0_10px_28px_rgba(15,23,42,0.08)]",
                              "dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-[0_12px_28px_rgba(0,0,0,0.24)]",
                            )}
                          >
                            <img
                              src={projectThumbnailSrc ?? undefined}
                              alt={`${label} thumbnail`}
                              className="block h-full w-auto max-w-none"
                              draggable={false}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500 dark:text-slate-400">
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

            <div className="mt-auto pt-3">
              <div
                className={classNames(
                  "flex flex-wrap items-center justify-between gap-2.5 border-t pt-3",
                  "border-slate-200/80 dark:border-slate-800",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  {updatedAt ? (
                    <span
                      className={classNames(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.25",
                        "border-slate-200 bg-white/88 text-slate-700",
                        "dark:border-slate-800 dark:bg-slate-900/88 dark:text-slate-300",
                      )}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                      <span className="text-slate-500 dark:text-slate-400">Updated</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatDateShort(updatedAt)}
                      </span>
                    </span>
                  ) : createdAt ? (
                    <span
                      className={classNames(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.25",
                        "border-slate-200 bg-white/88 text-slate-700",
                        "dark:border-slate-800 dark:bg-slate-900/88 dark:text-slate-300",
                      )}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-300" />
                      <span className="text-slate-500 dark:text-slate-400">Created</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatDateShort(createdAt)}
                      </span>
                    </span>
                  ) : null}

                  {diskUsage ? (
                    <span
                      className={classNames(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.25",
                        "border-slate-200 bg-white/88 text-slate-700",
                        "dark:border-slate-800 dark:bg-slate-900/88 dark:text-slate-300",
                      )}
                    >
                      <StorageIcon className="h-3.5 w-3.5 text-cyan-700 dark:text-cyan-300" />
                      <span className="font-semibold text-slate-900 dark:text-white">{diskUsage}</span>
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
                    "inline-flex items-center gap-2 rounded-[12px] px-4 py-2 text-[13px] font-semibold transition-all duration-200",
                    "bg-[linear-gradient(135deg,rgba(79,70,229,1),rgba(14,165,233,1),rgba(6,182,212,1))] text-white shadow-[0_10px_24px_rgba(59,130,246,0.28)]",
                    "hover:-translate-y-0.5 hover:brightness-[1.02] hover:shadow-[0_16px_30px_rgba(59,130,246,0.32)]",
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