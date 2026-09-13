import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type UIEventHandler } from "react";
import type { MetadataRow, MetadataTableSchema } from "@/api/projects";
import { useProjectService } from "@/ProjectServiceContext";

const PAGE_SIZE = 80;
const MAX_CACHED_PAGES = 8;
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

  const cache = useMemo(
    () => new Map<number, { rows: MetadataRow[]; offset: number }>(),
    [
      projectId,
      protocolId,
      outputName,
      selectedTable,
      schema,
      sortBy,
      sortAsc,
      totalRows,
      revision,
    ],
  );

  const [cacheVersion, setCacheVersion] = useState(0);

  const [failure, setFailure] = useState<{
    cache: typeof cache;
    pageOffsets: number[];
    message: string;
  } | null>(null);

  const inFlightRequestsRef = useRef<
    Array<{
      controller: AbortController;
      pageOffsets: number[];
    }>
  >([]);

  const frameRef = useRef<number | null>(null);
  const active = viewMode === "gallery" && !!schema && !!selectedTable && totalRows > 0;
  const layout = useMemo(() => getGalleryLayout(totalRows, viewport.width, viewport.height, imageThumbSize, viewport.top), [totalRows, viewport, imageThumbSize]);
  useEffect(() => {
    return () => {
      for (const request of inFlightRequestsRef.current) {
        request.controller.abort();
      }

      inFlightRequestsRef.current = [];
    };
  }, [cache]);

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

  const requiredPageOffsets = useMemo(() => {
    if (!active || layout.end <= layout.start) {
      return [];
    }

    const firstPageOffset =
      Math.floor(layout.start / PAGE_SIZE) * PAGE_SIZE;

    const offsets: number[] = [];

    for (
      let pageOffset = firstPageOffset;
      pageOffset < layout.end;
      pageOffset += PAGE_SIZE
    ) {
      offsets.push(pageOffset);
    }

    return offsets;
  }, [active, layout.start, layout.end]);

  const galleryData = useMemo(() => {
    let bestRun: number[] = [];
    let currentRun: number[] = [];

    for (const pageOffset of requiredPageOffsets) {
      if (!cache.has(pageOffset)) {
        currentRun = [];
        continue;
      }

      const previousOffset =
        currentRun.length > 0
          ? currentRun[currentRun.length - 1]
          : null;

      if (
        previousOffset == null ||
        pageOffset === previousOffset + PAGE_SIZE
      ) {
        currentRun.push(pageOffset);
      } else {
        currentRun = [pageOffset];
      }

      if (currentRun.length > bestRun.length) {
        bestRun = [...currentRun];
      }
    }

    if (bestRun.length === 0) {
      return {
        rows: [] as MetadataRow[],
        offset: requiredPageOffsets[0] ?? 0,
      };
    }

    const rows = bestRun.flatMap(
      (pageOffset) => cache.get(pageOffset)?.rows ?? [],
    );

    return {
      rows,
      offset: bestRun[0],
    };
  }, [cache, cacheVersion, requiredPageOffsets]);

  const error =
    failure?.cache === cache &&
      failure.pageOffsets.some((pageOffset) =>
        requiredPageOffsets.includes(pageOffset),
      )
      ? failure.message
      : null;

  useEffect(() => {
    if (!active || requiredPageOffsets.length === 0) {
      return;
    }

    const requiredSet = new Set(requiredPageOffsets);

    // Keep recently used cached pages at the end of the Map
    // so eviction behaves as a small LRU cache.
    for (const pageOffset of requiredPageOffsets) {
      const page = cache.get(pageOffset);

      if (!page) continue;

      cache.delete(pageOffset);
      cache.set(pageOffset, page);
    }

    // Abort only requests that no longer overlap the current gallery view.
    inFlightRequestsRef.current =
      inFlightRequestsRef.current.filter((request) => {
        const stillNeeded = request.pageOffsets.some((pageOffset) =>
          requiredSet.has(pageOffset),
        );

        if (!stillNeeded) {
          request.controller.abort();
        }

        return stillNeeded;
      });

    const inFlightOffsets = new Set(
      inFlightRequestsRef.current.flatMap(
        (request) => request.pageOffsets,
      ),
    );

    const missingPageOffsets = requiredPageOffsets.filter(
      (pageOffset) =>
        !cache.has(pageOffset) &&
        !inFlightOffsets.has(pageOffset),
    );

    if (missingPageOffsets.length === 0) {
      return;
    }

    const groups: Array<{
      offset: number;
      limit: number;
      pageOffsets: number[];
    }> = [];

    for (const pageOffset of missingPageOffsets) {
      const lastGroup =
        groups.length > 0
          ? groups[groups.length - 1]
          : null;

      const previousPageOffset =
        lastGroup && lastGroup.pageOffsets.length > 0
          ? lastGroup.pageOffsets[
          lastGroup.pageOffsets.length - 1
          ]
          : null;

      if (
        lastGroup &&
        previousPageOffset != null &&
        pageOffset === previousPageOffset + PAGE_SIZE
      ) {
        lastGroup.pageOffsets.push(pageOffset);

        lastGroup.limit =
          Math.min(
            totalRows,
            pageOffset + PAGE_SIZE,
          ) - lastGroup.offset;
      } else {
        groups.push({
          offset: pageOffset,
          limit: Math.min(
            PAGE_SIZE,
            totalRows - pageOffset,
          ),
          pageOffsets: [pageOffset],
        });
      }
    }

    const timer = setTimeout(() => {
      for (const group of groups) {
        const controller = new AbortController();

        const request = {
          controller,
          pageOffsets: group.pageOffsets,
        };

        inFlightRequestsRef.current.push(request);

        void (async () => {
          try {
            const response =
              await serviceRef.current.fetchMetadataTableWindow(
                projectId,
                protocolId,
                outputName,
                selectedTable,
                {
                  offset: group.offset,
                  limit: group.limit,
                  selectionOnly: false,
                  sortBy: sortBy ?? undefined,
                  asc: sortBy ? sortAsc : undefined,
                  signal: controller.signal,
                },
              );

            if (controller.signal.aborted) {
              return;
            }

            const parsed = Array.isArray(response)
              ? {
                rows: response,
                offset: group.offset,
              }
              : {
                rows: Array.isArray(response.rows)
                  ? response.rows
                  : [],
                offset:
                  typeof response.offset === "number"
                    ? response.offset
                    : group.offset,
              };

            const responseOffset = parsed.offset;

            let addedPage = false;

            for (const pageOffset of group.pageOffsets) {
              const relativeStart =
                pageOffset - responseOffset;

              if (relativeStart < 0) {
                continue;
              }

              const pageRows = parsed.rows.slice(
                relativeStart,
                relativeStart + PAGE_SIZE,
              );

              if (pageRows.length === 0) {
                continue;
              }

              cache.delete(pageOffset);

              cache.set(pageOffset, {
                rows: pageRows,
                offset: pageOffset,
              });

              addedPage = true;
            }

            if (!addedPage) {
              throw new Error(
                "Gallery page response did not contain requested rows",
              );
            }

            while (cache.size > MAX_CACHED_PAGES) {
              const oldestPageOffset =
                cache.keys().next().value as
                | number
                | undefined;

              if (oldestPageOffset == null) {
                break;
              }

              cache.delete(oldestPageOffset);
            }

            setFailure((current) => {
              if (
                current?.cache !== cache ||
                !current.pageOffsets.some((pageOffset) =>
                  group.pageOffsets.includes(pageOffset),
                )
              ) {
                return current;
              }

              return null;
            });

            setCacheVersion((value) => value + 1);
          } catch (requestError) {
            if (!controller.signal.aborted) {
              setFailure({
                cache,
                pageOffsets: group.pageOffsets,
                message:
                  requestError instanceof Error
                    ? requestError.message
                    : "Failed to load gallery",
              });
            }
          } finally {
            inFlightRequestsRef.current =
              inFlightRequestsRef.current.filter(
                (item) => item !== request,
              );
          }
        })();
      }
    }, 60);

    return () => {
      clearTimeout(timer);
    };
  }, [
    active,
    cache,
    cacheVersion,
    requiredPageOffsets,
    projectId,
    protocolId,
    outputName,
    selectedTable,
    sortBy,
    sortAsc,
    totalRows,
  ]);

  const invalidateGalleryState = useCallback(() => setRevision(value => value + 1), []);
  return {
    galleryRows: galleryData.rows,
    galleryBaseOffset: galleryData.offset,

    galleryLoading:
      active &&
      requiredPageOffsets.some(
        (pageOffset) => !cache.has(pageOffset),
      ) &&
      !error,

    galleryError: error,
    galleryLayout: layout,
    handleGalleryScroll,
    invalidateGalleryState,
    jumpToGalleryIndex,
  };
}
