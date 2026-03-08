// src/pages/settingspage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Collapse,
  Divider,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
  Table as MuiTable,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { useProjectService } from "@/ProjectServiceContext";
import { TreeIcon } from "@/icons";
import { LayoutGrid, Table, Search, Save, RotateCcw, RefreshCw } from "lucide-react";
import PageMeta from "@/components/common/PageMeta";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

import TagManager from "@/components/tags/TagManager";
import type { ProtocolTag } from "@/components/tags/tagTypes";

type TabKey = "user" | "instance" | "tags" | "environment";

type WorkflowViewMode = "treeTb" | "treeLr" | "grid" | "table";

type UserSettings = {
  theme: "light" | "dark";
  uiDensity: "comfortable" | "compact";
  fontScale: number;
  timeZone: string;

  workflowViewMode: WorkflowViewMode;
  graphMiniMapEnabled: boolean;
  graphFocusModeEnabled: boolean;
  workflowsAutoRefreshSec: number;
};

type InstanceSettings = {
  enableCelery: boolean;
  defaultQueueName: string;
  maxConcurrentRunsPerUser: number;
  requireConfirmBeforeExecute: boolean;
  requireConfirmBeforeDelete: boolean;
};

type EnvironmentRow = {
  name: string;
  value: string;
};

type UserSettingsPatch = Partial<UserSettings>;
type InstanceSettingsPatch = Partial<InstanceSettings>;
type EnvironmentPatch = Record<string, string>;

type ProjectOption = {
  id: string;
  name: string;
};

const defaultUserSettings: UserSettings = {
  theme: "light",
  uiDensity: "comfortable",
  fontScale: 1.0,
  timeZone: "Europe/Madrid",

  workflowViewMode: "treeTb",
  graphMiniMapEnabled: true,
  graphFocusModeEnabled: false,
  workflowsAutoRefreshSec: 15,
};

const defaultInstanceSettings: InstanceSettings = {
  enableCelery: false,
  defaultQueueName: "default",
  maxConcurrentRunsPerUser: 2,
  requireConfirmBeforeExecute: true,
  requireConfirmBeforeDelete: true,
};

const wrapperMaxWidth = 980;
const fieldFontSize = 12;

function safeStringify(value: unknown): string {
  // safeStringify
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function clampNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  // clampNumber
  const n = typeof value === "number" ? value : Number(value);
  const v = Number.isFinite(n) ? n : fallback;
  const vMin = typeof min === "number" ? Math.max(v, min) : v;
  return typeof max === "number" ? Math.min(vMin, max) : vMin;
}

function getErrorMsg(e: any): string {
  // getErrorMsg
  const status = e?.status ?? e?.response?.status ?? e?.statusCode;
  const data = e?.data ?? e?.response?.data;

  if (status === 403) return "Forbidden: admin permissions required.";
  if (status === 401) return "Unauthorized: please sign in again.";
  if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;
  if (typeof data?.message === "string" && data.message.trim()) return data.message;
  if (typeof e?.message === "string" && e.message.trim()) return e.message;

  return "Operation failed";
}

function isForbidden(e: any): boolean {
  // isForbidden
  const status = e?.status ?? e?.response?.status ?? e?.statusCode;
  return status === 403;
}

function buildUserPatch(base: UserSettings, next: UserSettings): UserSettingsPatch {
  // buildUserPatch
  const patch: UserSettingsPatch = {};
  (Object.keys(base) as (keyof UserSettings)[]).forEach((k) => {
    if (base[k] !== next[k]) patch[k] = next[k] as any;
  });
  return patch;
}

function buildInstancePatch(base: InstanceSettings, next: InstanceSettings): InstanceSettingsPatch {
  // buildInstancePatch
  const patch: InstanceSettingsPatch = {};
  (Object.keys(base) as (keyof InstanceSettings)[]).forEach((k) => {
    if (base[k] !== next[k]) patch[k] = next[k] as any;
  });
  return patch;
}

