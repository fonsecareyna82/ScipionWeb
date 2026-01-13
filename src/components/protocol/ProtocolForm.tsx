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
import { fetchProtocolLogsStream } from "@/api/protocols";
import OutputSelectorDialog from "./outputSelectorDialog";
import { useProjectService } from "@/ProjectServiceContext";
import RemoteFileDialog from "@/components/files/RemoteFileDialog";
import AnalyzeOutputDialog from "@/components/analyze/analyze-output-dialog";
import { CheckCircle2Icon, Copy } from "lucide-react";

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

function getPointerClass(objLike: any): string {
  // getPointerClass
  return String(objLike?.pointerClass ?? objLike?._class ?? "");
}

function unwrapParamDef(paramLike: any): UnwrappedParam {
  return { paramName: String((paramLike as any).name ?? ""), paramDef: paramLike };
}

function unwrapNamedEntry(entryLike: any): { name: string; payload: any } {
  // unwrapNamedEntry
  if (!entryLike || typeof entryLike !== "object") return { name: "", payload: entryLike };

  // If backend ever provides a direct shape with a name field
  if (typeof (entryLike as any).name === "string" && (entryLike as any).name.trim()) {
    return { name: String((entryLike as any).name), payload: entryLike };
  }

  // Legacy/current shape: { [name]: payload }
  const entries = Object.entries(entryLike);
  if (entries.length === 1) {
    const [name, payload] = entries[0] as [string, any];
    return { name, payload };
  }

  // Fallback: no stable name available
  return { name: String((entryLike as any)._key ?? ""), payload: entryLike };
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

type JsonValueProps = {
  value: any;
  path: string;
  indent: number;
  isLast: boolean;
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  seen: WeakSet<object>;
};

function JsonValue({
  value,
  path,
  indent,
  isLast,
  expandedPaths,
  togglePath,
  seen,
}: JsonValueProps) {
  // JsonValue
  const pad = { paddingLeft: indent * 14 };

  const comma = isLast ? "" : ",";

  const isObj = value && typeof value === "object";
  const isArr = Array.isArray(value);

  if (!isObj) {
    return (
      <div style={pad}>
        {renderJsonScalar(value)}
        <span style={{ color: jsonPunctColor }}>{comma}</span>
      </div>
    );
  }

  // handleCircularReferences
  if (seen.has(value)) {
    return (
      <div style={pad}>
        <span style={{ color: jsonNullColor }}>{JSON.stringify("[Circular]")}</span>
        <span style={{ color: jsonPunctColor }}>{comma}</span>
      </div>
    );
  }
  seen.add(value);

  const open = isArr ? "[" : "{";
  const close = isArr ? "]" : "}";

  const entries = isArr
    ? (value as any[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, any>);

  const isExpanded = expandedPaths.has(path);

  // collapsedNode
  if (!isExpanded) {
    return (
      <div style={pad}>
        <button
          type="button"
          onClick={() => togglePath(path)}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            marginRight: 6,
            cursor: "pointer",
            color: "inherit",
            fontFamily: "inherit",
            fontSize: "inherit",
          }}
          aria-label="Expand"
        >
          ▸
        </button>
        <span style={{ color: jsonPunctColor }}>
          {open}…{close}
        </span>
        <span style={{ color: jsonPunctColor }}>{comma}</span>
      </div>
    );
  }

  // expandedNode
  return (
    <>
      <div style={pad}>
        <button
          type="button"
          onClick={() => togglePath(path)}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            marginRight: 6,
            cursor: "pointer",
            color: "inherit",
            fontFamily: "inherit",
            fontSize: "inherit",
          }}
          aria-label="Collapse"
        >
          ▾
        </button>
        <span style={{ color: jsonPunctColor }}>{open}</span>
      </div>

      <div>
        {entries.length === 0 ? (
          <div style={{ paddingLeft: (indent + 1) * 14, opacity: 0.8 }}>
            {isArr ? "/* empty */" : "/* empty */"}
          </div>
        ) : (
          entries.map(([k, v], idx) => {
            const childPath = `${path}.${k}`;
            const childIsLast = idx === entries.length - 1;

            if (isArr) {
              return (
                <JsonValue
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

            const childIsObj = v && typeof v === "object";
            const childIsArr = Array.isArray(v);

            // objectProperty
            if (childIsObj) {
              const childExpanded = expandedPaths.has(childPath);
              const openChild = childIsArr ? "[" : "{";
              const closeChild = childIsArr ? "]" : "}";

              if (!childExpanded) {
                return (
                  <div key={childPath} style={{ paddingLeft: (indent + 1) * 14 }}>
                    <button
                      type="button"
                      onClick={() => togglePath(childPath)}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        marginRight: 6,
                        cursor: "pointer",
                        color: "inherit",
                        fontFamily: "inherit",
                        fontSize: "inherit",
                      }}
                      aria-label="Expand"
                    >
                      ▸
                    </button>
                    <span style={{ color: jsonKeyColor }}>{JSON.stringify(k)}</span>
                    <span style={{ color: jsonPunctColor }}>: </span>
                    <span>
                      {openChild}…{closeChild}
                    </span>
                    <span style={{ color: jsonPunctColor }}>{childIsLast ? "" : ","}</span>
                  </div>
                );
              }

              return (
                <div key={childPath}>
                  <div style={{ paddingLeft: (indent + 1) * 14 }}>
                    <button
                      type="button"
                      onClick={() => togglePath(childPath)}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        marginRight: 6,
                        cursor: "pointer",
                        color: "inherit",
                        fontFamily: "inherit",
                        fontSize: "inherit",
                      }}
                      aria-label="Collapse"
                    >
                      ▾
                    </button>
                    <span style={{ color: jsonKeyColor }}>{JSON.stringify(k)}</span>
                    <span style={{ color: jsonPunctColor }}>: </span>
                    <span>{openChild}</span>
                  </div>

                  <JsonValue
                    value={v}
                    path={childPath}
                    indent={indent + 2}
                    isLast={true}
                    expandedPaths={expandedPaths}
                    togglePath={togglePath}
                    seen={seen}
                  />

                  <div style={{ paddingLeft: (indent + 1) * 14 }}>
                    <span>{closeChild}</span>
                    <span style={{ color: jsonPunctColor }}>{childIsLast ? "" : ","}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={childPath} style={{ paddingLeft: (indent + 1) * 14 }}>
                <span style={{ color: jsonKeyColor }}>{JSON.stringify(k)}</span>
                <span style={{ color: jsonPunctColor }}>: </span>
                {renderJsonScalar(v)}
                <span style={{ color: jsonPunctColor }}>{childIsLast ? "" : ","}</span>
              </div>
            );
          })
        )}
      </div>

      <div style={pad}>
        <span style={{ color: jsonPunctColor }}>{close}</span>
        <span style={{ color: jsonPunctColor }}>{comma}</span>
      </div>
    </>
  );
}

