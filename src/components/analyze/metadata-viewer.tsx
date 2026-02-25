// src/components/analyze/metadata-viewer.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type UIEventHandler,
} from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  Menu,
  MenuItem,
  ListItemText,
  Divider,
  Paper,
  Select,
  type SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Tooltip,
  IconButton,
} from "@mui/material";
import {
  LayoutGrid,
  TableIcon,
  Check,
  ColumnsSettingsIcon,
  ChevronRight,
} from "lucide-react";
import type {
  MetadataCell,
  MetadataColumn,
  MetadataRow,
  MetadataTableInfo,
  MetadataTableSchema,
} from "@/api/projects";
import { CloseIcon } from "@/icons";
import { useProjectService } from "@/ProjectServiceContext";

type MetadataViewerProps = {
  projectId: number;
  protocolId: number;
  outputName: string;
};

type ViewMode = "table" | "gallery";

type SelectedImageCell = {
  rowIndexInTable: number;
  columnName: string;
};

type MetadataColumnWithVisibility = MetadataColumn & {
  visible?: boolean;
};

type ColumnSettings = {
  visible: boolean;
  renderAsImage: boolean;
};

type ImageCacheEntry = {
  url: string;
  revoke: () => void;
};

type MetadataWindowResponse = MetadataRow[] | { rows?: MetadataRow[]; offset?: number };

type ImageJobResult = { url: string; revoke: () => void };

interface ImageJob {
  run: () => Promise<ImageJobResult>;
  onSuccess: (result: ImageJobResult) => void;
  onError: (error: unknown) => void;
  isCancelled: () => boolean;
}

type IndexRange = {
  start: number;
  end: number;
};

type RowSelectionState = {
  /**
   * baseMode="none": ranges are selected ranges
   * baseMode="all": ranges are excluded ranges
   */
  baseMode: "none" | "all";
  ranges: IndexRange[];
  anchorIndex: number | null;
};

type TableContextMenuState = {
  mouseX: number;
  mouseY: number;
  rowIndex: number;
} | null;

type MetadataImageCellProps = {
  projectId: number;
  protocolId: number;
  outputName: string;
  tableName: string;
  rowIndexInTable: number;
  columnName: string;
  cell: { kind: "image"; path: string };
  size: number;
  isSelected?: boolean;
  onClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  imageCacheRef: MutableRefObject<Map<string, ImageCacheEntry>>;
};

type MetadataTablePanelProps = {
  viewMode: ViewMode;
  schema: MetadataTableSchema | null;
  totalRows: number;
  visibleColumns: MetadataColumnWithVisibility[];
  columnSettings: Record<string, ColumnSettings>;
  rowHeight: number;
  rowSizeForScroll: number;
  tableMinWidth?: number;
  windowRows: MetadataRow[];
  windowOffset: number;
  windowLoading: boolean;
  windowError: string | null;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  hasData: boolean;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  handleScroll: UIEventHandler<HTMLDivElement>;
  isRowSelected: (rowIndex: number) => boolean;
  onPrimaryRowClick: (rowIndex: number, event: ReactMouseEvent<Element>) => void;
  onRowContextMenu: (rowIndex: number, event: ReactMouseEvent<Element>) => void;
  selectedRowIndex: number | null;
  selectedImageCell: SelectedImageCell | null;
  setSelectedRowIndex: (value: number | null) => void;
  setSelectedImageCell: (value: SelectedImageCell | null) => void;
  projectId: number;
  protocolId: number;
  outputName: string;
  selectedTable: string;
  imageCacheRef: MutableRefObject<Map<string, ImageCacheEntry>>;
};

type MetadataGalleryPanelProps = {
  viewMode: ViewMode;
  firstImageColumn: MetadataColumnWithVisibility | null;
  galleryRows: MetadataRow[];
  galleryLoading: boolean;
  galleryError: string | null;
  galleryScrollRef: MutableRefObject<HTMLDivElement | null>;
  handleGalleryScroll: UIEventHandler<HTMLDivElement>;
  isRowSelected: (rowIndex: number) => boolean;
  onPrimaryRowClick: (rowIndex: number, event: ReactMouseEvent<Element>) => void;
  selectedImageCell: SelectedImageCell | null;
  setSelectedRowIndex: (value: number | null) => void;
  setSelectedImageCell: (value: SelectedImageCell | null) => void;
  projectId: number;
  protocolId: number;
  outputName: string;
  selectedTable: string;
  imageCacheRef: MutableRefObject<Map<string, ImageCacheEntry>>;
  showSizeLabel: boolean;
  sizeColumn: MetadataColumnWithVisibility | null;
};

type ColumnsDialogProps = {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  allColumns: MetadataColumnWithVisibility[];
  columnSettings: Record<string, ColumnSettings>;
  draftColumnSettings: Record<string, ColumnSettings> | null;
  updateDraftColumnSettings: (colName: string, partial: Partial<ColumnSettings>) => void;
};

/* ======================= Constants ======================= */

const BASE_THUMB_SIZE = 160;
const NORMAL_ROW_HEIGHT = 32;
const IMAGE_ROW_HEIGHT = BASE_THUMB_SIZE + 16;
const EXTRA_BUFFER_ROWS = 10;

const MAX_VIRTUAL_SCROLL_HEIGHT = 30_000_000;

const ROW_INDEX_COL_WIDTH = 52;
const MIN_TEXT_COL_WIDTH = 140;
const IMAGE_COL_MIN_WIDTH = BASE_THUMB_SIZE + 24;

const GALLERY_PAGE_SIZE = 120;

const MAX_CONCURRENT_IMAGE_REQUESTS = 4;
const MAX_IMAGE_CACHE_ENTRIES = 400;

const HEADER_BG = "#f3f4f6";

const DIALOG_HEADER_BG = "#e5e7eb";
const DIALOG_ROW_ODD_BG = "#f9fafb";
const DIALOG_ROW_EVEN_BG = "#ffffff";

const baseCellSx = {
  padding: "4px 8px",
  whiteSpace: "nowrap" as const,
  textOverflow: "ellipsis" as const,
  overflow: "hidden" as const,
  borderBottom: "1px solid rgba(148,163,184,0.25)",
  fontSize: "0.75rem",
  lineHeight: 1.4,
};

const headerCellSx = {
  ...baseCellSx,
  fontWeight: 600,
  background: HEADER_BG,
  color: "#0f172a",
  position: "sticky" as const,
  top: 0,
  zIndex: 1,
};

const headerColumnDialogSx = {
  px: 2,
  py: 1.25,
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  background: "linear-gradient(180deg, #0b1220 0%, #0a0f1e 100%)",
  color: "#e5e7eb",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const closeBtnSx = {
  ml: "auto",
  color: "#e5e7eb",
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.06)",
  "&:hover": {
    background: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.28)",
  },
};

/* ======================= Global image queue ======================= */

const imageJobQueue: ImageJob[] = [];
let activeImageJobs = 0;

function scheduleNextImageJob() {
  if (activeImageJobs >= MAX_CONCURRENT_IMAGE_REQUESTS) {
    return;
  }

  const job = imageJobQueue.shift();
  if (!job) return;

  if (job.isCancelled()) {
    scheduleNextImageJob();
    return;
  }

  activeImageJobs += 1;

  void (async () => {
    try {
      const result = await job.run();

      if (!job.isCancelled()) {
        job.onSuccess(result);
      } else {
        result.revoke();
      }
    } catch (error) {
      if (!job.isCancelled()) {
        job.onError(error);
      }
    } finally {
      activeImageJobs -= 1;
      scheduleNextImageJob();
    }
  })();
}

function enqueueImageJob(job: ImageJob) {
  imageJobQueue.push(job);
  scheduleNextImageJob();
}

/* ======================= Generic helpers ======================= */

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallbackMessage;
}

function parseWindowResponse(response: MetadataWindowResponse): {
  rows: MetadataRow[];
  offset?: number;
} {
  if (Array.isArray(response)) {
    return { rows: response };
  }

  return {
    rows: Array.isArray(response.rows) ? response.rows : [],
    offset: typeof response.offset === "number" ? response.offset : undefined,
  };
}

