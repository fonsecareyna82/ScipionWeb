import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Layers3, Pin, UserPlus2 } from "lucide-react";
import { RunningDot } from "./ProjectStatusSummary";
import { ACTIVE_STATUSES, countIn, formatFullDate, formatRelativeDate } from "@/utils/project-list";

import {
  CalendarIcon,
  FolderIcon,
  StorageIcon,
  OpenFolderIcon,
  RenameIcon,
  TrashBinIcon,
} from "@/icons";
import ProjectAction from "./ProjectActions";
import { useProjectService } from "@/ProjectServiceContext";
import { DeleteProjectDialog, RenameProjectDialog } from "./ProjectDialogs";
import { projectAccessLabel } from "@/utils/project-access";
import type {
  ProjectThumbnailGroup,
  ProjectThumbnailOutputItem,
} from "@/services/ProjectService";

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
  accessVia?: string | null;

  thumbnailUrl?: string | null;
  thumbnailRebuildUrl?: string | null;
  thumbnailItemsUrl?: string | null;
  thumbnailVersion?: string | number;

  // How many protocols are in each status
  statusCounts?: Record<string, number> | null;
  isPinned?: boolean;
  onTogglePin?: () => void;
}

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
};


type HydratedProjectThumbnailOutputItem = ProjectThumbnailOutputItem & {
  src: string | null;
  hasError: boolean;
};

type HydratedProjectThumbnailGroup = Omit<ProjectThumbnailGroup, "outputs"> & {
  outputs: HydratedProjectThumbnailOutputItem[];
};

type ThumbnailItemsCacheEntry = {
  ts: number;
  data: ProjectThumbnailGroup[];
};

type ThumbnailObjectUrlCacheEntry = {
  url: string;
  touchedAt: number;
};

const THUMBNAIL_ITEMS_TTL_MS = 300_000;

// Each output of a card is about this wide; its image is asked at the
// screen's pixels (up to twice that on high density screens).
const CARD_OUTPUT_CSS_WIDTH = 224;
// Images downloaded at once by a card.
const CARD_IMAGE_CONCURRENCY = 4;

function cardThumbnailSize(): number {
  const ratio = typeof window !== "undefined" ? Math.min(2, Math.max(1, window.devicePixelRatio || 1)) : 1;
  return Math.round(CARD_OUTPUT_CSS_WIDTH * ratio);
}
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

function getStatusToneClasses(raw?: string): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (!value) {
    return classNames(
      "border-gray-300/80 bg-white/90 text-gray-700",
      "dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200",
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


const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

// A thumbnail that fades in once decoded instead of popping in.
function FadeInImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      onLoad={() => setLoaded(true)}
      className={classNames(
        "block h-full w-full object-contain transition-opacity duration-300 ease-out",
        loaded ? "opacity-100" : "opacity-0",
      )}
      draggable={false}
    />
  );
}