function getJsonSummary(value: any): string {
  // getJsonSummary
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value && typeof value === "object") return `Object(${Object.keys(value).length})`;
  return formatJsonScalar(value);
}

function JsonNode({
  name,
  value,
  level,
  seen,
}: {
  name: string;
  value: any;
  level: number;
  seen: WeakSet<object>;
}) {
  // JsonNode
  const isObject = value && typeof value === "object";
  const isArray = Array.isArray(value);

  if (!isObject) {
    return (
      <div style={{ paddingLeft: level * 14 }}>
        <span style={{ opacity: 0.8 }}>{name}:</span>{" "}
        <span>{formatJsonScalar(value)}</span>
      </div>
    );
  }

  // handleCircularReferences
  if (seen.has(value)) {
    return (
      <div style={{ paddingLeft: level * 14 }}>
        <span style={{ opacity: 0.8 }}>{name}:</span>{" "}
        <span>[Circular]</span>
      </div>
    );
  }
  seen.add(value);

  const entries = isArray
    ? (value as any[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, any>);

  const defaultOpen = level <= 1;

  return (
    <details open={defaultOpen} style={{ paddingLeft: level * 14 }}>
      <summary style={{ cursor: "pointer", userSelect: "none" }}>
        <span style={{ opacity: 0.8 }}>{name}:</span>{" "}
        <span>{getJsonSummary(value)}</span>
      </summary>

      <div style={{ marginTop: 6 }}>
        {entries.length === 0 ? (
          <div style={{ paddingLeft: 14, opacity: 0.7 }}>
            {isArray ? "[]" : "{}"}
          </div>
        ) : (
          entries.map(([k, v]) => (
            <JsonNode
              key={`${name}.${k}`}
              name={k}
              value={v}
              level={level + 1}
              seen={seen}
            />
          ))
        )}
      </div>
    </details>
  );
}

function JsonTree({ data }: { data: any }) {
  // JsonTree
  const [copied, setCopied] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // defaultExpandedPaths
    return new Set(["$"]);
  });

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
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.5,
          overflow: "auto",
        }}
      >
        {/* renderRootAsJson */}
        <JsonValue
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

