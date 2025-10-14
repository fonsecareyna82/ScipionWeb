// src/components/ProtocolForm.tsx
import { useState, useEffect, useCallback, JSX, useRef } from "react";
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
import { executeProtocol, saveProtocol } from "../../api/projects";
import WrapWithDrop from "./WrapWithDrop";
import MultiParamRow from "./MultiParamRow";
import ParamRow from "./ParamRow";
import { fetchProtocolLogsStream } from "@/api/protocols";
import OutputSelectorDialog from "./outputSelectorDialog";

type ProtocolFormProps = {
  data: any;
  projectProtocols: any;
  onClose: () => void;
};

export default function ProtocolForm({ data, projectProtocols = [], onClose }: ProtocolFormProps) {
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
  const [, setLogsError] = useState<string | null>(null);
  const offsetRef = useRef<number>(0);
  const errorOffsetRef = useRef<number>(0);
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

  // Call this instead of onClose() directly to play exit animation
  const requestClose = () => setIsClosing(true);
  const handleAnimationEnd = () => {
    if (isClosing) onClose();
  };

  // ---------------- Utilities ----------------

  // Parse JSON envelopes like {"_objValue": "..."} if they appear as strings
  const parseFromJSONValue = (maybeJson: any) => {
    try {
      if (typeof maybeJson === "string") {
        const obj = JSON.parse(maybeJson);
        if (obj && typeof obj === "object" && "_objValue" in obj) {
          return obj._objValue;
        }
      }
    } catch {}
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

  // Simple condition evaluator used to show/hide params
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

  // --------------------------------------------
  // Load initial params and details (no side-effects on inputSets)
  // --------------------------------------------
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

  // --------------------------------------------
  // Live expected-class reader: ignore param meta-classes; dedupe
  // Returns:
  //  - string/string[] when there is a class restriction
  //  - null when there is NO restriction (e.g., All)
  // --------------------------------------------
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

    // Drop parameter meta-classes so they never constrain filtering
    const isParamMeta = (s: string) => /pointerparam$/i.test(s) || /multipointerparam$/i.test(s);
    const filtered = flat.filter((s) => !isParamMeta(s));

    if (filtered.length === 0) return null;
    return filtered.length === 1 ? filtered[0] : filtered;
  };

  // Gather all outputs across project protocols
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

  // --------------------------------------------
  // Sync inputSets constraints ONLY when user changes inputType
  //  - First render: no-op (keeps existing items and constraints)
  //  - Change to specific type: set SetOfType + clear items
  //  - Change to "All": remove constraints + keep items
  // --------------------------------------------
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

    // Commit new selection
    prevSelectedInputTypeRef.current = selectedLabel;

    // Apply constraints according to selection
    const isAll = selectedLabel.trim().toLowerCase() === "all";
    const nextPointerClass = isAll ? null : `SetOf${selectedLabel.replace(/\s+/g, "")}`;

    setProtocolDetails((prevState: any) => {
      const clone = { ...prevState, params: { ...prevState.params } };
      const target = { ...clone.params[inputSetsKey] };

      if (isAll) {
        // Remove ALL class constraints; keep items
        delete target.pointerClass;
        delete target.pointerClassName;
        delete target.accept;
        target.accepts = [];
        delete target.accepted;
        delete target._expectedClass;
        delete target.objectClass;
        delete target.type;
      } else {
        // Set SetOf<Type> on all aliases; clear items
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

  // --------------------------------------------
  // Filter outputs for a given paramKey using LIVE constraints
  //  - Always exclude current protocol and its descendants
  //  - When expected === null (All) => return all SetOf* types
  // --------------------------------------------
  const getFilteredOutputsForKey = (paramKey: string) => {
    const liveParam = protocolDetails.params?.[paramKey];
    const expected = getExpectedClass(liveParam);

    const { outputs, dependencyMap } = gatherAllOutputs();
    const currentId = String(data.id);

    // Build exclusion set (self + descendants)
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

    // Exclude self + descendants
    const pool = outputs.filter((o) => !blocked.has(String(o._protocolId)));

    const norm = (s: any) =>
      typeof s === "string" ? s.replace(/\s+/g, "").toLowerCase() : "";

    // All => allow any SetOf*
    if (expected === null) {
      return pool.filter((o) => /^setof/i.test(String(o._class || "")));
    }

    // Specific class/es
    return pool.filter((o) => {
      const oc = norm(o._class);
      return Array.isArray(expected)
        ? expected.some((e) => norm(e) === oc)
        : norm(expected) === oc;
    });
  };

  // --------------------------------------------
  // Serialize protocol parameters before save/execute
  // --------------------------------------------
  const getSerializedParams = () => {
    const out: any = {};

    Object.entries(protocolDetails.params || {}).forEach(([k, pRaw]: any) => {
      const keyParts = k.split("_");
      keyParts.shift(); // remove section index
      const newKey = keyParts.join("_");

      const p = pRaw ?? {};
      const cls = p._class;

      // POINTER
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

      // MULTI POINTER
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

      // REST (non-pointers)
      out[newKey] = {
        value: p.editableValue,
        _objValue: p._objValue,
        info: p.info,
        _parentId: p._parentId,
      };
    });

    return out;
  };

  // Extract validation messages from a detail string
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

  // --------------------------------------------
  // Execution & Save handlers
  // --------------------------------------------
  const handleExecute = async () => {
    setExecLoading(true);
    setExecError(null);
    setValidationErrors([]);

    try {
      const protocolId = data.id ?? "";
      const serialized = getSerializedParams();
      await executeProtocol(protocolId, data.protocolClassName, serialized);
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

  const handleSave = async () => {
    setExecLoading(true);
    setExecError(null);
    try {
      const protocolId = data.id ?? "";
      const serialized = getSerializedParams();
      await saveProtocol(protocolId, data.protocolClassName, serialized);
      requestClose();
    } catch (err: any) {
      setExecError(err.message || "Error saving the protocol");
    } finally {
      setExecLoading(false);
    }
  };

  // --------------------------------------------
  // renderParam - build UI for each parameter
  // --------------------------------------------
  const renderParam = useCallback(
    (paramObj: any, sectionIdx: number, rowIndex = 0): JSX.Element | null => {
      const [name, def] = Object.entries(paramObj)[0] as [string, any];
      const key = `${sectionIdx}_${name}`;
      const value = protocolDetails.params?.[key]?.editableValue;
      if (def.condition && !evalExpr(sectionIdx, def.condition)) return null;

      // Optional advanced indicator
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

      // ============ MultiPointerParam ============
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
          // Use LIVE expected class from the current param state (not the static def)
          const liveParam = protocolDetails.params?.[key];
          const expected = getExpectedClass(liveParam);
          const norm = (s: any) =>
            typeof s === "string" ? s.replace(/\s+/g, "").toLowerCase() : "";
          const draggedClass = norm(dragged._class);

          const matches =
            expected === null // null => "All" (no filter)
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

        const handlePickFromDialog = (rowIndex: number, picked: any) => {
          setProtocolDetails((prev: any) => {
            const list = Array.isArray(prev.params[key].editableValue)
              ? [...prev.params[key].editableValue]
              : [];

            while (list.length <= rowIndex) list.push({ object: "", info: "" });

            list[rowIndex] = {
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

        // Merge LIVE param state with static schema so picker sees updated pointerClass
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

      // ============ PointerParam ============
      if (def._class === "PointerParam") {
        const onClear = () =>
          setProtocolDetails((prev: any) => ({
            ...prev,
            params: {
              ...prev.params,
              [key]: { ...prev.params[key], editableValue: "", _objValue: "" },
            },
          }));

        const control = (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TextField
              size="small"
              value={value ?? def.default ?? ""}
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
              sx={{ minWidth: 300, "& .MuiInputBase-input": { fontSize: "0.8rem" } }}
            />
          </Box>
        );

        const handleOpenFind = (key: string) => {
          // Read LIVE param state (includes pointerClass updates)
          const liveParam = protocolDetails.params?.[key];
          const expected = getExpectedClass(liveParam);
          setExpectedClass(expected);
          setSelectorTarget({ key, def: liveParam, expectedClass: expected });

          const finalOutputs = getFilteredOutputsForKey(key);
          setAllOutputs(finalOutputs);
          setOpenSelector(true);
        };

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

      // ============ EnumParam ============
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
            <RadioGroup row value={sel} onChange={(e) => onChange(e.target.value)}>
              {def.choices.map((ch: string, i: number) => (
                <FormControlLabel key={i} value={ch} control={<Radio size="small" />} label={ch} />
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

      // ============ Group ============
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

      // ============ BooleanParam ============
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

      // ============ Default TextField ============
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
    [protocolDetails.params, dragOverKey, currentDraggedOutput, expandedGroups]
  );

  if (!data || !protocolDetails.params) return null;

  // --------------------------------------------
  // Global state for OutputSelectorDialog
  // --------------------------------------------
  const handleSelectOutput = (selected: any | any[]) => {
    if (!selectorTarget) return;

    const { key, def } = selectorTarget;
    const picks = Array.isArray(selected) ? selected : [selected];

    setProtocolDetails((prev: any) => {
      const prevParam = prev.params[key];

      // MULTI POINTER
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

      // POINTER
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

  // --------------------------------------------
  // JSX Layout
  // --------------------------------------------
  return (
    <div className={`protocol-form ${isClosing ? "slide-out-right" : "slide-in-right"}`} onAnimationEnd={handleAnimationEnd}>
      {/* HEADER */}
      <div className="form-header">
        <div className="form-title-wrapper">
          <Box className="inline-flex items-center justify-center rounded-full bg-green-500 text-black text-xs font-bold px: 2; py: 1;">
            {data.id}
          </Box>
          <h2>{protocolDetails.label}</h2>
          <span className="node-status-pill" style={{ backgroundColor: protocolDetails.color, color: "black" }}>
            {protocolDetails.status || "Unknown"}
          </span>
        </div>
        <button className="close-btn" onClick={requestClose}>
          ×
        </button>
      </div>

      {execError && (
        <Typography color="error" variant="body2" sx={{ px: 2, py: 1 }}>
          {execError}
        </Typography>
      )}

      {/* BODY */}
      <div className="form-body" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <Box
          sx={{
            flexGrow: 7,
            overflowY: "auto",
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

          <Box className="top-tab-content" sx={{ p: 1 }}>
            {topTab === 0 && (
              <>
                <Tabs
                  value={sectionTab}
                  onChange={(_, val) => setSectionTab(val)}
                  variant="scrollable"
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                  sx={{
                    mb: 2,
                    "& .MuiTab-root": { textTransform: "none", fontSize: "0.8rem", fontWeight: 500 },
                  }}
                >
                  {data.definition.map((section: any, idx: number) => (
                    <Tab key={idx} label={section.name || `Section ${idx + 1}`} />
                  ))}
                </Tabs>
                <Box>
                  {data.definition[sectionTab]?.params?.map((paramObj: any, idx: number) =>
                    renderParam(paramObj, sectionTab, idx)
                  )}
                </Box>
              </>
            )}
            {topTab === 1 && <Typography variant="body1">Outputs content goes here.</Typography>}
            {topTab === 2 && <Typography variant="body1">Summary content goes here.</Typography>}
            {topTab === 3 && <Typography variant="body1">Methods content goes here.</Typography>}
            {topTab === 4 && (
              <Box sx={{ flexGrow: 3, overflowY: "auto" }}>
                <Tabs
                  value={bottomTab}
                  onChange={(_, val) => setBottomTab(val)}
                  sx={{
                    mb: 2,
                    "& .MuiTab-root": { textTransform: "none", fontSize: "0.8rem", fontWeight: 500 },
                  }}
                >
                  {["Output", "Errors", "Schedule"].map((label, index) => (
                    <Tab key={index} label={label} />
                  ))}
                </Tabs>
                <Box className="bottom-tab-content" sx={{ p: 2 }}>
                  {bottomTab === 0 && (
                    <Box
                      ref={containerRef}
                      sx={{
                        backgroundColor: "#f5f5f5",
                        color: "black",
                        fontFamily: "monospace",
                        fontSize: "0.85rem",
                        p: 2,
                        borderRadius: 1,
                        maxHeight: "540px",
                        overflowY: "auto",
                        whiteSpace: "pre",
                      }}
                    >
                      {logs && logs.length > 0 ? (
                        logs.split("\n").map((line, idx) => (
                          <div key={idx} style={{ display: "flex" }}>
                            <span style={{ color: "blue", userSelect: "none", marginRight: 8 }}>
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

                  {bottomTab === 1 && (
                    <Box
                      ref={errorContainerRef}
                      sx={{
                        backgroundColor: "#f5f5f5",
                        fontFamily: "monospace",
                        fontSize: "0.85rem",
                        p: 2,
                        borderRadius: 1,
                        maxHeight: "540px",
                        overflowY: "auto",
                      }}
                    >
                      {errorLogs ? (
                        errorLogs.split("\n").map((line, idx) => (
                          <div key={idx} style={{ display: "flex" }}>
                            <span style={{ color: "red", userSelect: "none", marginRight: 8 }}>
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
                  {bottomTab === 2 && <Typography variant="body1">Schedule log</Typography>}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </div>

      {/* FOOTER */}
      <div className="form-footer">
        <Button variant="outlined" startIcon={<CloseIcon />} onClick={requestClose} sx={{ textTransform: "none" }}>
          Close
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={execLoading || protocolDetails.status === "running"}
          sx={{ textTransform: "none" }}
        >
          Save
        </Button>
        <Button
          variant="contained"
          startIcon={execLoading ? <CircularProgress size={16} color="inherit" /> : <ExecuteIcon />}
          color="success"
          onClick={handleExecute}
          disabled={execLoading || protocolDetails.status === "running"}
          sx={{ textTransform: "none" }}
        >
          {execLoading ? "Executing..." : "Execute"}
        </Button>
      </div>

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
                          p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : p
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
                "&:hover": { backgroundColor: "#c62828" },
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
