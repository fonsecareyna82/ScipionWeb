// src/components/ProtocolForm.tsx
import { useState, useEffect, useCallback, JSX, useRef, useMemo } from "react";
import toast from "react-hot-toast";
import {
  Tabs,
  Tab,
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  Switch,
  Tooltip,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import styles from "./protocolform.module.css";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  ExecuteIcon,
  SaveIcon,
} from "../../icons";
import WrapWithDrop from "./WrapWithDrop";
import MultiParamRow from "./MultiParamRow";
import ParamRow from "./ParamRow";
import OutputSelectorDialog from "./outputSelectorDialog";
import { useProjectService } from "@/ProjectServiceContext";
import RemoteFileDialog from "@/components/files/RemoteFileDialog";
import AnalyzeOutputDialog from "@/components/analyze/analyze-output-dialog";
import { Copy } from "lucide-react";
import ExecuteModeButton from "./ExecuteModeButton";

type ProtocolFormProps = {
  data: any;
  projectProtocols: any;
  onClose: () => void;
  onExecuted?: () => void;
  /** Presentation variant: "drawer" (default) slides in from the right; "docked" fills its parent panel. */
  variant?: "drawer" | "docked";
};

// jsonSyntaxColors
const jsonPunctColor = "#000000"; // braces, brackets, commas, colon
const jsonKeyColor = "#000000";
const jsonStringColor = "#16a34a";
const jsonNumberColor = "#f97316";
const jsonBooleanColor = "#7c3aed";
const jsonNullColor = "#6b7280";

const jsonIndentPx = 14;
const jsonToggleColWidthPx = 18;

function getJsonScalarColor(value: any): string {
  // getJsonScalarColor
  if (value === null || value === undefined) return jsonNullColor;
  if (typeof value === "string") return jsonStringColor;
  if (typeof value === "number" || typeof value === "bigint") return jsonNumberColor;
  if (typeof value === "boolean") return jsonBooleanColor;
  return "#111827";
}

function renderJsonScalar(value: any) {
  // renderJsonScalar
  return <span style={{ color: getJsonScalarColor(value) }}>{formatJsonScalar(value)}</span>;
}

// jsonTreeViewer
function formatJsonScalar(value: any): string {
  // formatJsonScalar
  if (value === null) return "null";
  if (value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value === "function") return JSON.stringify("[Function]");
  if (typeof value === "symbol") return JSON.stringify("[Symbol]");
  return JSON.stringify(String(value));
}

function makeSafeJsonReplacer() {
  // makeSafeJsonReplacer
  const seen = new WeakSet<object>();

  return (_key: string, value: any) => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function") return "[Function]";
    if (typeof value === "symbol") return "[Symbol]";

    if (value && typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };
}

function copyTextToClipboard(text: string) {
  // copyTextToClipboard
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  // fallbackCopy
  return new Promise<void>((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.left = "-1000px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("Copy failed"));
    } catch (e) {
      reject(e);
    }
  });
}

type UnwrappedParam = {
  paramName: string;
  paramDef: any;
};

function getParamClass(defLike: any): string {
  // getParamClass
  return String(defLike?.paramClass ?? defLike?._class ?? "");
}

function isNonEmptyString(v: any): boolean {
  // isNonEmptyString
  return typeof v === "string" && v.trim().length > 0;
}

function hasPointerClass(def: any): boolean {
  // hasPointerClass
  return isNonEmptyString(def?.pointerClass) || isNonEmptyString(def?.pointerClassName);
}

function hasMinMax(defLike: any): boolean {
  // hasMinMax
  if (!defLike || typeof defLike !== "object") return false;
  return "min" in defLike || "max" in defLike;
}

function resolveParamClass(defLike: any): string {
  // resolveParamClass
  const rawCls = getParamClass(defLike);

  // Keep explicit pointer classes as-is
  if (rawCls === "PointerParam" || rawCls === "MultiPointerParam") return rawCls;

  // Keep PathParam as PathParam even if pointerClass is present.
  // PathParam may be "pointer-enabled" via pointerClass, but it must still render as PathParam.
  if (rawCls === "PathParam") return "PathParam";

  const pointerLike = hasPointerClass(defLike);

  // If pointerClass exists, treat it as pointer for non-PathParam params
  if (pointerLike) {
    // If backend sends min/max, interpret as multi-pointer
    if (hasMinMax(defLike)) return "MultiPointerParam";
    return "PointerParam";
  }

  return rawCls;
}


function withResolvedParamClass(defLike: any): any {
  // withResolvedParamClass
  const rawCls = getParamClass(defLike);
  const resolved = resolveParamClass(defLike);

  if (!resolved || resolved === rawCls) return defLike;

  // Force a stable paramClass so later logic (render/serialize) is consistent
  return { ...defLike, paramClass: resolved };
}


function unwrapParamDef(paramLike: any): UnwrappedParam {
  // unwrapParamDef
  if (!paramLike || typeof paramLike !== "object") {
    return { paramName: "", paramDef: paramLike };
  }

  // Direct backend shape: { name: "...", paramClass: "..." }
  if (typeof (paramLike as any).name === "string") {
    return { paramName: String((paramLike as any).name ?? ""), paramDef: paramLike };
  }

  // Common backend shape: { [name]: payload }
  const entries = Object.entries(paramLike);
  if (entries.length === 1) {
    const [maybeName, payload] = entries[0] as [string, any];

    // If payload looks like a param definition, use it
    if (
      payload &&
      typeof payload === "object" &&
      ("paramClass" in payload || "_class" in payload)
    ) {
      return { paramName: String(maybeName), paramDef: payload };
    }

    // Otherwise keep previous behavior (rare edge cases)
    return { paramName: String(maybeName), paramDef: paramLike };
  }

  // Fallback
  return { paramName: String((paramLike as any).name ?? ""), paramDef: paramLike };
}


function unwrapObjValue(raw: any) {
  // unwrapObjValue
  if (raw && typeof raw === "object" && "value" in raw) {
    return (raw as any).value;
  }
  return raw;
}

function coerceBooleanValue(raw: any): boolean {
  // coerceBooleanValue
  const v = unwrapObjValue(raw);

  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;

  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }

  return false;
}

function coerceReadOnlyFlag(raw: any): boolean {
  // coerceReadOnlyFlag
  if (raw === true || raw === 1 || raw === "1") return true;
  if (raw === false || raw === 0 || raw === "0") return false;

  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }

  return false;
}


type JsonRowProps = {
  indent: number;
  toggle: React.ReactNode;
  children: React.ReactNode;
};