export default function ProtocolForm({
  data,
  projectProtocols = [],
  onClose,
  onExecuted,
  variant = "drawer",
}: ProtocolFormProps) {
  const svc = useProjectService();

  // unwrapFormEnvelope
  const form = useMemo(() => {
    if (data && typeof data === "object" && "form" in data) return (data as any).form ?? {};
    return data ?? {};
  }, [data]);

  // keepValuesForLater
  const values = useMemo(() => {
    if (data && typeof data === "object" && "values" in data) return (data as any).values ?? null;
    return null;
  }, [data]);

  const projectId = form?.projectId ?? form?.project?.id ?? null;
  const protocolId = form?.protocolId ?? null;

  const [topTab, setTopTab] = useState(0);
  const [bottomTab, setBottomTab] = useState(0);
  const [sectionTab, setSectionTab] = useState(0);
  const [protocolDetails, setProtocolDetails] = useState<any>({});
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({});
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  // Exit animation state
  const [isClosing, setIsClosing] = useState(false);

  // Drag/drop state
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [currentDraggedOutput] = useState<any>(null);

  // Logs
  const containerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [errorLogs, setErrorLogs] = useState<string>("");
  const [scheduleLogs, setScheduleLogs] = useState<string>("");
  const [, setLogsError] = useState<string | null>(null);
  const offsetRef = useRef<number>(0);
  const errorOffsetRef = useRef<number>(0);
  const scheduleOffsetRef = useRef<number>(0);
  const scheduleContainerRef = useRef<HTMLDivElement>(null);
  const errorContainerRef = useRef<HTMLDivElement>(null);
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

  const [pathDialog, setPathDialog] = useState<{ open: boolean; paramKey: string | null }>({
    open: false,
    paramKey: null,
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
    const arr = Array.isArray(form?.outputs) ? form.outputs : [];
    return arr.map((entry: any, idx: number) => {
      const outputName = String(entry?.outputName ?? entry?.name ?? entry?._key ?? idx);
      const infoText = entry?.info ?? entry?.pointerClass ?? "";
      return { name: outputName, infoText, raw: entry };
    });
  }, [form?.outputs]);


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
  }, [activeOutput, form?.protocolId, sqliteTable, svc, form?.projectId]);

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
    if (!form?.expertLevel || !Array.isArray(form?.definition)) return null;

    for (let i = 0; i < form.definition.length; i++) {
      const section = form.definition[i];
      const params = section?.params ?? [];
      for (const p of params) {
        const { paramName, paramDef: def } = unwrapParamDef(p);
        if (paramName === "expertLevel" && getParamClass(def) === "EnumParam") {
          return { sectionIdx: i, name: paramName };
        }
      }
    }
    return null;
  }, [form]);

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

    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => {
      if (item === null || item === undefined) return { object: "", info: "" };

      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        return { object: String(item), info: "" };
      }

      if (item && typeof item === "object") {
        const objectToken =
          (item as any).object ??
          (item as any).value ??
          (item as any)._objValue ??
          "";

        return {
          object: String(objectToken ?? ""),
          info: String((item as any).info ?? ""),
          pointerClass: String((item as any).pointerClass ?? ""),
          parentId: (item as any).parentId ?? null,
        };
      }

      return { object: "", info: "" };
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
      const { paramName: name, paramDef: def } = unwrapParamDef(paramLike);
      if (!name || !def) return;

      const cls = getParamClass(def);

      if ((cls === "Group" || cls === "Line") && Array.isArray(def.params)) {
        def.params.forEach((c: any) => walk(secIdx, c));
        return;
      }

      const key = `${secIdx}_${name}`;

      // Use values[name] as source of truth (fallback to def.value/def.default)
      const rawFromApi = getInitialRawForParam(name, def, valuesMap);
      const parsedFromApi = parseFromJSONValue(rawFromApi);

      // BooleanParam
      if (cls === "BooleanParam") {
        const initBool = coerceBooleanValue(parsedFromApi);

        const defObjValue = parseFromJSONValue(def.value);
        const defDefault = parseFromJSONValue(def.default);

        params[key] = {
          ...def,
          value: coerceBooleanValue(defObjValue),
          default: coerceBooleanValue(defDefault),
          editableValue: initBool,
        };
        return;
      }

      // MultiPointerParam
      if (cls === "MultiPointerParam") {
        const initList = normalizeMultiPointerValue(rawFromApi);
        params[key] = {
          ...def,
          editableValue: initList,
        };
        return;
      }

      // PointerParam: keep value and editableValue in sync (serializer prioritizes value)
      if (cls === "PointerParam") {
        const token = normalizePointerToken(rawFromApi);
        params[key] = {
          ...def,
          value: token,
          editableValue: token,
        };
        return;
      }

      // PathParam: keep value and editableValue in sync
      if (cls === "PathParam") {
        const token = parsedFromApi ?? "";
        params[key] = {
          ...def,
          value: token,
          editableValue: token,
        };
        return;
      }

      // EnumParam: normalize to label
      if (cls === "EnumParam" && Array.isArray(def.choices)) {
        const label = normalizeEnumLabel(rawFromApi, def.choices, def.default);
        params[key] = {
          ...def,
          editableValue: label,
        };
        return;
      }

      // Default: scalar text/number/etc.
      params[key] = {
        ...def,
        editableValue: parsedFromApi ?? "",
      };
    };

    form.definition?.forEach((section: any, i: number) => {
      section.params?.forEach((p: any) => walk(i, p));
    });

    setProtocolDetails({
      label: form.protocolName ?? "",
      status: form.status ?? "",
      id: form.id ?? "",
      color: form.color ?? "",
      params,
    });

    // Remember initial inputType label to detect future user change
    if (form.protocolClassName === "ProtUnionSet") {
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
  }, [form, values]);


  const isTerminalStatus = (s: any) =>
    ["finished", "success", "done", "failed", "error", "cancelled", "canceled", "stopped", "aborted"]
      .includes(String(s || "").toLowerCase());
  const idleStreakRef = useRef<number>(0);

  // Incremental log polling
  useEffect(() => {
    // clearPreviousInterval
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    // enablePollingOnlyOnLogsTab
    if (topTab !== 2 || !form?.projectId || !form?.protocolId) return;

    let cancelled = false;
    idleStreakRef.current = 0;

    // initialLoad
    (async () => {
      try {
        const res: any = await fetchProtocolLogsStream(form.projectId, form.protocolId, 0, 0, 0);
        if (cancelled) return;

        setLogs(res.stdoutLog ?? "");
        setErrorLogs(res.stderrLog ?? "");
        setScheduleLogs(res.scheduleLog ?? "");

        offsetRef.current =
          typeof res.stdoutOffset === "number"
            ? res.stdoutOffset
            : (typeof res.stdoutLog === "string" ? res.stdoutLog.length : 0);

        errorOffsetRef.current =
          typeof res.stderrOffset === "number"
            ? res.stderrOffset
            : (typeof res.stderrLog === "string" ? res.stderrLog.length : 0);

        scheduleOffsetRef.current =
          typeof res.scheduleOffset === "number"
            ? res.scheduleOffset
            : (typeof res.scheduleLog === "string" ? res.scheduleLog.length : 0);
      } catch (err: any) {
        if (!cancelled) setLogsError(err.message || "Failed to load logs");
      }
    })();

    // incrementalPolling
    pollRef.current = setInterval(async () => {
      try {
        const res: any = await fetchProtocolLogsStream(
          form.projectId,
          form.protocolId,
          offsetRef.current || 0,
          errorOffsetRef.current || 0,
          scheduleOffsetRef.current || 0
        );
        if (cancelled) return;

        let gotNew = false;

        const hasStdout = typeof res.stdoutLog === "string" && res.stdoutLog.length > 0;
        const hasStderr = typeof res.stderrLog === "string" && res.stderrLog.length > 0;
        const hasSched = typeof res.scheduleLog === "string" && res.scheduleLog.length > 0;

        if (hasStdout && typeof res.stdoutOffset === "number" && res.stdoutOffset > offsetRef.current) {
          setLogs((prev) => prev + res.stdoutLog);
          offsetRef.current = res.stdoutOffset;
          gotNew = true;
        }

        if (hasStderr && typeof res.stderrOffset === "number" && res.stderrOffset > errorOffsetRef.current) {
          setErrorLogs((prev) => prev + res.stderrLog);
          errorOffsetRef.current = res.stderrOffset;
          gotNew = true;
        }

        if (hasSched && typeof res.scheduleOffset === "number" && res.scheduleOffset > scheduleOffsetRef.current) {
          setScheduleLogs((prev) => prev + res.scheduleLog);
          scheduleOffsetRef.current = res.scheduleOffset;
          gotNew = true;
        }

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
        if (!cancelled) setLogsError(err.message || "Failed to load logs");
      }
    }, 2000);

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [topTab, form?.projectId, form?.protocolId, protocolDetails.status]);

  // Autoscroll logs
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [logs]);

  // Autoscroll on new error logs
  useEffect(() => {
    if (!errorContainerRef.current) return;
    errorContainerRef.current.scrollTop = errorContainerRef.current.scrollHeight;
  }, [errorLogs]);

  // Autoscroll on new schedule logs
  useEffect(() => {
    if (!scheduleContainerRef.current) return;
    scheduleContainerRef.current.scrollTop = scheduleContainerRef.current.scrollHeight;
  }, [scheduleLogs]);

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
    if (form?.protocolClassName !== "ProtUnionSet") return;
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
  const getSerializedParams = () => {
    const out: any = {};

    Object.entries(protocolDetails.params || {}).forEach(([k, pRaw]: any) => {
      const keyParts = k.split("_");
      keyParts.shift();
      const newKey = keyParts.join("_");

      const p = pRaw ?? {};
      const cls = getParamClass(p);

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
          if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
            return String(item)
          }
          return (item.value ?? item.object ?? "") || ""
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

  function getHttpStatusFromError(err: any): number | null {
    // getHttpStatusFromError
    const status =
      err?.status ??
      err?.response?.status ??
      err?.response?.data?.status ??
      err?.response?.data?.statusCode ??
      null;

    return typeof status === "number" ? status : null;
  }

  function getDetailFromError(err: any): any {
    // getDetailFromError
    return (
      err?.detail ??
      err?.response?.data?.detail ??
      err?.response?.data?.error ??
      err?.response?.data?.message ??
      err?.data?.detail ??
      null
    );
  }

  function getMessageFromError(err: any, detail: any): string {
    // getMessageFromError
    if (typeof err?.message === "string" && err.message.trim()) return err.message;

    if (typeof detail === "string" && detail.trim()) return detail;

    if (detail && typeof detail === "object") {
      const msg = (detail as any).msg ?? (detail as any).message ?? (detail as any).error;
      if (typeof msg === "string" && msg.trim()) return msg;
    }

    return "Error launching the protocol";
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


  // Execute handler
  const handleExecute = async () => {
    setExecLoading(true);
    setExecError(null);
    setValidationErrors([]);

    try {
      const projectId = form?.projectId;
      const pid = form?.protocolId ?? "";
      const serialized = getSerializedParams();

      await svc.executeProtocol(projectId, pid, form?.protocolClassName, serialized);

      onExecuted?.();
      requestClose();
    } catch (err: any) {
      const status = getHttpStatusFromError(err);
      const detail = getDetailFromError(err);

      // showValidationDialogOn422OrValidationPayload
      if (status === 422 || detail) {
        const extracted = extractValidationMessages(detail);
        if (extracted.length > 0 && (status === 422 || extracted.length > 0)) {
          setValidationErrors(extracted);
          setShowValidationDialog(true);
          return;
        }
      }

      const msg = getMessageFromError(err, detail);
      openExecErrorDialog("Execution error", msg);
    } finally {
      setExecLoading(false);
    }
  };


  // Save handler
  const handleSave = async () => {
    setExecLoading(true);
    setExecError(null);

    try {
      const projectId = form?.projectId;
      const pid = form?.protocolId ?? "";
      const serialized = getSerializedParams();

      const res: any = await svc.saveProtocol(projectId, pid, form?.protocolClassName, serialized);

      const returnedProtocolId = res?.protocolId ?? pid;

      if (res?.status === "ok" && Array.isArray(res?.errors) && res.errors.length === 0) {
        toast.success(`Saved protocol ${returnedProtocolId} successfully.`);
        requestClose();
        return;
      }

      if (res?.status === "ok") {
        const errText = Array.isArray(res?.errors) ? res.errors.join("; ") : "Unknown warning";
        toast.error(`Saved with warnings: ${errText}`);
        requestClose();
        return;
      }

      toast.error("Save failed");
    } catch (err: any) {
      const detail = getDetailFromError(err);
      const msg = getMessageFromError(err, detail);
      toast.error(msg);
      openExecErrorDialog("Save error", msg);
    } finally {
      setExecLoading(false);
    }
  };



  // Render a single parameter row
  const renderParam = useCallback(
    (paramLike: any, sectionIdx: number, rowIndex = 0, layoutVariant: "standard" | "inline" = "standard"): JSX.Element | null => {
      const { paramName: name, paramDef: def } = unwrapParamDef(paramLike);
      if (!name || !def) return null;

      const isInline = layoutVariant === "inline";
      const fieldWidth = isInline ? 60 : 300;

      const defClass = getParamClass(def);
      const key = `${sectionIdx}_${name}`;
      const value = protocolDetails.params?.[key]?.editableValue;

      if (def.condition && !evalExpr(sectionIdx, def.condition)) return null;

      const expertLocator = findGeneralExpertLocator();
      const isExpertSelector =
        !!expertLocator && expertLocator.sectionIdx === sectionIdx && name === "expertLevel";

      if (
        form?.expertLevel &&
        generalExpertLevel === 0 &&
        def?.expertLevel === 1 &&
        !isExpertSelector
      ) {
        return null;
      }

      // advancedSlot
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


      // MultiPointerParam
      if (defClass === "MultiPointerParam") {
        const items = Array.isArray(value) ? value : def.default ?? [];

        const onClear = (i: number) => {
          setProtocolDetails((prev: any) => {
            const list = Array.isArray(prev.params[key].editableValue)
              ? [...prev.params[key].editableValue]
              : [];
            list.splice(i, 1);
            list.push({ object: "", info: "" });
            return {
              ...prev,
              params: {
                ...prev.params,
                [key]: { ...prev.params[key], editableValue: list },
              },
            };
          });
        };

        const onRowDrop = (i: number, dragged: any) => {
          const liveParam = protocolDetails.params?.[key];
          const expected = getExpectedClass(liveParam);
          const norm = (s: any) =>
            typeof s === "string" ? s.replace(/\s+/g, "").toLowerCase() : "";
          const draggedClass = norm(dragged.pointerClass);

          const matches =
            expected === null
              ? true
              : Array.isArray(expected)
                ? expected.some((e) => norm(e) === draggedClass)
                : norm(expected) === draggedClass;

          if (!matches) return;

          setProtocolDetails((prev: any) => {
            const list = Array.isArray(prev.params[key].editableValue)
              ? [...prev.params[key].editableValue]
              : [];
            while (list.length <= i) list.push({ object: "", info: "" });
            list[i] = {
              object: dragged.value ?? "",
              info: dragged.info ?? "",
              pointerClass: dragged.pointerClass ?? "",
              parentId: dragged.parentId ?? null,
            };
            return {
              ...prev,
              params: {
                ...prev.params,
                [key]: { ...prev.params[key], editableValue: list },
              },
            };
          });
        };

        const handlePickFromDialog = (rowIndexInner: number, picked: any) => {
          setProtocolDetails((prev: any) => {
            const list = Array.isArray(prev.params[key].editableValue)
              ? [...prev.params[key].editableValue]
              : [];

            while (list.length <= rowIndexInner) list.push({ object: "", info: "" });

            list[rowIndexInner] = {
              object: picked.value ?? "",
              info: picked.info ?? "",
              pointerClass: picked.pointerClass ?? "",
              value: picked.value ?? "",
              parentId: picked.protocolId ?? picked.parentId ?? null,
            };

            return {
              ...prev,
              params: {
                ...prev.params,
                [key]: { ...prev.params[key], editableValue: list },
              },
            };
          });
        };

        const liveDef = { ...def, ...(protocolDetails.params?.[key] || {}) };

        return (
          <ParamRow
            key={key}
            label={def.label || name}
            control={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {advancedSlot}
                <MultiParamRow
                  label={def.label || name}
                  items={items}
                  helpText={def.help}
                  onRowClear={onClear}
                  onRowDrop={onRowDrop}
                  dragOverKey={dragOverKey}
                  setDragOverKey={setDragOverKey}
                  currentDraggedOutput={currentDraggedOutput}
                  paramKey={key}
                  def={liveDef}
                  getAvailableOutputs={() => getFilteredOutputsForKey(key)}
                  onPickForRow={handlePickFromDialog}
                />
              </Box>
            }
            helpText={def.help}
            rowIndex={rowIndex}
          />
        );
      }

      // PointerParam
      if (defClass === "PointerParam") {
        const onClear = () =>
          setProtocolDetails((prev: any) => ({
            ...prev,
            params: {
              ...prev.params,
              [key]: { ...prev.params[key], editableValue: "", value: "" },
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

        // normalizePointerValueForDisplay
        const displayValue = (() => {
          const v = value ?? def.default ?? "";
          if (typeof v === "string" || typeof v === "number") return v;
          if (v && typeof v === "object") {
            const objValue = (v as any).value;
            if (typeof objValue === "string" || typeof objValue === "number") return objValue;
          }
          return "";
        })();

        const control = (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TextField
              size="small"
              value={displayValue}
              InputProps={{ readOnly: true }}
              onClick={() => handleOpenFind(key)}
              sx={{
                width: fieldWidth,
                minWidth: 0,
                "& .MuiInputBase-root": { minHeight: 36 },
                "& .MuiInputBase-input, & input, & input[readonly]": {
                  fontSize: 12,
                  padding: "8px 10px",
                  lineHeight: 1.2,
                  color: "#111827",
                  WebkitTextFillColor: "#111827",
                  opacity: 1,
                  userSelect: "none",
                  cursor: "pointer",
                },
              }}
            />
          </Box>
        );

        return (
          <ParamRow
            key={key}
            label={def.label || name}
            control={
              <WrapWithDrop
                control={control}
                def={def}
                paramKey={key}
                setProtocolDetails={setProtocolDetails}
                setDragOverKey={setDragOverKey}
                dragOverKey={dragOverKey}
              />
            }
            helpText={def.help}
            isPointerParam
            onClear={onClear}
            rowIndex={rowIndex}
            onOpenFind={() => handleOpenFind(key)}
            layoutVariant={layoutVariant}
          />
        );
      }

      // PathParam
      if (defClass === "PathParam") {
        const current = protocolDetails.params?.[key] || {};
        const textValue =
          current.editableValue ??
          current.value ??
          def.value ??
          def.default ??
          "";

        const handleBrowsePath = () => {
          if (!projectId || !protocolId) {
            console.warn("Missing projectId or protocolId for PathParam browse.");
            return;
          }
          setPathDialog({ open: true, paramKey: key });
        };

        const handleClear = () => {
          setProtocolDetails((prev: any) => {
            if (!prev?.params?.[key]) return prev;
            return {
              ...prev,
              params: {
                ...prev.params,
                [key]: {
                  ...prev.params[key],
                  editableValue: "",
                  value: "",
                },
              },
            };
          });
        };

        const control = (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {advancedSlot}
            <TextField
              size="small"
              name={key}
              value={textValue}
              onChange={(e) =>
                setProtocolDetails((prev: any) => {
                  if (!prev?.params?.[key]) return prev;
                  return {
                    ...prev,
                    params: {
                      ...prev.params,
                      [key]: {
                        ...prev.params[key],
                        editableValue: e.target.value,
                        value: e.target.value,
                      },
                    },
                  };
                })
              }
              sx={{
                minWidth: fieldWidth,
                "& .MuiInputBase-root": { minHeight: 36 },
                "& .MuiInputBase-input": { fontSize: 12, padding: "8px 10px", lineHeight: 1.2 },
              }}
            />
          </Box>
        );

        return (
          <ParamRow
            key={key}
            label={def.label || name}
            control={control}
            helpText={def.help}
            isPathParam
            onBrowsePath={handleBrowsePath}
            onClear={handleClear}
            rowIndex={rowIndex}
            layoutVariant={layoutVariant}
          />
        );
      }

      // EnumParam
      if (defClass === "EnumParam" && Array.isArray(def.choices)) {
        let sel = value ?? def.default ?? "";
        if (typeof sel === "number") sel = def.choices[sel] ?? "";

        const safeSel = def.choices.includes(sel) ? sel : (def.choices[0] ?? "");

        const onChange = (v: any) =>
          setProtocolDetails((prev: any) => ({
            ...prev,
            params: { ...prev.params, [key]: { ...prev.params[key], editableValue: v } },
          }));

        const controlBase =
          def.display === 0 ? (
            <RadioGroup
              row
              value={safeSel}
              onChange={(e) => onChange(e.target.value)}
            >
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
                width: fieldWidth,
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
            key={key}
            label={def.label || name}
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

      // Line
      if (defClass === "Line" && Array.isArray(def.params)) {
        const title = String(def.label || name || "").trim();

        // renderInlineChildren
        const children = def.params
          .map((child: any, idx: number) => {
            const childEl = renderParam(child, sectionIdx, idx, "inline");
            if (!childEl) return null;

            return (
              <Box
                key={`${key}_line_${idx}`}
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

        // If the line has no label, just render the inline controls
        if (!title) {
          return (
            <Box
              key={key}
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

        // Single-row layout: label (left) + children controls (right)
        return (
          <ParamRow
            key={key}
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
            helpText={def.help}
            rowIndex={rowIndex}
            layoutVariant="standard"
          />
        );
      }


      // Group
      if (defClass === "Group" && Array.isArray(def.params)) {
        const groupKey = `${key}_group`;
        const expanded = expandedGroups[groupKey] ?? true;

        const toggleExpand = () =>
          setExpandedGroups((prev) => ({ ...prev, [groupKey]: !expanded }));

        return (
          <Box
            key={key}
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
                {def.label || name || `Group ${groupKey}`}
              </Typography>
              <IconButton size="small">
                {expanded ? <ChevronUpIcon fontSize="small" /> : <ChevronDownIcon fontSize="small" />}
              </IconButton>
            </Box>

            {expanded &&
              def.params.map((child: any, idx: number) => renderParam(child, sectionIdx, idx))}
          </Box>
        );
      }

      // BooleanParam
      if (defClass === "BooleanParam") {
        const checked = coerceBooleanValue(
          value !== undefined
            ? value
            : protocolDetails.params?.[key]?.value ?? def.value ?? def.value ?? def.default
        );

        return (
          <ParamRow
            key={key}
            label={def.label || name}
            control={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {advancedSlot}
                <Switch
                  checked={checked}
                  onChange={(e) =>
                    setProtocolDetails((prev: any) => ({
                      ...prev,
                      params: {
                        ...prev.params,
                        [key]: {
                          ...prev.params[key],
                          editableValue: e.target.checked,
                          value: e.target.checked,
                        },
                      },
                    }))
                  }
                  color="primary"
                />
              </Box>
            }
            helpText={def.help}
            rowIndex={rowIndex}
          />
        );
      }

      // Default text param
      const defaultControl = (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {advancedSlot}
          <TextField
            size="small"
            name={key}
            value={value ?? def.default ?? ""}
            onChange={(e) =>
              setProtocolDetails((prev: any) => ({
                ...prev,
                params: {
                  ...prev.params,
                  [key]: {
                    ...prev.params[key],
                    editableValue: e.target.value,
                  },
                },
              }))
            }
            sx={{
              width: fieldWidth,
              minWidth: 0,
              "& .MuiInputBase-root": { minHeight: 36 },
              "& .MuiInputBase-input": { fontSize: 12, padding: "8px 10px", lineHeight: 1.2 },
            }}
          />
        </Box>
      );

      return (
        <ParamRow
          key={key}
          label={def.label || name}
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
      form,
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
      const defClass = getParamClass(def);

      if (defClass === "MultiPointerParam") {
        const newItems = picks.map((pick) => ({
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

  const safeDefinition = Array.isArray(form?.definition) ? form.definition : [];
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
            {form?.protocolId}
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
                        sx={{
                          textTransform: "none",
                          ml: 1,
                          backgroundColor: "#333d49",
                          "&:hover": { backgroundColor: "#596472ff" },
                        }}
                        disabled={!activeOutput}
                        onClick={() => setAnalyzeOpen(true)}
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
                  flexGrow: 3,
                  overflowY: "auto",
                }}
              >
                <Tabs
                  value={bottomTab}
                  onChange={(_, val) => setBottomTab(val)}
                  sx={{
                    mb: 0,
                    "& .MuiTab-root": {
                      textTransform: "none",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                    },
                  }}
                >
                  {["Output", "Errors", "Schedule"].map((label, index) => (
                    <Tab key={index} label={label} />
                  ))}
                </Tabs>
                <Box className={styles.bottomTabContent} sx={{ p: 2 }}>

                  {/* Output Log */}
                  {bottomTab === 0 && (
                    <Box
                      ref={containerRef}
                      sx={{
                        backgroundColor: "#f5f5f5",
                        color: "black",
                        borderColor: "gray",
                        fontFamily: "monospace",
                        fontSize: 12,
                        p: 2,
                        borderRadius: 2,
                        border: "1px solid #e5e7eb",
                        maxHeight: "100%",
                        height: "100%",
                        overflowY: "auto",
                        whiteSpace: "pre",
                      }}
                    >
                      {logs && logs.length > 0 ? (
                        logs.split("\n").map((line, idx) => (
                          <div key={idx} style={{ display: "flex" }}>
                            <span
                              style={{
                                color: "blue",
                                userSelect: "none",
                                marginRight: 8,
                              }}
                            >
                              {String(idx + 1).padStart(5, "0")}:
                            </span>
                            <span>{parseAnsi(line)}</span>
                          </div>
                        ))
                      ) : (
                        <Typography variant="body2" sx={{ opacity: 0.7 }}>
                          No logs yet.
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Errors Log */}
                  {bottomTab === 1 && (
                    <Box
                      ref={errorContainerRef}
                      sx={{
                        backgroundColor: "#f5f5f5",
                        color: "black",
                        borderColor: "gray",
                        fontFamily: "monospace",
                        fontSize: 12,
                        p: 2,
                        borderRadius: 2,
                        border: "1px solid #e5e7eb",
                        maxHeight: "100%",
                        height: "100%",
                        overflowY: "auto",
                        whiteSpace: "pre",
                      }}
                    >
                      {errorLogs ? (
                        errorLogs.split("\n").map((line, idx) => (
                          <div key={idx} style={{ display: "flex" }}>
                            <span
                              style={{
                                color: "red",
                                userSelect: "none",
                                marginRight: 8,
                              }}
                            >
                              {String(idx + 1).padStart(5, "0")}:
                            </span>
                            <span>{parseAnsi(line)}</span>
                          </div>
                        ))
                      ) : (
                        <Typography variant="body2" sx={{ opacity: 0.7 }}>
                          No error logs.
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Schedule Log */}
                  {bottomTab === 2 && (
                    <Box
                      ref={scheduleContainerRef}
                      sx={{
                        backgroundColor: "#f5f5f5",
                        color: "black",
                        borderColor: "gray",
                        fontFamily: "monospace",
                        fontSize: 12,
                        p: 2,
                        borderRadius: 2,
                        border: "1px solid #e5e7eb",
                        maxHeight: "100%",
                        height: "100%",
                        overflowY: "auto",
                        whiteSpace: "pre",
                      }}
                    >
                      {/* Schedule Log */}
                      {scheduleLogs ? (
                        scheduleLogs.split("\n").map((line, idx) => (
                          <div key={idx} style={{ display: "flex" }}>
                            <span
                              style={{
                                color: "red",
                                userSelect: "none",
                                marginRight: 8,
                              }}
                            >
                              {String(idx + 1).padStart(5, "0")}:
                            </span>
                            <span>{parseAnsi(line)}</span>
                          </div>
                        ))
                      ) : (
                        <Typography variant="body2" sx={{ opacity: 0.7 }}>
                          No schedule logs.
                        </Typography>
                      )}
                    </Box>
                  )}
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
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={
            execLoading ||
            protocolDetails.status === "running" ||
            protocolDetails.status === "scheduled"
          }
          sx={{ textTransform: "none" }}
        >
          Save
        </Button>
        <Button
          variant="contained"
          startIcon={
            execLoading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <ExecuteIcon />
            )
          }
          color="success"
          onClick={handleExecute}
          disabled={
            execLoading ||
            protocolDetails.status === "running" ||
            protocolDetails.status === "scheduled"
          }
          sx={{ textTransform: "none" }}
        >
          {execLoading ? "Executing..." : "Execute"}
        </Button>
      </div>

      {/* PathParam RemoteFileDialog */}
      {/* PathParam RemoteFileDialog */}
      {pathDialog.open && pathDialog.paramKey && projectId && protocolId && (
        <RemoteFileDialog
          open={pathDialog.open}
          onClose={() =>
            setPathDialog({
              open: false,
              paramKey: null,
            })
          }
          title={`Select file for ${pathDialog.paramKey}`}
          projectId={projectId}
          protocolId={protocolId}
          resolveStartPath={() =>
            svc.resolveProtocolStartPath(projectId, String(protocolId))
          }
          listRemoteDirectory={(p) =>
            svc.listRemoteDirectory(projectId, String(protocolId), p)
          }
          previewRemoteText={(p) =>
            svc.previewProtocolText(projectId, String(protocolId), p)
          }
          buildDownloadUrl={(p, inline) =>
            svc.buildProtocolDownloadUrl(
              String(projectId),
              String(protocolId),
              p,
              !!inline
            )
          }
          fetchInlinePreviewBlob={(p) =>
            svc.fetchProtocolInlinePreviewBlob(
              String(projectId),
              String(protocolId),
              p
            )
          }
          onPick={(relativePath) => {
            const paramKey = pathDialog.paramKey;
            if (paramKey) {
              setProtocolDetails((prev: any) => {
                if (!prev?.params?.[paramKey]) {
                  return prev;
                }
                return {
                  ...prev,
                  params: {
                    ...prev.params,
                    [paramKey]: {
                      ...prev.params[paramKey],
                      editableValue: relativePath,
                      value: relativePath,
                    },
                  },
                };
              });
            }
            setPathDialog({
              open: false,
              paramKey: null,
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
        outputRaw={activeOutput?.raw || {}}
      />

    </div>
  );
}