export default function ProjectCard(props: ProjectCardProps) {
  const {
    id,
    label,
    value,
    badgeValue,
    createdAt,
    updatedAt,
    diskUsage,
    isSelected,
    onSelect,
    description = "",
    status,
    icon = <FolderIcon className="h-5 w-5 text-gray-700 dark:text-gray-200" />,
    onDelete,
    onRename,
    onShare,
    isShared,
    isOwner,
    permission,
    accessVia,
    thumbnailUrl,
    thumbnailRebuildUrl,
    thumbnailItemsUrl,
    thumbnailVersion,
    statusCounts,
    isPinned = false,
    onTogglePin,
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

  const [galleryItems, setGalleryItems] = useState<HydratedProjectThumbnailGroup[]>([]);
  const [galleryMetaLoading, setGalleryMetaLoading] = useState(false);
  const [galleryImagesLoading, setGalleryImagesLoading] = useState(false);
  const [galleryError, setGalleryError] = useState(false);

  const [projectThumbnailSrc, setProjectThumbnailSrc] = useState<string | null>(null);
  const [projectThumbnailLoading, setProjectThumbnailLoading] = useState(false);
  const [projectThumbnailError, setProjectThumbnailError] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isInViewport, setIsInViewport] = useState(false);

  const projectIdLabel = useMemo(() => `P${String(id)}`, [id]);

  const accessLabel = useMemo(
    () => projectAccessLabel({ isOwner: normalizedIsOwner, isShared: normalizedIsShared, permission, accessVia }),
    [normalizedIsOwner, normalizedIsShared, permission, accessVia],
  );

  const protocolCount = Number(value ?? 0);
  const runningCount = countIn(statusCounts, ACTIVE_STATUSES);
  const protocolsText = `${Number.isFinite(protocolCount) ? protocolCount : 0} ${protocolCount === 1 ? "protocol" : "protocols"}`;

  const statusLabel = useMemo(() => {
    const raw = String(status ?? badgeValue ?? "").trim();
    return raw || null;
  }, [status, badgeValue]);


  const fetchThumbnailObjectUrl = useCallback(
    async (rawUrl: string): Promise<string | null> => {
      const resolvedUrl = svc.resolveBackendUrl(rawUrl);
      if (!resolvedUrl) return null;

      const cached = getCachedThumbnailObjectUrl(resolvedUrl);
      if (cached) return cached;

      const pending = THUMBNAIL_PENDING_REQUESTS.get(resolvedUrl);
      if (pending) return pending;

      const promise = svc
        .fetchBlobObjectUrl(resolvedUrl, {
          cache: "default",
        })
        .then((objectUrl) => {
          setCachedThumbnailObjectUrl(resolvedUrl, objectUrl);
          return objectUrl;
        })
        .catch(() => null)
        .finally(() => {
          THUMBNAIL_PENDING_REQUESTS.delete(resolvedUrl);
        });

      THUMBNAIL_PENDING_REQUESTS.set(resolvedUrl, promise);
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

    // The thumbnails listed from the database, each image downloaded once by
    // its signed URL (it is drawn on the server meanwhile when missing).
    async function loadSignedThumbnails() {
      setGalleryMetaLoading(true);
      setGalleryError(false);
      try {
        const list = await svc.fetchProjectThumbnails!(id, {
          scope: "card",
          size: cardThumbnailSize(),
          maxProtocols: 4,
          maxOutputsPerProtocol: 2,
          signal: controller.signal,
        });
        if (cancelled) return;

        const groups: HydratedProjectThumbnailGroup[] = list.groups
          .map((group) => ({
            protocolId: group.protocolId,
            label: group.label,
            status: group.status,
            outputs: group.outputs
              .filter((output) => output.state !== "unavailable")
              .map((output) => ({
                outputName: output.outputName,
                outputClassName: output.outputClassName,
                thumbnailUrl: output.url,
                src: null,
                hasError: false,
              })),
          }))
          .filter((group) => group.outputs.length > 0);

        setGalleryItems(groups);
        setGalleryMetaLoading(false);
        if (!groups.length) return;
        setGalleryImagesLoading(true);

        const tasks = groups.flatMap((group, groupIndex) =>
          group.outputs.map((output, outputIndex) => ({ groupIndex, outputIndex, url: output.thumbnailUrl as string })),
        );
        await runWithConcurrencyLimit(tasks, CARD_IMAGE_CONCURRENCY, async (task) => {
          const src = await svc.fetchThumbnailImageObjectUrl!(task.url, { signal: controller.signal }).catch(() => null);
          if (cancelled) return;
          setGalleryItems((prev) => prev.map((group, groupIndex) => groupIndex !== task.groupIndex ? group : {
            ...group,
            outputs: group.outputs.map((output, outputIndex) => outputIndex !== task.outputIndex ? output
              : { ...output, src, hasError: !src }),
          }));
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

    async function loadGalleryItems() {
      if (!isInViewport) {
        return;
      }

      if (typeof svc.fetchProjectThumbnails === "function" && typeof svc.fetchThumbnailImageObjectUrl === "function") {
        await loadSignedThumbnails();
        return;
      }

      if (!thumbnailItemsUrl) {
        return;
      }


      setGalleryMetaLoading(true);
      setGalleryError(false);

      try {
        setProjectThumbnailError(false);

        const cacheKey = [
          String(id),
          String(thumbnailItemsUrl ?? ""),
          String(thumbnailVersion ?? ""),
          "size=128",
          "maxProtocols=4",
          "maxOutputsPerProtocol=2",
          "inlineImages=true",
        ].join("|");

        let groups: ProjectThumbnailGroup[] = [];
        const cachedEntry = THUMBNAIL_ITEMS_CACHE.get(cacheKey);

        if (
          cachedEntry &&
          Date.now() - cachedEntry.ts < THUMBNAIL_ITEMS_TTL_MS
        ) {
          groups = cachedEntry.data;
        } else {
          const resolvedItemsUrl = svc.resolveBackendUrl(thumbnailItemsUrl);
          const versionedItemsUrl = resolvedItemsUrl
            ? appendQueryParams(resolvedItemsUrl, {
              v: thumbnailVersion ?? "",
              maxProtocols: 4,
            })
            : thumbnailItemsUrl;

          groups = await svc.fetchProjectThumbnailItems(id, {
            sourceUrl: versionedItemsUrl,
            size: 128,
            maxProtocols: 4,
            maxOutputsPerProtocol: 2,
            inlineImages: true,
            signal: controller.signal,
            cache: "no-store",
          });
        }

        if (cancelled) return;

        if (!groups.length) {
          setGalleryItems([]);
          setGalleryImagesLoading(false);
          setGalleryError(false);
          return;
        }

        THUMBNAIL_ITEMS_CACHE.set(cacheKey, {
          ts: Date.now(),
          data: groups,
        });


        const initialGroups: HydratedProjectThumbnailGroup[] = groups.map((group) => ({
          ...group,
          outputs: (group.outputs || []).map((output) => {
            if (output.thumbnailDataUrl) {
              return {
                ...output,
                src: output.thumbnailDataUrl,
                hasError: false,
              };
            }

            const rawImageUrl = svc.resolveBackendUrl(output.thumbnailUrl);
            const requestUrl = rawImageUrl
              ? appendQueryParams(rawImageUrl, {
                size: 128,
                v: thumbnailVersion ?? "",
              })
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
          group.outputs
            .map((output, outputIndex) => {
              if (output.src || output.thumbnailDataUrl) {
                return null;
              }

              return {
                groupIndex,
                outputIndex,
                requestUrl: output.thumbnailUrl
                  ? appendQueryParams(
                    svc.resolveBackendUrl(output.thumbnailUrl) ?? "",
                    {
                      size: 128,
                      v: thumbnailVersion ?? "",
                    },
                  )
                  : null,
              };
            })
            .filter(Boolean) as Array<{
              groupIndex: number;
              outputIndex: number;
              requestUrl: string | null;
            }>,
        );

        if (!tasks.length) {
          setGalleryImagesLoading(false);
          return;
        }

        await runWithConcurrencyLimit(tasks, 1, async (task) => {
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
  }, [id, isInViewport, thumbnailItemsUrl, svc, thumbnailVersion, fetchThumbnailObjectUrl]);



  const galleryHasImages = useMemo(
    () =>
      galleryItems.some((group) =>
        (group.outputs || []).some((output) => Boolean(output.src)),
      ),
    [galleryItems],
  );

  const galleryHasPendingImages = useMemo(
    () =>
      galleryItems.some((group) =>
        (group.outputs || []).some((output) => !output.src && !output.hasError),
      ),
    [galleryItems],
  );

  const signedThumbnails = typeof svc.fetchProjectThumbnails === "function";

  const shouldPreferProtocolGallery = useMemo(() => {
    if (!thumbnailItemsUrl && !signedThumbnails) return false;
    if (galleryMetaLoading || galleryImagesLoading) return true;
    if (galleryHasImages) return true;
    if (galleryHasPendingImages) return true;
    return false;
  }, [
    thumbnailItemsUrl,
    signedThumbnails,
    galleryMetaLoading,
    galleryImagesLoading,
    galleryHasImages,
    galleryHasPendingImages,
  ]);

  const shouldLoadProjectFallback = useMemo(
    () => Boolean(
      thumbnailUrl &&
      !thumbnailItemsUrl &&
      !signedThumbnails
    ),
    [
      thumbnailUrl,
      thumbnailItemsUrl,
      signedThumbnails,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProjectThumbnailFallback() {
      if (!isInViewport || !shouldLoadProjectFallback || !thumbnailUrl) {
        return;
      }

      setProjectThumbnailLoading(true);
      setProjectThumbnailError(false);

      try {
        const resolvedBaseUrl = svc.resolveBackendUrl(thumbnailUrl);
        const requestUrl = resolvedBaseUrl
          ? appendQueryParams(resolvedBaseUrl, {
            size: 128,
            maxProtocols: 4,
            v: thumbnailVersion ?? "",
          })
          : null;

        if (!requestUrl) {
          throw new Error("Project thumbnail is not available");
        }

        const cachedSrc = getCachedThumbnailObjectUrl(requestUrl);
        if (cachedSrc) {
          if (!cancelled) {
            setProjectThumbnailSrc(cachedSrc);
          }
          return;
        }

        const objectUrl = await svc.fetchBlobObjectUrl(requestUrl, {
          cache: "default",
        });

        if (!cancelled) {
          setCachedThumbnailObjectUrl(requestUrl, objectUrl);
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
  }, [id, isInViewport, shouldLoadProjectFallback, thumbnailUrl, svc, thumbnailVersion]);

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

  const [deleting, setDeleting] = useState(false);

  const confirmRemove = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await svc.deleteProject(String(id));
      toast.success(`Project "${label}" deleted successfully`);
      setShowDeleteModal(false);
      onDelete?.(id);
    } catch (error: any) {
      toast.error(error?.message || "Error deleting project");
    } finally {
      setDeleting(false);
    }
  }, [svc, id, label, onDelete, deleting]);

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
    "relative min-h-[248px] cursor-pointer overflow-hidden rounded-[10px] border outline-none transition-[border-color,box-shadow] duration-200",
    "bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-gray-900",
    isSelected
      ? "border-brand-400 ring-2 ring-brand-500/15 dark:border-brand-600"
      : "border-gray-300 shadow-[0_1px_3px_rgba(15,23,42,0.08)] hover:border-gray-400 hover:shadow-[0_6px_18px_rgba(15,23,42,0.12)] dark:border-gray-700 dark:hover:border-gray-500",
    "focus-visible:ring-2 focus-visible:ring-brand-500/30",
  );


  const showGallery =
    shouldPreferProtocolGallery &&
    (galleryHasImages || galleryHasPendingImages);

  const showProjectFallback =
    Boolean(projectThumbnailSrc) &&
    !thumbnailItemsUrl &&
    !showGallery;

  const showGalleryLoading =
    !showGallery &&
    Boolean(thumbnailItemsUrl) &&
    (galleryMetaLoading || galleryImagesLoading);

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
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-2.5 border-b border-gray-200/90 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/40 md:px-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px]">
                {icon}
              </span>
              <span
                className="min-w-0 truncate text-[15.5px] font-semibold text-gray-900 dark:text-white"
                title={label}
              >
                {newLabel}
              </span>
              <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[13px] font-semibold tabular-nums leading-5 text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/30">
                {projectIdLabel}
              </span>
              {runningCount > 0 ? <RunningDot count={runningCount} /> : null}

              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="hidden items-center rounded-md border border-gray-300/80 bg-white px-2 py-0.5 text-[13px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 sm:inline-flex">
                  {accessLabel}
                </span>
                {showGuestBadge ? (
                  <span className="rounded-md border border-sky-300/80 bg-sky-50 px-2 py-0.5 text-[13px] font-medium text-sky-800 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200">
                    Guest
                  </span>
                ) : null}
                {statusLabel ? (
                  <span
                    className={classNames(
                      "rounded-md border px-2 py-0.5 text-[13px] font-medium",
                      getStatusToneClasses(statusLabel),
                    )}
                  >
                    {statusLabel}
                  </span>
                ) : null}
                {onTogglePin ? (
                  <button
                    type="button"
                    aria-label={isPinned ? `Unpin ${label}` : `Pin ${label}`}
                    aria-pressed={isPinned}
                    title={isPinned ? "Unpin" : "Pin to the top"}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onTogglePin();
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                    className={classNames(
                      "flex h-8 w-8 items-center justify-center rounded-[10px] transition",
                      isPinned
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"
                        : "text-gray-400 hover:bg-amber-50 hover:text-amber-500 dark:text-gray-500 dark:hover:bg-amber-500/10",
                    )}
                  >
                    <Pin className={classNames("h-4 w-4", isPinned ? "fill-current" : "")} />
                  </button>
                ) : null}
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

            <div className="px-4 pt-3 md:px-5">
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-950">
                <div className="relative h-[268px] w-full">
                  {showGalleryLoading ? (
                    <div className="h-full overflow-hidden px-2.5 py-2.5">
                      <div className="flex h-full min-w-max items-stretch gap-2.5">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div
                            key={index}
                            className={classNames(
                              "h-full w-[284px] shrink-0 overflow-hidden rounded-[18px] border",
                              "border-slate-200/80 bg-white/95",
                              "dark:border-gray-800 dark:bg-gray-950/90",
                            )}
                          >
                            <div className="h-[34px] border-b border-slate-200/80 bg-slate-50 dark:border-gray-800 dark:bg-gray-900" />
                            <div className="h-[calc(100%-34px)] animate-pulse bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : showGallery ? (
                    <>
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-8 bg-gradient-to-r from-gray-100 via-gray-100/90 to-transparent dark:from-gray-950 dark:via-gray-950/90 dark:to-transparent" />
                      <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-8 bg-gradient-to-l from-gray-100 via-gray-100/90 to-transparent dark:from-gray-950 dark:via-gray-950/90 dark:to-transparent" />

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
                                    "grid h-full grid-rows-[auto,1fr,auto] overflow-hidden rounded-lg border transition",
                                    "border-gray-300 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.10)]",
                                    "dark:border-gray-600 dark:bg-gray-800/80 dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
                                    "group-hover:border-gray-400 dark:group-hover:border-gray-500",
                                  )}
                                >
                                  <div
                                    className={classNames(
                                      "flex items-center justify-between gap-2 border-b px-3 py-1.5",
                                      "border-gray-200 bg-gray-50",
                                      "dark:border-gray-700 dark:bg-gray-900/70",
                                    )}
                                  >
                                    <div className="truncate text-[13px] font-medium text-gray-800 dark:text-slate-200">
                                      {group.label ?? `Protocol ${String(group.protocolId)}`}
                                    </div>
                                  </div>

                                  <div className="min-h-0 p-2">
                                    <div className="flex h-full items-stretch gap-2">
                                      {outputs.map((output, index) => (
                                        <div
                                          key={`${String(group.protocolId)}-${output.outputName ?? index}`}
                                          className={classNames(
                                            "min-w-0 flex-1 overflow-hidden rounded-md border",
                                            "border-gray-200 bg-gray-50",
                                            "dark:border-gray-800 dark:bg-gray-900",
                                          )}
                                          title={output.outputName ?? output.outputClassName ?? "Output"}
                                        >
                                          {output.src ? (
                                            <FadeInImage
                                              src={output.src}
                                              alt={output.outputName ?? output.outputClassName ?? "Output"}
                                            />
                                          ) : (
                                            <div className="h-full w-full animate-pulse bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800" />
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div
                                    className={classNames(
                                      "border-t px-3 py-1.5",
                                      "border-gray-200 bg-white",
                                      "dark:border-gray-700 dark:bg-transparent",
                                    )}
                                  >

                                    {group.status ? (
                                      <span
                                        className={classNames(
                                          "inline-flex max-w-[110px] items-center truncate rounded-md border px-2 py-0.5 text-[13px]",
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
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-8 bg-gradient-to-r from-slate-50 via-slate-50/90 to-transparent dark:from-gray-900 dark:via-gray-900/90 dark:to-transparent" />
                      <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-8 bg-gradient-to-l from-slate-50 via-slate-50/90 to-transparent dark:from-gray-900 dark:via-gray-900/90 dark:to-transparent" />

                      <div className="h-full overflow-x-auto overflow-y-hidden px-2.5 py-2.5 [scrollbar-width:thin]">
                        <div className="flex h-full min-w-max items-stretch">
                          <div
                            className={classNames(
                              "h-full overflow-hidden rounded-[18px] border",
                              "border-slate-200/90 bg-white/95 shadow-[0_10px_28px_rgba(15,23,42,0.08)]",
                              "dark:border-gray-800 dark:bg-gray-950/95 dark:shadow-[0_12px_28px_rgba(0,0,0,0.24)]",
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

            <div className="mt-auto px-4 pb-3 pt-3 md:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1.5" title="Protocols">
                    <Layers3 className="h-4 w-4" />
                    <span className="font-medium tabular-nums text-gray-800 dark:text-gray-200">{protocolsText}</span>
                  </span>
                  {updatedAt || createdAt ? (
                    <span
                      className="inline-flex items-center gap-1.5"
                      title={`${updatedAt ? "Updated" : "Created"} ${formatFullDate(updatedAt || createdAt)}`}
                    >
                      <CalendarIcon className="h-4 w-4" />
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {formatRelativeDate(updatedAt || createdAt)}
                      </span>
                    </span>
                  ) : null}
                  {diskUsage ? (
                    <span className="inline-flex items-center gap-1.5" title="Disk used">
                      <StorageIcon className="h-4 w-4" />
                      <span className="font-medium text-gray-800 dark:text-gray-200">{diskUsage}</span>
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
                  className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-brand-500 px-3.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-brand-600"
                >
                  <OpenFolderIcon className="h-4 w-4" />
                  Open project
                </button>
              </div>
            </div>
          </div>

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
              className="fixed w-48 overflow-hidden rounded-xl border border-gray-300/90 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
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
                  "cursor-pointer transition hover:bg-gray-50 focus:bg-gray-100 dark:hover:bg-gray-800/70 dark:focus:bg-slate-800/70";
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

      <RenameProjectDialog open={isRenaming} name={newLabel} description={newDescription} error={errorMessage}
                           onName={setNewLabel} onDescription={setNewDescription}
                           onSave={() => void handleRenameSubmit()} onClose={() => setIsRenaming(false)} />

      <DeleteProjectDialog open={showDeleteModal} name={label} protocols={value} diskUsage={diskUsage}
                           statusCounts={statusCounts} busy={deleting} onConfirm={() => void confirmRemove()}
                           onClose={() => !deleting && setShowDeleteModal(false)} />
    </>
  );
}