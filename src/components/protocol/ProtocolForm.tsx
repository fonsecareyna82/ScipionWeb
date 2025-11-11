// src/components/ProtocolForm.tsx
import { useState, useEffect, useCallback, JSX, useRef, useMemo } from "react";
import {
  Tabs,
  Tab,
  Box,
  Typography,
  Button,
  TextField,
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
import "./ProtocolForm.css";
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

type ProtocolFormProps = {
  data: any;
  projectProtocols: any;
  onClose: () => void;
  onExecuted?: () => void;
  /** Presentation variant: "drawer" (default) slides in from the right; "docked" fills its parent panel. */
  variant?: "drawer" | "docked";
};

export default function ProtocolForm({
  data,
  projectProtocols = [],
  onClose,
  onExecuted,
  variant = "drawer",
}: ProtocolFormProps) {
  const svc = useProjectService();

  const projectId = data?.projectId ?? data?.project?.id ?? null;
  const protocolId = data?.id ?? null;

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

  // Global Output Selector
  const [openSelector, setOpenSelector] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState<{
    key: string;
    def?: any;
    expectedClass?: string | string[] | null;
  } | null>(null);
  const [expectedClass, setExpectedClass] = useState<string | string[] | null | undefined>(undefined);
  const [allOutputs, setAllOutputs] = useState<any[]>([]);

  // Tracks last committed label for inputType to detect user changes
  const prevSelectedInputTypeRef = useRef<string | null>(null);

  // --------------------------------------------
  // Outputs tab state
  // --------------------------------------------
  const [selectedOutputIdx, setSelectedOutputIdx] = useState<number | null>(null);

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

  // Normalize outputs from data.outputs for the Outputs tab
  const normalizedOutputs = useMemo(() => {
    const arr = Array.isArray(data?.outputs) ? data.outputs : [];
    return arr.map((entry: any) => {
      const [name, payload] = Object.entries(entry)[0] as [string, any];
      const infoText = payload?.info ?? payload?._class ?? "";
      return {
        name,
        infoText,
        raw: payload,
      };
    });
  }, [data?.outputs]);

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
          data.projectId,
          data?.id,
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
  }, [activeOutput, data?.id, sqliteTable, svc, data?.projectId]);


  // Use this instead of onClose() directly to play exit animation
  const requestClose = () => setIsClosing(true);
  const handleAnimationEnd = () => {
    // Only propagate close to parent after the exit animation completes
    if (isClosing) onClose();
  };

  // Parse JSON envelopes like {"_objValue": "..."} if they appear as strings
  const parseFromJSONValue = (maybeJson: any) => {
    try {
      if (typeof maybeJson === "string") {
        const obj = JSON.parse(maybeJson);
        if (obj && typeof obj === "object" && "_objValue" in obj) {
          return obj._objValue;
        }
      }
    } catch { }
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
    if (state._class === "EnumParam" && Array.isArray(state.choices)) {
      const v = state.editableValue ?? state.default ?? "";
      if (typeof v === "number") return v;
      const idx = state.choices.indexOf(v);
      return idx >= 0 ? idx : 0;
    }
    return state.editableValue ?? "";
  };

  // Locate the global expertLevel EnumParam if present
  const findGeneralExpertLocator = useCallback(() => {
    if (!data?.expertLevel || !Array.isArray(data?.definition)) return null;

    for (let i = 0; i < data.definition.length; i++) {
      const section = data.definition[i];
      const params = section?.params ?? [];
      for (const p of params) {
        const [n, def] = Object.entries(p)[0] as [string, any];
        if (n === "expertLevel" && def?._class === "EnumParam") {
          return { sectionIdx: i, name: n };
        }
      }
    }
    return null;
  }, [data]);

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

  // Load initial parameters into protocolDetails
  useEffect(() => {
    if (!data) {
      setProtocolDetails({});
      return;
    }

    const params: any = {};
    const walk = (secIdx: number, obj: any) => {
      const [name, def] = Object.entries(obj)[0] as [string, any];
      if (def._class === "Group" && Array.isArray(def.children)) {
        def.children.forEach((c: any) => walk(secIdx, c));
        return;
      }
      const key = `${secIdx}_${name}`;
      const raw = def.value ?? def.default ?? "";
      const parsed = parseFromJSONValue(raw);
      let init = parsed ?? "";
      // If EnumParam default is index, map to label for UI state
      if (def._class === "EnumParam" && Array.isArray(def.choices) && typeof init === "number") {
        init = def.choices[init] ?? def.default ?? "";
      }
      params[key] = { ...def, value: def.value, editableValue: init };
    };

    data.definition?.forEach((section: any, i: number) => {
      section.params?.forEach((p: any) => walk(i, p));
    });

    setProtocolDetails({
      label: data.protocolName ?? "",
      status: data.status ?? "",
      id: data.id ?? "",
      color: data.color ?? "",
      params,
    });

    // Remember initial inputType label to detect future user change
    if (data.protocolClassName === "ProtUnionSet") {
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
  }, [data]);

  const isTerminalStatus = (s: any) =>
    ["finished", "success", "done", "failed", "error", "cancelled", "canceled", "stopped", "aborted"]
      .includes(String(s || "").toLowerCase());
  const idleStreakRef = useRef<number>(0);

  // Incremental log polling
  useEffect(() => {
    // Clear any previous interval before starting a new polling cycle
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    // Minimal conditions to enable polling
    if (topTab !== 4 || !data?.projectId || !data?.id) return;

    let cancelled = false;
    idleStreakRef.current = 0;

    // Initial load
    (async () => {
      try {
        const res: any = await fetchProtocolLogsStream(data.projectId, data.id, 0, 0, 0);
        if (cancelled) return;

        // Keep field names consistent: scheduleLog / scheduleOffset
        setLogs(res.stdoutLog ?? "");
        setErrorLogs(res.stderrLog ?? "");
        setScheduleLogs(res.scheduleLog ?? "");

        offsetRef.current = typeof res.stdoutOffset === "number"
          ? res.stdoutOffset
          : (typeof res.stdoutLog === "string" ? res.stdoutLog.length : 0);

        errorOffsetRef.current = typeof res.stderrOffset === "number"
          ? res.stderrOffset
          : (typeof res.stderrLog === "string" ? res.stderrLog.length : 0);

        scheduleOffsetRef.current = typeof res.scheduleOffset === "number"
          ? res.scheduleOffset
          : (typeof res.scheduleLog === "string" ? res.scheduleLog.length : 0);
      } catch (err: any) {
        if (!cancelled) setLogsError(err.message || "Failed to load logs");
      }
    })();

    // 2) Incremental polling every 2s
    pollRef.current = setInterval(async () => {
      try {
        const res: any = await fetchProtocolLogsStream(
          data.projectId,
          data.id,
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

        // Stop polling after 2 idle cycles if status is terminal
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
  }, [topTab, data?.projectId, data?.id, protocolDetails.status]);

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

      for (const out of prot.outputs) {
        const entries = Object.entries(out);
        if (entries.length === 0) continue;
        const [key, valAny] = entries[0];
        const val = valAny as any;

        outputs.push({
          protocol: prot.label ?? prot.protocolName ?? prot.id ?? "Unknown",
          key,
          info: val?.info ?? "",
          _class: val?._class ?? "",
          _objValue: val?._objValue ?? "",
          _protocolId: pid,
        });
      }
    }

    return { outputs, dependencyMap };
  }, [projectProtocols]);

  // Keep ProtUnionSet inputSets constraints in sync when inputType changes
  useEffect(() => {
    if (data?.protocolClassName !== "ProtUnionSet") return;
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
  }, [data?.protocolClassName, protocolDetails.params]);

  // Filter outputs for a given paramKey, excluding self and descendants
  const getFilteredOutputsForKey = (paramKey: string) => {
    const liveParam = protocolDetails.params?.[paramKey];
    const expected = getExpectedClass(liveParam);

    const { outputs, dependencyMap } = gatherAllOutputs();
    const currentId = String(data?.id ?? "");

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

    const pool = outputs.filter((o) => !blocked.has(String(o._protocolId)));

    const norm = (s: any) =>
      typeof s === "string" ? s.replace(/\s+/g, "").toLowerCase() : "";

    if (expected === null) {
      return pool.filter((o) => /^setof/i.test(String(o._class || "")));
    }

    return pool.filter((o) => {
      const oc = norm(o._class);
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
      const cls = p._class;

      if (cls === "PointerParam") {
        const editable = p.editableValue ?? "";
        const normalized = {
          _objValue: "",
          info: p.info ?? "",
          _parentId: p._parentId ?? null,
          _class: p._class ?? "PointerParam",
        };

        const token = (p._objValue ?? "").toString().trim();
        if (token) {
          normalized._objValue = token;
        } else if (editable) {
          normalized._objValue = String(editable);
        } else {
          normalized._objValue = "";
        }

        out[newKey] = normalized;
        return;
      }

      if (cls === "MultiPointerParam" && Array.isArray(p.editableValue)) {
        const list = p.editableValue.map((item: any) => {
          if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
            return {
              _objValue: String(item),
              info: "",
              _parentId: null,
              _class: p._class ?? "PointerParam",
            };
          }
          return {
            _objValue: (item._objValue ?? item.object ?? "") || "",
            info: item.info ?? "",
            _parentId: item._parentId ?? item._protocolId ?? null,
            _class: item._class ?? "PointerParam",
          };
        });

        out[newKey] = list;
        return;
      }

      out[newKey] = {
        value: p.editableValue,
        _objValue: p._objValue,
        info: p.info,
        _parentId: p._parentId,
      };
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

  // Execute handler
  const handleExecute = async () => {
    setExecLoading(true);
    setExecError(null);
    setValidationErrors([]);

    try {
      const pid = data?.id ?? "";
      const serialized = getSerializedParams();
      await svc.executeProtocol(pid, data?.protocolClassName, serialized);
      onExecuted?.();
      requestClose();
    } catch (err: any) {
      if (typeof err?.detail === "string") {
        const extracted = extractValidationErrors(err.detail);
        if (extracted.length > 0) {
          setValidationErrors(extracted);
          setShowValidationDialog(true);
          setExecLoading(false);
          return;
        }
      }
      setExecError(err.message || "Error launching the protocol");
    } finally {
      setExecLoading(false);
    }
  };

  // Save handler
  const handleSave = async () => {
    setExecLoading(true);
    setExecError(null);
    try {
      const pid = data?.id ?? "";
      const serialized = getSerializedParams();
      await svc.saveProtocol(pid, data?.protocolClassName, serialized);
      requestClose();
    } catch (err: any) {
      setExecError(err.message || "Error saving the protocol");
    } finally {
      setExecLoading(false);
    }
  };

  // Render a single parameter row
  const renderParam = useCallback(
    (paramObj: any, sectionIdx: number, rowIndex = 0): JSX.Element | null => {
      const [name, def] = Object.entries(paramObj)[0] as [string, any];
      const key = `${sectionIdx}_${name}`;
      const value = protocolDetails.params?.[key]?.editableValue;

      if (def.condition && !evalExpr(sectionIdx, def.condition)) return null;

      const expertLocator = findGeneralExpertLocator();
      const isExpertSelector =
        !!expertLocator && expertLocator.sectionIdx === sectionIdx && name === "expertLevel";

      if (
        data?.expertLevel &&
        generalExpertLevel === 0 &&
        def?.expertLevel === 1 &&
        !isExpertSelector
      ) {
        return null;
      }

      const advancedSlot = (
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
      if (def._class === "MultiPointerParam") {
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
          const draggedClass = norm(dragged._class);

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
              object: dragged._objValue ?? "",
              info: dragged.info ?? "",
              _class: dragged._class ?? "",
              _parentId: dragged._parentId ?? null,
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
              object: picked._objValue ?? "",
              info: picked.info ?? "",
              _class: picked._class ?? "",
              _objValue: picked._objValue ?? "",
              _parentId: picked._protocolId ?? picked._parentId ?? null,
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
      if (def._class === "PointerParam") {
        const onClear = () =>
          setProtocolDetails((prev: any) => ({
            ...prev,
            params: {
              ...prev.params,
              [key]: { ...prev.params[key], editableValue: "", _objValue: "" },
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

        const control = (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TextField
              size="small"
              value={value ?? def.default ?? ""}
              InputProps={{ readOnly: true }}
              onClick={() => handleOpenFind(key)}
              onChange={(e) =>
                setProtocolDetails((prev: any) => ({
                  ...prev,
                  params: {
                    ...prev.params,
                    [key]: {
                      ...prev.params[key],
                      editableValue: e.target.value,
                      _objValue: e.target.value,
                    },
                  },
                }))
              }
              sx={{
                minWidth: 300,
                "& .MuiInputBase-input": {
                  fontSize: "0.8rem",
                  userSelect: "none",
                  cursor: "pointer",
                },
                "& .MuiInputBase-input:active": {
                  cursor: "grabbing",
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
          />
        );
      }

      // PathParam
      if (def._class === "PathParam") {
        const current = protocolDetails.params?.[key] || {};
        const textValue =
          current.editableValue ??
          current._objValue ??
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
                  _objValue: "",
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
                        _objValue: e.target.value,
                      },
                    },
                  };
                })
              }
              sx={{ minWidth: 300, "& .MuiInputBase-input": { fontSize: "0.8rem" } }}
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
          />
        );
      }

      // EnumParam
      if (def._class === "EnumParam" && Array.isArray(def.choices)) {
        let sel = value ?? def.default ?? "";
        if (typeof sel === "number") sel = def.choices[sel] ?? "";

        const onChange = (v: any) =>
          setProtocolDetails((prev: any) => ({
            ...prev,
            params: { ...prev.params, [key]: { ...prev.params[key], editableValue: v } },
          }));

        const controlBase =
          def.display === 0 ? (
            <RadioGroup
              row
              value={
                def.choices?.includes(sel)
                  ? sel
                  : def.choices?.[0] ?? ""
              }
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
              value={sel}
              onChange={(e) => onChange(e.target.value)}
              SelectProps={{ native: true }}
              sx={{ minWidth: 300, "& .MuiInputBase-input": { fontSize: "0.8rem" } }}
            >
              {def.choices.map((ch: string, i: number) => (
                <option key={i} value={ch}>
                  {ch}
                </option>
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
          />
        );
      }

      // Group
      if (def._class === "Group" && Array.isArray(def.children)) {
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
              def.children.map((child: any, idx: number) => renderParam(child, sectionIdx, idx))}
          </Box>
        );
      }

      // BooleanParam
      if (def._class === "BooleanParam") {
        const checked =
          value !== undefined
            ? ["True", true, 1, "1"].includes(value)
            : ["True", true, 1, "1"].includes(def.default);

        return (
          <ParamRow
            key={key}
            label={def.label || name}
            control={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {advancedSlot}
                <Switch
                  checked={!!checked}
                  onChange={(e) =>
                    setProtocolDetails((prev: any) => ({
                      ...prev,
                      params: {
                        ...prev.params,
                        [key]: {
                          ...prev.params[key],
                          editableValue: e.target.checked ? "True" : "False",
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
            sx={{ minWidth: 300, "& .MuiInputBase-input": { fontSize: "0.8rem" } }}
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
        />
      );
    },
    [
      protocolDetails.params,
      dragOverKey,
      currentDraggedOutput,
      expandedGroups,
      data,
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

      if (def?._class === "MultiPointerParam") {
        const newItems = picks.map((pick) => ({
          _objValue: pick?._objValue ?? "",
          info: pick?.info ?? "",
          _class: pick?._class ?? "PointerParam",
          _parentId: pick?._protocolId ?? pick?._parentId ?? null,
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
            editableValue: pick?._objValue ?? "",
            _objValue: pick?._objValue ?? "",
            info: pick?.info ?? "",
            _class: pick?._class ?? "",
            _parentId: pick?._protocolId ?? pick?._parentId ?? null,
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
            fontSize: "0.8rem",
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

  const safeDefinition = Array.isArray(data?.definition) ? data.definition : [];

  const presentationClass = variant === "docked" ? "as-docked" : "";

  return (
    <div
      className={`protocol-form ${presentationClass} ${
        isClosing ? "slide-out-right" : "slide-in-right"
      }`}
      onAnimationEnd={handleAnimationEnd}
    >
      {/* HEADER */}
      <div className="form-header">
        <div className="form-title-wrapper">
          <Box className="inline-flex items-center justify-center rounded-full bg-green-500 text-black text-xs font-bold px-2 py-1">
            {data?.id}
          </Box>
          <h2>{protocolDetails.label}</h2>
          <span
            className="node-status-pill"
            style={{
              backgroundColor: protocolDetails.color,
              color: "black",
            }}
          >
            {protocolDetails.status || "Unknown"}
          </span>
        </div>
        <button className="close-btn" onClick={requestClose}>
          ×
        </button>
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
        className="form-body"
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
            <Tab label="Summary" />
            <Tab label="Methods" />
            <Tab label="Logs" />
          </Tabs>

          <Box
            className="top-tab-content"
            sx={{
              flex: 1,
              minHeight: 0,
              p: 1,
              display: "flex",
              flexDirection: "column",
            }}
          >
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
                  {safeDefinition.map(
                    (section: any, idx: number) => (
                      <Tab
                        key={idx}
                        label={
                          section.name ||
                          `Section ${idx + 1}`
                        }
                      />
                    )
                  )}
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
                  {safeDefinition[sectionTab]?.params?.map(
                    (paramObj: any, idx: number) =>
                      renderParam(
                        paramObj,
                        sectionTab,
                        idx
                      )
                  )}
                </Box>
              </>
            )}

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
                {/* Left Panel Outputs */}
                <Box
                  sx={{
                    flex: "0 0 45%",
                    maxWidth: "45%",
                    minWidth: 0,
                    minHeight: 0,
                    backgroundColor: "#fff",
                    borderRadius: 2,
                    boxShadow:
                      "0px 2px 6px rgba(0,0,0,0.1)",
                    border:
                      "1px solid #e5e7eb",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderBottom:
                        "1px solid #e5e7eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
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
                      {
                        normalizedOutputs.length
                      }{" "}
                      items
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
                    {normalizedOutputs.length ===
                    0 ? (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "#6b7280",
                          fontSize:
                            "0.8rem",
                          textAlign:
                            "center",
                          py: 4,
                        }}
                      >
                        No outputs for this
                        protocol.
                      </Typography>
                    ) : (
                      normalizedOutputs.map(
                        (
                          o: any,
                          idx: number
                        ) => (
                          <Box
                            key={idx}
                            onClick={() =>
                              setSelectedOutputIdx(
                                idx
                              )
                            }
                            sx={{
                              cursor:
                                "pointer",
                              userSelect:
                                "none",
                              borderRadius:
                                1.5,
                              border:
                                "1px solid transparent",
                              px: 1,
                              py: 1,
                              mb: 1,
                              backgroundColor:
                                selectedOutputIdx ===
                                idx
                                  ? "#eef2ff"
                                  : "transparent",
                              borderColor:
                                selectedOutputIdx ===
                                idx
                                  ? "#6366f1"
                                  : "transparent",
                              "&:hover": {
                                backgroundColor:
                                  selectedOutputIdx ===
                                  idx
                                    ? "#eef2ff"
                                    : "#f9fafb",
                                borderColor:
                                  selectedOutputIdx ===
                                  idx
                                    ? "#6366f1"
                                    : "#e5e7eb",
                              },
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                color:
                                  "#111827",
                                fontSize:
                                  "0.7rem",
                                fontWeight:
                                  selectedOutputIdx ===
                                  idx
                                    ? 600
                                    : 500,
                                lineHeight:
                                  1.4,
                                wordBreak:
                                  "break-word",
                                whiteSpace:
                                  "pre-wrap",
                              }}
                            >
                              {
                                o.infoText
                              }
                            </Typography>
                          </Box>
                        )
                      )
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
                    boxShadow:
                      "0px 2px 6px rgba(0,0,0,0.1)",
                    border:
                      "1px solid #e5e7eb",
                    display: "flex",
                    flexDirection:
                      "column",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderBottom:
                        "1px solid #e5e7eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
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
                      Preview
                    </Typography>
                    {activeOutput ? (
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#6b7280",
                          fontSize:
                            "0.7rem",
                          textAlign:
                            "center",
                          maxWidth:
                            "60%",
                          overflow:
                            "hidden",
                          textOverflow:
                            "ellipsis",
                          whiteSpace:
                            "nowrap",
                        }}
                        title={
                          activeOutput.infoText
                        }
                      >
                        {
                          activeOutput.infoText
                        }
                      </Typography>
                    ) : (
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#6b7280",
                          fontSize:
                            "0.7rem",
                        }}
                      >
                        No selection
                      </Typography>
                    )}
                  </Box>

                  <Box
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      overflowX: "hidden",
                      p: 1,
                      pb: 6,
                      backgroundColor:
                        "#f9fafb",
                      display: "flex",
                      justifyContent:
                        "center",
                      alignItems:
                        "flex-start",
                    }}
                  >
                    {previewContent}
                  </Box>
                </Box>
              </Box>
            )}

            {topTab === 2 && (
              <Typography variant="body1">
                Summary content goes here.
              </Typography>
            )}

            {topTab === 3 && (
              <Typography variant="body1">
                Methods content goes here.
              </Typography>
            )}

            {topTab === 4 && (
              <Box
                sx={{
                  flexGrow: 3,
                  overflowY: "auto",
                }}
              >
                <Tabs
                  value={bottomTab}
                  onChange={(_, val) =>
                    setBottomTab(val)
                  }
                  sx={{
                    mb: 0,
                    "& .MuiTab-root": {
                      textTransform:
                        "none",
                      fontSize:
                        "0.8rem",
                      fontWeight: 500,
                    },
                  }}
                >
                  {["Output", "Errors", "Schedule"].map(
                    (label, index) => (
                      <Tab
                        key={index}
                        label={label}
                      />
                    )
                  )}
                </Tabs>
                <Box
                  className="bottom-tab-content"
                  sx={{ p: 2 }}
                >
                  {bottomTab === 0 && (
                    <Box
                      ref={containerRef}
                      sx={{
                        backgroundColor:
                          "#f5f5f5",
                        color: "black",
                        borderColor:
                          "gray",
                        fontFamily:
                          "monospace",
                        fontSize:
                          "0.80rem",
                        p: 2,
                        borderRadius: 1,
                        maxHeight:
                          "100%",
                        height:
                          "100%",
                        overflowY:
                          "auto",
                        whiteSpace:
                          "pre",
                      }}
                    >
                      {logs &&
                      logs.length >
                        0 ? (
                        logs
                          .split("\n")
                          .map(
                            (
                              line,
                              idx
                            ) => (
                              <div
                                key={
                                  idx
                                }
                                style={{
                                  display:
                                    "flex",
                                }}
                              >
                                <span
                                  style={{
                                    color:
                                      "blue",
                                    userSelect:
                                      "none",
                                    marginRight: 8,
                                  }}
                                >
                                  {String(
                                    idx +
                                      1
                                  ).padStart(
                                    5,
                                    "0"
                                  )}
                                  :
                                </span>
                                <span>
                                  {parseAnsi(
                                    line
                                  )}
                                </span>
                              </div>
                            )
                          )
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            opacity: 0.7,
                          }}
                        >
                          No logs yet.
                        </Typography>
                      )}
                    </Box>
                  )}

                  {bottomTab === 1 && (
                    <Box
                      ref={
                        errorContainerRef
                      }
                      sx={{
                        backgroundColor:
                          "#f5f5f5",
                        color: "black",
                        borderColor:
                          "gray",
                        fontFamily:
                          "monospace",
                        fontSize:
                          "0.80rem",
                        p: 2,
                        borderRadius: 1,
                        maxHeight:
                          "100%",
                        height:
                          "100%",
                        overflowY:
                          "auto",
                        whiteSpace:
                          "pre",
                      }}
                    >
                      {errorLogs ? (
                        errorLogs
                          .split("\n")
                          .map(
                            (
                              line,
                              idx
                            ) => (
                              <div
                                key={
                                  idx
                                }
                                style={{
                                  display:
                                    "flex",
                                }}
                              >
                                <span
                                  style={{
                                    color:
                                      "red",
                                    userSelect:
                                      "none",
                                    marginRight: 8,
                                  }}
                                >
                                  {String(
                                    idx +
                                      1
                                  ).padStart(
                                    5,
                                    "0"
                                  )}
                                  :
                                </span>
                                <span>
                                  {parseAnsi(
                                    line
                                  )}
                                </span>
                              </div>
                            )
                          )
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            opacity: 0.7,
                          }}
                        >
                          No error
                          logs.
                        </Typography>
                      )}
                    </Box>
                  )}

                  {bottomTab === 2 && (
                    <Box
                      ref={
                        scheduleContainerRef
                      }
                      sx={{
                        backgroundColor:
                          "#f5f5f5",
                        color: "black",
                        borderColor:
                          "gray",
                        fontFamily:
                          "monospace",
                        fontSize:
                          "0.80rem",
                        p: 2,
                        borderRadius: 1,
                        maxHeight:
                          "100%",
                        height:
                          "100%",
                        overflowY:
                          "auto",
                        whiteSpace:
                          "pre",
                      }}
                    >
                      {scheduleLogs ? (
                        scheduleLogs
                          .split("\n")
                          .map(
                            (
                              line,
                              idx
                            ) => (
                              <div
                                key={
                                  idx
                                }
                                style={{
                                  display:
                                    "flex",
                                }}
                              >
                                <span
                                  style={{
                                    color:
                                      "red",
                                    userSelect:
                                      "none",
                                    marginRight: 8,
                                  }}
                                >
                                  {String(
                                    idx +
                                      1
                                  ).padStart(
                                    5,
                                    "0"
                                  )}
                                  :
                                </span>
                                <span>
                                  {parseAnsi(
                                    line
                                  )}
                                </span>
                              </div>
                            )
                          )
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            opacity: 0.7,
                          }}
                        >
                          No schedule
                          logs.
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </div>

      {/* FOOTER */}
      <div className="form-footer">
        <Button
          variant="outlined"
          startIcon={<CloseIcon />}
          onClick={requestClose}
          sx={{ textTransform: "none" }}
        >
          Close
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={
            execLoading ||
            protocolDetails.status ===
              "running" ||
            protocolDetails.status ===
              "scheduled"
          }
          sx={{ textTransform: "none" }}
        >
          Save
        </Button>
        <Button
          variant="contained"
          startIcon={
            execLoading ? (
              <CircularProgress
                size={16}
                color="inherit"
              />
            ) : (
              <ExecuteIcon />
            )
          }
          color="success"
          onClick={handleExecute}
          disabled={
            execLoading ||
            protocolDetails.status ===
              "running" ||
            protocolDetails.status ===
              "scheduled"
          }
          sx={{ textTransform: "none" }}
        >
          {execLoading
            ? "Executing..."
            : "Execute"}
        </Button>
      </div>

      {/* PathParam RemoteFileDialog */}
      {pathDialog.open &&
        pathDialog.paramKey &&
        projectId &&
        protocolId && (
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
              svc.resolveProtocolStartPath(
                projectId,
                String(protocolId)
              )
            }
            listRemoteDirectory={(p) =>
              svc.listRemoteDirectory(
                projectId,
                String(protocolId),
                p
              )
            }
            previewRemoteText={(p) =>
              svc.previewProtocolText(
                projectId,
                String(protocolId),
                p
              )
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
              const paramKey =
                pathDialog.paramKey;
              if (paramKey) {
                setProtocolDetails(
                  (prev: any) => {
                    if (
                      !prev?.params?.[
                        paramKey
                      ]
                    ) {
                      return prev;
                    }
                    return {
                      ...prev,
                      params: {
                        ...prev.params,
                        [paramKey]: {
                          ...prev
                            .params[
                            paramKey
                          ],
                          editableValue:
                            relativePath,
                          _objValue:
                            relativePath,
                        },
                      },
                    };
                  }
                );
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

      {showValidationDialog && (
        <Dialog
          open={showValidationDialog}
          onClose={() =>
            setShowValidationDialog(false)
          }
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
              boxShadow:
                "0px 10px 25px rgba(0, 0, 0, 0.25)",
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
              fontSize:
                "1.1rem",
              borderBottom:
                "1px solid ",
              pb: 1,
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor:
                  "#f8d7da",
                color: "#d32f2f",
                display: "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                fontWeight:
                  "bold",
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
              overflowY:
                "auto",
              backgroundColor:
                "#fff8f8",
              borderTop:
                "1px solid #f0f0f0",
              borderBottom:
                "1px solid #f0f0f0",
              p: 2.5,
            }}
          >
            {validationErrors.length >
            0 ? (
              <Box
                component="ul"
                sx={{
                  listStyle:
                    "none",
                  pl: 0,
                  m: 0,
                  color:
                    "#b00020",
                  fontSize:
                    "0.9rem",
                }}
              >
                {validationErrors.map(
                  (err, i) => {
                    const parts =
                      err.split(
                        /(\*\*[^*]+\*\*)/g
                      );
                    return (
                      <Box
                        key={i}
                        component="li"
                        sx={{
                          display:
                            "flex",
                          alignItems:
                            "flex-start",
                          mb: 1.2,
                        }}
                      >
                        <Box
                          component="span"
                          sx={{
                            color:
                              "#d32f2f",
                            fontWeight:
                              "bold",
                            mr: 1.2,
                            fontSize:
                              "1rem",
                            lineHeight:
                              "1rem",
                          }}
                        >
                          •
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{
                            color:
                              "#333",
                            lineHeight:
                              1.5,
                            fontSize:
                              "0.9rem",
                          }}
                        >
                          {parts.map(
                            (
                              p,
                              j
                            ) =>
                              p.startsWith(
                                "**"
                              ) &&
                              p.endsWith(
                                "**"
                              ) ? (
                                <strong
                                  key={
                                    j
                                  }
                                >
                                  {p.slice(
                                    2,
                                    -2
                                  )}
                                </strong>
                              ) : (
                                p
                              )
                          )}
                        </Typography>
                      </Box>
                    );
                  }
                )}
              </Box>
            ) : (
              <Typography
                variant="body2"
                sx={{
                  color: "#555",
                }}
              >
                No validation
                details
                provided.
              </Typography>
            )}
          </DialogContent>

          <DialogActions
            sx={{
              p: 2,
              justifyContent:
                "flex-end",
              backgroundColor:
                "#fafafa",
              borderTop:
                "1px solid #eee",
            }}
          >
            <Button
              onClick={() =>
                setShowValidationDialog(
                  false
                )
              }
              variant="contained"
              color="error"
              sx={{
                textTransform:
                  "none",
                px: 3,
                borderRadius: 2,
                fontWeight:
                  "bold",
                boxShadow:
                  "none",
                "&:hover": {
                  backgroundColor:
                    "#c62828",
                },
              }}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}