function formatCellValue(value: MetadataCell): ReactNode {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;

  if (typeof value === "object" && "kind" in value) {
    if ((value as { kind?: string }).kind === "matrix") {
      const matrixValue = (value as { value?: unknown }).value;
      if (Array.isArray(matrixValue) && matrixValue.length > 0 && Array.isArray(matrixValue[0])) {
        return `matrix ${matrixValue.length}×${matrixValue[0].length}`;
      }
      return "matrix";
    }

    if ((value as { kind?: string }).kind === "image") {
      return "[image]";
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/* ======================= Selection helpers ======================= */

function clampIndex(value: number, minValue: number, maxValue: number): number {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function normalizeRange(start: number, end: number): IndexRange {
  return start <= end ? { start, end } : { start: end, end: start };
}

function mergeRanges(ranges: IndexRange[]): IndexRange[] {
  if (!ranges.length) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: IndexRange[] = [{ ...sorted[0] }];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];

    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function addRangeToRanges(ranges: IndexRange[], nextRange: IndexRange): IndexRange[] {
  return mergeRanges([...ranges, nextRange]);
}

function isIndexInRanges(ranges: IndexRange[], index: number): boolean {
  for (const range of ranges) {
    if (index < range.start) return false;
    if (index <= range.end) return true;
  }
  return false;
}

function toggleSingleIndexInRanges(ranges: IndexRange[], index: number): IndexRange[] {
  const next: IndexRange[] = [];

  for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) {
    const range = ranges[rangeIndex];

    if (index < range.start || index > range.end) {
      next.push({ ...range });
      continue;
    }

    if (range.start === range.end && range.start === index) {
      // Remove exact single range
    } else if (index === range.start) {
      next.push({ start: range.start + 1, end: range.end });
    } else if (index === range.end) {
      next.push({ start: range.start, end: range.end - 1 });
    } else {
      next.push({ start: range.start, end: index - 1 });
      next.push({ start: index + 1, end: range.end });
    }

    for (let tailIndex = rangeIndex + 1; tailIndex < ranges.length; tailIndex += 1) {
      next.push({ ...ranges[tailIndex] });
    }

    return next;
  }

  return addRangeToRanges(next, { start: index, end: index });
}

function countIndicesInRanges(ranges: IndexRange[]): number {
  let total = 0;
  for (const range of ranges) {
    total += range.end - range.start + 1;
  }
  return total;
}

function isRowIndexSelected(selectionState: RowSelectionState, rowIndex: number): boolean {
  const inRanges = isIndexInRanges(selectionState.ranges, rowIndex);
  return selectionState.baseMode === "all" ? !inRanges : inRanges;
}

function getSelectionCount(selectionState: RowSelectionState, totalRows: number): number {
  const covered = countIndicesInRanges(selectionState.ranges);
  if (selectionState.baseMode === "all") {
    return Math.max(0, totalRows - covered);
  }
  return covered;
}

function createEmptySelectionState(): RowSelectionState {
  return {
    baseMode: "none",
    ranges: [],
    anchorIndex: null,
  };
}

/* ======================= Cache helpers ======================= */

function getImageCacheEntry(
  cache: Map<string, ImageCacheEntry>,
  key: string,
): ImageCacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;

  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function setImageCacheEntry(
  cache: Map<string, ImageCacheEntry>,
  key: string,
  entry: ImageCacheEntry,
) {
  const existing = cache.get(key);
  if (existing && existing !== entry) {
    existing.revoke();
  }

  cache.delete(key);
  cache.set(key, entry);

  while (cache.size > MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;

    const oldestEntry = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (oldestEntry) {
      oldestEntry.revoke();
    }
  }
}

/* ======================= Shared hooks ======================= */

function useIsMountedRef() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}

function useElementSize<T extends Element>(ref: { current: T | null }) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ width: rect.width, height: rect.height });
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [ref]);

  return size;
}

function useImageCache() {
  const imageCacheRef = useRef<Map<string, ImageCacheEntry>>(new Map());

  const clearImageCache = useCallback(() => {
    for (const [, entry] of imageCacheRef.current) {
      entry.revoke();
    }
    imageCacheRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      clearImageCache();
    };
  }, [clearImageCache]);

  return { imageCacheRef, clearImageCache };
}

/* ======================= Data hooks ======================= */

function useMetadataTables(
  projectId: number,
  protocolId: number,
  outputName: string,
  isMountedRef: MutableRefObject<boolean>,
) {
  const [tables, setTables] = useState<MetadataTableInfo[] | null>(null);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | "">("");
  const svc = useProjectService();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setTablesLoading(true);
        setTablesError(null);

        const list = await svc.fetchOutputMetadataTables(projectId, protocolId, outputName);
        if (cancelled || !isMountedRef.current) return;

        const safeList = list || [];
        setTables(safeList);

        setSelectedTable((prev) => {
          if (!safeList.length) return "";
          if (prev && safeList.some((table) => table.name === prev)) return prev;
          return safeList[0].name;
        });
      } catch (error) {
        if (cancelled || !isMountedRef.current) return;

        setTables([]);
        setTablesError(getErrorMessage(error, "Failed to load metadata tables"));
        setSelectedTable("");
      } finally {
        if (!cancelled && isMountedRef.current) {
          setTablesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, protocolId, outputName, isMountedRef]);

  return {
    tables,
    tablesLoading,
    tablesError,
    selectedTable,
    setSelectedTable,
  };
}

