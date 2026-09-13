import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type UIEventHandler } from "react";
import type { MetadataRow, MetadataTableSchema } from "@/api/projects";
import { useProjectService } from "@/ProjectServiceContext";

const PAGE_SIZE = 80;
const MAX_CACHED_WINDOWS = 8;
const MAX_SCROLL_HEIGHT = 16_000_000;

export function getGalleryLayout(total: number, width: number, height: number, thumbnailSize: number, scrollTop: number) {
  const cardWidth = thumbnailSize + 12;
  const columnGap = 8;
  const rowGap = 4;
  const availableWidth = Math.max(1, width - 16);
  const columns = Math.max(
    1,
    Math.floor((availableWidth + columnGap) / (cardWidth + columnGap)),
  );
  const columnStride = cardWidth + columnGap;
  const contentWidth =
    columns * cardWidth +
    Math.max(0, columns - 1) * columnGap;

  const leftInset = Math.max(
    8,
    (width - contentWidth) / 2,
  );

  const cardHeight = thumbnailSize + 38;
  // Cap the DOM height; card positions compensate for the compressed scrollbar.
  const logicalHeight = Math.ceil(total / columns) * cardHeight + 16;
  const scrollHeight = Math.min(MAX_SCROLL_HEIGHT, logicalHeight);
  const maxScroll = Math.max(0, scrollHeight - height);
  const physicalTop = Math.max(0, Math.min(scrollTop, maxScroll));
  const logicalTop = maxScroll > 0 ? physicalTop * Math.max(0, logicalHeight - height) / maxScroll : 0;
  const firstRow = Math.max(0, Math.floor(logicalTop / cardHeight));
  const start = Math.min(total, Math.max(0, firstRow - 2) * columns);
  const end = Math.min(total, (Math.ceil((logicalTop + height) / cardHeight) + 2) * columns);
  return {
    columns,
    cardWidth,
    cardHeight,
    columnGap,
    columnStride,
    rowGap,
    leftInset,
    scrollHeight,
    logicalHeight,
    logicalTop,
    physicalTop,
    start,
    end,
    height,
  };
}

type GalleryParams = {
  projectId: number;
  protocolId: number;
  outputName: string;
  selectedTable: string;
  schema: MetadataTableSchema | null;
  totalRows: number;
  viewMode: "table" | "gallery";
  sortBy: string | null;
  sortAsc: boolean;
  anchorRowIndex: number | null;
  imageThumbSize: number;
  galleryScrollRef: MutableRefObject<HTMLDivElement | null>;
};