function normalizeEnvironmentRows(raw: any): EnvironmentRow[] {
  // normalizeEnvironmentRows
  if (Array.isArray(raw)) {
    return raw
      .map((item: any) => ({
        name: String(item?.name ?? item?.key ?? item?.variable ?? "").trim(),
        value: String(item?.value ?? ""),
      }))
      .filter((item: EnvironmentRow) => item.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw)
      .map(([name, value]) => ({
        name: String(name).trim(),
        value: value == null ? "" : String(value),
      }))
      .filter((item: EnvironmentRow) => item.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return [];
}

function buildEnvironmentPatch(base: EnvironmentRow[], next: EnvironmentRow[]): EnvironmentPatch {
  // buildEnvironmentPatch
  const baseMap = new Map(base.map((row) => [row.name, row.value]));
  const patch: EnvironmentPatch = {};

  next.forEach((row) => {
    const prev = baseMap.get(row.name);
    if (prev !== row.value) {
      patch[row.name] = row.value;
    }
  });

  return patch;
}

function normalizeWorkflowViewMode(raw: any): WorkflowViewMode {
  // normalizeWorkflowViewMode
  const v = String(raw ?? "").trim();
  if (!v) return defaultUserSettings.workflowViewMode;

  const lowered = v.toLowerCase();
  if (lowered === "treetb" || lowered === "tree_tb" || lowered === "tree-tb" || lowered === "tb") return "treeTb";
  if (lowered === "treelr" || lowered === "tree_lr" || lowered === "tree-lr" || lowered === "lr") return "treeLr";
  if (lowered === "grid") return "grid";
  if (lowered === "table") return "table";

  return defaultUserSettings.workflowViewMode;
}

function sanitizeUserSettings(raw: any): UserSettings {
  // sanitizeUserSettings
  const theme = raw?.theme;
  const uiDensity = raw?.uiDensity;

  return {
    theme: theme === "light" || theme === "dark" ? theme : defaultUserSettings.theme,
    uiDensity: uiDensity === "compact" || uiDensity === "comfortable" ? uiDensity : defaultUserSettings.uiDensity,
    fontScale: clampNumber(raw?.fontScale, defaultUserSettings.fontScale, 0.85, 1.25),
    timeZone: typeof raw?.timeZone === "string" && raw.timeZone.trim() ? raw.timeZone : defaultUserSettings.timeZone,

    workflowViewMode: normalizeWorkflowViewMode(raw?.workflowViewMode ?? raw?.viewMode),
    graphMiniMapEnabled:
      typeof raw?.graphMiniMapEnabled === "boolean" ? raw.graphMiniMapEnabled : defaultUserSettings.graphMiniMapEnabled,
    graphFocusModeEnabled:
      typeof raw?.graphFocusModeEnabled === "boolean" ? raw.graphFocusModeEnabled : defaultUserSettings.graphFocusModeEnabled,
    workflowsAutoRefreshSec: clampNumber(raw?.workflowsAutoRefreshSec, defaultUserSettings.workflowsAutoRefreshSec, 0, 300),
  };
}

function sanitizeInstanceSettings(raw: any): InstanceSettings {
  // sanitizeInstanceSettings
  return {
    enableCelery: typeof raw?.enableCelery === "boolean" ? raw.enableCelery : defaultInstanceSettings.enableCelery,
    defaultQueueName:
      typeof raw?.defaultQueueName === "string" && raw.defaultQueueName.trim()
        ? raw.defaultQueueName
        : defaultInstanceSettings.defaultQueueName,
    maxConcurrentRunsPerUser: clampNumber(raw?.maxConcurrentRunsPerUser, defaultInstanceSettings.maxConcurrentRunsPerUser, 1, 64),
    requireConfirmBeforeExecute:
      typeof raw?.requireConfirmBeforeExecute === "boolean"
        ? raw.requireConfirmBeforeExecute
        : defaultInstanceSettings.requireConfirmBeforeExecute,
    requireConfirmBeforeDelete:
      typeof raw?.requireConfirmBeforeDelete === "boolean"
        ? raw.requireConfirmBeforeDelete
        : defaultInstanceSettings.requireConfirmBeforeDelete,
  };
}

async function copyToClipboard(text: string): Promise<void> {
  // copyToClipboard
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function getTimeZoneOptions(): string[] {
  // getTimeZoneOptions
  const fallback = [
    "UTC",
    "Europe/Madrid",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Rome",
    "Europe/Lisbon",
    "Europe/Amsterdam",
    "Europe/Zurich",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Mexico_City",
    "America/Sao_Paulo",
    "America/Argentina/Buenos_Aires",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Hong_Kong",
    "Asia/Singapore",
    "Asia/Kolkata",
    "Australia/Sydney",
  ];

  try {
    const anyIntl = Intl as any;
    if (typeof anyIntl.supportedValuesOf === "function") {
      const list = anyIntl.supportedValuesOf("timeZone") as string[];
      if (Array.isArray(list) && list.length > 0) {
        return [...new Set(list)].sort((a, b) => a.localeCompare(b));
      }
    }
  } catch {
    // ignoreAndUseFallback
  }

  return fallback;
}

function getViewModeMeta(mode: WorkflowViewMode): { label: string; icon: React.ReactNode } {
  // getViewModeMeta
  switch (mode) {
    case "treeTb":
      return { label: "Tree TB", icon: <TreeIcon className="pp-btnIcon w-4 h-4" /> };

    case "treeLr":
      return {
        label: "Tree LR",
        icon: (
          <span className="inline-flex -rotate-90">
            <TreeIcon className="pp-btnIcon w-4 h-4" />
          </span>
        ),
      };

    case "grid":
      return { label: "Grid", icon: <LayoutGrid className="pp-btnIcon w-4 h-4" /> };

    case "table":
      return { label: "Table", icon: <Table className="pp-btnIcon w-4 h-4" /> };

    default:
      return { label: "Tree TB", icon: <TreeIcon className="pp-btnIcon w-4 h-4" /> };
  }
}

export default function SettingsPage() {
  const svc = useProjectService() as any;
  const muiTheme = useTheme();

  const [darkClassEnabled, setDarkClassEnabled] = useState(false);

  useEffect(() => {
    // syncDarkClassEnabled
    if (typeof document === "undefined") return;

    const readDark = () => document.documentElement.classList.contains("dark");
    setDarkClassEnabled(readDark());

    const observer = new MutationObserver(() => {
      setDarkClassEnabled(readDark());
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  const [tab, setTab] = useState<TabKey>("user");

  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userBase, setUserBase] = useState<UserSettings | null>(null);
  const [userDraft, setUserDraft] = useState<UserSettings | null>(null);

  const [instanceLoading, setInstanceLoading] = useState(false);
  const [instanceError, setInstanceError] = useState<string | null>(null);
  const [instanceAvailable, setInstanceAvailable] = useState(true);
  const [instanceBase, setInstanceBase] = useState<InstanceSettings | null>(null);
  const [instanceDraft, setInstanceDraft] = useState<InstanceSettings | null>(null);
  const [instanceLoadedOnce, setInstanceLoadedOnce] = useState(false);

  const [environmentLoading, setEnvironmentLoading] = useState(false);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [environmentAvailable, setEnvironmentAvailable] = useState(true);
  const [environmentBase, setEnvironmentBase] = useState<EnvironmentRow[]>([]);
  const [environmentDraft, setEnvironmentDraft] = useState<EnvironmentRow[]>([]);
  const [environmentLoadedOnce, setEnvironmentLoadedOnce] = useState(false);
  const [environmentFilter, setEnvironmentFilter] = useState("");

  const [showAdvanced, setShowAdvanced] = useState(false);

  // tagsUiState
  const [tagsDraft, setTagsDraft] = useState<ProtocolTag[]>([]);

  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsLoadedOnce, setProjectsLoadedOnce] = useState(false);

  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);

  const projectAutocompleteValue = useMemo(() => {
    // projectAutocompleteValue
    if (projectOptions.length === 0) return null;

    if (selectedProject && projectOptions.some((p) => String(p.id) === String(selectedProject.id))) {
      return selectedProject;
    }

    return projectOptions[0];
  }, [projectOptions, selectedProject]);

  const projectsRequestInFlightRef = useRef(false);

  const selectedProjectId = useMemo(() => {
    // selectedProjectId
    const raw = String(selectedProject?.id ?? "").trim();
    if (!raw) return null;

    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) return asNumber;

    return raw;
  }, [selectedProject?.id]);

  const loadProjectsForTagsTab = useCallback(async () => {
    // loadProjectsForTagsTab
    if (projectsRequestInFlightRef.current) return;
    projectsRequestInFlightRef.current = true;

    setProjectsLoading(true);
    setProjectsError(null);

    try {
      const data = await svc.fetchList();

      const normalized: ProjectOption[] = Array.isArray(data)
        ? data
          .map((p: any) => ({
            id: String(p?.id ?? p?.projectId ?? p?.name ?? "").trim(),
            name: String(p?.name ?? p?.title ?? p?.id ?? p?.projectId ?? "").trim(),
          }))
          .filter((p: ProjectOption) => p.id.length > 0 && p.name.length > 0)
        : [];

      setProjectOptions(normalized);
      setProjectsLoadedOnce(true);

      setSelectedProject((prev) => {
        // computeNextSelectedProject
        if (normalized.length === 0) return null;

        if (prev && normalized.some((x) => String(x.id) === String(prev.id))) {
          return prev;
        }

        return normalized[0];
      });
    } catch (e: any) {
      const msg = getErrorMsg(e);
      setProjectsError(msg);
      setProjectOptions([]);
      setSelectedProject(null);

      // allowRetryOnTabSwitch
      setProjectsLoadedOnce(false);
    } finally {
      setProjectsLoading(false);
      projectsRequestInFlightRef.current = false;
    }
  }, [svc]);

  useEffect(() => {
    // lazyLoadProjectsOnTagsTabOpen
    if (tab !== "tags") return;
    if (projectsLoadedOnce) return;
    void loadProjectsForTagsTab();
  }, [tab, projectsLoadedOnce, loadProjectsForTagsTab]);

  const isDarkMode = useMemo(() => {
    // isDarkMode
    const muiDark = muiTheme.palette.mode === "dark";
    return muiDark || darkClassEnabled || userDraft?.theme === "dark";
  }, [muiTheme.palette.mode, darkClassEnabled, userDraft?.theme]);

  const colors = useMemo(() => {
    // colors
    const border = isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.12)";
    const text = isDarkMode ? "rgba(255,255,255,0.92)" : "rgba(17,24,39,0.92)";
    const muted = isDarkMode ? "rgba(255,255,255,0.62)" : "rgba(17,24,39,0.62)";
    const surface = isDarkMode ? "rgba(255,255,255,0.03)" : "#ffffff";
    const card = isDarkMode ? "rgba(255,255,255,0.02)" : "#ffffff";
    const hover = isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.04)";
    const menu = isDarkMode ? "#0b1220" : "#ffffff";
    const primary = muiTheme.palette.primary.main;

    return {
      border,
      text,
      muted,
      surface,
      card,
      hover,
      menu,
      primary,
      primaryContrast: muiTheme.palette.getContrastText(primary),
    } as const;
  }, [isDarkMode, muiTheme.palette.primary.main, muiTheme.palette.getContrastText]);

  const fieldSx = useMemo(() => {
    // fieldSx
    return {
      "& .MuiInputLabel-root": { fontSize: fieldFontSize, color: colors.muted },
      "& .MuiInputBase-input": { fontSize: fieldFontSize, color: colors.text },
      "& .MuiFormHelperText-root": { fontSize: fieldFontSize, color: colors.muted },
      "& .MuiInputAdornment-root": { fontSize: fieldFontSize, color: colors.muted },
      "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.border },
      "& .MuiOutlinedInput-root": {
        bgcolor: isDarkMode ? "rgba(255,255,255,0.02)" : "transparent",
        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: isDarkMode ? "rgba(255,255,255,0.22)" : colors.border },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: colors.primary },
      },
      "& .MuiSvgIcon-root": { color: colors.muted },
    } as const;
  }, [colors.border, colors.muted, colors.primary, colors.text, isDarkMode]);

  const selectSx = useMemo(() => {
    // selectSx
    return {
      ...fieldSx,
      "& .MuiSelect-select": { fontSize: fieldFontSize, color: colors.text },
    } as const;
  }, [colors.text, fieldSx]);

  const menuPaperSx = useMemo(() => {
    // menuPaperSx
    return {
      bgcolor: colors.menu,
      color: colors.text,
      border: "1px solid",
      borderColor: colors.border,
      "& .MuiMenuItem-root": { fontSize: fieldFontSize },
    } as const;
  }, [colors.border, colors.menu, colors.text]);

  const autocompletePaperComponent = useCallback(
    (props: any) => {
      // autocompletePaperComponent
      return <Paper {...props} sx={menuPaperSx} />;
    },
    [menuPaperSx],
  );

  const cardHeaderSx = useMemo(() => {
    // cardHeaderSx
    return {
      pb: 0,
      "& .MuiCardHeader-title": { fontSize: 16, fontWeight: 900, lineHeight: 1.2, color: colors.text },
      "& .MuiCardHeader-subheader": { fontSize: 12.5, color: colors.muted, mt: 0.25 },
    } as const;
  }, [colors.muted, colors.text]);

  const cardSx = useMemo(() => {
    // cardSx
    return {
      borderRadius: 2,
      bgcolor: colors.card,
      borderColor: colors.border,
      color: colors.text,
    } as const;
  }, [colors.border, colors.card, colors.text]);

  const dividerSx = useMemo(() => {
    // dividerSx
    return { borderColor: colors.border, opacity: 1 } as const;
  }, [colors.border]);

  const tabsSx = useMemo(() => {
    // tabsSx
    return {
      px: 1,
      bgcolor: "transparent",
      "& .MuiTab-root": {
        minHeight: 44,
        fontSize: 13,
        textTransform: "none",
        fontWeight: 800,
        color: colors.muted,
      },
      "& .MuiTab-root.Mui-selected": {
        color: colors.text,
      },
      "& .MuiTabs-indicator": {
        height: 3,
        borderRadius: 999,
        backgroundColor: colors.primary,
      },
    } as const;
  }, [colors.muted, colors.primary, colors.text]);

  const actionButtonSx = useMemo(() => {
    // actionButtonSx
    const bg = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(17,24,39,0.03)";
    const bgHover = isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
    const inset = isDarkMode ? "0 1px 0 rgba(255,255,255,0.06) inset" : "0 1px 0 rgba(255,255,255,0.7) inset";
    const shadow = isDarkMode ? "0 8px 18px rgba(0,0,0,0.28)" : "0 10px 22px rgba(17,24,39,0.10)";

    return {
      textTransform: "none",
      fontSize: 12,
      color: colors.text,
      borderColor: colors.border,
      borderRadius: 3,
      bgcolor: bg,
      backgroundImage: isDarkMode
        ? "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.00))"
        : "linear-gradient(180deg, rgba(255,255,255,0.80), rgba(255,255,255,0.10))",
      boxShadow: `${inset}, ${shadow}`,
      "&:hover": {
        borderColor: isDarkMode ? "rgba(255,255,255,0.22)" : colors.border,
        bgcolor: bgHover,
        boxShadow: `${inset}, ${isDarkMode ? "0 10px 22px rgba(0,0,0,0.34)" : "0 12px 26px rgba(17,24,39,0.14)"}`,
      },
    } as const;
  }, [colors.border, colors.text, isDarkMode]);

  const saveButtonSx = useMemo(() => {
    // saveButtonSx
    const inset = "0 1px 0 rgba(255,255,255,0.18) inset";
    const shadow = isDarkMode ? "0 12px 26px rgba(0,0,0,0.30)" : "0 12px 26px rgba(17,24,39,0.16)";

    return {
      textTransform: "none",
      fontSize: 12,
      borderRadius: 3,
      bgcolor: colors.primary,
      color: colors.primaryContrast,
      backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.00))",
      boxShadow: `${inset}, ${shadow}`,
      "&:hover": {
        bgcolor: colors.primary,
        filter: "brightness(0.96)",
        boxShadow: `${inset}, ${isDarkMode ? "0 14px 30px rgba(0,0,0,0.36)" : "0 14px 30px rgba(17,24,39,0.20)"}`,
      },
    } as const;
  }, [colors.primary, colors.primaryContrast, isDarkMode]);

  const timeZoneOptions = useMemo(() => {
    // timeZoneOptions
    const opts = getTimeZoneOptions();
    const current = userDraft?.timeZone ?? userBase?.timeZone ?? "";
    if (current && !opts.includes(current)) return [current, ...opts];
    return opts;
  }, [userDraft?.timeZone, userBase?.timeZone]);

  const userPatch = useMemo(() => {
    // userPatch
    if (!userBase || !userDraft) return null;
    const patch = buildUserPatch(userBase, userDraft);
    return Object.keys(patch).length ? patch : null;
  }, [userBase, userDraft]);

  const instancePatch = useMemo(() => {
    // instancePatch
    if (!instanceBase || !instanceDraft) return null;
    const patch = buildInstancePatch(instanceBase, instanceDraft);
    return Object.keys(patch).length ? patch : null;
  }, [instanceBase, instanceDraft]);

  const environmentPatch = useMemo(() => {
    // environmentPatch
    const patch = buildEnvironmentPatch(environmentBase, environmentDraft);
    return Object.keys(patch).length ? patch : null;
  }, [environmentBase, environmentDraft]);

  const filteredEnvironmentRows = useMemo(() => {
    // filteredEnvironmentRows
    const q = environmentFilter.trim().toLowerCase();
    if (!q) return environmentDraft;

    return environmentDraft.filter((row) => {
      const name = row.name.toLowerCase();
      const value = row.value.toLowerCase();
      return name.includes(q) || value.includes(q);
    });
  }, [environmentDraft, environmentFilter]);

  const loadUserSettings = useCallback(async () => {
    // loadUserSettings
    setUserLoading(true);
    setUserError(null);

    try {
      const raw = await svc.fetchUserSettings();
      const data = sanitizeUserSettings(raw);
      setUserBase(data);
      setUserDraft(data);
    } catch (e: any) {
      const msg = getErrorMsg(e);
      setUserError(msg);
      toast.error(msg);
    } finally {
      setUserLoading(false);
    }
  }, [svc]);

  const loadInstanceSettings = useCallback(async () => {
    // loadInstanceSettings
    setInstanceLoading(true);
    setInstanceError(null);

    try {
      const raw = await svc.fetchInstanceSettings();
      const data = sanitizeInstanceSettings(raw);
      setInstanceAvailable(true);
      setInstanceBase(data);
      setInstanceDraft(data);
    } catch (e: any) {
      if (isForbidden(e)) {
        setInstanceAvailable(false);
        setInstanceBase(null);
        setInstanceDraft(null);
        setInstanceLoadedOnce(true);
        return;
      }
      const msg = getErrorMsg(e);
      setInstanceError(msg);
      toast.error(msg);
    } finally {
      setInstanceLoading(false);
      setInstanceLoadedOnce(true);
    }
  }, [svc]);

  const loadEnvironmentVariables = useCallback(async () => {
    // loadEnvironmentVariables
    setEnvironmentLoading(true);
    setEnvironmentError(null);

    try {
      const raw = await svc.fetchEnvironmentVariables();
      const data = normalizeEnvironmentRows(raw);
      setEnvironmentAvailable(true);
      setEnvironmentBase(data);
      setEnvironmentDraft(data);
    } catch (e: any) {
      if (isForbidden(e)) {
        setEnvironmentAvailable(false);
        setEnvironmentBase([]);
        setEnvironmentDraft([]);
        setEnvironmentLoadedOnce(true);
        return;
      }
      const msg = getErrorMsg(e);
      setEnvironmentError(msg);
      toast.error(msg);
    } finally {
      setEnvironmentLoading(false);
      setEnvironmentLoadedOnce(true);
    }
  }, [svc]);

  useEffect(() => {
    // initialLoad
    void loadUserSettings();
  }, [loadUserSettings]);

  useEffect(() => {
    // lazyLoadInstanceOnFirstOpen
    if (tab !== "instance") return;
    if (instanceLoadedOnce) return;
    void loadInstanceSettings();
  }, [tab, instanceLoadedOnce, loadInstanceSettings]);

  useEffect(() => {
    // lazyLoadEnvironmentOnFirstOpen
    if (tab !== "environment") return;
    if (environmentLoadedOnce) return;
    void loadEnvironmentVariables();
  }, [tab, environmentLoadedOnce, loadEnvironmentVariables]);

  const handleSaveUser = useCallback(async () => {
    // handleSaveUser
    if (!userDraft || !userBase) return;

    const patch = buildUserPatch(userBase, userDraft);
    if (!Object.keys(patch).length) return;

    setUserLoading(true);
    setUserError(null);

    try {
      const savedRaw = await svc.patchUserSettings(patch as UserSettingsPatch);
      const saved = sanitizeUserSettings(savedRaw);
      setUserBase(saved);
      setUserDraft(saved);
      toast.success("User settings saved.");
    } catch (e: any) {
      const msg = getErrorMsg(e);
      setUserError(msg);
      toast.error(msg);
    } finally {
      setUserLoading(false);
    }
  }, [svc, userBase, userDraft]);

  const handleSaveInstance = useCallback(async () => {
    // handleSaveInstance
    if (!instanceAvailable || !instanceDraft || !instanceBase) return;

    const patch = buildInstancePatch(instanceBase, instanceDraft);
    if (!Object.keys(patch).length) return;

    setInstanceLoading(true);
    setInstanceError(null);

    try {
      const savedRaw = await svc.patchInstanceSettings(patch as InstanceSettingsPatch);
      const saved = sanitizeInstanceSettings(savedRaw);
      setInstanceBase(saved);
      setInstanceDraft(saved);
      toast.success("Instance settings saved.");
    } catch (e: any) {
      if (isForbidden(e)) {
        setInstanceAvailable(false);
        toast.error("Forbidden: admin permissions required.");
        return;
      }
      const msg = getErrorMsg(e);
      setInstanceError(msg);
      toast.error(msg);
    } finally {
      setInstanceLoading(false);
    }
  }, [svc, instanceAvailable, instanceBase, instanceDraft]);

  const handleSaveEnvironment = useCallback(async () => {
    // handleSaveEnvironment
    if (!environmentAvailable) return;

    const patch = buildEnvironmentPatch(environmentBase, environmentDraft);
    if (!Object.keys(patch).length) return;

    setEnvironmentLoading(true);
    setEnvironmentError(null);

    try {
      const savedRaw = await svc.patchEnvironmentVariables(patch as EnvironmentPatch);
      const saved = normalizeEnvironmentRows(savedRaw);
      setEnvironmentBase(saved);
      setEnvironmentDraft(saved);
      toast.success("Environment variables saved.");
    } catch (e: any) {
      if (isForbidden(e)) {
        setEnvironmentAvailable(false);
        toast.error("Forbidden: admin permissions required.");
        return;
      }
      const msg = getErrorMsg(e);
      setEnvironmentError(msg);
      toast.error(msg);
    } finally {
      setEnvironmentLoading(false);
    }
  }, [svc, environmentAvailable, environmentBase, environmentDraft]);

  const handleResetUser = useCallback(() => {
    // handleResetUser
    if (userBase) setUserDraft(userBase);
  }, [userBase]);

  const handleResetInstance = useCallback(() => {
    // handleResetInstance
    if (instanceBase) setInstanceDraft(instanceBase);
  }, [instanceBase]);

  const handleResetEnvironment = useCallback(() => {
    // handleResetEnvironment
    setEnvironmentDraft(environmentBase);
  }, [environmentBase]);

  const handleCopyAdvanced = useCallback(async () => {
    // handleCopyAdvanced
    try {
      const payload =
        tab === "user"
          ? (userDraft ?? userBase ?? {})
          : tab === "instance"
            ? (instanceDraft ?? instanceBase ?? {})
            : tab === "environment"
              ? (environmentDraft ?? [])
              : (tagsDraft ?? []);
      await copyToClipboard(safeStringify(payload));
      toast.success("Copied.");
    } catch {
      toast.error("Copy failed.");
    }
  }, [tab, userDraft, userBase, instanceDraft, instanceBase, environmentDraft, tagsDraft]);

  const headerRight = useMemo(() => {
    // headerRight
    if (tab === "tags") return null;

    const isUser = tab === "user";
    const isInstance = tab === "instance";
    const isEnvironment = tab === "environment";

    const busy = isUser ? userLoading : isInstance ? instanceLoading : environmentLoading;
    const patch = isUser ? userPatch : isInstance ? instancePatch : environmentPatch;
    const hasChanges = Boolean(patch);

    const canSave = isUser
      ? Boolean(userDraft)
      : isInstance
        ? instanceAvailable && Boolean(instanceDraft)
        : environmentAvailable;

    const onReload = isUser ? loadUserSettings : isInstance ? loadInstanceSettings : loadEnvironmentVariables;
    const onReset = isUser ? handleResetUser : isInstance ? handleResetInstance : handleResetEnvironment;
    const onSave = isUser ? handleSaveUser : isInstance ? handleSaveInstance : handleSaveEnvironment;

    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
        {hasChanges && <Chip size="small" label="Unsaved changes" />}

        <Button
          sx={actionButtonSx}
          variant="outlined"
          onClick={onReload}
          disabled={busy}
          size="small"
          startIcon={<RefreshCw size={16} />}
        >
          Reload
        </Button>

        <Button
          sx={actionButtonSx}
          variant="outlined"
          onClick={onReset}
          disabled={busy || !hasChanges}
          size="small"
          startIcon={<RotateCcw size={16} />}
        >
          Reset
        </Button>

        <Button
          sx={saveButtonSx}
          variant="contained"
          onClick={onSave}
          disabled={busy || !canSave || !hasChanges}
          size="small"
          startIcon={<Save size={16} />}
        >
          Save
        </Button>
      </Stack>
    );
  }, [
    tab,
    userLoading,
    instanceLoading,
    environmentLoading,
    userPatch,
    instancePatch,
    environmentPatch,
    instanceAvailable,
    environmentAvailable,
    userDraft,
    instanceDraft,
    loadUserSettings,
    loadInstanceSettings,
    loadEnvironmentVariables,
    handleResetUser,
    handleResetInstance,
    handleResetEnvironment,
    handleSaveUser,
    handleSaveInstance,
    handleSaveEnvironment,
    actionButtonSx,
    saveButtonSx,
  ]);

  const renderUserContent = () => {
    // renderUserContent
    if (userLoading && !userDraft) {
      return (
        <Stack spacing={1.75}>
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={140} />
          <Skeleton variant="rounded" height={170} />
        </Stack>
      );
    }

    if (!userDraft) {
      return <Alert severity="error">Unable to load user settings. Please try reloading.</Alert>;
    }

    const autoRefreshEnabled = userDraft.workflowsAutoRefreshSec > 0;
    const selectedViewMeta = getViewModeMeta(userDraft.workflowViewMode);

    return (
      <Stack spacing={1.75}>
        {userError && <Alert severity="error">{userError}</Alert>}

        <Card variant="outlined" sx={cardSx}>
          <CardHeader title="Appearance" subheader="Theme, density, and typography scaling." sx={cardHeaderSx} />
          <CardContent sx={{ pt: 2 }}>
            <Grid container spacing={2} sx={{ width: "100%" }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ fontSize: fieldFontSize, color: colors.muted }} id="themeLabel">
                    Theme
                  </InputLabel>
                  <Select
                    sx={selectSx}
                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                    labelId="themeLabel"
                    label="Theme"
                    value={userDraft.theme}
                    onChange={(e) =>
                      setUserDraft((prev) => (prev ? { ...prev, theme: e.target.value as UserSettings["theme"] } : prev))
                    }
                  >
                    <MenuItem sx={{ fontSize: fieldFontSize, color: colors.text }} value="light">
                      Light
                    </MenuItem>
                    <MenuItem sx={{ fontSize: fieldFontSize, color: colors.text }} value="dark">
                      Dark
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ fontSize: fieldFontSize, color: colors.muted }} id="densityLabel">
                    UI density
                  </InputLabel>
                  <Select
                    sx={selectSx}
                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                    labelId="densityLabel"
                    label="UI density"
                    value={userDraft.uiDensity}
                    onChange={(e) =>
                      setUserDraft((prev) =>
                        prev ? { ...prev, uiDensity: e.target.value as UserSettings["uiDensity"] } : prev,
                      )
                    }
                  >
                    <MenuItem sx={{ fontSize: fieldFontSize, color: colors.text }} value="comfortable">
                      Comfortable
                    </MenuItem>
                    <MenuItem sx={{ fontSize: fieldFontSize, color: colors.text }} value="compact">
                      Compact
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  sx={fieldSx}
                  fullWidth
                  size="small"
                  label="Font scale"
                  type="number"
                  value={userDraft.fontScale}
                  inputProps={{ min: 0.85, max: 1.25, step: 0.01 }}
                  onChange={(e) =>
                    setUserDraft((prev) =>
                      prev ? { ...prev, fontScale: clampNumber(e.target.value, 1.0, 0.85, 1.25) } : prev,
                    )
                  }
                  helperText="0.85–1.25"
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={cardSx}>
          <CardHeader title="Time" subheader="Time zone used for formatting and scheduling." sx={cardHeaderSx} />
          <CardContent sx={{ pt: 2 }}>
            <Autocomplete<string, false, boolean, false>
              PaperComponent={autocompletePaperComponent}
              options={timeZoneOptions}
              value={userDraft.timeZone}
              loading={userLoading}
              onChange={(_, next) => {
                // onTimeZoneChange
                if (!next) return;
                setUserDraft((prev) => (prev ? { ...prev, timeZone: String(next) } : prev));
              }}
              renderInput={(params) => {
                // renderTimeZoneInput
                return (
                  <TextField
                    {...params}
                    sx={fieldSx}
                    fullWidth
                    label="Time zone"
                    size="small"
                    helperText="Select the time zone used across the UI."
                  />
                );
              }}
              disableClearable
            />
          </CardContent>
        </Card>

        <Card variant="outlined" sx={cardSx}>
          <CardHeader title="Workflow viewer" subheader="Layout mode, navigation helpers, and refresh behavior." sx={cardHeaderSx} />
          <CardContent sx={{ pt: 2 }}>
            <Grid container spacing={2} sx={{ width: "100%" }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ fontSize: fieldFontSize, color: colors.muted }} id="viewModeLabel">
                    View mode
                  </InputLabel>
                  <Select
                    sx={selectSx}
                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                    labelId="viewModeLabel"
                    label="View mode"
                    value={userDraft.workflowViewMode}
                    renderValue={(v) => {
                      const meta = getViewModeMeta(v as WorkflowViewMode);
                      return (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{ display: "flex", alignItems: "center", opacity: 0.9 }}>{meta.icon}</Box>
                          <Typography sx={{ fontSize: fieldFontSize, color: colors.text }}>{meta.label}</Typography>
                        </Stack>
                      );
                    }}
                    onChange={(e) =>
                      setUserDraft((prev) => (prev ? { ...prev, workflowViewMode: e.target.value as WorkflowViewMode } : prev))
                    }
                  >
                    {(["treeTb", "treeLr", "grid", "table"] as WorkflowViewMode[]).map((m) => {
                      const meta = getViewModeMeta(m);
                      return (
                        <MenuItem key={m} value={m} sx={{ fontSize: fieldFontSize, color: colors.text }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box sx={{ display: "flex", alignItems: "center", opacity: 0.9 }}>{meta.icon}</Box>
                            <Typography sx={{ fontSize: fieldFontSize, color: colors.text }}>{meta.label}</Typography>
                          </Stack>
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>

                <Typography sx={{ mt: 0.75, fontSize: fieldFontSize, color: colors.muted }}>
                  Current: {selectedViewMeta.label}
                </Typography>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(userDraft.graphMiniMapEnabled)}
                      onChange={(e) => setUserDraft((prev) => (prev ? { ...prev, graphMiniMapEnabled: e.target.checked } : prev))}
                      size="small"
                    />
                  }
                  label={<Typography sx={{ fontSize: 13.5, fontWeight: 700, color: colors.text }}>Mini map</Typography>}
                />
                <Typography sx={{ fontSize: fieldFontSize, color: colors.muted }}>
                  Shows an overview mini map in large workflows.
                </Typography>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(userDraft.graphFocusModeEnabled)}
                      onChange={(e) => setUserDraft((prev) => (prev ? { ...prev, graphFocusModeEnabled: e.target.checked } : prev))}
                      size="small"
                    />
                  }
                  label={<Typography sx={{ fontSize: 13.5, fontWeight: 700, color: colors.text }}>Focus mode</Typography>}
                />
                <Typography sx={{ fontSize: fieldFontSize, color: colors.muted }}>
                  De-emphasizes non-selected nodes/edges.
                </Typography>
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Divider sx={{ my: 1, ...dividerSx }} />
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={userDraft.workflowsAutoRefreshSec > 0}
                      onChange={(e) =>
                        setUserDraft((prev) => {
                          if (!prev) return prev;
                          if (!e.target.checked) return { ...prev, workflowsAutoRefreshSec: 0 };
                          const next = prev.workflowsAutoRefreshSec > 0 ? prev.workflowsAutoRefreshSec : 5;
                          return { ...prev, workflowsAutoRefreshSec: clampNumber(next, 5, 1, 300) };
                        })
                      }
                      size="small"
                    />
                  }
                  label={<Typography sx={{ fontSize: 13.5, fontWeight: 700, color: colors.text }}>Auto-refresh</Typography>}
                />
                <Typography sx={{ fontSize: fieldFontSize, color: colors.muted }}>
                  Refreshes workflow view automatically.
                </Typography>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  sx={fieldSx}
                  fullWidth
                  size="small"
                  label="Interval"
                  type="number"
                  value={autoRefreshEnabled ? userDraft.workflowsAutoRefreshSec : 0}
                  disabled={!autoRefreshEnabled}
                  inputProps={{ min: 1, max: 300, step: 1 }}
                  onChange={(e) =>
                    setUserDraft((prev) =>
                      prev ? { ...prev, workflowsAutoRefreshSec: clampNumber(e.target.value, 5, 1, 300) } : prev,
                    )
                  }
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <span style={{ fontSize: fieldFontSize, color: colors.muted }}>sec</span>
                      </InputAdornment>
                    ),
                  }}
                  helperText={!autoRefreshEnabled ? "Disabled" : "1–300 seconds"}
                />
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: colors.hover, border: "1px solid", borderColor: colors.border }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 800, mb: 0.25, color: colors.text }}>Note</Typography>
                  <Typography sx={{ fontSize: fieldFontSize, color: colors.muted }}>
                    Set interval to a small value only if your workflows change frequently.
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Stack>
    );
  };

  const renderInstanceContent = () => {
    // renderInstanceContent
    if (!instanceAvailable) {
      return <Alert severity="info">Instance settings are restricted to admin users.</Alert>;
    }

    if (instanceLoading && !instanceDraft) {
      return (
        <Stack spacing={1.75}>
          <Skeleton variant="rounded" height={140} />
          <Skeleton variant="rounded" height={180} />
        </Stack>
      );
    }

    if (!instanceDraft) {
      return <Alert severity="warning">Instance settings are not available. Please reload or verify permissions.</Alert>;
    }

    return (
      <Stack spacing={1.75}>
        {instanceError && <Alert severity="error">{instanceError}</Alert>}

        <Card variant="outlined" sx={cardSx}>
          <CardHeader title="Execution" subheader="Task execution, queues, and confirmation requirements." sx={cardHeaderSx} />
          <CardContent sx={{ pt: 2 }}>
            <Grid container spacing={2} sx={{ width: "100%" }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(instanceDraft.enableCelery)}
                      onChange={(e) => setInstanceDraft((prev) => (prev ? { ...prev, enableCelery: e.target.checked } : prev))}
                      size="small"
                    />
                  }
                  label={<Typography sx={{ fontSize: 13.5, fontWeight: 700, color: colors.text }}>Enable Celery</Typography>}
                />
                <Typography sx={{ fontSize: fieldFontSize, color: colors.muted }}>
                  If disabled, the backend may run tasks synchronously.
                </Typography>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  sx={fieldSx}
                  fullWidth
                  label="Default queue name"
                  value={instanceDraft.defaultQueueName}
                  onChange={(e) => setInstanceDraft((prev) => (prev ? { ...prev, defaultQueueName: e.target.value } : prev))}
                  helperText='Example: "default"'
                  size="small"
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  sx={fieldSx}
                  fullWidth
                  label="Max concurrent runs per user"
                  type="number"
                  value={instanceDraft.maxConcurrentRunsPerUser}
                  inputProps={{ min: 1, max: 64, step: 1 }}
                  onChange={(e) =>
                    setInstanceDraft((prev) =>
                      prev ? { ...prev, maxConcurrentRunsPerUser: clampNumber(e.target.value, 2, 1, 64) } : prev,
                    )
                  }
                  helperText="1–64"
                  size="small"
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Stack spacing={0.5}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(instanceDraft.requireConfirmBeforeExecute)}
                        onChange={(e) =>
                          setInstanceDraft((prev) => (prev ? { ...prev, requireConfirmBeforeExecute: e.target.checked } : prev))
                        }
                        size="small"
                      />
                    }
                    label={<Typography sx={{ fontSize: 13.5, fontWeight: 700, color: colors.text }}>Confirm before execute</Typography>}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(instanceDraft.requireConfirmBeforeDelete)}
                        onChange={(e) =>
                          setInstanceDraft((prev) => (prev ? { ...prev, requireConfirmBeforeDelete: e.target.checked } : prev))
                        }
                        size="small"
                      />
                    }
                    label={<Typography sx={{ fontSize: 13.5, fontWeight: 700, color: colors.text }}>Confirm before delete</Typography>}
                  />
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Stack>
    );
  };

  const renderTagsContent = () => {
    // renderTagsContent
    const hasProjects = projectOptions.length > 0;

    return (
      <Stack spacing={1.75}>
        <Card variant="outlined" sx={cardSx}>
          <CardHeader title="Tags" subheader="Create and manage protocol tags per project." sx={cardHeaderSx} />
          <CardContent sx={{ pt: 2 }}>
            <Stack spacing={1.25}>
              {projectsError && <Alert severity="error">{projectsError}</Alert>}

              <Autocomplete<ProjectOption, false, boolean, false>
                PaperComponent={autocompletePaperComponent}
                options={projectOptions}
                value={projectAutocompleteValue}
                loading={projectsLoading}
                getOptionLabel={(o) => String((o as any)?.name ?? "")}
                isOptionEqualToValue={(a, b) => String((a as any)?.id) === String((b as any)?.id)}
                onChange={(_, next) => {
                  // onProjectSelectionChange
                  if (!next) return;
                  setSelectedProject(next);
                }}
                renderOption={(props, option) => {
                  // renderProjectOption
                  return (
                    <Box component="li" {...props} sx={{ fontSize: fieldFontSize, color: colors.text }}>
                      {option.name}
                    </Box>
                  );
                }}
                renderInput={(params) => {
                  // renderProjectInput
                  return (
                    <TextField
                      {...params}
                      sx={fieldSx}
                      fullWidth
                      label="Project"
                      size="small"
                      helperText={projectsLoading ? "Loading projects..." : "Select a project to manage its tags."}
                    />
                  );
                }}
                disableClearable={projectOptions.length > 0}
                disabled={projectsLoading || Boolean(projectsError) || projectOptions.length === 0}
              />

              {!projectsLoading && !projectsError && !hasProjects ? (
                <Alert severity="info">No projects found.</Alert>
              ) : !selectedProjectId ? (
                <Alert severity="info">Select a project to manage tags.</Alert>
              ) : (
                <>
                  <TagManager
                    projectId={selectedProjectId as any}
                    title="Tags"
                    tags={tagsDraft}
                    onTagsChange={setTagsDraft}
                  />

                  <Typography sx={{ mt: 0.5, fontSize: 12, color: colors.muted }}>
                    You can switch projects using the selector above.
                  </Typography>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    );
  };

  const renderEnvironmentContent = () => {
    // renderEnvironmentContent
    if (!environmentAvailable) {
      return <Alert severity="info">Environment variables are restricted to admin users.</Alert>;
    }

    if (environmentLoading && environmentDraft.length === 0) {
      return (
        <Stack spacing={1.75}>
          <Skeleton variant="rounded" height={64} />
          <Skeleton variant="rounded" height={340} />
        </Stack>
      );
    }

    return (
      <Stack spacing={1.75}>
        {environmentError && <Alert severity="error">{environmentError}</Alert>}

        <Card variant="outlined" sx={cardSx}>
          <CardHeader
            title="Environment"
            subheader="Inspect and edit backend environment variables exposed by the server."
            sx={cardHeaderSx}
          />
          <CardContent sx={{ pt: 2 }}>
            <Stack spacing={1.5}>
              <Grid container spacing={2} sx={{ width: "100%" }}>
                <Grid size={{ xs: 12, md: 8 }}>
                  <TextField
                    sx={fieldSx}
                    fullWidth
                    size="small"
                    label="Filter"
                    value={environmentFilter}
                    onChange={(e) => setEnvironmentFilter(e.target.value)}
                    placeholder="Filter by variable name or value"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search size={16} />
                        </InputAdornment>
                      ),
                    }}
                    helperText="Use this to quickly find specific variables."
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                  <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: colors.hover, border: "1px solid", borderColor: colors.border }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 800, mb: 0.25, color: colors.text }}>Rows</Typography>
                    <Typography sx={{ fontSize: fieldFontSize, color: colors.muted }}>
                      Showing {filteredEnvironmentRows.length} of {environmentDraft.length} variables.
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              {environmentDraft.length === 0 ? (
                <Alert severity="info">No environment variables returned by the backend.</Alert>
              ) : (
                <TableContainer
                  component={Paper}
                  variant="outlined"
                  sx={{
                    bgcolor: "transparent",
                    borderColor: colors.border,
                    borderRadius: 2,
                    overflow: "auto",
                    maxHeight: { xs: 360, md: 360 },
                  }}
                >
                  <MuiTable size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell
                          sx={{
                            minWidth: 280,
                            bgcolor: colors.surface,
                            color: colors.text,
                            borderColor: colors.border,
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          Variable
                        </TableCell>
                        <TableCell
                          sx={{
                            bgcolor: colors.surface,
                            color: colors.text,
                            borderColor: colors.border,
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          Value
                        </TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {filteredEnvironmentRows.map((row) => {
                        const originalIndex = environmentDraft.findIndex((item) => item.name === row.name);

                        return (
                          <TableRow key={row.name} hover>
                            <TableCell
                              sx={{
                                verticalAlign: "top",
                                borderColor: colors.border,
                                color: colors.text,
                                fontSize: 12,
                                fontWeight: 800,
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                              }}
                            >
                              {row.name}
                            </TableCell>

                            <TableCell sx={{ borderColor: colors.border }}>
                              <TextField
                                sx={fieldSx}
                                fullWidth
                                multiline
                                minRows={1}
                                maxRows={8}
                                size="small"
                                value={row.value}
                                onChange={(e) => {
                                  const nextValue = e.target.value;
                                  setEnvironmentDraft((prev) => {
                                    const next = [...prev];
                                    if (originalIndex >= 0 && originalIndex < next.length) {
                                      next[originalIndex] = { ...next[originalIndex], value: nextValue };
                                    }
                                    return next;
                                  });
                                }}
                                placeholder="Variable value"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </MuiTable>
                </TableContainer>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    );
  };

  const advancedPayload = useMemo(() => {
    // advancedPayload
    if (tab === "user") return userDraft ?? userBase ?? {};
    if (tab === "instance") return instanceDraft ?? instanceBase ?? {};
    if (tab === "environment") return environmentDraft ?? [];
    return tagsDraft ?? [];
  }, [tab, userDraft, userBase, instanceDraft, instanceBase, environmentDraft, tagsDraft]);

  return (
    <>
      <PageMeta title="Scipion | Settings" description="Settings page" />
      <PageBreadcrumb pageTitle="Settings" />

      <div
        className="relative rounded-2xl border p-5 lg:p-6"
        style={{
          maxWidth: wrapperMaxWidth,
          width: "100%",
          background: colors.surface,
          borderColor: colors.border,
          color: colors.text,
        }}
      >
        <Stack spacing={1.75}>
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "transparent",
              borderColor: colors.border,
              color: colors.text,
            }}
          >
            <Box sx={{ px: 2, pt: 1.75, pb: 1.25 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems="flex-start">
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: colors.muted, fontSize: 13 }}>
                    Manage personal preferences and instance-wide configuration.
                  </Typography>
                </Box>
                <Box sx={{ pt: { xs: 0, sm: 0.25 } }}>{headerRight}</Box>
              </Stack>
            </Box>

            <Divider sx={dividerSx} />

            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="scrollable"
              allowScrollButtonsMobile
              scrollButtons="auto"
              sx={tabsSx}
            >
              <Tab value="user" label="User" />
              <Tab value="instance" label="Instance" />
              <Tab value="tags" label="Tags" />
              <Tab value="environment" label="Environment" />
            </Tabs>

            <Divider sx={dividerSx} />

            <Box sx={{ p: 2 }}>
              {tab === "user"
                ? renderUserContent()
                : tab === "instance"
                  ? renderInstanceContent()
                  : tab === "tags"
                    ? renderTagsContent()
                    : renderEnvironmentContent()}

              <Divider sx={{ my: 2, ...dividerSx }} />

              <Stack spacing={1}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", sm: "center" }}
                  justifyContent="space-between"
                >
                  <Typography sx={{ fontWeight: 900, fontSize: 13, color: colors.text }}>
                    Advanced (read-only JSON)
                  </Typography>

                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button sx={actionButtonSx} variant="outlined" onClick={() => setShowAdvanced((v) => !v)} size="small">
                      {showAdvanced ? "Hide" : "Show"}
                    </Button>
                    <Button sx={actionButtonSx} variant="outlined" onClick={handleCopyAdvanced} size="small">
                      Copy
                    </Button>
                  </Stack>
                </Stack>

                <Collapse in={showAdvanced} timeout="auto" unmountOnExit>
                  <TextField
                    value={safeStringify(advancedPayload)}
                    multiline
                    minRows={10}
                    fullWidth
                    size="small"
                    inputProps={{
                      readOnly: true,
                      style: {
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        fontSize: "12px",
                        color: colors.text,
                      },
                    }}
                    sx={fieldSx}
                  />
                  <Typography sx={{ mt: 1, color: colors.muted, fontSize: 12 }}>
                    This view is intended for diagnostics and support. Use the controls above to edit values.
                  </Typography>
                </Collapse>
              </Stack>
            </Box>
          </Paper>
        </Stack>
      </div>
    </>
  );
}