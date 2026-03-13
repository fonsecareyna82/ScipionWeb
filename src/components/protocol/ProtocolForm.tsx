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
  HelpIcon,
} from "../../icons";
import WrapWithDrop from "./WrapWithDrop";
import MultiParamRow from "./MultiParamRow";
import ParamRow from "./ParamRow";
import OutputSelectorDialog from "./outputSelectorDialog";
import { useProjectService } from "@/ProjectServiceContext";
import RemoteFileDialog from "@/components/files/RemoteFileDialog";
import ExecuteModeButton from "./ExecuteModeButton";
import renderRichHelpText from "./help-text";
import { useProtocolLogs } from "@/hooks/useProtocolLogs";
import ProtocolLogsPanel from "./ProtocolLogsPanel";
import ProtocolOutputsPanel from "./ProtocolOutputsPanel";
import ProtocolMetadataPanel from "./ProtocolMetadataPanel";
import ProtocolHelpDialog from "./ProtocolHelpDialog";


type ProtocolFormProps = {
  data: any;
  projectProtocols: any;
  onClose: () => void;
  onExecuted?: () => void;
  /** Presentation variant: "drawer" (default) slides in from the right; "docked" fills its parent panel. */
  variant?: "drawer" | "docked";
};

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

function coerceCollapsedFlag(raw: any): boolean {
  // coerceCollapsedFlag
  return coerceReadOnlyFlag(raw);
}