export function useMetadataGalleryRows(params: GalleryParams) {
  const { projectId, protocolId, outputName, selectedTable, schema, totalRows, viewMode, sortBy, sortAsc, anchorRowIndex, imageThumbSize, galleryScrollRef } = params;
  const service = useProjectService();
  const serviceRef = useRef(service);
  serviceRef.current = service;
  const [viewport, setViewport] = useState({ width: 840, height: 600, top: 0 });
  const [revision, setRevision] = useState(0);
  const cache = useMemo(() => new Map<string, { rows: MetadataRow[]; offset: number }>(), [projectId, protocolId, outputName, selectedTable, schema, sortBy, sortAsc, totalRows, revision]);
  const [result, setResult] = useState<{ cache: typeof cache; key: string; rows: MetadataRow[]; offset: number } | null>(null);
  const [failure, setFailure] = useState<{ cache: typeof cache; key: string; message: string } | null>(null);
  const frameRef = useRef<number | null>(null);
  const active = viewMode === "gallery" && !!schema && !!selectedTable && totalRows > 0;
  const layout = useMemo(() => getGalleryLayout(totalRows, viewport.width, viewport.height, imageThumbSize, viewport.top), [totalRows, viewport, imageThumbSize]);

  const measure = useCallback(() => {
    const host = galleryScrollRef.current;
    if (!host) return;
    setViewport(previous => {
      const next = { width: host.clientWidth || previous.width, height: host.clientHeight || previous.height, top: host.scrollTop };
      return previous.width === next.width && previous.height === next.height && previous.top === next.top ? previous : next;
    });
  }, [galleryScrollRef]);

  const handleGalleryScroll = useCallback<UIEventHandler<HTMLDivElement>>(() => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => { frameRef.current = null; measure(); });
  }, [measure]);

  const jumpToGalleryIndex = useCallback((index: number) => {
    const host = galleryScrollRef.current;
    if (!host) return;
    const current = getGalleryLayout(totalRows, host.clientWidth || viewport.width, host.clientHeight || viewport.height, imageThumbSize, host.scrollTop);
    const row = Math.floor(Math.max(0, Math.min(index, totalRows - 1)) / current.columns);
    const logicalTarget = Math.max(0, row * current.cardHeight - Math.max(0, (current.height - current.cardHeight) / 2));
    const maxLogicalScroll = Math.max(1, current.logicalHeight - current.height);
    host.scrollTop = Math.min(1, logicalTarget / maxLogicalScroll) * Math.max(0, current.scrollHeight - current.height);
    measure();
  }, [galleryScrollRef, totalRows, imageThumbSize, viewport.width, viewport.height, measure]);

  useEffect(() => {
    if (!active) return;
    measure();
    const host = galleryScrollRef.current;
    if (!host) return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => {
      observer.disconnect();
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [active, galleryScrollRef, measure]);

  const jumpRef = useRef(jumpToGalleryIndex);
  jumpRef.current = jumpToGalleryIndex;
  useEffect(() => {
    if (active) jumpRef.current(anchorRowIndex ?? 0);
  }, [active, projectId, protocolId, outputName, selectedTable, schema, sortBy, sortAsc, totalRows, anchorRowIndex, imageThumbSize]);

  const offset = Math.floor(layout.start / PAGE_SIZE) * PAGE_SIZE;
  const limit = Math.min(Math.max(PAGE_SIZE, Math.ceil((layout.end - offset) / PAGE_SIZE) * PAGE_SIZE), Math.max(0, totalRows - offset));
  const key = `${offset}:${limit}`;
  const cached = cache.get(key);
  const current = result?.cache === cache && result.key === key ? result : cached;
  const error = failure?.cache === cache && failure.key === key ? failure.message : null;

  useEffect(() => {
    if (!active || limit <= 0) return;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      setResult({ ...hit, cache, key });
      return;
    }
    const controller = new AbortController();
    // Coalesce scrollbar movement before starting image/metadata work.
    const timer = setTimeout(async () => {
      try {
        const response = await serviceRef.current.fetchMetadataTableWindow(projectId, protocolId, outputName, selectedTable, { offset, limit, selectionOnly: false, sortBy: sortBy ?? undefined, asc: sortBy ? sortAsc : undefined, signal: controller.signal });
        if (controller.signal.aborted) return;
        const rows = Array.isArray(response) ? response : response.rows ?? [];
        const entry = { rows, offset: Array.isArray(response) ? offset : response.offset ?? offset };
        cache.set(key, entry);
        while (cache.size > MAX_CACHED_WINDOWS) cache.delete(cache.keys().next().value!);
        setResult({ ...entry, cache, key });
        setFailure(null);
      } catch (error) {
        if (!controller.signal.aborted) setFailure({ cache, key, message: error instanceof Error ? error.message : "Failed to load gallery" });
      }
    }, 60);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, cache, key, offset, limit, projectId, protocolId, outputName, selectedTable, sortBy, sortAsc]);

  const invalidateGalleryState = useCallback(() => setRevision(value => value + 1), []);
  return {
    galleryRows: current?.rows ?? [],
    galleryBaseOffset: current?.offset ?? offset,
    galleryLoading: active && !current && !error,
    galleryError: error,
    galleryLayout: layout,
    handleGalleryScroll,
    invalidateGalleryState,
    jumpToGalleryIndex,
  };
}