function JsonRow({ indent, toggle, children }: JsonRowProps) {
  // JsonRow
  return (
    <div
      style={{
        paddingLeft: indent * jsonIndentPx,
        display: "grid",
        gridTemplateColumns: `${jsonToggleColWidthPx}px 1fr`,
        columnGap: 6,
        alignItems: "start",
      }}
    >
      <div style={{ width: jsonToggleColWidthPx, lineHeight: 1 }}>{toggle}</div>
      <div
        style={{
          minWidth: 0,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function JsonToggleButton({
  expanded,
  onToggle,
  disabled,
}: {
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  // JsonToggleButton
  if (disabled) return <span />;

  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: jsonToggleColWidthPx,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        color: "inherit",
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: 1,
      }}
      aria-label={expanded ? "Collapse" : "Expand"}
    >
      {expanded ? "▾" : "▸"}
    </button>
  );
}

function encodePathSegment(seg: string) {
  // encodePathSegment
  try {
    return encodeURIComponent(seg);
  } catch {
    return seg;
  }
}


type JsonNodeProps = {
  value: any;
  path: string;
  indent: number;
  isLast: boolean;
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  seen: WeakSet<object>;
  keyName?: string;
  isArrayItem?: boolean;
};

function JsonNode({
  value,
  path,
  indent,
  isLast,
  expandedPaths,
  togglePath,
  seen,
  keyName,
  isArrayItem,
}: JsonNodeProps) {
  // JsonNode
  const comma = isLast ? "" : ",";

  const isObjLike = value !== null && typeof value === "object";
  const isArr = Array.isArray(value);

  const renderKeyPrefix = () => {
    // renderKeyPrefix
    if (typeof keyName !== "string" || !keyName) return null;

    const renderedKey = isArrayItem ? keyName : JSON.stringify(keyName);

    return (
      <>
        <span style={{ color: jsonKeyColor }}>{renderedKey}</span>
        <span style={{ color: jsonPunctColor }}>: </span>
      </>
    );
  };

  if (!isObjLike) {
    return (
      <JsonRow indent={indent} toggle={<span />}>
        {renderKeyPrefix()}
        {renderJsonScalar(value)}
        <span style={{ color: jsonPunctColor }}>{comma}</span>
      </JsonRow>
    );
  }

  if (seen.has(value)) {
    return (
      <JsonRow indent={indent} toggle={<span />}>
        {renderKeyPrefix()}
        <span style={{ color: jsonNullColor }}>{JSON.stringify("[Circular]")}</span>
        <span style={{ color: jsonPunctColor }}>{comma}</span>
      </JsonRow>
    );
  }
  seen.add(value);

  const entries: Array<[string, any]> = isArr
    ? (value as any[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, any>);

  const isExpandable = entries.length > 0;
  const isExpanded = isExpandable && expandedPaths.has(path);

  const itemsLabel = `${entries.length} items`;
  const collapsedToken = isArr ? `[${itemsLabel}]` : `{ ${itemsLabel}}`;
  const open = isArr ? "[" : "{";
  const close = isArr ? "]" : "}";

  // Render empty object/array as a single token: { 0 items } / [0 items]
  if (!isExpandable) {
    return (
      <JsonRow indent={indent} toggle={<span />}>
        {renderKeyPrefix()}
        <span style={{ color: jsonPunctColor }}>{collapsedToken}</span>
        <span style={{ color: jsonPunctColor }}>{comma}</span>
      </JsonRow>
    );
  }

  // Collapsed node: "key": { 3 items }  OR  [20 items]
  if (!isExpanded) {
    return (
      <JsonRow
        indent={indent}
        toggle={<JsonToggleButton expanded={false} onToggle={() => togglePath(path)} />}
      >
        {renderKeyPrefix()}
        <span style={{ color: jsonPunctColor }}>{collapsedToken}</span>
        <span style={{ color: jsonPunctColor }}>{comma}</span>
      </JsonRow>
    );
  }

  // Expanded node:
  // - Opening line contains optional key + the opening brace/bracket
  // - Children lines
  // - Closing line contains only closing brace/bracket + comma
  return (
    <>
      <JsonRow
        indent={indent}
        toggle={<JsonToggleButton expanded={true} onToggle={() => togglePath(path)} />}
      >
        {renderKeyPrefix()}
        <span style={{ color: jsonPunctColor }}>{open}</span>
      </JsonRow>

      {entries.map(([k, v], idx) => {
        const childIsLast = idx === entries.length - 1;
        const childPath = `${path}/${encodePathSegment(k)}`;

        if (isArr) {
          return (
            <JsonNode
              key={childPath}
              value={v}
              path={childPath}
              indent={indent + 1}
              isLast={childIsLast}
              expandedPaths={expandedPaths}
              togglePath={togglePath}
              seen={seen}
            />
          );
        }

        return (
          <JsonNode
            key={childPath}
            value={v}
            path={childPath}
            indent={indent + 1}
            isLast={childIsLast}
            expandedPaths={expandedPaths}
            togglePath={togglePath}
            seen={seen}
            keyName={k}
          />
        );
      })}

      <JsonRow indent={indent} toggle={<span />}>
        <span style={{ color: jsonPunctColor }}>{close}</span>
        <span style={{ color: jsonPunctColor }}>{comma}</span>
      </JsonRow>
    </>
  );
}



function JsonTree({ data }: { data: any }) {
  // JsonTree
  const [copied, setCopied] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(["$"]));

  const togglePath = (path: string) => {
    // togglePath
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const jsonText = useMemo(() => {
    // jsonText
    try {
      return JSON.stringify(data, makeSafeJsonReplacer(), 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const handleCopy = async () => {
    // handleCopy
    try {
      await copyTextToClipboard(jsonText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      // noOp
    }
  };

  const seen = new WeakSet<object>();

  return (
    <Box
      sx={{
        height: "100%",
        maxHeight: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          size="small"
          variant="outlined"
          onClick={handleCopy}
          startIcon={<Copy size={16} />}
          sx={{ textTransform: "none" }}
        >
          {copied ? "Copying..." : "Copy JSON"}
        </Button>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          backgroundColor: "#f5f5f5",
          color: "#000000",
          border: "1px solid #e5e7eb",
          borderRadius: 2,
          p: 1.5,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.5,
          overflow: "auto",
        }}
      >
        <JsonNode
          value={data}
          path="$"
          indent={0}
          isLast={true}
          expandedPaths={expandedPaths}
          togglePath={togglePath}
          seen={seen}
        />
      </Box>
    </Box>
  );
}

type LogChannel = {
  id: string;
  label: string;
  order?: number;
};

type LogOffsets = Record<string, number>;

type LogChunkItem = {
  channel: string;
  content?: string;
  text?: string; // backward compatibility
  offset?: number;
  resetOffset?: boolean;
  truncated?: boolean;
  exists?: boolean;
  path?: string;
  bytesRead?: number;
  linesRead?: number;
  sizeBytes?: number;
};

type LogsChunkResponse = {
  chunks?: LogChunkItem[] | Record<string, { text?: string; offset?: number }>;
  done?: boolean;
};


const defaultLogChannels: LogChannel[] = [];

function mergeLogChannels(base: LogChannel[], extra: LogChannel[]) {
  // mergeLogChannels
  const map = new Map<string, LogChannel>();

  for (const ch of base) map.set(ch.id, ch);
  for (const ch of extra) {
    const prev = map.get(ch.id);
    map.set(ch.id, { ...prev, ...ch }); // extra overrides label/order if provided
  }

  return Array.from(map.values());
}

function buildLogBuffers(channels: LogChannel[], prev?: Record<string, string>) {
  // buildLogBuffers
  const next: Record<string, string> = {};
  for (const ch of channels) {
    next[ch.id] = typeof prev?.[ch.id] === "string" ? prev![ch.id] : "";
  }
  return next;
}

function buildOffsets(channels: LogChannel[], prev?: Record<string, number>) {
  // buildOffsets
  const next: Record<string, number> = {};
  for (const ch of channels) {
    const v = prev?.[ch.id];
    next[ch.id] = typeof v === "number" ? v : 0;
  }
  return next;
}

function buildOffsetsPayload(requestChannels: LogChannel[], offsets: Record<string, number>) {
  // buildOffsetsPayload
  const payload: Record<string, number> = {};
  for (const ch of requestChannels) {
    payload[ch.id] = typeof offsets[ch.id] === "number" ? offsets[ch.id] : 0;
  }
  return payload;
}


function normalizeLogChannels(raw: any): LogChannel[] {
  // normalizeLogChannels
  if (!raw) return defaultLogChannels;

  if (Array.isArray(raw)) {
    const arr = raw
      .map((x) => ({
        id: String(x?.id ?? x?.key ?? x?.name ?? ""),
        label: String(x?.label ?? x?.title ?? x?.name ?? ""),
        order: typeof x?.order === "number" ? x.order : undefined,
      }))
      .filter((x) => x.id.length > 0)
      .map((x) => ({
        ...x,
        label: x.label.trim().length > 0 ? x.label : x.id,
      }));

    return arr.length > 0 ? arr : defaultLogChannels;
  }

  if (raw && typeof raw === "object") {
    const channelsArr = Array.isArray(raw.channels) ? raw.channels : null;
    if (channelsArr) return normalizeLogChannels(channelsArr);

    const dict = raw.logs && typeof raw.logs === "object" ? raw.logs : raw;
    const entries = Object.entries(dict as Record<string, any>);

    const arr = entries
      .map(([id, meta]) => ({
        id: String(id),
        label: String(meta?.label ?? meta?.name ?? meta?.title ?? id),
        order: typeof meta?.order === "number" ? meta.order : undefined,
      }))
      .filter((x) => x.id.length > 0);

    return arr.length > 0 ? arr : defaultLogChannels;
  }

  return defaultLogChannels;
}

function sortLogChannels(channels: LogChannel[]): LogChannel[] {
  // sortLogChannels
  const arr = Array.isArray(channels) ? [...channels] : [];
  arr.sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : 1_000_000;
    const bo = typeof b.order === "number" ? b.order : 1_000_000;
    if (ao !== bo) return ao - bo;
    return String(a.label || a.id).localeCompare(String(b.label || b.id));
  });
  return arr.length > 0 ? arr : defaultLogChannels;
}


export default function ProtocolForm({
  data,
  projectProtocols = [],
  onClose,
  onExecuted,
  variant = "drawer",
}: ProtocolFormProps) {
  const svc = useProjectService();

  // unwrapEnvelope
  const info = useMemo(() => {
    if (data && typeof data === "object" && "info" in data) return (data as any).info ?? {};
    return {};
  }, [data]);

  // unwrapFormEnvelope
  const form = useMemo(() => {
    if (data && typeof data === "object" && "form" in data) return (data as any).form ?? {};
    return data ?? {};
  }, [data]);

  // keepValuesForLater
  const values = useMemo(() => {
    if (!data || typeof data !== "object") return null;

    if ("values" in data) return (data as any).values ?? null;

    const formObj = (data as any).form;
    if (formObj && typeof formObj === "object" && "values" in formObj) {
      return (formObj as any).values ?? null;
    }

    return null;
  }, [data]);

  // normalizeSections
  const sections = useMemo(() => {
    const s = (form as any)?.sections ?? (form as any)?.definition ?? [];
    return Array.isArray(s) ? s : [];
  }, [form]);

  // normalizeIdsAndCoreInfo
  const projectId = info?.projectId ?? (form as any)?.projectId ?? (form as any)?.project?.id ?? null;
  const protocolId =
    info?.protocolId ?? info?.id ?? (form as any)?.protocolId ?? (form as any)?.id ?? null;
  const protocolClassName =
    info?.protocolClassName ?? (form as any)?.protocolClassName ?? null;


  const outputsFromApi = useMemo(() => {
    const arr =
      Array.isArray(info?.outputs) ? info.outputs :
        Array.isArray((form as any)?.outputs) ? (form as any).outputs :
          [];
    return arr;
  }, [info, form]);


  const executeModeMap = useMemo(() => {
    const raw = (info as any)?.executeMode ?? null;
    if (!raw || typeof raw !== "object") return null;
    return raw as Record<string, { label?: string; help?: string }>;
  }, [info]);

  const [selectedExecuteMode, setSelectedExecuteMode] = useState<string | null>(null);

  useEffect(() => {
    if (!executeModeMap) return;
    const keys = Object.keys(executeModeMap);
    if (keys.length === 0) return;

    setSelectedExecuteMode((prev) => {
      if (prev && executeModeMap[prev]) return prev;
      return keys[0];
    });
  }, [executeModeMap]);




  const [topTab, setTopTab] = useState(0);
  const [activeLogChannelId, setActiveLogChannelId] = useState<string>("");
  const [sectionTab, setSectionTab] = useState(0);
  const [protocolDetails, setProtocolDetails] = useState<any>({});
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({});
  const [execError, setExecError] = useState<string | null>(null);

  // actionLoadingState
  const [actionLoading, setActionLoading] = useState<"save" | "execute" | null>(null);
  const isSaving = actionLoading === "save";
  const isExecuting = actionLoading === "execute";
  const isBusy = actionLoading !== null;

  // Exit animation state
  const [isClosing, setIsClosing] = useState(false);

  // Drag/drop state
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [currentDraggedOutput] = useState<any>(null);

  // Logs (dynamic channels)
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [logChannels, setLogChannels] = useState<LogChannel[]>(defaultLogChannels);
  const sortedLogChannels = useMemo(() => sortLogChannels(logChannels), [logChannels]);

  const uiChannelsRef = useRef<LogChannel[]>(defaultLogChannels);
  const requestChannelsRef = useRef<LogChannel[]>(defaultLogChannels);

  const [logBuffers, setLogBuffers] = useState<Record<string, string>>(() =>
    buildLogBuffers(defaultLogChannels)
  );

  const offsetsRef = useRef<Record<string, number>>(buildOffsets(defaultLogChannels));

  useEffect(() => {
    // ensureActiveLogChannelId
    if (!sortedLogChannels || sortedLogChannels.length === 0) return;

    setActiveLogChannelId((prev) => {
      if (prev && sortedLogChannels.some((c) => c.id === prev)) return prev;
      return sortedLogChannels[0].id;
    });
  }, [sortedLogChannels]);


  const [logsError, setLogsError] = useState<string | null>(null);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [execErrorDialogOpen, setExecErrorDialogOpen] = useState(false);
  const [execErrorDialogTitle, setExecErrorDialogTitle] = useState("Error");
  const [execErrorDialogMessage, setExecErrorDialogMessage] = useState<string>("");

  // Global Output Selector
  const [openSelector, setOpenSelector] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState<{
    key: string;
    def?: any;
    expectedClass?: string | string[] | null;
  } | null>(null);
  const [expectedClass, setExpectedClass] = useState<string | string[] | null | undefined>(undefined);
  const [allOutputs, setAllOutputs] = useState<any[]>([]);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);

  // Tracks last committed label for inputType to detect user changes
  const prevSelectedInputTypeRef = useRef<string | null>(null);

  // --------------------------------------------
  // Outputs tab state
  // --------------------------------------------
  const [selectedOutputIdx, setSelectedOutputIdx] = useState<number | null>(null);


  // --------------------------------------------
  // Metadata tab snapshot
  // --------------------------------------------
  const [metadataSnapshot, setMetadataSnapshot] = useState<any>(data);

  // Preview panel state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);

  const [sqliteTable, setSqliteTable] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [pathDialog, setPathDialog] = useState<{
    open: boolean;
    stateKey: string | null;
    title: string | null;
  }>({
    open: false,
    stateKey: null,
    title: null,
  });


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

  // Normalize outputs from data.outputs for the Outputs tab
  const normalizedOutputs = useMemo(() => {
    const arr = Array.isArray(outputsFromApi) ? outputsFromApi : [];
    return arr.map((entry: any, idx: number) => {
      const outputName = String(entry?.outputName ?? entry?.name ?? entry?._key ?? idx);
      const infoText = entry?.info ?? entry?.pointerClass ?? "";
      return { name: outputName, infoText, raw: entry };
    });
  }, [outputsFromApi]);



  // Active Output
  const activeOutput = useMemo(() => {
    if (
      selectedOutputIdx == null ||
      selectedOutputIdx < 0 ||
      selectedOutputIdx >= normalizedOutputs.length
    ) {
      return null;
    }
    return normalizedOutputs[selectedOutputIdx];
  }, [selectedOutputIdx, normalizedOutputs]);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // Request preview whenever activeOutput/sqliteTable changes
  useEffect(() => {
    if (!projectId || !protocolId) {
      setPreviewData(null);
      setPreviewError("Missing projectId or protocolId");
      setPreviewLoading(false);
      return;
    }
    if (!activeOutput) {
      setPreviewData(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setSqliteTable(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    (async () => {
      try {
        const res: any = await svc.fetchOutputPreview(
          projectId,
          protocolId,
          activeOutput.name,
          sqliteTable ? { table: sqliteTable } : undefined
        );
        if (cancelled) return;

        // Track object URLs (image/pdf/binary) to revoke later
        if ((res?.kind === "image" || res?.kind === "pdf" || res?.kind === "binary") && res.url) {
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = res.url;
        }

        setPreviewData(res ?? null);
      } catch (err: any) {
        if (cancelled) return;
        setPreviewError(err?.message || "Failed to load preview");
        setPreviewData(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeOutput, protocolId, sqliteTable, svc, projectId]);

  // Use this instead of onClose() directly to play exit animation
  const requestClose = () => setIsClosing(true);
  const handleAnimationEnd = () => {
    // Only propagate close to parent after the exit animation completes
    if (isClosing) onClose();
  };

  // Parse JSON envelopes like {"value": "..."} if they appear as strings or objects
  const parseFromJSONValue = (maybeJson: any) => {
    // parseFromJSONValue
    try {
      // unwrapObjectEnvelope
      if (maybeJson && typeof maybeJson === "object" && "value" in maybeJson) {
        return (maybeJson as any).value;
      }

      // unwrapStringEnvelope
      if (typeof maybeJson === "string") {
        const obj = JSON.parse(maybeJson);
        if (obj && typeof obj === "object" && "value" in obj) {
          return (obj as any).value;
        }
      }
    } catch {
      // noOp
    }
    return maybeJson;
  };

  const coerceToken = (raw: any) => {
    if (raw === undefined || raw === null) return "";
    if (typeof raw === "boolean" || typeof raw === "number") return raw;
    if (typeof raw !== "string") return raw;
    const trimmed = raw.trim();
    if (/^["'].*["']$/.test(trimmed)) return trimmed.slice(1, -1);
    if (/^(True|true)$/.test(trimmed)) return true;
    if (/^(False|false)$/.test(trimmed)) return false;
    if (!isNaN(Number(trimmed))) return Number(trimmed);
    return trimmed;
  };

  const getParamCurrentValue = (sectionIdx: number, paramName: string) => {
    const key = `${sectionIdx}_${paramName}`;
    const state = protocolDetails.params?.[key];
    if (!state) return "";
    if (getParamClass(state) === "EnumParam" && Array.isArray(state.choices)) {
      const v = state.editableValue ?? state.default ?? "";
      if (typeof v === "number") return v;
      const idx = state.choices.indexOf(v);
      return idx >= 0 ? idx : 0;
    }
    return state.editableValue ?? "";
  };

  // Locate the global expertLevel EnumParam if present
  const findGeneralExpertLocator = useCallback(() => {
    if (!Array.isArray(sections)) return null;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const params = section?.params ?? [];
      for (const p of params) {
        const { paramName, paramDef: def } = unwrapParamDef(p);
        if (paramName === "expertLevel" && getParamClass(def) === "EnumParam") {
          return { sectionIdx: i, name: paramName };
        }
      }
    }
    return null;
  }, [sections]);

  // 0 = Normal, 1 = Advanced
  const generalExpertLevel = (() => {
    const loc = findGeneralExpertLocator();
    if (!loc) return null;
    const v = getParamCurrentValue(loc.sectionIdx, "expertLevel");
    return typeof v === "number" ? v : Number(v) || 0;
  })();

  // Show/hide params with logical conditions
  const evalAtom = (sectionIdx: number, atom: string): boolean => {
    let a = atom.replace(/[()]/g, "").trim();
    let neg = false;
    if (/^not\s+/i.test(a)) {
      neg = true;
      a = a.replace(/^not\s+/i, "").trim();
    } else if (a.startsWith("!")) {
      neg = true;
      a = a.slice(1).trim();
    }
    const m = a.match(/^(.*?)\s*(==|!=|>=|<=|>|<|=)\s*(.*)$/);
    let res = false;
    if (m) {
      const [, leftRaw, opRaw, rightRaw] = m;
      const left = coerceToken(getParamCurrentValue(sectionIdx, leftRaw.trim()));
      const op = opRaw === "=" ? "==" : opRaw;
      const right = coerceToken(rightRaw.replace(/[()]/g, "").trim());
      switch (op) {
        case "==":
          res = left === right;
          break;
        case "!=":
          res = left !== right;
          break;
        case ">":
          res = (left as any) > (right as any);
          break;
        case "<":
          res = (left as any) < (right as any);
          break;
        case ">=":
          res = (left as any) >= (right as any);
          break;
        case "<=":
          res = (left as any) <= (right as any);
          break;
      }
    } else {
      const v = coerceToken(getParamCurrentValue(sectionIdx, a));
      res = !!(v === true || v === "True" || v === 1 || v === "1");
    }
    return neg ? !res : res;
  };

  const evalExpr = (sectionIdx: number, exprRaw: string): boolean => {
    const expr = exprRaw
      .replace(/[()]/g, " ")
      .replace(/\band\b/gi, "&&")
      .replace(/\bor\b/gi, "||")
      .replace(/\s+/g, " ")
      .trim();
    if (!expr) return true;
    return expr
      .split("||")
      .some((part) => part.split("&&").every((atom) => evalAtom(sectionIdx, atom.trim())));
  };

  // ANSI color parser for logs
  function parseAnsi(line: string): JSX.Element[] {
    const regex = /\x1b\[(\d+)m/g;
    const parts: JSX.Element[] = [];
    let lastIndex = 0;
    let match;
    let currentColor: string | null = null;
    let key = 0;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={key++} style={{ color: currentColor ?? "inherit" }}>
            {line.slice(lastIndex, match.index)}
          </span>
        );
      }
      const code = parseInt(match[1], 10);
      switch (code) {
        case 31:
          currentColor = "red";
          break;
        case 32:
          currentColor = "green";
          break;
        case 33:
          currentColor = "orange";
          break;
        case 35:
          currentColor = "magenta";
          break;
        case 0:
          currentColor = null;
          break;
        default:
          currentColor = null;
          break;
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push(
        <span key={key++} style={{ color: currentColor ?? "inherit" }}>
          {line.slice(lastIndex)}
        </span>
      );
    }
    return parts;
  }


  const hasOwn = (obj: any, key: string) => {
    // hasOwn
    return obj != null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
  };

  const getInitialRawForParam = (paramName: string, def: any, valuesMap: any) => {
    // getInitialRawForParam
    if (hasOwn(valuesMap, paramName)) return valuesMap[paramName];
    return def?.value ?? def?.default ?? "";
  };

  const normalizePointerToken = (raw: any): string => {
    // normalizePointerToken
    const v = parseFromJSONValue(raw);

    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);

    if (v && typeof v === "object") {
      if ("value" in v) return String((v as any).value ?? "");
      if ("object" in v) return String((v as any).object ?? "");
    }

    return "";
  };

  const normalizeEnumLabel = (raw: any, choices: string[] | undefined, fallback: any) => {
    // normalizeEnumLabel
    const parsed = parseFromJSONValue(raw);
    if (!Array.isArray(choices) || choices.length === 0) return parsed ?? fallback ?? "";

    if (typeof parsed === "number") return choices[parsed] ?? (fallback ?? choices[0]);
    if (typeof parsed === "string") {
      const trimmed = parsed.trim();

      // If backend sends "0"/"1" as string index
      if (!choices.includes(trimmed) && /^\d+$/.test(trimmed)) {
        const idx = Number(trimmed);
        return choices[idx] ?? (fallback ?? choices[0]);
      }

      return choices.includes(trimmed) ? trimmed : (fallback ?? choices[0]);
    }

    return fallback ?? choices[0];
  };

  const normalizeMultiPointerValue = (raw: any) => {
    // normalizeMultiPointerValue
    const parsed = parseFromJSONValue(raw);

    const tryParseJsonArray = (text: string) => {
      // tryParseJsonArray
      const t = text.trim();
      if (!t) return null;

      try {
        const v = JSON.parse(t);
        return Array.isArray(v) ? v : null;
      } catch {
        try {
          const normalized = t
            .replace(/'/g, '"')
            .replace(/\bNone\b/g, "null")
            .replace(/\bTrue\b/g, "true")
            .replace(/\bFalse\b/g, "false");
          const v2 = JSON.parse(normalized);
          return Array.isArray(v2) ? v2 : null;
        } catch {
          return null;
        }
      }
    };

    const asArray =
      Array.isArray(parsed)
        ? parsed
        : typeof parsed === "string"
          ? (tryParseJsonArray(parsed) ?? [])
          : [];

    return asArray.map((item: any) => {
      // normalizeMultiPointerItem
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        const token = String(item);
        return { object: token, value: token, info: "", pointerClass: "", parentId: null };
      }

      const objectToken = item?.object ?? item?.value ?? item?._objValue ?? item?._objId ?? "";
      const objectStr = String(objectToken ?? "");

      return {
        object: objectStr,
        value: objectStr,
        info: String(item?.info ?? ""),
        pointerClass: String(item?.pointerClass ?? item?._class ?? ""),
        parentId: item?.parentId ?? null,
      };
    });
  };



  // Load initial parameters into protocolDetails
  useEffect(() => {
    if (!form) {
      setProtocolDetails({});
      return;
    }

    const valuesMap = values && typeof values === "object" ? values : null;

    const params: any = {};
    const walk = (secIdx: number, paramLike: any) => {
      // walkParamDefinitionTree
      const { paramName: name, paramDef: def } = unwrapParamDef(paramLike);
      if (!def) return;

      const rawDef = def;
      const defResolved = withResolvedParamClass(rawDef);
      const cls = resolveParamClass(defResolved);

      // Always traverse decorators even when name is missing
      // Decorators should never create state keys; just traverse children if present
      if (cls === "Group" || cls === "Line") {
        const children = Array.isArray(rawDef?.params) ? rawDef.params : [];
        children.forEach((c: any) => walk(secIdx, c));
        return;
      }

      // Label is a pure decorator (no value stored)
      if (cls === "Label") {
        return;
      }


      // For real params, name is required to create a state key
      if (!name) return;

      const key = `${secIdx}_${name}`;

      // Use values[name] as source of truth (fallback to def.value/def.default)
      const rawFromApi = getInitialRawForParam(name, def, valuesMap);
      const parsedFromApi = parseFromJSONValue(rawFromApi);

      if (cls === "BooleanParam") {
        const initBool = coerceBooleanValue(parsedFromApi);

        const defObjValue = parseFromJSONValue(def.value);
        const defDefault = parseFromJSONValue(def.default);

        params[key] = {
          ...defResolved,
          value: coerceBooleanValue(defObjValue),
          default: coerceBooleanValue(defDefault),
          editableValue: initBool,
        };
        return;
      }

      if (cls === "MultiPointerParam") {
        // If valuesMap provides an empty/null value, fallback to def.value/def.default
        const rawCandidate = getInitialRawForParam(name, def, valuesMap);
        const fallbackRaw = def?.value ?? def?.default ?? [];
        const rawEffective =
          rawCandidate === null || rawCandidate === undefined || rawCandidate === ""
            ? fallbackRaw
            : rawCandidate;

        const initList = normalizeMultiPointerValue(rawEffective);

        params[key] = {
          ...def,
          editableValue: initList,
        };
        return;
      }


      if (cls === "PointerParam") {
        const token = normalizePointerToken(rawFromApi);
        params[key] = {
          ...defResolved,
          paramClass: "PointerParam",
          value: token,
          editableValue: token,
        };
        return;
      }

      if (cls === "PathParam") {
        const token = parsedFromApi ?? "";
        params[key] = {
          ...defResolved,
          paramClass: "PathParam",
          value: token,
          editableValue: token,
        };
        return;
      }

      if (cls === "EnumParam" && Array.isArray(def.choices)) {
        const label = normalizeEnumLabel(rawFromApi, def.choices, def.default);
        params[key] = {
          ...defResolved,
          editableValue: label,
        };
        return;
      }

      params[key] = {
        ...defResolved,
        editableValue: parsedFromApi ?? "",
      };
    };


    sections.forEach((section: any, i: number) => {
      section?.params?.forEach((p: any) => walk(i, p));
    });

    setProtocolDetails({
      label: info?.protocolName ?? info?.label ?? (form as any)?.protocolName ?? "",
      status: info?.status ?? (form as any)?.status ?? "",
      id: protocolId ?? "",
      color: info?.color ?? (form as any)?.color ?? "",
      params,
    });

    // Remember initial inputType label to detect future user change
    if (protocolClassName === "ProtUnionSet") {
      const inputTypeKey = Object.keys(params).find((k) => k.endsWith("_inputType"));
      if (inputTypeKey) {
        const it = params[inputTypeKey];
        const label =
          typeof it.editableValue === "string"
            ? it.editableValue
            : typeof it.default === "string"
              ? it.default
              : null;
        prevSelectedInputTypeRef.current = label ?? null;
      }
    }
  }, [form, info, values, sections, protocolId, protocolClassName]);


  const isTerminalStatus = (s: any) =>
    ["finished", "success", "done", "failed", "error", "cancelled", "canceled", "stopped", "aborted"]
      .includes(String(s || "").toLowerCase());
  const idleStreakRef = useRef<number>(0);

  const maxLogCharsPerChannel = 300_000;

  function trimLogBuffer(text: string, maxChars: number): string {
    // trimLogBuffer
    if (maxChars <= 0) return text;
    if (text.length <= maxChars) return text;

    const start = text.length - maxChars;

    // trimToNextNewline
    const nl = text.indexOf("\n", start);
    if (nl >= 0 && nl + 1 < text.length) return text.slice(nl + 1);

    return text.slice(start);
  }


  // Incremental log polling (svc-only, dynamic channels)
  useEffect(() => {
    // clearPreviousInterval
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    setLogsError(null);

    // enablePollingOnlyOnLogsTab
    if (topTab !== 2 || !projectId || !protocolId) return;

    let cancelled = false;
    idleStreakRef.current = 0;

    const fetchChannelsFn = svc.fetchProtocolLogChannels;
    const fetchChunkFn = svc.fetchProtocolLogsChunk;


    const ensureChannelState = (channels: LogChannel[]) => {
      // ensureChannelState
      const ids = channels.map((c) => c.id);

      setLogBuffers((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          if (typeof next[id] !== "string") next[id] = "";
        }
        return next;
      });

      for (const id of ids) {
        if (typeof offsetsRef.current[id] !== "number") offsetsRef.current[id] = 0;
      }
    };

    const appendChunks = (chunksRaw: any): boolean => {
      // appendChunks
      if (!chunksRaw) return false;

      const items: Array<{ id: string; text: string; nextOffset: number | null; reset: boolean }> = [];

      // normalizeFromArrayShape
      if (Array.isArray(chunksRaw)) {
        for (const c of chunksRaw) {
          const id = String(c?.channel ?? "");
          if (!id) continue;

          const text =
            typeof c?.content === "string"
              ? c.content
              : typeof c?.text === "string"
                ? c.text
                : "";

          const nextOffset = typeof c?.offset === "number" ? c.offset : null;
          const reset = Boolean(c?.resetOffset);

          items.push({ id, text, nextOffset, reset });
        }
      }
      // normalizeFromDictShape (legacy)
      else if (typeof chunksRaw === "object") {
        for (const [idRaw, chunk] of Object.entries(chunksRaw)) {
          const id = String(idRaw ?? "");
          if (!id) continue;

          const text = typeof (chunk as any)?.text === "string" ? (chunk as any).text : "";
          const nextOffset = typeof (chunk as any)?.offset === "number" ? (chunk as any).offset : null;

          items.push({ id, text, nextOffset, reset: false });
        }
      } else {
        return false;
      }

      if (items.length === 0) return false;

      let gotNew = false;
      const patches: Record<string, { reset: boolean; text: string }> = {};

      for (const it of items) {
        const curOffset = typeof offsetsRef.current[it.id] === "number" ? offsetsRef.current[it.id] : 0;

        const offsetKnown = typeof it.nextOffset === "number";
        const nextOffset = offsetKnown ? (it.nextOffset as number) : curOffset;

        // resetIfServerSaysOrOffsetGoesBack
        const mustReset = it.reset || (offsetKnown && nextOffset < curOffset);

        if (mustReset) {
          offsetsRef.current[it.id] = offsetKnown ? nextOffset : 0;
          patches[it.id] = { reset: true, text: it.text };
          if (it.text.length > 0) gotNew = true;
          continue;
        }

        // appendOnlyIfOffsetAdvanced
        if (offsetKnown && nextOffset > curOffset) {
          offsetsRef.current[it.id] = nextOffset;

          if (it.text.length > 0) {
            patches[it.id] = { reset: false, text: it.text };
            gotNew = true;
          }
        }
      }

      if (gotNew) {
        setLogBuffers((prev) => {
          const next = { ...prev };
          for (const [id, p] of Object.entries(patches)) {
            const base = p.reset ? "" : String(next[id] ?? "");
            next[id] = trimLogBuffer(base + p.text, maxLogCharsPerChannel);
          }
          return next;
        });
      }

      return gotNew;
    };


    // initialLoad
    (async () => {
      try {
        const rawChannels: any = await fetchChannelsFn(projectId, protocolId);
        if (cancelled) return;

        const serverChannels = sortLogChannels(normalizeLogChannels(rawChannels));

        // uiChannels keeps defaults (includes schedule) plus whatever the server declares
        const uiChannels = sortLogChannels(mergeLogChannels(defaultLogChannels, serverChannels));

        // requestChannels only includes what server declared (if any); otherwise fallback to defaults
        const requestChannels = serverChannels.length > 0 ? serverChannels : defaultLogChannels;

        uiChannelsRef.current = uiChannels;
        requestChannelsRef.current = requestChannels;

        setLogChannels(uiChannels);

        setLogBuffers((prev) => buildLogBuffers(uiChannels, prev));
        offsetsRef.current = buildOffsets(uiChannels, offsetsRef.current);

        const offsetsPayload = buildOffsetsPayload(requestChannelsRef.current, offsetsRef.current);

        const rawChunk: LogsChunkResponse = await fetchChunkFn(projectId, protocolId, offsetsPayload);
        if (cancelled) return;

        appendChunks(rawChunk?.chunks);
      } catch (err: any) {
        if (!cancelled) setLogsError(err?.message || "Failed to load logs");
      }
    })();


    // incrementalPolling
    pollRef.current = setInterval(async () => {
      try {
        const offsetsPayload = buildOffsetsPayload(requestChannelsRef.current, offsetsRef.current);

        const rawChunk: LogsChunkResponse = await fetchChunkFn(projectId, protocolId, offsetsPayload);
        if (cancelled) return;

        const gotNew = appendChunks(rawChunk?.chunks);

        // stopPollingWhenTerminalAndIdle
        if (isTerminalStatus(protocolDetails.status)) {
          idleStreakRef.current = gotNew ? 0 : idleStreakRef.current + 1;
          if (idleStreakRef.current >= 2 && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } else {
          if (gotNew) idleStreakRef.current = 0;
        }
      } catch (err: any) {
        if (!cancelled) setLogsError(err?.message || "Failed to poll logs");
      }
    }, 2000);


    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [topTab, projectId, protocolId, protocolDetails.status, svc]);


  // Autoscroll logs
  const activeLogText = logBuffers[activeLogChannelId] ?? "";

  useEffect(() => {
    // autoscrollActiveLogChannel
    if (!logsContainerRef.current) return;
    logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
  }, [activeLogChannelId, activeLogText]);



  // Live expected-class reader for pointer-like params
  const getExpectedClass = (def: any): string | string[] | null => {
    if (!def) return null;
    const candidates = [
      def.pointerClass,
      def.pointerClassName,
      def.accept,
      def.accepts,
      def.accepted,
      def.objectClass,
      def.targetClass,
      def._expectedClass,
      def.acceptsClass,
      def.type,
      def._type,
      def._classAccepted,
      def.class,
    ];

    const flat: string[] = [];
    const push = (s?: any) => {
      if (typeof s === "string") {
        const v = s.trim();
        if (v && !flat.includes(v)) flat.push(v);
      }
    };
    for (const c of candidates) {
      if (Array.isArray(c)) c.forEach(push);
      else push(c);
    }

    const isParamMeta = (s: string) =>
      /pointerparam$/i.test(s) || /multipointerparam$/i.test(s);
    const filtered = flat.filter((s) => !isParamMeta(s));

    if (filtered.length === 0) return null;
    return filtered.length === 1 ? filtered[0] : filtered;
  };

  // Collect outputs from all protocols (for the input selector)
  const gatherAllOutputs = useCallback((): {
    outputs: any[];
    dependencyMap: Record<string, string[]>;
  } => {
    if (!projectProtocols) return { outputs: [], dependencyMap: {} };

    const protocolsArray = Array.isArray(projectProtocols)
      ? projectProtocols
      : Object.values(projectProtocols);

    const outputs: any[] = [];
    const dependencyMap: Record<string, string[]> = {};

    for (const prot of protocolsArray) {
      const pid = String(prot.id);
      dependencyMap[pid] = (prot.children ?? []).map(String);
      if (!Array.isArray(prot.outputs)) continue;

      for (const outRaw of prot.outputs) {
        const hasOutputName =
          outRaw && typeof outRaw === "object" && "outputName" in outRaw;
        const out = hasOutputName ? (outRaw as any) : (outRaw as any);
        const key = String(out?.outputName ?? out?._key ?? out?.name ?? "");
        if (!key) continue;

        outputs.push({
          protocol: prot.label ?? prot.protocolName ?? prot.id ?? "Unknown",
          key,
          info: out?.info ?? "",
          paramClass: String(out?.paramClass ?? "PointerParam"),
          pointerClass: String(out?.pointerClass ?? ""),
          value: String(out?.value ?? ""),
          protocolId: pid,
          parentId: out?.parentId ?? null,
        });
      }
    }

    return { outputs, dependencyMap };
  }, [projectProtocols]);

  // Keep ProtUnionSet inputSets constraints in sync when inputType changes
  useEffect(() => {
    if (protocolClassName !== "ProtUnionSet") return;
    const params = protocolDetails?.params;
    if (!params || Object.keys(params).length === 0) return;

    const findKey = (name: string) =>
      Object.keys(params).find((k) => k.endsWith(`_${name}`));

    const inputTypeKey = findKey("inputType");
    const inputSetsKey = findKey("inputSets");
    if (!inputTypeKey || !inputSetsKey) return;

    const inputTypeParam = params[inputTypeKey];
    const inputSetsParam = params[inputSetsKey];
    if (!inputTypeParam || !inputSetsParam) return;

    // Resolve current label
    const rawSel =
      inputTypeParam.editableValue !== undefined
        ? inputTypeParam.editableValue
        : inputTypeParam.default;

    let selectedLabel: string | null = null;
    if (typeof rawSel === "number" && Array.isArray(inputTypeParam.choices)) {
      selectedLabel = inputTypeParam.choices[rawSel] ?? null;
    } else if (typeof rawSel === "string") {
      selectedLabel = rawSel;
    }
    if (selectedLabel == null) return;

    const prev = prevSelectedInputTypeRef.current;

    // First run: record and exit (no changes)
    if (prev === null) {
      prevSelectedInputTypeRef.current = selectedLabel;
      return;
    }

    // No change: do nothing
    if (prev === selectedLabel) return;

    prevSelectedInputTypeRef.current = selectedLabel;

    // Apply constraints according to selection
    const isAll = selectedLabel.trim().toLowerCase() === "all";
    const nextPointerClass = isAll ? null : `SetOf${selectedLabel.replace(/\s+/g, "")}`;

    setProtocolDetails((prevState: any) => {
      const clone = { ...prevState, params: { ...prevState.params } };
      const target = { ...clone.params[inputSetsKey] };

      if (isAll) {
        delete target.pointerClass;
        delete target.pointerClassName;
        delete target.accept;
        target.accepts = [];
        delete target.accepted;
        delete target._expectedClass;
        delete target.objectClass;
        delete target.type;
      } else {
        target.pointerClass = nextPointerClass!;
        target.pointerClassName = nextPointerClass!;
        target.accept = nextPointerClass!;
        target.accepts = [nextPointerClass!];
        target.accepted = nextPointerClass!;
        target._expectedClass = nextPointerClass!;
        target.objectClass = nextPointerClass!;
        target.type = nextPointerClass!;
        target.editableValue = [];
      }

      clone.params[inputSetsKey] = target;
      return clone;
    });
  }, [form?.protocolClassName, protocolDetails.params]);


  useEffect(() => {
    // updateMetadataSnapshotOnTabOpen
    if (topTab !== 3) return;

    const serialized = getSerializedParams();

    setMetadataSnapshot(() => {
      if (!data || typeof data !== "object") return data;

      // cloneEnvelopeShallow
      const base: any = Array.isArray(data) ? [...data] : { ...(data as any) };

      // mergeValuesKeepingUnknownKeys
      const prevValues =
        base.values && typeof base.values === "object" && !Array.isArray(base.values)
          ? base.values
          : {};

      const nextValues = { ...prevValues, ...serialized };

      base.values = nextValues;

      // optionalSyncFormValuesIfPresent
      if (base.form && typeof base.form === "object" && base.form !== null) {
        if ("values" in base.form) {
          base.form = { ...base.form, values: nextValues };
        }
      }

      return base;
    });
  }, [topTab, data, protocolDetails.params]);


  // Filter outputs for a given paramKey, excluding self and descendants
  const getFilteredOutputsForKey = (paramKey: string) => {
    const liveParam = protocolDetails.params?.[paramKey];
    const expected = getExpectedClass(liveParam);

    const { outputs, dependencyMap } = gatherAllOutputs();
    const currentId = String(form?.protocolId ?? "");

    const blocked = new Set<string>([currentId]);
    const stack = [currentId];
    while (stack.length > 0) {
      const parent = stack.pop()!;
      const children = dependencyMap[parent] || [];
      for (const child of children) {
        if (!blocked.has(child)) {
          blocked.add(child);
          stack.push(child);
        }
      }
    }

    const pool = outputs.filter((o) => !blocked.has(String(o.protocolId)));

    const norm = (s: any) =>
      typeof s === "string" ? s.replace(/\s+/g, "").toLowerCase() : "";

    if (expected === null) {
      return pool.filter((o) => /^setof/i.test(String(o.pointerClass || "")));
    }

    return pool.filter((o) => {
      const oc = norm(o.pointerClass);
      return Array.isArray(expected)
        ? expected.some((e) => norm(e) === oc)
        : norm(expected) === oc;
    });
  };

  // Serialize protocol parameters before save/execute

  // deriveParamNameFromStateKey
  const getParamNameFromStateKey = (stateKey: string) => {
    const firstUnderscore = stateKey.indexOf("_");
    return firstUnderscore >= 0 ? stateKey.slice(firstUnderscore + 1) : stateKey;
  };

  const getSerializedParams = () => {
    const out: any = {};

    Object.entries(protocolDetails.params || {}).forEach(([k, pRaw]: any) => {
      const keyParts = k.split("_");
      keyParts.shift();
      const newKey = getParamNameFromStateKey(k);

      const p = pRaw ?? {};
      const cls = resolveParamClass(p);

      if (cls === "PointerParam") {
        const editable = p.editableValue ?? "";
        let normalized = ""

        const token = (p.value ?? "").toString().trim();
        if (token) {
          normalized = token;
        } else if (editable) {
          normalized = String(editable);
        } else {
          normalized = "";
        }

        out[newKey] = normalized;
        return;
      }

      if (cls === "MultiPointerParam" && Array.isArray(p.editableValue)) {
        const list = p.editableValue.map((item: any) => {
          const token = item?.object ?? item?.value ?? "";
          return token ? String(token) : "";
        });

        out[newKey] = list;
        return;
      }

      if (cls === "BooleanParam") {
        const boolVal = coerceBooleanValue(
          p.editableValue ?? p.value ?? p.value ?? p.default
        );

        out[newKey] = boolVal ? true : false
        return;
      }

      if (cls === "PathParam") {
        const token = (p.value ?? p.editableValue ?? "").toString();
        out[newKey] = token;
        return;
      }


      out[newKey] = p.editableValue;
    });

    return out;
  };

  // Extract validation messages from backend error detail
  function extractValidationErrors(detail: string): string[] {
    const singleQuoted = Array.from(detail.matchAll(/'([^']+)'/g), (m) => m[1].trim());
    if (singleQuoted.length) return singleQuoted;

    const doubleQuoted = Array.from(detail.matchAll(/"([^"]+)"/g), (m) => m[1].trim());
    if (doubleQuoted.length) return doubleQuoted;

    const bracket = detail.match(/\[(.*)\]/);
    if (bracket && bracket[1]) {
      return bracket[1]
        .split(/',\s*'|",\s*"/)
        .map((s: string) => s.replace(/^['"]|['"]$/g, "").trim())
        .filter((s: string) => s.length > 0);
    }
    return [detail.replace(/^422:\s*/, "").trim()];
  }

  function extractValidationMessages(detail: any): string[] {
    // extractValidationMessages
    if (!detail) return [];

    if (typeof detail === "string") {
      return extractValidationErrors(detail);
    }

    // FastAPI/Pydantic often returns an array of error objects
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "string") return item;

          const loc = Array.isArray(item?.loc) ? item.loc.join(".") : "";
          const msg = item?.msg ?? item?.message ?? JSON.stringify(item);
          const locPrefix = loc ? `${loc}: ` : "";
          return `${locPrefix}${String(msg)}`;
        })
        .filter((s) => typeof s === "string" && s.trim().length > 0);
    }

    if (typeof detail === "object") {
      const msg = (detail as any).msg ?? (detail as any).message ?? (detail as any).error;
      if (typeof msg === "string" && msg.trim()) return [msg];
      try {
        return [JSON.stringify(detail)];
      } catch {
        return [String(detail)];
      }
    }

    return [String(detail)];
  }

  function openExecErrorDialog(title: string, message: string) {
    // openExecErrorDialog
    setExecError(message); // optional: keep the inline Typography too
    setExecErrorDialogTitle(title);
    setExecErrorDialogMessage(message);
    setExecErrorDialogOpen(true);
  }

  function normalizeStringList(value: any): string[] {
    // normalizeStringList
    if (!value) return [];
    if (Array.isArray(value)) return value.map((v) => String(v)).filter((s) => s.trim().length > 0);
    if (typeof value === "string") return [value].filter((s) => s.trim().length > 0);
    return [String(value)].filter((s) => s.trim().length > 0);
  }

  function getBackendPayloadFromError(err: any): any {
    // getBackendPayloadFromError
    return err?.response?.data ?? err?.data ?? null;
  }

  function getHttpStatusFromError(err: any): number | null {
    // getHttpStatusFromError
    const statusCode = err?.status ?? err?.response?.status ?? null;
    return typeof statusCode === "number" ? statusCode : null;
  }

  function getErrorsFromBackendPayload(payload: any): string[] {
    // getErrorsFromBackendPayload
    if (!payload) return [];

    // Preferred schema from backend: { status: number, errors: string[], workflow: [] }
    const directErrors = normalizeStringList(payload?.errors);
    if (directErrors.length > 0) return directErrors;

    // Fallbacks (older/other shapes)
    const detail = payload?.detail ?? payload?.error ?? payload?.message ?? null;
    if (!detail) return [];

    // Reuse your existing logic for detail parsing if you want
    return extractValidationMessages(detail);
  }

  function formatErrorsForDialog(errors: string[]): string {
    // formatErrorsForDialog
    if (errors.length === 0) return "Unknown error";
    if (errors.length === 1) return errors[0];
    return errors.map((e, i) => `${i + 1}. ${e}`).join("\n");
  }


  // handleExecute
  const handleExecute = async (modeKey: string) => {
    setActionLoading("execute");
    setExecError(null);
    setValidationErrors([]);

    try {
      const pid = String(protocolId ?? "");
      const serializedParams = getSerializedParams();
      const res: any = await svc.executeProtocol(projectId, pid, protocolClassName, serializedParams, modeKey);
      const errors = getErrorsFromBackendPayload(res);

      if (errors.length > 0) {
        setValidationErrors(errors);
        setShowValidationDialog(true);
        return;
      }

      onExecuted?.();
      requestClose();
    } catch (err: any) {
      // keepYourExistingErrorHandling
      const httpStatus = getHttpStatusFromError(err);
      const backendPayload = getBackendPayloadFromError(err);
      const errors = getErrorsFromBackendPayload(backendPayload);

      if (errors.length > 0) {
        if (httpStatus === 422) {
          setValidationErrors(errors);
          setShowValidationDialog(true);
          return;
        }
        openExecErrorDialog("Execution error", formatErrorsForDialog(errors));
        return;
      }

      const fallbackMsg =
        err?.message ||
        (typeof backendPayload?.detail === "string" ? backendPayload.detail : null) ||
        "Error launching the protocol";

      openExecErrorDialog("Execution error", String(fallbackMsg));
    } finally {
      setActionLoading(null);
    }
  };



  // handleSave
  const handleSave = async () => {
    setActionLoading("save");
    setExecError(null);

    try {
      const pid = String(protocolId ?? "");
      const serialized = getSerializedParams();

      const res: any = await svc.saveProtocol(projectId, pid, protocolClassName, serialized);
      const errors = getErrorsFromBackendPayload(res);

      const returnedProtocolId = String(res?.protocolId ?? pid);

      if (errors.length === 0) {
        toast.success(`Saved protocol ${returnedProtocolId} successfully.`);
        requestClose();
        return;
      }

      const msg = formatErrorsForDialog(errors);
      toast.error(`Saved with warnings: ${msg}`);
      requestClose();
    } catch (err: any) {
      const payload = getBackendPayloadFromError(err);
      const errors = getErrorsFromBackendPayload(payload);

      if (errors.length > 0) {
        const msg = formatErrorsForDialog(errors);
        toast.error(msg);
        openExecErrorDialog("Save error", msg);
        return;
      }

      const fallbackMsg =
        err?.message ||
        (typeof payload?.detail === "string" ? payload.detail : null) ||
        "Save failed";

      toast.error(String(fallbackMsg));
      openExecErrorDialog("Save error", String(fallbackMsg));
    } finally {
      setActionLoading(null);
    }
  };


  const handleAnalyzeResultsClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // openAnalyzeResultsDialog
    e.preventDefault();
    e.stopPropagation();
    if (!activeOutput) return;

    // buildAnalyzeContext
    const outputRaw = activeOutput.raw ?? null;
    const ctx = {
      projectId: String(projectId ?? ""),
      protocolId: String(protocolId ?? ""),
      outputName: String(activeOutput.name ?? ""),
      outputRaw,
      pointerClass: String(outputRaw?.pointerClass ?? outputRaw?.paramClass ?? outputRaw?._class ?? ""),
    };

    // tryServiceResolverFirst
    const resolveAnalyzeViewer = (svc as any)?.resolveAnalyzeViewer;
    if (typeof resolveAnalyzeViewer === "function") {
      try {
        const res = await resolveAnalyzeViewer(ctx);

        if (res?.handled) {
          const url = typeof res?.url === "string" ? res.url : "";
          const target = typeof res?.target === "string" ? res.target : "_self";

          // honorUrlTargetIfProvided
          if (url) {
            if (target === "_self") {
              if (url.startsWith("#")) {
                window.location.hash = url.slice(1);
              } else {
                window.location.assign(url);
              }
            } else {
              window.open(url, target);
            }
          }

          // doNotOpenInternalDialog
          return;
        }
      } catch (err) {
        console.warn("[ProtocolForm] resolveAnalyzeViewer failed, falling back:", err);
      }
    }

    // fallbackToInternalAnalyzeDialog
    setAnalyzeOpen(true);
  };




  // Render a single parameter row
  const renderParam = useCallback(
    (
      paramLike: any,
      sectionIdx: number,
      rowIndex = 0,
      layoutVariant: "standard" | "inline" = "standard",
      parentKeyPrefix = ""
    ): JSX.Element | null => {
      // renderParamRow
      const { paramName: name, paramDef: def } = unwrapParamDef(paramLike);
      if (!def) return null;

      const rawDef = def;
      const defResolved = withResolvedParamClass(rawDef);
      const defClass = resolveParamClass(defResolved);

      // Stable key for React + decorator state (even when name is missing)
      const basePrefix = parentKeyPrefix || `sec${sectionIdx}`;
      const stableKey = `${basePrefix}|${name ? `param:${name}` : `decorator:${defClass}:${rowIndex}`}`;

      // State key only exists for real params with a name
      const stateKey = name ? `${sectionIdx}_${name}` : null;
      const value = stateKey ? protocolDetails.params?.[stateKey]?.editableValue : undefined;

      const isInline = layoutVariant === "inline";


      // fieldWidthPx
      const inlineFieldWidth = 50;
      const standardFieldWidth = variant === "docked" ? 280 : 460;
      const fieldWidth = isInline ? inlineFieldWidth : standardFieldWidth;

      const fieldContainerSx = isInline
        ? { width: fieldWidth, flex: "0 0 auto", minWidth: 0 }
        : { flex: 1, minWidth: 0, maxWidth: "100%" };


      if (typeof def?.condition === "string" && def.condition.trim()) {
        if (!evalExpr(sectionIdx, def.condition)) return null;
      }

      const expertLocator = findGeneralExpertLocator();
      const isExpertSelector =
        !!expertLocator && expertLocator.sectionIdx === sectionIdx && name === "expertLevel";

      if (generalExpertLevel === 0 && def?.expertLevel === 1 && !isExpertSelector) {
        return null;
      }

      const advancedSlot = isInline
        ? def.expertLevel === 1
          ? (
            <Tooltip title="Advanced">
              <Box
                sx={{
                  width: 18,
                  height: 18,
                  bgcolor: "#777",
                  color: "white",
                  borderRadius: "50%",
                  fontSize: "0.7rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                A
              </Box>
            </Tooltip>
          )
          : null
        : (
          <Box
            sx={{
              width: "1.5rem",
              height: "1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {def.expertLevel === 1 ? (
              <Tooltip title="Advanced">
                <Box
                  sx={{
                    width: "1.5rem",
                    height: "1.5rem",
                    bgcolor: "#777",
                    color: "white",
                    borderRadius: "50%",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  A
                </Box>
              </Tooltip>
            ) : null}
          </Box>
        );

      // MultiPointerParam (requires stateKey)
      if (defClass === "MultiPointerParam") {
        if (!stateKey) return null;

        const items = Array.isArray(value) ? value : def.default ?? [];

        // By default editable; if def.readOnly is true => block manual typing in MultiParamRow
        const isReadOnly = coerceReadOnlyFlag(def?.readOnly);

        // onRowEdit
        const onRowEdit = (rowIndexInner: number, patch: { object?: string; info?: string }) => {
          setProtocolDetails((prev: any) => {
            const existing = prev.params?.[stateKey];
            const list = Array.isArray(existing?.editableValue) ? [...existing.editableValue] : [];

            while (list.length <= rowIndexInner) list.push({ object: "", value: "", info: "" });

            const current = list[rowIndexInner] ?? { object: "", value: "", info: "" };
            const nextItem = { ...current, ...patch };

            // keepObjectValueSynced
            if (typeof patch.object === "string") nextItem.value = patch.object;

            list[rowIndexInner] = nextItem;

            return {
              ...prev,
              params: {
                ...prev.params,
                [stateKey]: { ...existing, editableValue: list },
              },
            };
          });
        };


        const onClear = (i: number) => {
          setProtocolDetails((prev: any) => {
            const existing = prev.params?.[stateKey];
            const list = Array.isArray(existing?.editableValue) ? [...existing.editableValue] : [];
            list.splice(i, 1);
            list.push({ object: "", info: "" });

            return {
              ...prev,
              params: {
                ...prev.params,
                [stateKey]: { ...existing, editableValue: list },
              },
            };
          });
        };

        const onRowDrop = (i: number, dragged: any) => {
          const liveParam = protocolDetails.params?.[stateKey];
          const expected = getExpectedClass(liveParam);
          const norm = (s: any) => (typeof s === "string" ? s.replace(/\s+/g, "").toLowerCase() : "");
          const draggedClass = norm(dragged.pointerClass);

          const matches =
            expected === null
              ? true
              : Array.isArray(expected)
                ? expected.some((e) => norm(e) === draggedClass)
                : norm(expected) === draggedClass;

          if (!matches) return;

          setProtocolDetails((prev: any) => {
            const existing = prev.params?.[stateKey];
            const list = Array.isArray(existing?.editableValue) ? [...existing.editableValue] : [];
            while (list.length <= i) list.push({ object: "", info: "" });

            list[i] = {
              object: dragged.value ?? "",
              value: dragged.value ?? "",
              info: dragged.info ?? "",
              pointerClass: dragged.pointerClass ?? "",
              parentId: dragged.parentId ?? null,
            };

            return {
              ...prev,
              params: {
                ...prev.params,
                [stateKey]: { ...existing, editableValue: list },
              },
            };
          });
        };

        const handlePickFromDialog = (rowIndexInner: number, picked: any) => {
          setProtocolDetails((prev: any) => {
            const existing = prev.params?.[stateKey];
            const list = Array.isArray(existing?.editableValue) ? [...existing.editableValue] : [];

            while (list.length <= rowIndexInner) list.push({ object: "", info: "" });

            list[rowIndexInner] = {
              object: picked.value ?? "",
              value: picked.value ?? "",
              info: picked.info ?? "",
              pointerClass: picked.pointerClass ?? "",
              parentId: picked.protocolId ?? picked.parentId ?? null,
            };

            return {
              ...prev,
              params: {
                ...prev.params,
                [stateKey]: { ...existing, editableValue: list },
              },
            };
          });
        };

        const liveDef = {
          ...defResolved,
          ...(protocolDetails.params?.[stateKey] || {}),
          paramClass: "MultiPointerParam",
        };

        return (
          <ParamRow
            key={stableKey}
            label={def.label || name || ""}
            control={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {advancedSlot}
                <MultiParamRow
                  label={def.label || name || ""}
                  items={items}
                  helpText={def.help}
                  onRowClear={onClear}
                  onRowDrop={onRowDrop}
                  dragOverKey={dragOverKey}
                  setDragOverKey={setDragOverKey}
                  currentDraggedOutput={currentDraggedOutput}
                  paramKey={stateKey}
                  def={liveDef}
                  getAvailableOutputs={() => getFilteredOutputsForKey(stateKey)}
                  onPickForRow={handlePickFromDialog}
                  readOnly={isReadOnly}
                  onRowEdit={onRowEdit}
                />
              </Box>
            }
            helpText={def.help}
            rowIndex={rowIndex}
          />
        );
      }


      // PointerParam (requires stateKey)
      if (defClass === "PointerParam") {
        if (!stateKey) return null;

        const liveDef = {
          ...defResolved,
          ...(protocolDetails.params?.[stateKey] || {}),
          paramClass: "PointerParam",
        };

        const onClear = () =>
          setProtocolDetails((prev: any) => ({
            ...prev,
            params: {
              ...prev.params,
              [stateKey]: { ...prev.params[stateKey], editableValue: "", value: "" },
            },
          }));

        const handleOpenFind = (targetKey: string) => {
          const liveParam = protocolDetails.params?.[targetKey];
          const expected = getExpectedClass(liveParam);
          setExpectedClass(expected);
          setSelectorTarget({ key: targetKey, def: liveParam, expectedClass: expected });

          const finalOutputs = getFilteredOutputsForKey(targetKey);
          setAllOutputs(finalOutputs);
          setOpenSelector(true);
        };

        const isReadOnly = coerceReadOnlyFlag(def?.readOnly);



        const fieldContainerSx = {
          // fieldContainerSx
          width: "100%",
          maxWidth: fieldWidth,
          minWidth: 0,
        };

        const field = (
          <TextField
            size="small"
            fullWidth={!isInline}
            value={String(
              protocolDetails.params?.[stateKey]?.editableValue ??
              protocolDetails.params?.[stateKey]?.value ??
              def.default ??
              ""
            )}
            onChange={
              isReadOnly
                ? undefined
                : (e) =>
                  setProtocolDetails((prev: any) => ({
                    ...prev,
                    params: {
                      ...prev.params,
                      [stateKey]: {
                        ...prev.params[stateKey],
                        editableValue: e.target.value,
                        value: e.target.value,
                      },
                    },
                  }))
            }
            InputProps={isReadOnly ? { readOnly: true } : undefined}
            onClick={isReadOnly ? () => handleOpenFind(stateKey) : undefined}
            sx={{
              width: isInline ? fieldWidth : "100%",
              minWidth: 0,
              "& .MuiInputBase-root": { minHeight: 36 },
              "& .MuiInputBase-input, & input, & input[readonly]": {
                fontSize: 12,
                padding: "8px 10px",
                lineHeight: 1.2,
                color: "#111827",
                WebkitTextFillColor: "#111827",
                opacity: 1,
                userSelect: isReadOnly ? "none" : "text",
                cursor: isReadOnly ? "pointer" : "text",
              },
            }}
          />
        );


        return (
          <ParamRow
            key={stableKey}
            label={def.label || name || ""}
            control={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, width: "100%" }}>
                {advancedSlot}
                <Box sx={fieldContainerSx}>
                  <WrapWithDrop
                    control={field}
                    def={liveDef}
                    paramKey={stateKey}
                    setProtocolDetails={setProtocolDetails}
                    setDragOverKey={setDragOverKey}
                    dragOverKey={dragOverKey}
                  />
                </Box>
              </Box>
            }

            helpText={def.help}
            isPointerParam
            onClear={onClear}
            rowIndex={rowIndex}
            onOpenFind={() => handleOpenFind(stateKey)}
            layoutVariant={layoutVariant}
          />
        );
      }


      // PathParam (requires stateKey)
      if (defClass === "PathParam") {
        if (!stateKey) return null;

        const current = protocolDetails.params?.[stateKey] || {};
        const textValue = current.editableValue ?? current.value ?? def.value ?? def.default ?? "";
        const label = current['label'] ?? def.label ?? name ?? "";

        const isPointerEnabled =
          typeof current.pointerClass === "string"
            ? current.pointerClass.trim().length > 0
            : typeof def.pointerClass === "string" && def.pointerClass.trim().length > 0;

        const handleBrowsePath = () => {
          if (!projectId) {
            console.warn("Missing projectId for PathParam browse.");
            return;
          }
          setPathDialog({ open: true, stateKey, title: label });
        };

        const handleClear = () => {
          setProtocolDetails((prev: any) => {
            if (!prev?.params?.[stateKey]) return prev;
            return {
              ...prev,
              params: {
                ...prev.params,
                [stateKey]: {
                  ...prev.params[stateKey],
                  editableValue: "",
                  value: "",
                },
              },
            };
          });
        };

        const handleOpenFind = (targetKey: string) => {
          const liveParam = protocolDetails.params?.[targetKey];
          const expected = getExpectedClass(liveParam);
          setExpectedClass(expected);
          setSelectorTarget({ key: targetKey, def: liveParam, expectedClass: expected });

          const finalOutputs = getFilteredOutputsForKey(targetKey);
          setAllOutputs(finalOutputs);
          setOpenSelector(true);
        };

        const fieldContainerSx = {
          // fieldContainerSx
          width: "100%",
          maxWidth: fieldWidth,
          minWidth: 0,
        };

        const field = (
          <TextField
            size="small"
            fullWidth={!isInline}
            name={stateKey}
            value={textValue}
            onChange={(e) =>
              setProtocolDetails((prev: any) => {
                if (!prev?.params?.[stateKey]) return prev;
                return {
                  ...prev,
                  params: {
                    ...prev.params,
                    [stateKey]: {
                      ...prev.params[stateKey],
                      editableValue: e.target.value,
                      value: e.target.value,
                    },
                  },
                };
              })
            }
            sx={{
              width: isInline ? fieldWidth : "98%",
              minWidth: 0,
              "& .MuiInputBase-root": { minHeight: 36 },
              "& .MuiInputBase-input": { fontSize: 12, padding: "8px 10px", lineHeight: 1.2 },
            }}
          />
        );

        return (
          <ParamRow
            key={stableKey}
            label={def.label || name || ""}
            control={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, width: "100%" }}>
                {advancedSlot}
                <Box sx={fieldContainerSx}>
                  {isPointerEnabled ? (
                    <WrapWithDrop
                      control={field}
                      def={{ ...def, ...current }}
                      paramKey={stateKey}
                      setProtocolDetails={setProtocolDetails}
                      setDragOverKey={setDragOverKey}
                      dragOverKey={dragOverKey}
                    />
                  ) : (
                    field
                  )}
                </Box>
              </Box>
            }

            helpText={def.help}
            isPathParam
            onBrowsePath={handleBrowsePath}
            onClear={handleClear}
            isPointerParam={isPointerEnabled}
            onOpenFind={isPointerEnabled ? () => handleOpenFind(stateKey) : undefined}
            rowIndex={rowIndex}
            layoutVariant={layoutVariant}
          />
        );


      }


      // EnumParam (requires stateKey)
      if (defClass === "EnumParam" && Array.isArray(def.choices)) {
        if (!stateKey) return null;

        let sel = value ?? def.default ?? "";
        if (typeof sel === "number") sel = def.choices[sel] ?? "";

        const safeSel = def.choices.includes(sel) ? sel : (def.choices[0] ?? "");

        const onChange = (v: any) =>
          setProtocolDetails((prev: any) => ({
            ...prev,
            params: { ...prev.params, [stateKey]: { ...prev.params[stateKey], editableValue: v } },
          }));

        const controlBase =
          def.display === 0 ? (
            <RadioGroup row value={safeSel} onChange={(e) => onChange(e.target.value)}>
              {def.choices.map((ch: string, i: number) => (
                <FormControlLabel
                  key={i}
                  value={ch}
                  control={<Radio size="small" />}
                  label={ch}
                  sx={{ "& .MuiFormControlLabel-label": { fontSize: 12, lineHeight: 1.2 } }}
                />
              ))}
            </RadioGroup>
          ) : (
            <TextField
              select
              size="small"
              value={safeSel}
              onChange={(e) => onChange(e.target.value)}
              sx={{
                width: "69%",
                minWidth: 0,
                "& .MuiInputBase-input": { fontSize: 12 },
                "& .MuiSelect-select": { fontSize: 12, display: "flex", alignItems: "center" },
              }}
            >
              {def.choices.map((ch: string, i: number) => (
                <MenuItem key={i} value={ch} sx={{ fontSize: 12 }}>
                  {ch}
                </MenuItem>
              ))}
            </TextField>
          );

        return (
          <ParamRow
            key={stableKey}
            label={def.label || name || ""}
            control={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {advancedSlot}
                {controlBase}
              </Box>
            }
            helpText={def.help}
            rowIndex={rowIndex}
            layoutVariant={layoutVariant}
          />
        );
      }

      // Line (decorator, name optional)
      if (defClass === "Line") {
        const title = String(def?.label || name || "").trim();
        const lineParams = Array.isArray(def?.params) ? def.params : [];

        const children = lineParams
          .map((child: any, idx: number) => {
            const childEl = renderParam(child, sectionIdx, idx, "inline", stableKey);
            if (!childEl) return null;

            return (
              <Box
                key={`${stableKey}|lineChild:${idx}`}
                sx={{
                  flex: "0 0 auto",
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {childEl}
              </Box>
            );
          })
          .filter(Boolean);

        // If Line has no children, render only the label (if present) and stay stable
        if (children.length === 0) {
          if (!title) return null;

          return (
            <ParamRow
              key={stableKey}
              label={title}
              control={<></>}
              helpText={def?.help}
              rowIndex={rowIndex}
              layoutVariant="fullWidth"
            />
          );
        }

        if (!title) {
          return (
            <Box
              key={stableKey}
              sx={{
                mb: 1,
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "nowrap",
                overflowX: "auto",
                overflowY: "hidden",
                pb: 0.25,
              }}
            >
              {children as any}
            </Box>
          );
        }

        return (
          <ParamRow
            key={stableKey}
            label={title}
            control={
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "nowrap",
                  overflowX: "auto",
                  overflowY: "hidden",
                  minWidth: 0,
                  pb: 0.25,
                  ml: 3,
                }}
              >
                {children as any}
              </Box>
            }
            helpText={def?.help}
            rowIndex={rowIndex}
            layoutVariant="standard"
          />
        );
      }


      // Group (decorator, name optional)
      if (defClass === "Group") {
        const groupKey = `${stableKey}|group`;
        const expanded = expandedGroups[groupKey] ?? true;

        const toggleExpand = () =>
          setExpandedGroups((prev) => ({ ...prev, [groupKey]: !expanded }));

        const groupLabel = String(def?.label || name || "Group").trim();
        const groupParams = Array.isArray(def?.params) ? def.params : [];

        return (
          <Box
            key={stableKey}
            sx={{
              mb: 2,
              border: "1px dashed #ccc",
              borderRadius: 1,
              p: 1,
              backgroundColor: (theme) =>
                theme.palette.mode === "dark" ? "#2c2c2c" : "#f9fafb",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                mb: 1,
              }}
              onClick={toggleExpand}
            >
              <Typography
                variant="subtitle2"
                sx={(theme) => ({
                  color: theme.palette.mode === "dark" ? "#ffffff" : "#000000",
                })}
              >
                {groupLabel || "Group"}
              </Typography>

              <IconButton size="small">
                {expanded ? (
                  <ChevronUpIcon fontSize="small" />
                ) : (
                  <ChevronDownIcon fontSize="small" />
                )}
              </IconButton>
            </Box>

            {expanded && (
              <>
                {groupParams.length === 0 ? (
                  <Typography variant="caption" sx={{ opacity: 0.7, pl: 1 }}>
                    {/* No parameters in this group */}
                    No parameters.
                  </Typography>
                ) : (
                  groupParams.map((child: any, idx: number) =>
                    renderParam(child, sectionIdx, idx, "standard", stableKey)
                  )
                )}
              </>
            )}
          </Box>
        );
      }


      // BooleanParam (requires stateKey)
      if (defClass === "BooleanParam") {
        if (!stateKey) return null;

        const checked = coerceBooleanValue(
          value !== undefined
            ? value
            : protocolDetails.params?.[stateKey]?.value ?? def.value ?? def.default
        );

        return (
          <ParamRow
            key={stableKey}
            label={def.label || name || ""}
            control={
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  minWidth: 0,
                  width: isInline ? fieldWidth : "100%",
                }}
              >
                {advancedSlot}
                <Box sx={fieldContainerSx}>
                  <Switch
                    checked={checked}
                    onChange={(e) =>
                      setProtocolDetails((prev: any) => ({
                        ...prev,
                        params: {
                          ...prev.params,
                          [stateKey]: {
                            ...prev.params[stateKey],
                            editableValue: e.target.checked,
                            value: e.target.checked,
                          },
                        },
                      }))
                    }
                    color="primary"
                    sx={{ m: 0 }}
                  />
                </Box>
              </Box>
            }
            helpText={def.help}
            rowIndex={rowIndex}
            layoutVariant={layoutVariant}
          />
        );
      }


      // LabelParam (decorator, name optional)
      if (defClass === "Label") {
        return (
          <ParamRow
            key={stableKey}
            label={String(def.label || name || "")}
            control={<></>}
            helpText={def.help}
            rowIndex={rowIndex}
            layoutVariant="fullWidth"
          />
        );
      }

      // Default text param (requires stateKey)
      if (!stateKey) return null;

      const defaultControl = (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, width: "77%" }}>
          {advancedSlot}
          <Box sx={fieldContainerSx}>
            <TextField
              size="small"
              fullWidth={!isInline}
              name={stateKey}
              value={value ?? def.default ?? ""}
              onChange={(e) =>
                setProtocolDetails((prev: any) => ({
                  ...prev,
                  params: {
                    ...prev.params,
                    [stateKey]: {
                      ...prev.params[stateKey],
                      editableValue: e.target.value,
                    },
                  },
                }))
              }
              sx={{
                width: isInline ? fieldWidth : "100%",
                minWidth: 0,
                "& .MuiInputBase-root": { minHeight: 36 },
                "& .MuiInputBase-input": { fontSize: 12, padding: "8px 10px", lineHeight: 1.2 },
              }}
            />
          </Box>
        </Box>
      );

      return (
        <ParamRow
          key={stableKey}
          label={def.label || name || ""}
          control={defaultControl}
          helpText={def.help}
          rowIndex={rowIndex}
          layoutVariant={layoutVariant}
        />
      );
    },
    [
      protocolDetails.params,
      dragOverKey,
      currentDraggedOutput,
      expandedGroups,
      generalExpertLevel,
      findGeneralExpertLocator,
      getExpectedClass,
      gatherAllOutputs,
      getFilteredOutputsForKey,
      projectId,
      protocolId,
    ]
  );

  // Handle selected output in OutputSelectorDialog
  const handleSelectOutput = (selected: any | any[]) => {
    if (!selectorTarget) return;

    const { key, def } = selectorTarget;
    const picks = Array.isArray(selected) ? selected : [selected];

    setProtocolDetails((prev: any) => {
      const prevParam = prev.params[key];
      const defClass = resolveParamClass(def);

      if (defClass === "MultiPointerParam") {
        const newItems = picks.map((pick) => ({
          object: pick?.value ?? "",
          value: pick?.value ?? "",
          info: pick?.info ?? "",
          pointerClass: pick?.pointerClass ?? "",
          parentId: pick?.protocolId ?? pick?.parentId ?? null,
        }));

        return {
          ...prev,
          params: {
            ...prev.params,
            [key]: {
              ...prevParam,
              editableValue: newItems,
            },
          },
        };
      }

      const pick = picks[0];
      return {
        ...prev,
        params: {
          ...prev.params,
          [key]: {
            ...prevParam,
            editableValue: pick?.value ?? "",
            value: pick?.value ?? "",
            info: pick?.info ?? "",
            pointerClass: pick?.pointerClass ?? "",
            parentId: pick?.protocolId ?? pick?.parentId ?? null,
          },
        },
      };
    });

    setOpenSelector(false);
  };

  // Preview content for Outputs tab
  const previewContent = useMemo(() => {
    if (!activeOutput) {
      return (
        <Typography
          variant="body2"
          sx={{
            color: "#6b7280",
            fontSize: 12,
            textAlign: "center",
            py: 4,
          }}
        >
          Select an output on the left to preview it here.
        </Typography>
      );
    }

    if (previewLoading) {
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
          }}
        >
          <CircularProgress size={20} />
          <Typography
            variant="caption"
            sx={{ fontSize: "0.75rem", color: "#4b5563" }}
          >
            Loading preview...
          </Typography>
        </Box>
      );
    }

    if (previewError) {
      return (
        <Typography
          variant="body2"
          sx={{
            color: "#dc2626",
            fontSize: "0.75rem",
            textAlign: "center",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {previewError}
        </Typography>
      );
    }

    if (previewData?.imageUrl) {
      return (
        <Box
          sx={{
            width: "100%",
            flexShrink: 0,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        >
          <img
            src={previewData.imageUrl}
            alt={activeOutput.name}
            style={{
              display: "block",
              maxWidth: "100%",
              height: "auto",
              objectFit: "contain",
            }}
          />
        </Box>
      );
    }

    if (previewData?.text && !previewData?.kind) {
      return (
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            maxWidth: "100%",
            maxHeight: "100%",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: ".75rem",
            lineHeight: 1.4,
            color: "#111827",
          }}
        >
          {previewData.text}
        </Box>
      );
    }

    switch (previewData?.kind) {
      case "image":
        return (
          <Box
            sx={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
            }}
          >
            <img
              src={previewData.url}
              alt={activeOutput.name}
              style={{
                display: "block",
                maxWidth: "100%",
                height: "auto",
              }}
            />
          </Box>
        );

      case "pdf":
        return (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              borderRadius: 2,
              overflow: "hidden",
              border: "1px solid #e5e7eb",
              backgroundColor: "#fff",
            }}
          >
            <object
              data={previewData.url}
              type="application/pdf"
              width="100%"
              height="100%"
            >
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  PDF preview not supported by your browser.
                </Typography>
                <a href={previewData.downloadUrl} target="_blank" rel="noreferrer">
                  Open PDF
                </a>
              </Box>
            </object>
          </Box>
        );

      case "table": {
        const cols: string[] = previewData.data?.columns || [];
        const rows: any[] = previewData.data?.rows || [];
        return (
          <Box
            sx={{
              width: "100%",
              maxHeight: "100%",
              overflow: "auto",
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 2,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.75rem",
              }}
            >
              <thead
                style={{
                  position: "sticky",
                  top: 0,
                  background: "#f3f4f6",
                }}
              >
                <tr>
                  {cols.map((c) => (
                    <th
                      key={c}
                      style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid #f3f4f6" }}
                  >
                    {cols.map((c) => (
                      <td
                        key={c}
                        style={{
                          padding: "6px 8px",
                          verticalAlign: "top",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {String(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        );
      }

      case "sqlite": {
        const mode = previewData.meta?.mode;
        if (mode === "tables") {
          const tables: string[] = previewData.data?.tables || [];
          return (
            <Box
              sx={{
                width: "100%",
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 2,
                p: 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: "#6b7280" }}
              >
                Tables
              </Typography>
              <Box
                sx={{
                  mt: 1,
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill,minmax(160px,1fr))",
                  gap: 0.5,
                }}
              >
                {tables.map((t) => (
                  <Button
                    key={t}
                    size="small"
                    variant="outlined"
                    sx={{
                      textTransform: "none",
                      justifyContent: "flex-start",
                    }}
                    onClick={() => setSqliteTable(t)}
                  >
                    {t}
                  </Button>
                ))}
              </Box>
            </Box>
          );
        }
        const cols: string[] =
          previewData.data?.columns ||
          previewData.meta?.columnsHeader?.split(",") ||
          [];
        const rows: any[] = previewData.data?.rows || [];
        return (
          <Box
            sx={{
              width: "100%",
              maxHeight: "100%",
              overflow: "auto",
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 2,
            }}
          >
            <Box
              sx={{
                p: 1,
                display: "flex",
                gap: 1,
                alignItems: "center",
                borderBottom: "1px solid #eee",
              }}
            >
              <Button
                size="small"
                onClick={() => setSqliteTable(null)}
                sx={{ textTransform: "none" }}
              >
                Back to tables
              </Button>
              <Typography
                variant="caption"
                sx={{ color: "#6b7280" }}
              >
                {rows.length} rows{" "}
                {previewData.meta?.rowCount
                  ? `(server: ${previewData.meta.rowCount})`
                  : ""}
              </Typography>
            </Box>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.75rem",
              }}
            >
              <thead
                style={{
                  position: "sticky",
                  top: 0,
                  background: "#f3f4f6",
                }}
              >
                <tr>
                  {cols.map((c) => (
                    <th
                      key={c}
                      style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid #f3f4f6" }}
                  >
                    {cols.map((c) => (
                      <td
                        key={c}
                        style={{
                          padding: "6px 8px",
                          verticalAlign: "top",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {String(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        );
      }

      case "archive": {
        const entries: Array<{
          name: string;
          isDir?: boolean;
          size?: number;
          compressedSize?: number;
        }> = previewData.data?.entries || [];
        return (
          <Box
            sx={{
              width: "100%",
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 2,
              p: 1,
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: "#6b7280" }}
            >
              Archive entries
            </Typography>
            <Box
              sx={{
                mt: 1,
                maxHeight: "100%",
                overflow: "auto",
              }}
            >
              {entries.map((e, i) => (
                <Box
                  key={i}
                  sx={{
                    display: "flex",
                    gap: 1,
                    py: 0.5,
                    borderBottom:
                      "1px dashed #f3f4f6",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.75rem",
                      color: e.isDir
                        ? "#111827"
                        : "#374151",
                    }}
                  >
                    {e.name}
                  </Typography>
                  {!e.isDir && (
                    <Typography
                      variant="caption"
                      sx={{ color: "#6b7280" }}
                    >
                      {typeof e.size === "number"
                        ? `• ${e.size} B`
                        : ""}
                      {typeof e.compressedSize ===
                        "number"
                        ? ` (compressed ${e.compressedSize} B)`
                        : ""}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        );
      }

      case "text":
        return (
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              boxShadow:
                "0 2px 4px rgba(0,0,0,0.05)",
              maxWidth: "100%",
              maxHeight: "100%",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "0.75rem",
              lineHeight: 1.4,
              color: "#111827",
            }}
          >
            {previewData.text}
          </Box>
        );

      case "binary":
        return (
          <Box
            sx={{
              width: "100%",
              borderRadius: 2,
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              p: 2,
            }}
          >
            <Typography
              variant="body2"
              sx={{ mb: 1 }}
            >
              Binary file preview is not available.
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "#6b7280",
                display: "block",
                mb: 1,
              }}
            >
              {previewData.meta?.mime ||
                "application/octet-stream"}{" "}
              • {previewData.meta?.sizeBytes ??
                "?"}{" "}
              bytes
            </Typography>
            <Button
              size="small"
              variant="outlined"
              href={previewData.downloadUrl}
              sx={{ textTransform: "none" }}
            >
              Download
            </Button>
          </Box>
        );

      default:
        if (previewData) {
          return (
            <Box
              sx={{
                width: "100%",
                maxHeight: "100%",
                overflowY: "auto",
                border:
                  "2px dashed #e5e7eb",
                borderRadius: 2,
                backgroundColor: "#fff",
                textAlign: "left",
                p: 2,
                fontSize: "0.7rem",
                lineHeight: 1.4,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#1f2937",
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
              }}
            >
              {JSON.stringify(
                previewData,
                null,
                2
              )}
            </Box>
          );
        }
        return (
          <Box
            sx={{
              width: "100%",
              minHeight: "100%",
              maxHeight: "100%",
              border:
                "2px dashed #e5e7eb",
              borderRadius: 2,
              backgroundColor: "#fff",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              px: 2,
              py: 3,
              color: "#6b7280",
              fontSize: "0.8rem",
              lineHeight: 1.4,
              wordBreak: "break-word",
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: "#4b5563",
                fontSize: "0.75rem",
                mb: 1,
                lineHeight: 1.4,
              }}
            >
              Preview for "{activeOutput.name}".
            </Typography>
          </Box>
        );
    }
  }, [activeOutput, previewLoading, previewError, previewData, setSqliteTable]);

  const safeDefinition = sections;
  const isDocked = variant === "docked";

  return (
    <div
      className={[
        styles.protocolForm,
        isDocked ? styles.asDocked : "",
        isClosing ? styles.slideOutRight : styles.slideInRight,
      ]
        .filter(Boolean)
        .join(" ")}
      onAnimationEnd={handleAnimationEnd}
    >
      {/* HEADER */}
      <div className={styles.formHeader}>
        <div className={styles.formTitleWrapper}>
          <Box className="inline-flex items-center justify-center rounded-full bg-green-500 text-black text-xs font-bold px-2 py-1">
            {String(protocolId ?? "")}
          </Box>
          <span className="text-white">{protocolDetails.label}</span>
          <span
            className={styles.nodeStatusPill}
            style={{
              backgroundColor: protocolDetails.color,
              color: "black",
            }}
          >
            {protocolDetails.status || "Unknown"}
          </span>
        </div>
        <IconButton
          onClick={requestClose}
          aria-label="Close analyze dialog"
          size="small"
          sx={closeBtnSx}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      {execError && (
        <Typography
          color="error"
          variant="body2"
          sx={{ px: 2, py: 1 }}
        >
          {execError}
        </Typography>
      )}

      {/* BODY */}
      <div
        className={styles.formBody}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            backgroundColor: "#f9fafb",
            borderRadius: 2,
            boxShadow: "0px 2px 6px rgba(0,0,0,0.2)",
            p: 1,
          }}
        >
          <Tabs
            value={topTab}
            onChange={(_, val) => setTopTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              "& .MuiTab-root": {
                textTransform: "none",
                fontSize: "0.8rem",
                fontWeight: 500,
                minHeight: 48,
              },
              "& .Mui-selected": {
                backgroundColor: "white",
                borderRadius: 1,
              },
            }}
          >
            <Tab label="Inputs and Parameters" />
            <Tab label="Outputs" />
            <Tab label="Logs" />
            <Tab label="Metadata" />
          </Tabs>

          <Box
            className={styles.topTabContent}
            sx={{
              flex: 1,
              minHeight: 0,
              p: 1,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/*Input and parameters */}
            {topTab === 0 && (
              <>
                <Tabs
                  value={sectionTab}
                  onChange={(_, val) => setSectionTab(val)}
                  variant="scrollable"
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                  sx={{
                    mb: 1,
                    "& .MuiTab-root": {
                      textTransform: "none",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                    },
                  }}
                >
                  {safeDefinition.map((section: any, idx: number) => (
                    <Tab
                      key={idx}
                      label={section.label || `Section ${idx + 1}`}
                    />
                  ))}
                </Tabs>

                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    pr: 1,
                    pb: 1,
                  }}
                >
                  {safeDefinition[sectionTab]?.params?.map((paramObj: any, idx: number) =>
                    renderParam(paramObj, sectionTab, idx)
                  )}
                </Box>
              </>
            )}

            {/* Outputs */}
            {topTab === 1 && (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  gap: 2,
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <Box
                  sx={{
                    flex: "0 0 45%",
                    maxWidth: "45%",
                    minWidth: 0,
                    minHeight: 0,
                    backgroundColor: "#fff",
                    borderRadius: 2,
                    boxShadow: "0px 2px 6px rgba(0,0,0,0.1)",
                    border: "1px solid #e5e7eb",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderBottom: "1px solid #e5e7eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        color: "#111827",
                      }}
                    >
                      Outputs
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "#6b7280",
                        fontSize: "0.7rem",
                      }}
                    >
                      {normalizedOutputs.length} items
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      p: 1,
                    }}
                  >
                    {normalizedOutputs.length === 0 ? (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "#6b7280",
                          fontSize: "0.8rem",
                          textAlign: "center",
                          py: 4,
                        }}
                      >
                        No outputs for this protocol.
                      </Typography>
                    ) : (
                      normalizedOutputs.map((o: any, idx: number) => (
                        <Box
                          key={idx}
                          onClick={() => setSelectedOutputIdx(idx)}
                          sx={{
                            cursor: "pointer",
                            userSelect: "none",
                            borderRadius: 1.5,
                            border: "1px solid transparent",
                            px: 1,
                            py: 1,
                            mb: 1,
                            backgroundColor:
                              selectedOutputIdx === idx ? "#eef2ff" : "transparent",
                            borderColor:
                              selectedOutputIdx === idx ? "#6366f1" : "transparent",
                            "&:hover": {
                              backgroundColor:
                                selectedOutputIdx === idx ? "#eef2ff" : "#f9fafb",
                              borderColor:
                                selectedOutputIdx === idx ? "#6366f1" : "#e5e7eb",
                            },
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              color: "#111827",
                              fontSize: "0.7rem",
                              fontWeight: selectedOutputIdx === idx ? 600 : 500,
                              lineHeight: 1.4,
                              wordBreak: "break-word",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {o.infoText}
                          </Typography>
                        </Box>
                      ))
                    )}
                  </Box>
                </Box>

                {/* Right Panel Preview */}
                <Box
                  sx={{
                    flex: "1 1 0",
                    minWidth: 0,
                    minHeight: 0,
                    backgroundColor: "#fff",
                    borderRadius: 2,
                    boxShadow: "0px 2px 6px rgba(0,0,0,0.1)",
                    border: "1px solid #e5e7eb",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderBottom: "1px solid #e5e7eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, fontSize: "0.8rem", color: "#111827" }}
                    >
                      Preview
                    </Typography>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={!activeOutput}
                        onClick={handleAnalyzeResultsClick}
                        sx={{
                          textTransform: "none",
                          ml: 1,
                          backgroundColor: "#333d49",
                          "&:hover": { backgroundColor: "#596472ff" },
                        }}
                      >
                        Analyze results
                      </Button>

                    </Box>
                  </Box>

                  <Box
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      overflowX: "hidden",
                      p: 1,
                      pb: 6,
                      backgroundColor: "#f9fafb",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "flex-start",
                    }}
                  >
                    {previewContent}
                  </Box>
                </Box>
              </Box>
            )}

            {/* Logs */}
            {topTab === 2 && (
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <Tabs
                  value={activeLogChannelId}
                  onChange={(_, val) => setActiveLogChannelId(String(val))}
                  variant="scrollable"
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                  sx={{
                    flex: "0 0 auto",
                    mb: 0.5,
                    "& .MuiTab-root": {
                      textTransform: "none",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                    },
                  }}
                >
                  {sortedLogChannels.map((ch) => (
                    <Tab key={ch.id} value={ch.id} label={ch.label} />
                  ))}
                </Tabs>

                <Box
                  className={styles.bottomTabContent}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    p: 1,
                  }}
                >
                  {logsError && (
                    <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                      {logsError}
                    </Typography>
                  )}

                  <Box
                    ref={logsContainerRef}
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      minWidth: 0,
                      backgroundColor: "#f5f5f5",
                      color: "black",
                      borderRadius: 2,
                      border: "1px solid #e5e7eb",
                      p: 1.5,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: 12,
                      lineHeight: 1.4,

                      // The scrollbars must live here, not in the whole form
                      overflowY: "auto",
                      overflowX: "auto",

                      // Keep log formatting; horizontal scroll stays inside this panel
                      whiteSpace: "pre",
                    }}
                  >
                    {activeLogText && activeLogText.length > 0 ? (
                      activeLogText.split("\n").map((line, idx) => {
                        const lineNoColor = activeLogChannelId === "stderr" ? "red" : "blue";

                        return (
                          <div key={idx} style={{ display: "flex", minWidth: 0 }}>
                            <span
                              style={{
                                color: lineNoColor,
                                userSelect: "none",
                                marginRight: 8,
                                flex: "0 0 auto",
                              }}
                            >
                              {String(idx + 1).padStart(5, "0")}:
                            </span>
                            <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                              {parseAnsi(line)}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <Typography variant="body2" sx={{ opacity: 0.7 }}>
                        No logs yet.
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            )}



            {/* Metadata */}
            {topTab === 3 && (
              <Box sx={{ height: "100%", maxHeight: "100%", overflow: "auto" }}>
                <JsonTree data={metadataSnapshot} />
              </Box>
            )}
          </Box>
        </Box>
      </div>

      {/* FOOTER */}
      <div className={styles.formFooter}>
        <Button
          variant="contained"
          startIcon={<CloseIcon />}
          onClick={requestClose}
          sx={{ textTransform: "none" }}
          color="error"
        >
          Close
        </Button>
        <Button
          variant="contained"
          startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={
            isBusy ||
            protocolDetails.status === "running" ||
            protocolDetails.status === "scheduled"
          }
          sx={{ textTransform: "none" }}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>

        {executeModeMap && Object.keys(executeModeMap).length > 0 ? (
          <ExecuteModeButton
            executeModeMap={executeModeMap}
            selectedMode={selectedExecuteMode}
            onSelectedModeChange={setSelectedExecuteMode}
            onExecute={handleExecute}
            disabled={
              isBusy //||
              //protocolDetails.status === "running" ||
              //protocolDetails.status === "scheduled"
            }
            loading={isExecuting}
          />

        ) : (
          <Button
            variant="contained"
            startIcon={isExecuting ? <CircularProgress size={16} color="inherit" /> : <ExecuteIcon />}
            color="success"
            onClick={() => handleExecute("launch")}
            disabled={
              isBusy //||
              //protocolDetails.status === "running" ||
              // protocolDetails.status === "scheduled"
            }
            sx={{ textTransform: "none" }}
          >
            {isExecuting ? "Processing..." : "Launch"}
          </Button>
        )}

      </div>

      {/* PathParam RemoteFileDialog */}
      {pathDialog.open && pathDialog.stateKey && projectId && (

        <RemoteFileDialog
          open={pathDialog.open}
          onClose={() =>
            setPathDialog({
              open: false,
              stateKey: null,
              title: null,
            })
          }
          title={`Select file for: ${pathDialog.title ?? pathDialog.stateKey}`}
          projectId={projectId}
          protocolId={protocolId}
          resolveBrowserPaths={() => svc.resolveBrowserPaths(projectId, protocolId)}
          listRemoteDirectory={(p) => svc.listRemoteDirectory(projectId, protocolId, p)}
          previewRemoteText={(p) => svc.previewProtocolText(projectId, protocolId, p)}
          buildDownloadUrl={(p, inline) =>
            svc.buildProtocolDownloadUrl(projectId, protocolId, p, !!inline)
          }
          fetchInlinePreviewBlob={(p) =>
            svc.fetchProtocolInlinePreviewBlob(projectId, protocolId, p)
          }
          onPick={(relativePath) => {
            const stateKey = pathDialog.stateKey;

            if (stateKey) {
              setProtocolDetails((prev: any) => {
                if (!prev?.params?.[stateKey]) return prev;

                return {
                  ...prev,
                  params: {
                    ...prev.params,
                    [stateKey]: {
                      ...prev.params[stateKey],
                      editableValue: relativePath,
                      value: relativePath,
                    },
                  },
                };
              });
            }

            setPathDialog({
              open: false,
              stateKey: null,
              title: null,
            });
          }}
        />
      )}

      <OutputSelectorDialog
        open={openSelector}
        onClose={() => setOpenSelector(false)}
        expectedClass={expectedClass ?? undefined}
        allOutputs={allOutputs}
        onSelect={handleSelectOutput}
        multiSelect={false}
      />

      {/* Generic execute/save error dialog */}
      <Dialog
        open={execErrorDialogOpen}
        onClose={() => setExecErrorDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: "0px 10px 25px rgba(0, 0, 0, 0.25)",
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {execErrorDialogTitle}
        </DialogTitle>

        <DialogContent dividers>
          <Typography
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {execErrorDialogMessage}
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setExecErrorDialogOpen(false)}
            variant="contained"
            sx={{ textTransform: "none" }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Validation errors dialog */}
      {showValidationDialog && (
        <Dialog
          open={showValidationDialog}
          onClose={() => setShowValidationDialog(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
              boxShadow: "0px 10px 25px rgba(0, 0, 0, 0.25)",
            },
          }}
        >
          <DialogTitle
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              fontWeight: "bold",
              color: "#d32f2f",
              fontSize: "1.1rem",
              borderBottom: "1px solid ",
              pb: 1,
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: "#f8d7da",
                color: "#d32f2f",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
              }}
            >
              !
            </Box>
            Validation Errors
          </DialogTitle>

          <DialogContent
            dividers
            sx={{
              maxHeight: "300px",
              overflowY: "auto",
              backgroundColor: "#fff8f8",
              borderTop: "1px solid #f0f0f0",
              borderBottom: "1px solid #f0f0f0",
              p: 2.5,
            }}
          >
            {validationErrors.length > 0 ? (
              <Box
                component="ul"
                sx={{
                  listStyle: "none",
                  pl: 0,
                  m: 0,
                  color: "#b00020",
                  fontSize: "0.9rem",
                }}
              >
                {validationErrors.map((err, i) => {
                  const parts = err.split(/(\*\*[^*]+\*\*)/g);
                  return (
                    <Box
                      key={i}
                      component="li"
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        mb: 1.2,
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          color: "#d32f2f",
                          fontWeight: "bold",
                          mr: 1.2,
                          fontSize: "1rem",
                          lineHeight: "1rem",
                        }}
                      >
                        •
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          color: "#333",
                          lineHeight: 1.5,
                          fontSize: "0.9rem",
                        }}
                      >
                        {parts.map((p, j) =>
                          p.startsWith("**") && p.endsWith("**") ? (
                            <strong key={j}>{p.slice(2, -2)}</strong>
                          ) : (
                            p
                          )
                        )}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: "#555" }}>
                No validation details provided.
              </Typography>
            )}
          </DialogContent>

          <DialogActions
            sx={{
              p: 2,
              justifyContent: "flex-end",
              backgroundColor: "#fafafa",
              borderTop: "1px solid #eee",
            }}
          >
            <Button
              onClick={() => setShowValidationDialog(false)}
              variant="contained"
              color="error"
              sx={{
                textTransform: "none",
                px: 3,
                borderRadius: 2,
                fontWeight: "bold",
                boxShadow: "none",
                "&:hover": {
                  backgroundColor: "#c62828",
                },
              }}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <AnalyzeOutputDialog
        open={analyzeOpen}
        onClose={() => setAnalyzeOpen(false)}
        projectId={projectId}
        protocolId={protocolId}
        protocolLabel={protocolDetails.label}
        outputName={activeOutput?.name || ""}
        outputRaw={activeOutput?.raw ?? null}
      />

    </div>
  );
}
