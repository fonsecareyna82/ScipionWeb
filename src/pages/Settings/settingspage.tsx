// src/pages/settingspage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  InputAdornment,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { useProjectService } from "@/ProjectServiceContext";
import { TreeIcon } from "@/icons";
import { LayoutGrid, Table } from "lucide-react";
import PageMeta from "@/components/common/PageMeta";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

import TagManager from "@/components/tags/TagManager";
import type { ProtocolTag } from "@/components/tags/tagTypes";

type TabKey = "user" | "instance" | "tags";

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

type UserSettingsPatch = Partial<UserSettings>;
type InstanceSettingsPatch = Partial<InstanceSettings>;

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
      typeof raw?.graphFocusModeEnabled === "boolean"
        ? raw.graphFocusModeEnabled
        : defaultUserSettings.graphFocusModeEnabled,
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

  const [tags, setTags] = useState<ProtocolTag[]>([]);

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

  const [showAdvanced, setShowAdvanced] = useState(false);

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
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: isDarkMode ? "rgba(255,255,255,0.22)" : colors.border,
        },
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
    return {
      textTransform: "none",
      fontSize: 12,
      color: colors.text,
      borderColor: colors.border,
      "&:hover": {
        borderColor: isDarkMode ? "rgba(255,255,255,0.22)" : colors.border,
        bgcolor: colors.hover,
      },
    } as const;
  }, [colors.border, colors.hover, colors.text, isDarkMode]);

  const saveButtonSx = useMemo(() => {
    // saveButtonSx
    return {
      textTransform: "none",
      fontSize: 12,
      bgcolor: colors.primary,
      color: colors.primaryContrast,
      "&:hover": {
        bgcolor: colors.primary,
        filter: "brightness(0.95)",
      },
    } as const;
  }, [colors.primary, colors.primaryContrast]);

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

  const handleResetUser = useCallback(() => {
    // handleResetUser
    if (userBase) setUserDraft(userBase);
  }, [userBase]);

  const handleResetInstance = useCallback(() => {
    // handleResetInstance
    if (instanceBase) setInstanceDraft(instanceBase);
  }, [instanceBase]);

  const handleCopyAdvanced = useCallback(async () => {
    // handleCopyAdvanced
    try {
      const payload =
        tab === "tags"
          ? tags
          : tab === "user"
            ? (userDraft ?? userBase ?? {})
            : (instanceDraft ?? instanceBase ?? {});
      await copyToClipboard(safeStringify(payload));
      toast.success("Copied.");
    } catch {
      toast.error("Copy failed.");
    }
  }, [tab, tags, userDraft, userBase, instanceDraft, instanceBase]);

  const headerRight = useMemo(() => {
    // headerRight
    if (tab === "tags") return null;

    const isUser = tab === "user";
    const busy = isUser ? userLoading : instanceLoading;
    const patch = isUser ? userPatch : instancePatch;
    const hasChanges = Boolean(patch);
    const canSave = isUser ? Boolean(userDraft) : instanceAvailable && Boolean(instanceDraft);

    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
        {hasChanges && <Chip size="small" label="Unsaved changes" />}
        <Button
          sx={actionButtonSx}
          variant="outlined"
          onClick={isUser ? loadUserSettings : loadInstanceSettings}
          disabled={busy}
          size="small"
        >
          Reload
        </Button>
        <Button
          sx={actionButtonSx}
          variant="outlined"
          onClick={isUser ? handleResetUser : handleResetInstance}
          disabled={busy || !hasChanges}
          size="small"
        >
          Reset
        </Button>
        <Button
          sx={saveButtonSx}
          variant="contained"
          onClick={isUser ? handleSaveUser : handleSaveInstance}
          disabled={busy || !canSave || !hasChanges}
          size="small"
        >
          Save
        </Button>
      </Stack>
    );
  }, [
    tab,
    userLoading,
    instanceLoading,
    userPatch,
    instancePatch,
    instanceAvailable,
    userDraft,
    instanceDraft,
    loadUserSettings,
    loadInstanceSettings,
    handleResetUser,
    handleResetInstance,
    handleSaveUser,
    handleSaveInstance,
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
            <Grid container spacing={2} sx={{ width: "100%" }}>
              <Grid size={{ xs: 12 }}>
                <Autocomplete
                  PaperComponent={autocompletePaperComponent}
                  options={timeZoneOptions}
                  value={userDraft.timeZone || defaultUserSettings.timeZone}
                  onChange={(_, value) =>
                    setUserDraft((prev) => (prev ? { ...prev, timeZone: value || defaultUserSettings.timeZone } : prev))
                  }
                  renderOption={(props, option) => (
                    <Box component="li" {...props} sx={{ fontSize: fieldFontSize, color: colors.text }}>
                      {option}
                    </Box>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={fieldSx}
                      fullWidth
                      label="Time zone"
                      helperText="Type to search (IANA time zones)."
                      size="small"
                    />
                  )}
                  disableClearable
                  autoHighlight
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={cardSx}>
          <CardHeader
            title="Workflow viewer"
            subheader="Layout mode, navigation helpers, and refresh behavior."
            sx={cardHeaderSx}
          />
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
                      setUserDraft((prev) =>
                        prev ? { ...prev, workflowViewMode: e.target.value as WorkflowViewMode } : prev,
                      )
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
                      onChange={(e) =>
                        setUserDraft((prev) => (prev ? { ...prev, graphFocusModeEnabled: e.target.checked } : prev))
                      }
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
                          setInstanceDraft((prev) =>
                            prev ? { ...prev, requireConfirmBeforeExecute: e.target.checked } : prev,
                          )
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
                          setInstanceDraft((prev) =>
                            prev ? { ...prev, requireConfirmBeforeDelete: e.target.checked } : prev,
                          )
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
    return (
      <Stack spacing={1.75}>
        <Card variant="outlined" sx={cardSx}>
          <CardHeader
            title="Tags"
            subheader="Create tags to classify protocols (local only, not persisted yet)."
            sx={cardHeaderSx}
          />
          <CardContent sx={{ pt: 2 }}>
            <TagManager title="Protocol tags" tags={tags} onTagsChange={setTags} />
          </CardContent>
        </Card>
      </Stack>
    );
  };

  const advancedPayload = useMemo(() => {
    // advancedPayload
    if (tab === "tags") return tags;
    return tab === "user" ? (userDraft ?? userBase ?? {}) : (instanceDraft ?? instanceBase ?? {});
  }, [tab, tags, userDraft, userBase, instanceDraft, instanceBase]);

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
            </Tabs>

            <Divider sx={dividerSx} />

            <Box sx={{ p: 2 }}>
              {tab === "user" ? renderUserContent() : tab === "instance" ? renderInstanceContent() : renderTagsContent()}

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