function useMetadataSchema(
  projectId: number,
  protocolId: number,
  outputName: string,
  selectedTable: string,
  isMountedRef: MutableRefObject<boolean>,
) {
  const [schema, setSchema] = useState<MetadataTableSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const svc = useProjectService();

  useEffect(() => {
    if (!selectedTable) {
      setSchema(null);
      setSchemaLoading(false);
      setSchemaError(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setSchemaLoading(true);
        setSchemaError(null);

        const nextSchema = await svc.fetchMetadataTableSchema(
          projectId,
          protocolId,
          outputName,
          selectedTable,
        );

        if (cancelled || !isMountedRef.current) return;
        setSchema(nextSchema);
      } catch (error) {
        if (cancelled || !isMountedRef.current) return;

        setSchema(null);
        setSchemaError(getErrorMessage(error, "Failed to load metadata schema"));
      } finally {
        if (!cancelled && isMountedRef.current) {
          setSchemaLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, protocolId, outputName, selectedTable, isMountedRef]);

  return {
    schema,
    setSchema,
    schemaLoading,
    schemaError,
    setSchemaError,
  };
}

function useColumnSettings(schema: MetadataTableSchema | null, selectedTable: string) {
  const [columnSettings, setColumnSettings] = useState<Record<string, ColumnSettings>>({});

  useEffect(() => {
    if (!schema) {
      setColumnSettings({});
      return;
    }

    setColumnSettings((prev) => {
      const next: Record<string, ColumnSettings> = {};
      const columns = (schema.columns ?? []) as MetadataColumnWithVisibility[];

      for (const column of columns) {
        const previousEntry = prev[column.name];
        const defaultVisible = column.visible !== false;
        const defaultRenderAsImage = column.rendererType === "image";

        next[column.name] = {
          visible: previousEntry?.visible ?? defaultVisible,
          renderAsImage: previousEntry?.renderAsImage ?? defaultRenderAsImage,
        };
      }

      return next;
    });
  }, [schema, selectedTable]);

  return { columnSettings, setColumnSettings };
}

function useVirtualTableWindow(params: {
  projectId: number;
  protocolId: number;
  outputName: string;
  selectedTable: string;
  schema: MetadataTableSchema | null;
  totalRows: number;
  viewMode: ViewMode;
  rowHeight: number;
  rowSizeForScroll: number;
  desiredWindowSize: number;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  isMountedRef: MutableRefObject<boolean>;
}) {
  const {
    projectId,
    protocolId,
    outputName,
    selectedTable,
    schema,
    totalRows,
    viewMode,
    rowHeight,
    rowSizeForScroll,
    desiredWindowSize,
    scrollRef,
    isMountedRef,
  } = params;

  const [windowRows, setWindowRows] = useState<MetadataRow[]>([]);
  const [windowOffset, setWindowOffset] = useState(0);
  const [windowLoading, setWindowLoading] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);

  const windowRequestInFlightRef = useRef(false);
  const pendingWindowOffsetRef = useRef<number | null>(null);
  const windowEpochRef = useRef(0);

  const desiredWindowSizeRef = useRef(desiredWindowSize);
  const svc = useProjectService();

  useEffect(() => {
    desiredWindowSizeRef.current = desiredWindowSize;
  }, [desiredWindowSize]);

  const invalidateWindowState = useCallback(() => {
    windowEpochRef.current += 1;
    windowRequestInFlightRef.current = false;
    pendingWindowOffsetRef.current = null;
    setWindowRows([]);
    setWindowOffset(0);
    setWindowLoading(false);
    setWindowError(null);
  }, []);

  const loadWindow = useCallback(
    async (requestedOffset: number) => {
      if (!selectedTable || totalRows <= 0) return;

      const limit = desiredWindowSizeRef.current || 60;
      const maxOffset = Math.max(0, totalRows - limit);
      const clampedOffset = Math.min(Math.max(0, requestedOffset), maxOffset);

      if (windowRequestInFlightRef.current) {
        pendingWindowOffsetRef.current = clampedOffset;
        return;
      }

      const requestEpoch = windowEpochRef.current;

      windowRequestInFlightRef.current = true;
      setWindowLoading(true);
      setWindowError(null);

      try {
        const response = (await svc.fetchMetadataTableWindow(
          projectId,
          protocolId,
          outputName,
          selectedTable,
          { offset: clampedOffset, limit, selectionOnly: false },
        )) as MetadataWindowResponse;

        if (!isMountedRef.current || requestEpoch !== windowEpochRef.current) {
          return;
        }

        const parsed = parseWindowResponse(response);
        setWindowRows(parsed.rows);
        setWindowOffset(parsed.offset ?? clampedOffset);
      } catch (error) {
        if (!isMountedRef.current || requestEpoch !== windowEpochRef.current) {
          return;
        }

        setWindowRows([]);
        setWindowError(getErrorMessage(error, "Failed to load rows"));
      } finally {
        if (!isMountedRef.current || requestEpoch !== windowEpochRef.current) {
          return;
        }

        setWindowLoading(false);
        windowRequestInFlightRef.current = false;

        const pendingOffset = pendingWindowOffsetRef.current;
        pendingWindowOffsetRef.current = null;

        if (pendingOffset != null && totalRows > 0) {
          void loadWindow(pendingOffset);
        }
      }
    },
    [isMountedRef, outputName, projectId, protocolId, selectedTable, totalRows],
  );

  useEffect(() => {
    invalidateWindowState();

    if (!schema || !selectedTable || totalRows === 0) return;
    if (viewMode === "table") {
      void loadWindow(0);
    }
  }, [
    schema,
    selectedTable,
    totalRows,
    projectId,
    protocolId,
    outputName,
    viewMode,
    loadWindow,
    invalidateWindowState,
  ]);

  useEffect(() => {
    if (
      viewMode === "table" &&
      schema &&
      selectedTable &&
      totalRows > 0 &&
      windowRows.length === 0 &&
      !windowLoading &&
      !windowError
    ) {
      void loadWindow(0);
    }
  }, [
    viewMode,
    schema,
    selectedTable,
    totalRows,
    windowRows.length,
    windowLoading,
    windowError,
    loadWindow,
  ]);

  useEffect(() => {
    if (
      viewMode !== "table" ||
      !schema ||
      !selectedTable ||
      totalRows <= 0 ||
      windowRows.length > 0 ||
      windowLoading ||
      windowError
    ) {
      return;
    }

    const container = scrollRef.current;
    const scrollTop = container?.scrollTop ?? 0;
    const effectiveRowSize = rowSizeForScroll || rowHeight || NORMAL_ROW_HEIGHT;
    const firstVisible = Math.floor(scrollTop / effectiveRowSize);

    const limit = desiredWindowSizeRef.current || 60;
    const buffer = Math.floor(limit / 3);
    const maxOffset = Math.max(0, totalRows - limit);

    let targetOffset = firstVisible - buffer;
    if (targetOffset < 0) targetOffset = 0;
    if (targetOffset > maxOffset) targetOffset = maxOffset;

    void loadWindow(targetOffset);
  }, [
    viewMode,
    schema,
    selectedTable,
    totalRows,
    windowRows.length,
    windowLoading,
    windowError,
    rowSizeForScroll,
    rowHeight,
    scrollRef,
    loadWindow,
  ]);

  const handleScroll = useCallback<UIEventHandler<HTMLDivElement>>(
    (event) => {
      if (!schema || !selectedTable || totalRows === 0) return;

      const effectiveRowSize = rowSizeForScroll || rowHeight || NORMAL_ROW_HEIGHT;
      if (effectiveRowSize <= 0) return;

      const element = event.currentTarget;
      const firstVisible = Math.floor(element.scrollTop / effectiveRowSize);

      const limit = desiredWindowSizeRef.current || windowRows.length || 60;
      const buffer = Math.floor(limit / 3);
      const maxOffset = Math.max(0, totalRows - limit);

      let targetOffset = firstVisible - buffer;
      if (targetOffset < 0) targetOffset = 0;
      if (targetOffset > maxOffset) targetOffset = maxOffset;

      const distance = Math.abs(targetOffset - windowOffset);
      if (distance < Math.max(5, Math.floor(buffer / 2))) {
        return;
      }

      void loadWindow(targetOffset);
    },
    [
      schema,
      selectedTable,
      totalRows,
      rowSizeForScroll,
      rowHeight,
      windowRows.length,
      windowOffset,
      loadWindow,
    ],
  );

  return {
    windowRows,
    windowOffset,
    windowLoading,
    windowError,
    handleScroll,
    invalidateWindowState,
  };
}

function useMetadataGalleryRows(params: {
  projectId: number;
  protocolId: number;
  outputName: string;
  selectedTable: string;
  schema: MetadataTableSchema | null;
  totalRows: number;
  viewMode: ViewMode;
  isMountedRef: MutableRefObject<boolean>;
}) {
  const {
    projectId,
    protocolId,
    outputName,
    selectedTable,
    schema,
    totalRows,
    viewMode,
    isMountedRef,
  } = params;

  const [galleryRows, setGalleryRows] = useState<MetadataRow[]>([]);
  const [galleryNextOffset, setGalleryNextOffset] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryHasMore, setGalleryHasMore] = useState(false);

  const galleryRequestInFlightRef = useRef(false);
  const galleryEpochRef = useRef(0);
  const svc = useProjectService();

  const invalidateGalleryState = useCallback(() => {
    galleryEpochRef.current += 1;
    galleryRequestInFlightRef.current = false;
    setGalleryRows([]);
    setGalleryNextOffset(0);
    setGalleryLoading(false);
    setGalleryError(null);
    setGalleryHasMore(false);
  }, []);

  const loadGalleryChunk = useCallback(
    async (offset: number) => {
      if (!selectedTable || !schema || totalRows === 0) return;
      if (galleryRequestInFlightRef.current) return;

      const remaining = totalRows - offset;
      if (remaining <= 0) {
        setGalleryHasMore(false);
        return;
      }

      const limit = Math.min(GALLERY_PAGE_SIZE, remaining);
      const requestEpoch = galleryEpochRef.current;

      galleryRequestInFlightRef.current = true;
      setGalleryLoading(true);
      setGalleryError(null);

      try {
        const response = (await svc.fetchMetadataTableWindow(
          projectId,
          protocolId,
          outputName,
          selectedTable,
          { offset, limit, selectionOnly: false },
        )) as MetadataWindowResponse;

        if (!isMountedRef.current || requestEpoch !== galleryEpochRef.current) {
          return;
        }

        const parsed = parseWindowResponse(response);

        setGalleryRows((prev) => (offset === 0 ? parsed.rows : [...prev, ...parsed.rows]));

        const nextOffset = offset + parsed.rows.length;
        setGalleryNextOffset(nextOffset);
        setGalleryHasMore(nextOffset < totalRows);
      } catch (error) {
        if (!isMountedRef.current || requestEpoch !== galleryEpochRef.current) {
          return;
        }

        setGalleryError(getErrorMessage(error, "Failed to load gallery images"));
      } finally {
        if (!isMountedRef.current || requestEpoch !== galleryEpochRef.current) {
          return;
        }

        setGalleryLoading(false);
        galleryRequestInFlightRef.current = false;
      }
    },
    [isMountedRef, outputName, projectId, protocolId, schema, selectedTable, totalRows],
  );

  useEffect(() => {
    invalidateGalleryState();

    if (!schema || !selectedTable || totalRows === 0) return;
    if (viewMode === "gallery") {
      void loadGalleryChunk(0);
    }
  }, [
    schema,
    selectedTable,
    totalRows,
    projectId,
    protocolId,
    outputName,
    viewMode,
    invalidateGalleryState,
    loadGalleryChunk,
  ]);

  useEffect(() => {
    if (
      viewMode === "gallery" &&
      schema &&
      selectedTable &&
      totalRows > 0 &&
      galleryRows.length === 0 &&
      !galleryLoading &&
      !galleryError
    ) {
      void loadGalleryChunk(0);
    }
  }, [
    viewMode,
    schema,
    selectedTable,
    totalRows,
    galleryRows.length,
    galleryLoading,
    galleryError,
    loadGalleryChunk,
  ]);

  const handleGalleryScroll = useCallback<UIEventHandler<HTMLDivElement>>(
    (event) => {
      if (!galleryHasMore || galleryLoading) return;

      const element = event.currentTarget;
      if (element.scrollTop + element.clientHeight >= element.scrollHeight - 400) {
        void loadGalleryChunk(galleryNextOffset);
      }
    },
    [galleryHasMore, galleryLoading, galleryNextOffset, loadGalleryChunk],
  );

  return {
    galleryRows,
    galleryLoading,
    galleryError,
    galleryHasMore,
    handleGalleryScroll,
    invalidateGalleryState,
  };
}

function useRowSelection(totalRows: number) {
  const [selectionState, setSelectionState] = useState<RowSelectionState>(
    createEmptySelectionState(),
  );

  const isRowSelected = useCallback(
    (rowIndex: number) => isRowIndexSelected(selectionState, rowIndex),
    [selectionState],
  );

  const selectedCount = useMemo(
    () => getSelectionCount(selectionState, totalRows),
    [selectionState, totalRows],
  );

  const clearSelection = useCallback(() => {
    setSelectionState(createEmptySelectionState());
  }, []);

  const selectOnly = useCallback((rowIndex: number) => {
    setSelectionState({
      baseMode: "none",
      ranges: [{ start: rowIndex, end: rowIndex }],
      anchorIndex: rowIndex,
    });
  }, []);

  const handlePrimaryRowClick = useCallback(
    (rowIndex: number, event: ReactMouseEvent<Element>) => {
      if (totalRows <= 0) return;

      const maxIndex = Math.max(0, totalRows - 1);
      const safeIndex = clampIndex(rowIndex, 0, maxIndex);

      const isToggle = event.ctrlKey || event.metaKey;
      const isRange = event.shiftKey;

      setSelectionState((prev) => {
        const anchor = prev.anchorIndex ?? safeIndex;

        if (isRange) {
          const nextRange = normalizeRange(anchor, safeIndex);

          if (isToggle && prev.baseMode === "none") {
            return {
              ...prev,
              ranges: addRangeToRanges(prev.ranges, nextRange),
              anchorIndex: anchor,
            };
          }

          return {
            baseMode: "none",
            ranges: [nextRange],
            anchorIndex: anchor,
          };
        }

        if (isToggle) {
          return {
            ...prev,
            ranges: toggleSingleIndexInRanges(prev.ranges, safeIndex),
            anchorIndex: safeIndex,
          };
        }

        return {
          baseMode: "none",
          ranges: [{ start: safeIndex, end: safeIndex }],
          anchorIndex: safeIndex,
        };
      });
    },
    [totalRows],
  );

  const selectAll = useCallback(() => {
    setSelectionState((prev) => ({
      baseMode: "all",
      ranges: [],
      anchorIndex: prev.anchorIndex,
    }));
  }, []);

  const selectFromHere = useCallback(
    (rowIndex: number) => {
      if (totalRows <= 0) return;
      const maxIndex = Math.max(0, totalRows - 1);
      const safeIndex = clampIndex(rowIndex, 0, maxIndex);

      setSelectionState({
        baseMode: "none",
        ranges: [{ start: safeIndex, end: maxIndex }],
        anchorIndex: safeIndex,
      });
    },
    [totalRows],
  );

  const selectToHere = useCallback(
    (rowIndex: number) => {
      if (totalRows <= 0) return;
      const maxIndex = Math.max(0, totalRows - 1);
      const safeIndex = clampIndex(rowIndex, 0, maxIndex);

      setSelectionState({
        baseMode: "none",
        ranges: [{ start: 0, end: safeIndex }],
        anchorIndex: safeIndex,
      });
    },
    [totalRows],
  );

  const invertSelection = useCallback(() => {
    setSelectionState((prev) => ({
      ...prev,
      baseMode: prev.baseMode === "all" ? "none" : "all",
    }));
  }, []);

  return {
    selectionState,
    isRowSelected,
    selectedCount,
    clearSelection,
    selectOnly,
    handlePrimaryRowClick,
    selectAll,
    selectFromHere,
    selectToHere,
    invertSelection,
    setSelectionState,
  };
}

/* ======================= UI subcomponents ======================= */

function MetadataImageCell({
  projectId,
  protocolId,
  outputName,
  tableName,
  rowIndexInTable,
  columnName,
  cell,
  size,
  isSelected = false,
  onClick,
  imageCacheRef,
}: MetadataImageCellProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const svc = useProjectService();

  useEffect(() => {
    const cache = imageCacheRef.current;

    const key = [
      projectId,
      protocolId,
      outputName,
      tableName,
      rowIndexInTable,
      columnName,
      cell.path,
      size,
    ].join("|");

    const cached = getImageCacheEntry(cache, key);
    if (cached) {
      setThumbUrl(cached.url);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    setThumbUrl(null);
    setLoading(true);
    setError(null);

    const job: ImageJob = {
      isCancelled: () => cancelled,
      run: () =>
        svc.fetchMetadataImageCellObjectUrl(
          projectId,
          protocolId,
          outputName,
          tableName,
          rowIndexInTable,
          columnName,
          { size, applyTransform: false, inline: true, format: "png" },
        ),
      onSuccess: ({ url, revoke }) => {
        if (cancelled) {
          revoke();
          return;
        }

        setImageCacheEntry(imageCacheRef.current, key, { url, revoke });
        setThumbUrl(url);
        setError(null);
        setLoading(false);
      },
      onError: (requestError) => {
        if (cancelled) return;
        setError(getErrorMessage(requestError, "Failed to load image"));
        setLoading(false);
      },
    };

    enqueueImageJob(job);

    return () => {
      cancelled = true;
    };
  }, [
    cell.path,
    columnName,
    imageCacheRef,
    outputName,
    projectId,
    protocolId,
    rowIndexInTable,
    size,
    tableName,
  ]);

  const borderColor = isSelected ? "#2563eb" : "rgba(148,163,184,0.6)";

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onClick) return;
    event.stopPropagation();
    onClick(event);
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        cursor: "pointer",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 1,
        border: `1px solid ${borderColor}`,
        overflow: "hidden",
        bgcolor: "#d1d5db",
      }}
    >
      {loading ? (
        <CircularProgress size={18} />
      ) : error ? (
        <Typography variant="caption" color="error" sx={{ p: 1, textAlign: "center" }}>
          img error
        </Typography>
      ) : thumbUrl ? (
        <img
          src={thumbUrl}
          alt={cell.path}
          style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }}
        />
      ) : (
        <Typography variant="caption" color="text.secondary">
          no image
        </Typography>
      )}
    </Box>
  );
}