function getParamNameFromStateKey(stateKey: string): string {
  // getParamNameFromStateKey
  const firstUnderscore = stateKey.indexOf("_");
  return firstUnderscore >= 0 ? stateKey.slice(firstUnderscore + 1) : stateKey;
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

  const formHelpText = useMemo(() => {
    // formHelpText
    const raw = (form as any)?.help ?? (form as any)?.helpText ?? "";
    return typeof raw === "string" ? raw : "";
  }, [form]);

  const hasFormHelp = isNonEmptyString(formHelpText);
  const [openFormHelp, setOpenFormHelp] = useState(false);

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

  //Logs
  const {
    sortedLogChannels,
    activeLogChannelId,
    setActiveLogChannelId,
    activeLogText,
    logsError,
    logsContainerRef,
    updateStickToBottom,
  } = useProtocolLogs({
    svc,
    enabled: topTab === 2,
    projectId,
    protocolId,
    protocolStatus: protocolDetails.status,
  });

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
  // Tracks last committed label for inputType to detect user changes
  const prevSelectedInputTypeRef = useRef<string | null>(null);

  // --------------------------------------------
  // Metadata tab snapshot
  // --------------------------------------------
  const [metadataSnapshot, setMetadataSnapshot] = useState<any>(data);

  const [pathDialog, setPathDialog] = useState<{
    open: boolean;
    stateKey: string | null;
    title: string | null;
  }>({
    open: false,
    stateKey: null,
    title: null,
  });

  const [groupHelpDialog, setGroupHelpDialog] = useState<{
    open: boolean;
    text: string;
  }>({
    open: false,
    text: "",
  });


  const headerActionBtnSx = {
    // headerActionBtnSx
    color: "#e5e7eb",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    "&:hover": {
      background: "rgba(255,255,255,0.12)",
      borderColor: "rgba(255,255,255,0.28)",
    },
  };

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
    if (getParamClass(state) === "EnumParam" && state.choices) {
      const choicesRaw = state.choices;

      // arrayChoicesReturnIndexForLegacyConditions
      if (Array.isArray(choicesRaw)) {
        const v = state.editableValue ?? state.default ?? "";
        if (typeof v === "number") return v;

        if (typeof v === "string" && /^\d+$/.test(v.trim())) {
          return Number(v.trim());
        }

        const idx = choicesRaw.indexOf(v);
        return idx >= 0 ? idx : 0;
      }

      // dictChoicesReturnKey
      if (choicesRaw && typeof choicesRaw === "object") {
        const options = normalizeEnumOptions(choicesRaw);
        const v = state.editableValue ?? state.default ?? "";

        if (typeof v === "number" && Number.isFinite(v)) {
          return options[v]?.value ?? options[0]?.value ?? "";
        }

        if (typeof v === "string") {
          const trimmed = v.trim();

          // ifKeyExistsReturnKey
          if (Object.prototype.hasOwnProperty.call(choicesRaw, trimmed)) return trimmed;

          // ifValueProvidedReturnMatchingKey
          const byLabel = options.find((o) => o.label === trimmed);
          if (byLabel) return byLabel.value;

          // numericStringAsIndex
          if (/^\d+$/.test(trimmed)) {
            const idx = Number(trimmed);
            return options[idx]?.value ?? options[0]?.value ?? "";
          }

          return options[0]?.value ?? "";
        }

        return options[0]?.value ?? "";
      }
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

  type EnumOption = { value: string; label: string };

  function normalizeEnumOptions(choicesRaw: any): EnumOption[] {
    // normalizeEnumOptions
    if (Array.isArray(choicesRaw)) {
      return choicesRaw.map((c) => {
        const s = String(c ?? "");
        return { value: s, label: s };
      });
    }

    if (choicesRaw && typeof choicesRaw === "object") {
      return Object.entries(choicesRaw as Record<string, any>).map(([k, v]) => ({
        value: String(k ?? ""),
        label: String(v ?? ""),
      }));
    }

    return [];
  }

  function normalizeEnumSelection(raw: any, choicesRaw: any, fallbackRaw: any): string {
    // normalizeEnumSelection
    const options = normalizeEnumOptions(choicesRaw);
    if (options.length === 0) return String(parseFromJSONValue(raw) ?? fallbackRaw ?? "");

    const pickByIndex = (idx: number) => options[idx]?.value ?? options[0].value;

    const resolveString = (s: string): string => {
      const trimmed = s.trim();
      if (!trimmed) return options[0].value;

      // directMatchOnValue
      if (options.some((o) => o.value === trimmed)) return trimmed;

      // matchOnLabelToReturnValue
      const byLabel = options.find((o) => o.label === trimmed);
      if (byLabel) return byLabel.value;

      // numericStringAsIndex
      if (/^\d+$/.test(trimmed)) return pickByIndex(Number(trimmed));

      return options[0].value;
    };

    const v = parseFromJSONValue(raw);

    if (typeof v === "number" && Number.isFinite(v)) return pickByIndex(v);
    if (typeof v === "string") return resolveString(v);

    // fallbackHandling
    const fb = parseFromJSONValue(fallbackRaw);
    if (typeof fb === "number" && Number.isFinite(fb)) return pickByIndex(fb);
    if (typeof fb === "string") return resolveString(fb);

    return options[0].value;
  }


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
          ? tryParseJsonArray(parsed) ?? []
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

      if (cls === "EnumParam" && def.choices) {
        const selected = normalizeEnumSelection(rawFromApi, def.choices, def.default);
        params[key] = {
          ...defResolved,
          editableValue: selected,
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

    const isParamMeta = (s: string) => /pointerparam$/i.test(s) || /multipointerparam$/i.test(s);
    const filtered = flat.filter((s) => !isParamMeta(s));

    if (filtered.length === 0) return null;
    return filtered.length === 1 ? filtered[0] : filtered;
  };

  // Collect outputs from all protocols (for the input selector)
  const gatherAllOutputs = useCallback((): { outputs: any[]; dependencyMap: Record<string, string[]> } => {
    if (!projectProtocols) return { outputs: [], dependencyMap: {} };

    const protocolsArray = Array.isArray(projectProtocols) ? projectProtocols : Object.values(projectProtocols);

    const outputs: any[] = [];
    const dependencyMap: Record<string, string[]> = {};

    for (const prot of protocolsArray) {
      const pid = String(prot.id);
      dependencyMap[pid] = (prot.children ?? []).map(String);
      if (!Array.isArray(prot.outputs)) continue;

      for (const outRaw of prot.outputs) {
        const hasOutputName = outRaw && typeof outRaw === "object" && "outputName" in outRaw;
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

  // Serialize protocol parameters before save/execute

  const getSerializedParams = useCallback(() => {
    // getSerializedParams
    const out: any = {};

    Object.entries(protocolDetails.params || {}).forEach(([k, pRaw]: any) => {
      const newKey = getParamNameFromStateKey(k);

      const p = pRaw ?? {};
      const cls = resolveParamClass(p);

      if (cls === "PointerParam") {
        const editable = p.editableValue ?? "";
        let normalized = "";

        const token = (p.value ?? "").toString().trim();
        if (token) normalized = token;
        else if (editable) normalized = String(editable);
        else normalized = "";

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
        const boolVal = coerceBooleanValue(p.editableValue ?? p.value ?? p.value ?? p.default);
        out[newKey] = boolVal ? true : false;
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
  }, [protocolDetails.params]);

  useEffect(() => {
    // syncMetadataSnapshot
    const liveValues = getSerializedParams();

    setMetadataSnapshot(() => {
      if (!data || typeof data !== "object") return data;

      // shallowCopyBase
      const snapshot: any = Array.isArray(data) ? [...data] : { ...(data as any) };

      // patchValuesInMostLikelyPlace
      if ("values" in snapshot) {
        snapshot.values = liveValues;
        return snapshot;
      }

      if (snapshot.form && typeof snapshot.form === "object") {
        snapshot.form = { ...snapshot.form, values: liveValues };
        return snapshot;
      }

      // fallbackExposeValuesAnyway
      snapshot.values = liveValues;
      return snapshot;
    });
  }, [data, getSerializedParams]);


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
        err?.message || (typeof payload?.detail === "string" ? payload.detail : null) || "Save failed";

      toast.error(String(fallbackMsg));
      openExecErrorDialog("Save error", String(fallbackMsg));
    } finally {
      setActionLoading(null);
    }
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
                <Box
                  sx={{
                    width: "100%",
                    maxWidth: fieldWidth,
                    minWidth: 0,
                  }}
                >
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
        const label = current["label"] ?? def.label ?? name ?? "";

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
                <Box
                  sx={{
                    width: "100%",
                    maxWidth: fieldWidth,
                    minWidth: 0,
                  }}
                >
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
      if (defClass === "EnumParam" && def.choices) {
        if (!stateKey) return null;

        const options = normalizeEnumOptions(def.choices);
        if (options.length === 0) return null;

        const safeSel = normalizeEnumSelection(value ?? def.default ?? "", def.choices, def.default);

        const onChange = (v: any) =>
          setProtocolDetails((prev: any) => ({
            ...prev,
            params: { ...prev.params, [stateKey]: { ...prev.params[stateKey], editableValue: v } },
          }));

        const controlBase =
          def.display === 0 ? (
            <RadioGroup row value={safeSel} onChange={(e) => onChange(e.target.value)}>
              {options.map((opt, i) => (
                <FormControlLabel
                  key={i}
                  value={opt.value}
                  control={<Radio size="small" />}
                  label={opt.label}
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
                width: isInline ? fieldWidth : "69%",
                minWidth: 0,
                "& .MuiInputBase-input": { fontSize: 12 },
                "& .MuiSelect-select": { fontSize: 12, display: "flex", alignItems: "center" },
              }}
            >
              {options.map((opt, i) => (
                <MenuItem key={i} value={opt.value} sx={{ fontSize: 12 }}>
                  {opt.label}
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
      // Group (decorator, name optional)
      if (defClass === "Group") {
        const groupKey = `${stableKey}|group`;

        const collapsedByDefault = coerceCollapsedFlag(def?.collapsed);
        const expanded = expandedGroups[groupKey] ?? !collapsedByDefault;

        const toggleExpand = () => setExpandedGroups((prev) => ({ ...prev, [groupKey]: !expanded }));

        const groupLabel = String(def?.label || name || "Group").trim();
        const groupParams = Array.isArray(def?.params) ? def.params : [];

        const groupHelpText = typeof def?.help === "string" ? def.help : "";
        const hasGroupHelp = isNonEmptyString(groupHelpText);

        const handleOpenGroupHelp = (e: React.MouseEvent) => {
          // handleOpenGroupHelp
          e.preventDefault();
          e.stopPropagation();
          setGroupHelpDialog({ open: true, text: groupHelpText });
        };

        return (
          <Box
            key={stableKey}
            sx={{
              mb: 2,
              border: "1px dashed #ccc",
              borderRadius: 1,
              p: 1,
              backgroundColor: (theme) => (theme.palette.mode === "dark" ? "#2c2c2c" : "#f9fafb"),
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                mb: 1,

                // headerBackground
                px: 1,
                py: 0.75,
                borderRadius: 1,
                backgroundColor: (theme) =>
                  theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "#e2e2e4",
                border: "1px solid",
                borderColor: (theme) =>
                  theme.palette.mode === "dark" ? "rgba(255,255,255,0.10)" : "#e2e2e4",

                "&:hover": {
                  backgroundColor: (theme) =>
                    theme.palette.mode === "dark" ? "rgba(255,255,255,0.10)" : "#e2e2e4",
                },
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

              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                {hasGroupHelp && (
                  <Tooltip title="Help">
                    <IconButton size="small" onClick={handleOpenGroupHelp}>
                      <HelpIcon fontSize="large" />
                    </IconButton>
                  </Tooltip>
                )}

                <IconButton size="small">
                  {expanded ? <ChevronUpIcon fontSize="small" /> : <ChevronDownIcon fontSize="small" />}
                </IconButton>
              </Box>
            </Box>

            {expanded && (
              <>
                {groupParams.length === 0 ? (
                  <Typography variant="caption" sx={{ opacity: 0.7, pl: 1 }}>
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
          value !== undefined ? value : protocolDetails.params?.[stateKey]?.value ?? def.value ?? def.default
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
      projectId,
      protocolId,
    ]
  );

  // Filter outputs for a given paramKey, excluding self and descendants
  const getFilteredOutputsForKey = (paramKey: string) => {
    const liveParam = protocolDetails.params?.[paramKey];
    const expected = getExpectedClass(liveParam);

    const { outputs, dependencyMap } = gatherAllOutputs();
    const currentId = String((form as any)?.protocolId ?? "");

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

    const norm = (s: any) => (typeof s === "string" ? s.replace(/\s+/g, "").toLowerCase() : "");

    if (expected === null) {
      return pool.filter((o) => /^setof/i.test(String(o.pointerClass || "")));
    }

    return pool.filter((o) => {
      const oc = norm(o.pointerClass);
      return Array.isArray(expected) ? expected.some((e) => norm(e) === oc) : norm(expected) === oc;
    });
  };

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

        <Box sx={{ ml: "auto", display: "inline-flex", alignItems: "center", gap: 0.75 }}>
          {hasFormHelp && (
            <Tooltip title="Help">
              <IconButton
                onClick={() => setOpenFormHelp(true)}
                aria-label="Open protocol help"
                size="small"
                sx={headerActionBtnSx}
              >
                <span style={{ fontSize: "1.1rem" }} className="ml-2 mr-2 text-white">?</span>
              </IconButton>
            </Tooltip>
          )}

          <IconButton
            onClick={requestClose}
            aria-label="Close analyze dialog"
            size="small"
            sx={headerActionBtnSx}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </div>

      {/* Protocol form help dialog */}
      {hasFormHelp && (
        <ProtocolHelpDialog
          open={openFormHelp}
          onClose={() => setOpenFormHelp(false)}
          text={formHelpText}
          title="Help"
        />
      )}

      {execError && (
        <Typography color="error" variant="body2" sx={{ px: 2, py: 1 }}>
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


            {/* Logs */}
            {topTab === 2 && (
              <ProtocolLogsPanel
                sortedLogChannels={sortedLogChannels}
                activeLogChannelId={activeLogChannelId}
                setActiveLogChannelId={setActiveLogChannelId}
                activeLogText={activeLogText}
                logsError={logsError}
                logsContainerRef={logsContainerRef}
                updateStickToBottom={updateStickToBottom}
              />
            )}

            {topTab === 1 && (
              <ProtocolOutputsPanel
                projectId={projectId}
                protocolId={protocolId}
                protocolLabel={protocolDetails.label}
                outputsFromApi={outputsFromApi}
              />
            )}

            {/* Metadata */}
            {topTab === 3 && (
              <ProtocolMetadataPanel metadataSnapshot={metadataSnapshot} />
            )}
          </Box>
        </Box>
      </div>


      <ProtocolHelpDialog
        open={groupHelpDialog.open}
        onClose={() => setGroupHelpDialog({ open: false, text: "" })}
        text={groupHelpDialog.text}
        title="Help"
      />


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
          previewRemoteEntry={(p) => svc.previewRemoteEntry(projectId, protocolId, p)}
          buildDownloadUrl={(p, inline) =>
            svc.buildProtocolDownloadUrl(projectId, protocolId, p, !!inline)
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
    </div>
  );
}