function MetadataTablePanel({
  viewMode,
  schema,
  totalRows,
  visibleColumns,
  columnSettings,
  rowHeight,
  rowSizeForScroll,
  tableMinWidth,
  windowRows,
  windowOffset,
  windowLoading,
  windowError,
  topSpacerHeight,
  bottomSpacerHeight,
  hasData,
  scrollRef,
  handleScroll,
  isRowSelected,
  onPrimaryRowClick,
  onRowContextMenu,
  selectedRowIndex,
  selectedImageCell,
  setSelectedRowIndex,
  setSelectedImageCell,
  projectId,
  protocolId,
  outputName,
  selectedTable,
  imageCacheRef,
}: MetadataTablePanelProps) {
  if (!schema || totalRows <= 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mt: 0,
        minHeight: 660,
        maxHeight: 660,
        minWidth: 840,
        flexShrink: 0,
        display: viewMode === "table" ? "flex" : "none",
        flexDirection: "column",
        borderColor: "rgba(148,163,184,0.4)",
        backgroundColor: "background.paper",
      }}
    >
      <TableContainer
        ref={scrollRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflow: "auto",
        }}
      >
        <Table
          size="small"
          stickyHeader
          sx={{
            minWidth: tableMinWidth || 700,
            tableLayout: "fixed",
            borderCollapse: "collapse",
            borderSpacing: 0,
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  ...headerCellSx,
                  width: ROW_INDEX_COL_WIDTH,
                  minWidth: ROW_INDEX_COL_WIDTH,
                  maxWidth: ROW_INDEX_COL_WIDTH,
                  textAlign: "right",
                  pr: 1,
                  left: 0,
                  zIndex: 3,
                  borderRight: "1px solid rgba(148,163,184,0.6)",
                }}
              >
                #
              </TableCell>

              {visibleColumns.map((column) => (
                <TableCell
                  key={column.name}
                  sx={{
                    ...headerCellSx,
                    minWidth:
                      column.rendererType === "image"
                        ? IMAGE_COL_MIN_WIDTH
                        : MIN_TEXT_COL_WIDTH,
                    width:
                      column.rendererType === "image"
                        ? IMAGE_COL_MIN_WIDTH
                        : MIN_TEXT_COL_WIDTH,
                  }}
                >
                  {column.alias || column.name}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {topSpacerHeight > 0 && (
              <TableRow style={{ height: topSpacerHeight }}>
                <TableCell
                  colSpan={visibleColumns.length + 1}
                  sx={{ padding: 0, borderBottom: "none" }}
                />
              </TableRow>
            )}

            {windowRows.map((row, rowIndexInWindow) => {
              const displayRowIndex = windowOffset + rowIndexInWindow;
              const isHighlightedRow = isRowSelected(displayRowIndex);

              return (
                <TableRow
                  key={row.id ?? `${windowOffset}-${rowIndexInWindow}`}
                  hover
                  onClick={(event) => {
                    onPrimaryRowClick(displayRowIndex, event);
                    setSelectedRowIndex(displayRowIndex);
                    setSelectedImageCell(null);
                  }}
                  onContextMenu={(event) => {
                    onRowContextMenu(displayRowIndex, event);
                  }}
                  sx={{
                    height: rowHeight,
                    backgroundColor: isHighlightedRow
                      ? "rgba(219,234,254,0.9)"
                      : "background.paper",
                    transition: "background-color 120ms ease-out",
                    "&:hover": {
                      backgroundColor: isHighlightedRow
                        ? "rgba(191,219,254,0.95)"
                        : "rgba(248,250,252,1)",
                    },
                    "&:hover td": {
                      transition: "background-color 120ms ease-out",
                    },
                    "& > td": {
                      borderRight: "1px solid rgba(148,163,184,0.25)",
                    },
                    "& > td:last-of-type": {
                      borderRight: "none",
                    },
                  }}
                >
                  <TableCell
                    sx={{
                      ...baseCellSx,
                      height: rowHeight,
                      width: ROW_INDEX_COL_WIDTH,
                      minWidth: ROW_INDEX_COL_WIDTH,
                      maxWidth: ROW_INDEX_COL_WIDTH,
                      textAlign: "right",
                      pr: 1,
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      borderRight: "1px solid rgba(148,163,184,0.3)",
                      backgroundColor: HEADER_BG,
                    }}
                  >
                    {displayRowIndex + 1}
                  </TableCell>

                  {visibleColumns.map((column) => {
                    const cellValue = row.values[column.index];
                    const isImageColumn = column.rendererType === "image";
                    const renderAsImage =
                      isImageColumn && (columnSettings[column.name]?.renderAsImage ?? true);

                    const isSelectedImage =
                      !!selectedImageCell &&
                      isImageColumn &&
                      renderAsImage &&
                      selectedImageCell.rowIndexInTable === displayRowIndex &&
                      selectedImageCell.columnName === column.name;

                    const cellWidth =
                      column.rendererType === "image"
                        ? IMAGE_COL_MIN_WIDTH
                        : MIN_TEXT_COL_WIDTH;

                    if (
                      renderAsImage &&
                      cellValue &&
                      typeof cellValue === "object" &&
                      (cellValue as { kind?: string }).kind === "image"
                    ) {
                      const imageCell = cellValue as { kind: "image"; path: string };

                      return (
                        <TableCell
                          key={column.name}
                          sx={{
                            ...baseCellSx,
                            height: rowHeight,
                            verticalAlign: "middle",
                            width: cellWidth,
                            minWidth: cellWidth,
                            maxWidth: cellWidth,
                            backgroundColor: isHighlightedRow
                              ? "rgba(219,234,254,0.9)"
                              : "background.paper",
                          }}
                        >
                          <MetadataImageCell
                            projectId={projectId}
                            protocolId={protocolId}
                            outputName={outputName}
                            tableName={selectedTable}
                            rowIndexInTable={displayRowIndex}
                            columnName={column.name}
                            cell={imageCell}
                            size={BASE_THUMB_SIZE}
                            isSelected={isSelectedImage}
                            onClick={(event) => {
                              onPrimaryRowClick(displayRowIndex, event);
                              setSelectedRowIndex(displayRowIndex);
                              setSelectedImageCell({
                                rowIndexInTable: displayRowIndex,
                                columnName: column.name,
                              });
                            }}
                            imageCacheRef={imageCacheRef}
                          />
                        </TableCell>
                      );
                    }

                    return (
                      <TableCell
                        key={column.name}
                        sx={{
                          ...baseCellSx,
                          height: rowHeight,
                          verticalAlign: "middle",
                          width: cellWidth,
                          minWidth: cellWidth,
                          maxWidth: cellWidth,
                          backgroundColor: isHighlightedRow
                            ? "rgba(219,234,254,0.9)"
                            : "background.paper",
                        }}
                        title={typeof cellValue === "string" ? cellValue : undefined}
                      >
                        {formatCellValue(cellValue as MetadataCell)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}

            {bottomSpacerHeight > 0 && (
              <TableRow style={{ height: bottomSpacerHeight }}>
                <TableCell
                  colSpan={visibleColumns.length + 1}
                  sx={{ padding: 0, borderBottom: "none" }}
                />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {windowLoading && hasData && (
        <Box
          sx={{
            py: 0.5,
            px: 1.5,
            borderTop: "1px solid rgba(148,163,184,0.4)",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">
            Loading rows…
          </Typography>
        </Box>
      )}

      {windowError && (
        <Box
          sx={{
            py: 0.5,
            px: 1.5,
            borderTop: "1px solid rgba(148,163,184,0.4)",
          }}
        >
          <Typography variant="caption" color="error">
            {windowError}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

function MetadataGalleryPanel({
  viewMode,
  firstImageColumn,
  galleryRows,
  galleryLoading,
  galleryError,
  galleryScrollRef,
  handleGalleryScroll,
  isRowSelected,
  onPrimaryRowClick,
  selectedImageCell,
  setSelectedRowIndex,
  setSelectedImageCell,
  projectId,
  protocolId,
  outputName,
  selectedTable,
  imageCacheRef,
  showSizeLabel,
  sizeColumn,
}: MetadataGalleryPanelProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        mt: 1,
        minHeight: 660,
        maxHeight: 660,
        minWidth: 840,
        flexShrink: 0,
        display: viewMode === "gallery" ? "flex" : "none",
        flexDirection: "column",
        borderColor: "rgba(148,163,184,0.4)",
        backgroundColor: "background.paper",
      }}
    >
      <Box
        ref={galleryScrollRef}
        onScroll={handleGalleryScroll}
        sx={{
          flex: 1,
          overflow: "auto",
        }}
      >
        {!firstImageColumn && (
          <Box
            sx={{
              py: 4,
              px: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              This table has no image columns to display in gallery mode.
            </Typography>
          </Box>
        )}

        {firstImageColumn && (
          <Box
            sx={{
              p: 1,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 0,
            }}
          >
            {galleryRows.map((row, index) => {
              const globalRowIndex = index;

              const cellValue = row.values[firstImageColumn.index];
              const isImageCell =
                cellValue &&
                typeof cellValue === "object" &&
                (cellValue as { kind?: string }).kind === "image";

              const imageCell = isImageCell
                ? (cellValue as { kind: "image"; path: string })
                : null;

              const isSelected = isRowSelected(globalRowIndex);

              const isFocusedImageCell =
                !!selectedImageCell &&
                selectedImageCell.rowIndexInTable === globalRowIndex &&
                selectedImageCell.columnName === firstImageColumn.name;

              let sizeLabel: string | null = null;
              if (showSizeLabel && sizeColumn) {
                const sizeValue = row.values[sizeColumn.index];
                if (sizeValue !== null && sizeValue !== undefined && sizeValue !== "") {
                  sizeLabel = `size=${sizeValue}`;
                }
              }

              return (
                <Box
                  key={row.id ?? `${index}`}
                  onClick={(event) => {
                    onPrimaryRowClick(globalRowIndex, event);
                    setSelectedRowIndex(globalRowIndex);
                    setSelectedImageCell({
                      rowIndexInTable: globalRowIndex,
                      columnName: firstImageColumn.name,
                    });
                  }}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.5,
                    p: 0.75,
                    borderRadius: 1.5,
                    border: isSelected
                      ? "2px solid #2563eb"
                      : "1px solid rgba(148,163,184,0.45)",
                    background: isSelected ? "#e0f2fe" : "#f9fafb",
                    boxShadow: isSelected ? "0 0 0 1px rgba(37,99,235,0.3)" : "none",
                    transition:
                      "background-color 120ms ease-out, border-color 120ms ease-out, box-shadow 120ms ease-out",
                    cursor: "pointer",
                  }}
                >
                  {imageCell ? (
                    <MetadataImageCell
                      projectId={projectId}
                      protocolId={protocolId}
                      outputName={outputName}
                      tableName={selectedTable}
                      rowIndexInTable={globalRowIndex}
                      columnName={firstImageColumn.name}
                      cell={imageCell}
                      size={BASE_THUMB_SIZE}
                      isSelected={isFocusedImageCell || isSelected}
                      imageCacheRef={imageCacheRef}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: BASE_THUMB_SIZE,
                        height: BASE_THUMB_SIZE,
                        borderRadius: 1,
                        border: "1px dashed rgba(148,163,184,0.6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        no image
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{ minHeight: 18 }}>
                    {sizeLabel && (
                      <Typography variant="caption" color="text.secondary">
                        {sizeLabel}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}

        {galleryLoading && (
          <Box
            sx={{
              py: 1,
              px: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
            }}
          >
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">
              Loading images…
            </Typography>
          </Box>
        )}

        {galleryError && (
          <Box sx={{ py: 1, px: 2 }}>
            <Typography variant="caption" color="error">
              {galleryError}
            </Typography>
          </Box>
        )}

        {!galleryLoading && firstImageColumn && galleryRows.length === 0 && !galleryError && (
          <Box
            sx={{
              py: 4,
              px: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No images to display yet.
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}

function ColumnsDialog({
  open,
  onClose,
  onApply,
  allColumns,
  columnSettings,
  draftColumnSettings,
  updateDraftColumnSettings,
}: ColumnsDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      BackdropProps={{
        sx: { backgroundColor: "transparent" },
      }}
    >
      <DialogTitle sx={headerColumnDialogSx}>
        Columns
        <IconButton
          onClick={onClose}
          aria-label="Close columns dialog"
          size="small"
          sx={closeBtnSx}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Table size="small">
          <TableHead>
            <TableRow
              sx={{
                backgroundColor: DIALOG_HEADER_BG,
              }}
            >
              <TableCell sx={{ fontWeight: 600, fontSize: "0.8rem" }}>Label</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: "0.8rem" }}>
                Visible
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: "0.8rem" }}>
                Render
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {allColumns.map((column, index) => {
              const draft = draftColumnSettings?.[column.name];
              const current = columnSettings[column.name];

              const effectiveVisible =
                draft?.visible ?? current?.visible ?? (column.visible !== false);

              const canRender = column.rendererType === "image";
              const effectiveRenderAsImage =
                draft?.renderAsImage ??
                current?.renderAsImage ??
                (column.rendererType === "image");

              return (
                <TableRow
                  key={column.name}
                  sx={{
                    backgroundColor:
                      index % 2 === 0 ? DIALOG_ROW_EVEN_BG : DIALOG_ROW_ODD_BG,
                  }}
                >
                  <TableCell sx={{ fontSize: "0.8rem" }}>
                    {column.alias || column.name}
                  </TableCell>

                  <TableCell align="center">
                    <Checkbox
                      size="small"
                      checked={effectiveVisible}
                      onChange={(event) =>
                        updateDraftColumnSettings(column.name, {
                          visible: event.target.checked,
                        })
                      }
                    />
                  </TableCell>

                  <TableCell align="center">
                    <Checkbox
                      size="small"
                      checked={canRender && effectiveRenderAsImage}
                      disabled={!canRender}
                      onChange={(event) =>
                        updateDraftColumnSettings(column.name, {
                          renderAsImage: event.target.checked,
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DialogContent>

      <DialogActions>
        <Button
          variant="contained"
          startIcon={<CloseIcon />}
          onClick={onClose}
          sx={{ textTransform: "none" }}
          color="error"
        >
          Close
        </Button>

        <Button
          variant="contained"
          startIcon={<Check size={16} />}
          onClick={onApply}
          sx={{ textTransform: "none" }}
        >
          Ok
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ======================= Main component ======================= */

export function MetadataViewer({ projectId, protocolId, outputName }: MetadataViewerProps) {
  const isMountedRef = useIsMountedRef();

  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [selectedImageCell, setSelectedImageCell] = useState<SelectedImageCell | null>(null);

  const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);
  const [draftColumnSettings, setDraftColumnSettings] =
    useState<Record<string, ColumnSettings> | null>(null);

  const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState>(null);
  const [selectSubmenuAnchorEl, setSelectSubmenuAnchorEl] = useState<HTMLElement | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement | null>(null);
  const { height: viewportHeight } = useElementSize(scrollRef);

  const { imageCacheRef, clearImageCache } = useImageCache();

  const {
    tables,
    tablesLoading,
    tablesError,
    selectedTable,
    setSelectedTable,
  } = useMetadataTables(projectId, protocolId, outputName, isMountedRef);

  const {
    schema,
    setSchema,
    schemaLoading,
    schemaError,
    setSchemaError,
  } = useMetadataSchema(projectId, protocolId, outputName, selectedTable, isMountedRef);

  const { columnSettings, setColumnSettings } = useColumnSettings(schema, selectedTable);

  const tableInfo = useMemo<MetadataTableInfo | null>(() => {
    if (!tables || !selectedTable) return null;
    return tables.find((table) => table.name === selectedTable) || null;
  }, [tables, selectedTable]);

  const totalRows = tableInfo?.rowCount ?? 0;

  const {
    isRowSelected,
    selectedCount,
    clearSelection,
    selectOnly,
    handlePrimaryRowClick,
    selectAll,
    selectFromHere,
    selectToHere,
    invertSelection,
  } = useRowSelection(totalRows);

  const allColumns: MetadataColumnWithVisibility[] = useMemo(
    () => (schema?.columns ?? []) as MetadataColumnWithVisibility[],
    [schema],
  );

  const visibleColumns: MetadataColumnWithVisibility[] = useMemo(
    () =>
      allColumns.filter((column) => {
        const settings = columnSettings[column.name];
        if (settings) return settings.visible;
        return column.visible !== false;
      }),
    [allColumns, columnSettings],
  );

  const imageColumns = useMemo(
    () =>
      visibleColumns.filter((column) => {
        if (column.rendererType !== "image") return false;
        const settings = columnSettings[column.name];
        return settings?.renderAsImage ?? true;
      }),
    [visibleColumns, columnSettings],
  );

  const hasImageColumns = imageColumns.length > 0;
  const firstImageColumn = imageColumns[0] ?? null;

  const sizeColumn = useMemo(() => {
    if (!allColumns.length) return null;

    const column = allColumns.find((item) => item.name === "_size");
    if (!column) return null;

    const settings = columnSettings[column.name];
    const visible = settings?.visible ?? (column.visible !== false);
    return visible ? column : null;
  }, [allColumns, columnSettings]);

  const isClassTable = useMemo(() => {
    if (!tableInfo) return false;
    const label = (tableInfo.alias || tableInfo.name || "").toLowerCase();
    return label.startsWith("class2d") || label.startsWith("class3d");
  }, [tableInfo]);

  const showSizeLabel = isClassTable && !!sizeColumn;

  const rowHeight = hasImageColumns ? IMAGE_ROW_HEIGHT : NORMAL_ROW_HEIGHT;

  const virtualContentHeight = useMemo(() => {
    if (!totalRows || !rowHeight) return 0;
    const fullHeight = totalRows * rowHeight;
    return fullHeight > MAX_VIRTUAL_SCROLL_HEIGHT ? MAX_VIRTUAL_SCROLL_HEIGHT : fullHeight;
  }, [totalRows, rowHeight]);

  const pixelsPerRow = useMemo(() => {
    if (!totalRows || !rowHeight) return rowHeight || NORMAL_ROW_HEIGHT;
    if (!virtualContentHeight) return rowHeight;
    return virtualContentHeight / totalRows;
  }, [virtualContentHeight, totalRows, rowHeight]);

  const rowSizeForScroll = useMemo(
    () => pixelsPerRow || rowHeight || NORMAL_ROW_HEIGHT,
    [pixelsPerRow, rowHeight],
  );

  useEffect(() => {
    if (viewMode === "gallery" && !hasImageColumns) {
      setViewMode("table");
    }
  }, [viewMode, hasImageColumns]);

  const desiredWindowSize = useMemo(() => {
    if (!rowHeight || viewportHeight <= 0) return 60;
    const approxVisible = Math.ceil(viewportHeight / rowHeight);
    return approxVisible * 2 + EXTRA_BUFFER_ROWS;
  }, [viewportHeight, rowHeight]);

  const {
    windowRows,
    windowOffset,
    windowLoading,
    windowError,
    handleScroll,
    invalidateWindowState,
  } = useVirtualTableWindow({
    projectId,
    protocolId,
    outputName,
    selectedTable,
    schema,
    totalRows,
    viewMode,
    rowHeight,
    rowSizeForScroll,
    desiredWindowSize,
    scrollRef,
    isMountedRef,
  });

  const {
    galleryRows,
    galleryLoading,
    galleryError,
    handleGalleryScroll,
    invalidateGalleryState,
  } = useMetadataGalleryRows({
    projectId,
    protocolId,
    outputName,
    selectedTable,
    schema,
    totalRows,
    viewMode,
    isMountedRef,
  });

  const topSpacerHeight = totalRows > 0 ? windowOffset * rowSizeForScroll : 0;

  const bottomSpacerHeight =
    totalRows > 0
      ? Math.max(0, (totalRows - windowOffset - windowRows.length) * rowSizeForScroll)
      : 0;

  const hasData = !!schema && totalRows > 0;

  const tableMinWidth = useMemo(() => {
    if (!schema) return undefined;

    const imageColumnCount = visibleColumns.filter(
      (column) => column.rendererType === "image",
    ).length;
    const textColumnCount = visibleColumns.length - imageColumnCount;

    return (
      ROW_INDEX_COL_WIDTH +
      textColumnCount * MIN_TEXT_COL_WIDTH +
      imageColumnCount * IMAGE_COL_MIN_WIDTH
    );
  }, [schema, visibleColumns]);

  const resetSelection = useCallback(() => {
    clearSelection();
    setSelectedRowIndex(null);
    setSelectedImageCell(null);
  }, [clearSelection]);

  const closeTableContextMenus = useCallback(() => {
    setTableContextMenu(null);
    setSelectSubmenuAnchorEl(null);
  }, []);

  const handleTableRowContextMenu = useCallback(
    (rowIndex: number, event: ReactMouseEvent<Element>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!isRowSelected(rowIndex)) {
        selectOnly(rowIndex);
      }

      setSelectedRowIndex(rowIndex);
      setSelectedImageCell(null);

      setTableContextMenu({
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
        rowIndex,
      });

      setSelectSubmenuAnchorEl(null);
    },
    [isRowSelected, selectOnly],
  );

  const runContextSelectionAction = useCallback(
    (action: "all" | "fromHere" | "toHere" | "invert") => {
      const contextRowIndex = tableContextMenu?.rowIndex ?? null;

      if (action === "all") {
        selectAll();
        closeTableContextMenus();
        return;
      }

      if (action === "invert") {
        invertSelection();
        closeTableContextMenus();
        return;
      }

      if (contextRowIndex == null) {
        closeTableContextMenus();
        return;
      }

      if (action === "fromHere") {
        selectFromHere(contextRowIndex);
      } else if (action === "toHere") {
        selectToHere(contextRowIndex);
      }

      closeTableContextMenus();
    },
    [
      closeTableContextMenus,
      invertSelection,
      selectAll,
      selectFromHere,
      selectToHere,
      tableContextMenu,
    ],
  );

  const handleTableChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      const value = event.target.value;

      setSelectedTable(value);
      setSchema(null);
      setSchemaError(null);

      invalidateWindowState();
      invalidateGalleryState();
      resetSelection();
      clearImageCache();
      closeTableContextMenus();
    },
    [
      clearImageCache,
      closeTableContextMenus,
      invalidateGalleryState,
      invalidateWindowState,
      resetSelection,
      setSchema,
      setSchemaError,
      setSelectedTable,
    ],
  );

  useEffect(() => {
    resetSelection();
    closeTableContextMenus();
  }, [projectId, protocolId, outputName, resetSelection, closeTableContextMenus]);

  const openColumnsDialog = useCallback(() => {
    if (!schema) return;

    const columns = (schema.columns ?? []) as MetadataColumnWithVisibility[];
    const draft: Record<string, ColumnSettings> = {};

    for (const column of columns) {
      const current =
        columnSettings[column.name] ?? {
          visible: column.visible !== false,
          renderAsImage: column.rendererType === "image",
        };

      draft[column.name] = { ...current };
    }

    setDraftColumnSettings(draft);
    setColumnsDialogOpen(true);
  }, [schema, columnSettings]);

  const closeColumnsDialog = useCallback(() => {
    setColumnsDialogOpen(false);
    setDraftColumnSettings(null);
  }, []);

  const applyColumnsDialog = useCallback(() => {
    if (draftColumnSettings) {
      setColumnSettings(draftColumnSettings);
    }
    setColumnsDialogOpen(false);
    setDraftColumnSettings(null);
  }, [draftColumnSettings, setColumnSettings]);

  const updateDraftColumnSettings = useCallback(
    (columnName: string, partial: Partial<ColumnSettings>) => {
      setDraftColumnSettings((prev) => {
        if (!prev) return prev;

        const current = prev[columnName] ?? {
          visible: true,
          renderAsImage: false,
        };

        return {
          ...prev,
          [columnName]: {
            ...current,
            ...partial,
          },
        };
      });
    },
    [],
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        minHeight: 480,
        mt: 2,
      }}
    >
      {/* Header */}
      <Box
        className="ml-4 mr-4 p-1 border rounded-lg shadow-sm bg-white dark:bg-gray-800 flex items-center gap-1"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          mb: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Box
          className="ml-0 mr-4 p-0 border rounded-lg shadow-sm bg-white dark:bg-gray-800 flex items-center"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            minWidth: 96,
            px: 1,
            py: 0.5,
          }}
        >
          <Typography
            variant="caption"
            sx={{ mr: 0.5, color: "text.secondary", fontWeight: 500 }}
          >
            View mode:
          </Typography>

          <Tooltip title="Table">
            <span>
              <IconButton
                size="small"
                color={viewMode === "table" ? "primary" : "default"}
                onClick={() => setViewMode("table")}
              >
                <TableIcon size={16} />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip
            title={
              hasImageColumns
                ? "Gallery"
                : "Gallery view is only available when the table has image columns"
            }
          >
            <span>
              <IconButton
                size="small"
                color={viewMode === "gallery" ? "primary" : "default"}
                disabled={!hasImageColumns}
                onClick={() => {
                  if (!hasImageColumns) return;
                  setViewMode("gallery");
                }}
              >
                <LayoutGrid size={16} />
              </IconButton>
            </span>
          </Tooltip>

          <Divider
            orientation="vertical"
            flexItem
            sx={{
              mx: 1,
              borderColor: "rgba(148,163,184,0.6)",
            }}
          />

          {viewMode === "table" && schema && (
            <Tooltip title="Manage columns">
              <span>
                <IconButton size="small" onClick={openColumnsDialog}>
                  <ColumnsSettingsIcon size={16} />
                </IconButton>
              </span>
            </Tooltip>
          )}

          {viewMode === "gallery" && schema && (
            <Tooltip title="Manage columns">
              <span>
                <IconButton disabled size="small">
                  <ColumnsSettingsIcon size={16} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>

        <Box
          sx={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="metadata-table-select-label">Metadata table</InputLabel>
            <Select
              labelId="metadata-table-select-label"
              label="Metadata table"
              value={selectedTable}
              onChange={handleTableChange}
              disabled={tablesLoading || !tables || tables.length === 0}
              renderValue={(value) => {
                if (!value) return "";
                const table = tables?.find((item) => item.name === value);
                const label = table?.alias || table?.name || value;

                return (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TableIcon size={16} />
                    <span>{label}</span>
                  </Box>
                );
              }}
            >
              {tables?.map((table) => {
                const label = table.alias || table.name;
                return (
                  <MenuItem key={table.name} value={table.name}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <TableIcon size={14} />
                      <span>{label}</span>
                    </Box>
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Box>

        <Box
          className="mr-2"
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            minWidth: 240,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Output: <strong>{outputName}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Rows: <strong>{totalRows}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Selected: <strong>{selectedCount}</strong>
          </Typography>
        </Box>
      </Box>

      {tablesLoading && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2">Loading tables…</Typography>
        </Box>
      )}

      {tablesError && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {tablesError}
        </Typography>
      )}

      {!tablesLoading && !tablesError && tables && tables.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No metadata tables for this output.
        </Typography>
      )}

      {selectedTable && schemaLoading && !schema && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 2 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Loading schema…</Typography>
        </Box>
      )}

      {selectedTable && schemaError && (
        <Typography variant="body2" color="error" sx={{ mt: 2 }}>
          {schemaError}
        </Typography>
      )}

      {selectedTable && schema && totalRows === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          This table has no rows.
        </Typography>
      )}

      <MetadataTablePanel
        viewMode={viewMode}
        schema={schema}
        totalRows={totalRows}
        visibleColumns={visibleColumns}
        columnSettings={columnSettings}
        rowHeight={rowHeight}
        rowSizeForScroll={rowSizeForScroll}
        tableMinWidth={tableMinWidth}
        windowRows={windowRows}
        windowOffset={windowOffset}
        windowLoading={windowLoading}
        windowError={windowError}
        topSpacerHeight={topSpacerHeight}
        bottomSpacerHeight={bottomSpacerHeight}
        hasData={hasData}
        scrollRef={scrollRef}
        handleScroll={handleScroll}
        isRowSelected={isRowSelected}
        onPrimaryRowClick={handlePrimaryRowClick}
        onRowContextMenu={handleTableRowContextMenu}
        selectedRowIndex={selectedRowIndex}
        selectedImageCell={selectedImageCell}
        setSelectedRowIndex={setSelectedRowIndex}
        setSelectedImageCell={setSelectedImageCell}
        projectId={projectId}
        protocolId={protocolId}
        outputName={outputName}
        selectedTable={selectedTable}
        imageCacheRef={imageCacheRef}
      />

      {selectedTable && schema && totalRows > 0 && (
        <MetadataGalleryPanel
          viewMode={viewMode}
          firstImageColumn={firstImageColumn}
          galleryRows={galleryRows}
          galleryLoading={galleryLoading}
          galleryError={galleryError}
          galleryScrollRef={galleryScrollRef}
          handleGalleryScroll={handleGalleryScroll}
          isRowSelected={isRowSelected}
          onPrimaryRowClick={handlePrimaryRowClick}
          selectedImageCell={selectedImageCell}
          setSelectedRowIndex={setSelectedRowIndex}
          setSelectedImageCell={setSelectedImageCell}
          projectId={projectId}
          protocolId={protocolId}
          outputName={outputName}
          selectedTable={selectedTable}
          imageCacheRef={imageCacheRef}
          showSizeLabel={showSizeLabel}
          sizeColumn={sizeColumn}
        />
      )}

      <ColumnsDialog
        open={columnsDialogOpen}
        onClose={closeColumnsDialog}
        onApply={applyColumnsDialog}
        allColumns={allColumns}
        columnSettings={columnSettings}
        draftColumnSettings={draftColumnSettings}
        updateDraftColumnSettings={updateDraftColumnSettings}
      />

      <Menu
        open={!!tableContextMenu}
        onClose={closeTableContextMenus}
        anchorReference="anchorPosition"
        anchorPosition={
          tableContextMenu
            ? { top: tableContextMenu.mouseY, left: tableContextMenu.mouseX }
            : undefined
        }
        transformOrigin={{ horizontal: "left", vertical: "top" }}
      >
        <MenuItem
          onClick={(event) => {
            setSelectSubmenuAnchorEl(event.currentTarget);
          }}
        >
          <ListItemText>Select</ListItemText>
          <ChevronRight size={16} />
        </MenuItem>
      </Menu>

      <Menu
        open={!!tableContextMenu && !!selectSubmenuAnchorEl}
        anchorEl={selectSubmenuAnchorEl}
        onClose={() => setSelectSubmenuAnchorEl(null)}
        anchorOrigin={{ horizontal: "right", vertical: "top" }}
        transformOrigin={{ horizontal: "left", vertical: "top" }}
      >
        <MenuItem onClick={() => runContextSelectionAction("all")}>All</MenuItem>
        <MenuItem onClick={() => runContextSelectionAction("fromHere")}>
          From here
        </MenuItem>
        <MenuItem onClick={() => runContextSelectionAction("toHere")}>To here</MenuItem>
        <Divider />
        <MenuItem onClick={() => runContextSelectionAction("invert")}>
          Invert selection
        </MenuItem>
      </Menu>
    </Box>
  );
}