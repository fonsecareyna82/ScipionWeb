// src/pages/settingspage.tsx
import { useTheme as useAppTheme } from "@/context/ThemeContext";
import { useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { useProjectService } from "@/ProjectServiceContext";
import {
  BellRing, Bot, Braces, Cpu, HardDrive, Network, RefreshCw, RotateCcw, Save, ScrollText, Server, ShieldCheck,
  Tag, UserCog, UserRound, UsersRound,
} from "lucide-react";
import PageMeta from "@/components/common/PageMeta";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

import TagsPanel from "@/pages/Settings/TagsPanel";
import EnvironmentPanel, { type EnvironmentRow } from "@/pages/Settings/EnvironmentPanel";
import HostSettingsPanel, {
  type HostSettings,
  defaultHostSettings,
  sanitizeHostSettings,
  buildHostPatch,
} from "@/pages/Settings/HostSettingsPanel";
import {
  DEFAULT_PROJECT_USER_SETTINGS,
  DEFAULT_PROJECT_INSTANCE_SETTINGS,
} from "@/config/settingsDefaults";

import ResourcesPanel from "./ResourcesPanel";
import SignInProvidersCard from "./SignInProvidersCard";
import JobsSettingsPanel from "@/pages/Settings/JobsSettingsPanel";

import type {
  InstanceResources,
  UserSettings,
  UserSettingsPatch,
} from "@/services/ProjectService";

import { getCurrentUser } from "@/api/auth";
import type { UserProfile } from "@/types/user";
import UserManagementPanel from "@/pages/Settings/UserManagementPanel";
import RolesPanel from "@/pages/Settings/RolesPanel";
import GroupsPanel from "@/pages/Settings/GroupsPanel";
import AuditPanel from "@/pages/Settings/AuditPanel";
import UsagePanel from "@/pages/Settings/UsagePanel";
import NotificationsPanel from "@/pages/Settings/NotificationsPanel";
import AssistantPanel from "@/pages/Settings/AssistantPanel";
import UserPreferencesPanel from "@/pages/Settings/UserPreferencesPanel";
import InstancePanel from "@/pages/Settings/InstancePanel";
import { useSettingsStyles } from "@/pages/Settings/useSettingsStyles";
import { usePermissions } from "@/hooks/usePermissions";
import { setDisplayPreferences } from "@/theme/displayPreferences";

/** The saved text size, density and time zone, applied to the whole app. */
function applyDisplayPreferences(settings: UserSettings) {
  setDisplayPreferences({
    fontScale: settings.fontScale,
    density: settings.uiDensity,
    timeZone: settings.timeZone || undefined,
  });
}


type TabKey =
  | "user"
  | "instance"
  | "jobs"
  | "host"
  | "users"
  | "roles"
  | "groups"
  | "audit"
  | "disk"
  | "tags"
  | "notifications"
  | "assistant"
  | "environment";

type InstanceSettings = {
  defaultQueueName: string;
  maxConcurrentRunsPerUser: number;
};


type InstanceSettingsPatch =
  Partial<InstanceSettings>;

type EnvironmentPatch =
  Record<string, string>;

const defaultUserSettings:
  UserSettings = {
  theme: "light",
  uiDensity: "comfortable",
  fontScale: 1.0,
  language: "en",
  // Empty: the time zone of this computer
  timeZone: "",

  workflowViewMode:
    DEFAULT_PROJECT_USER_SETTINGS
      .workflowViewMode,

  graphMiniMapEnabled:
    DEFAULT_PROJECT_USER_SETTINGS
      .graphMiniMapEnabled,

  graphFocusModeEnabled:
    DEFAULT_PROJECT_USER_SETTINGS
      .graphFocusModeEnabled,

  protocolOutputThumbnailsEnabled:
    DEFAULT_PROJECT_USER_SETTINGS
      .protocolOutputThumbnailsEnabled,

  workflowsAutoRefreshSec:
    DEFAULT_PROJECT_USER_SETTINGS
      .workflowsAutoRefreshSec,
};

const defaultInstanceSettings:
  InstanceSettings = {
  ...DEFAULT_PROJECT_INSTANCE_SETTINGS,
};

// Wide enough for every tab in one row (and the wide tables of Users, Audit and Disk usage)
const wrapperMaxWidth = 1640;

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
        name: String(
          item?.name
          ?? item?.key
          ?? item?.variable
          ?? ""
        ).trim(),
        value: String(item?.value ?? ""),
        isOverride: Boolean(item?.isOverride),
        default: item?.default == null ? "" : String(item.default),
        description: item?.description == null ? "" : String(item.description),
      }))
      .filter(
        (item: EnvironmentRow) =>
          item.name.length > 0
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name)
      );
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw)
      .map(([name, value]) => ({
        name: String(name).trim(),
        value:
          value == null
            ? ""
            : String(value),
        isOverride: false,
      }))
      .filter(
        (item: EnvironmentRow) =>
          item.name.length > 0
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name)
      );
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

function normalizeWorkflowViewMode(
  raw: any
): UserSettings["workflowViewMode"] {
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

function sanitizeUserSettings(
  raw: any
): UserSettings {
  // sanitizeUserSettings
  const theme = raw?.theme;
  const uiDensity = raw?.uiDensity;

  return {
    theme:
      theme === "light"
        || theme === "dark"
        || theme === "system"
        ? theme
        : defaultUserSettings.theme,

    uiDensity:
      uiDensity === "compact"
        || uiDensity === "comfortable"
        ? uiDensity
        : defaultUserSettings.uiDensity,

    fontScale: clampNumber(
      raw?.fontScale,
      defaultUserSettings.fontScale,
      0.85,
      1.25,
    ),

    language:
      raw?.language === "es"
        || raw?.language === "en"
        ? raw.language
        : defaultUserSettings.language,

    timeZone:
      typeof raw?.timeZone === "string"
        && raw.timeZone.trim()
        ? raw.timeZone
        : defaultUserSettings.timeZone,

    workflowViewMode:
      normalizeWorkflowViewMode(
        raw?.workflowViewMode
        ?? raw?.viewMode
      ),
    graphMiniMapEnabled:
      typeof raw?.graphMiniMapEnabled === "boolean" ? raw.graphMiniMapEnabled : defaultUserSettings.graphMiniMapEnabled,
    graphFocusModeEnabled:
      typeof raw?.graphFocusModeEnabled === "boolean" ? raw.graphFocusModeEnabled : defaultUserSettings.graphFocusModeEnabled,
    protocolOutputThumbnailsEnabled:
      typeof raw?.protocolOutputThumbnailsEnabled === "boolean"
        ? raw.protocolOutputThumbnailsEnabled
        : defaultUserSettings.protocolOutputThumbnailsEnabled,
    workflowsAutoRefreshSec: clampNumber(raw?.workflowsAutoRefreshSec, defaultUserSettings.workflowsAutoRefreshSec, 0, 300),
  };
}

function sanitizeInstanceSettings(
  raw: any
): InstanceSettings {
  return {
    defaultQueueName:
      typeof raw?.defaultQueueName === "string" &&
        raw.defaultQueueName.trim()
        ? raw.defaultQueueName
        : defaultInstanceSettings.defaultQueueName,

    maxConcurrentRunsPerUser: clampNumber(
      raw?.maxConcurrentRunsPerUser,
      defaultInstanceSettings
        .maxConcurrentRunsPerUser,
      0,
      64,
    ),
  };
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

export default function SettingsPage() {
  const svc = useProjectService() as any;
  const muiTheme = useTheme();
  const { setPreference: setThemePreference } = useAppTheme();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getCurrentUser()
      .then((user) => {
        if (!cancelled) setCurrentUser(user as UserProfile);
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Each tab is shown to whoever may use it (the API refuses the others anyway)
  const { can } = usePermissions();

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
  // /settings?tab=users (e.g. from the bell, for a new account) opens that tab once permissions are known
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  useEffect(() => {
    const allowed: Partial<Record<TabKey, boolean>> = {
      user: true, tags: true, notifications: true, instance: can("settings.manage"), host: can("settings.manage"),
      environment: can("settings.manage"), jobs: can("jobs.manage"), users: can("users.manage"),
      roles: can("roles.manage"), groups: can("groups.manage"), audit: can("audit.view"),
      disk: can("storage.view"), assistant: can("settings.manage"),
    };
    if (requestedTab && allowed[requestedTab as TabKey]) setTab(requestedTab as TabKey);
  }, [requestedTab, can]);

  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);
  const [userBase, setUserBase] = useState<UserSettings | null>(null);
  const [userDraft, setUserDraft] = useState<UserSettings | null>(null);

  const [instanceLoading, setInstanceLoading] = useState(false);
  const [instanceError, setInstanceError] = useState<string | null>(null);
  const [instanceAvailable, setInstanceAvailable] = useState(true);
  const [instanceBase, setInstanceBase] = useState<InstanceSettings | null>(null);
  const [instanceDraft, setInstanceDraft] = useState<InstanceSettings | null>(null);
  const [instanceLoadedOnce, setInstanceLoadedOnce] = useState(false);

  // The server's facts only add to the Machines block: their loading and error are not shown
  const [
    ,
    setInstanceResourcesLoading,
  ] = useState(false);

  const [
    ,
    setInstanceResourcesError,
  ] = useState<string | null>(null);

  const [
    instanceResources,
    setInstanceResources,
  ] = useState<InstanceResources | null>(
    null
  );

  const [
    instanceResourcesLoadedOnce,
    setInstanceResourcesLoadedOnce,
  ] = useState(false);

  const [environmentLoading, setEnvironmentLoading] = useState(false);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [environmentAvailable, setEnvironmentAvailable] = useState(true);
  const [environmentBase, setEnvironmentBase] = useState<EnvironmentRow[]>([]);
  const [environmentDraft, setEnvironmentDraft] = useState<EnvironmentRow[]>([]);
  const [environmentLoadedOnce, setEnvironmentLoadedOnce] = useState(false);



  const [hostLoading, setHostLoading] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [hostAvailable, setHostAvailable] = useState(true);
  const [hostBase, setHostBase] = useState<HostSettings | null>(null);
  const [hostDraft, setHostDraft] = useState<HostSettings | null>(null);
  const [hostLoadedOnce, setHostLoadedOnce] = useState(false);

  const isDarkMode = useMemo(() => {
    // The theme shown now: the one chosen in the form only applies once saved
    const muiDark = muiTheme.palette.mode === "dark";
    return muiDark || darkClassEnabled;
  }, [muiTheme.palette.mode, darkClassEnabled]);

  const { colors, fieldSx, menuPaperSx, cardHeaderSx, cardSx, dividerSx, tabsSx, actionButtonSx,
          saveButtonSx } = useSettingsStyles(isDarkMode);





  const timeZoneOptions = useMemo(() => {
    // timeZoneOptions
    const opts = getTimeZoneOptions();
    const current = userDraft?.timeZone ?? userBase?.timeZone ?? "";
    // The first choice is always "this computer's" (empty)
    const zones = current && !opts.includes(current) ? [current, ...opts] : opts;
    return ["", ...zones];
  }, [userDraft?.timeZone, userBase?.timeZone]);


  const hostPatch = useMemo(() => {
    if (!hostBase || !hostDraft) return null;
    const patch = buildHostPatch(hostBase, hostDraft);
    return Object.keys(patch).length ? patch : null;
  }, [hostBase, hostDraft]);

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

  const handleEnvironmentValueChange = useCallback((name: string, value: string) => {
    setEnvironmentDraft((prev) => prev.map((row) => (row.name === name ? { ...row, value } : row)));
  }, []);

  const handleAddEnvironmentVariable = useCallback((name: string, value: string) => {
    setEnvironmentDraft((prev) => (prev.some((row) => row.name === name)
      ? prev
      : [...prev, { name, value, isOverride: false }].sort((a, b) => a.name.localeCompare(b.name))));
  }, []);

  const loadHostSettings = useCallback(async () => {
    setHostLoading(true);
    setHostError(null);

    try {
      const raw = await svc.fetchHostSettings();
      const data = sanitizeHostSettings(raw ?? defaultHostSettings);
      setHostAvailable(true);
      setHostBase(data);
      setHostDraft(data);
    } catch (e: any) {
      if (isForbidden(e)) {
        setHostAvailable(false);
        setHostBase(null);
        setHostDraft(null);
        setHostLoadedOnce(true);
        return;
      }

      const msg = getErrorMsg(e);
      setHostError(msg);
      toast.error(msg);
    } finally {
      setHostLoading(false);
      setHostLoadedOnce(true);
    }
  }, [svc]);

  useEffect(() => {
    // The Instance tab offers the host's queues as default queue
    if (tab !== "host" && tab !== "instance") return;
    if (hostLoadedOnce) return;
    void loadHostSettings();
  }, [tab, hostLoadedOnce, loadHostSettings]);


  const loadUserSettings = useCallback(async () => {
    // loadUserSettings
    setUserLoading(true);
    setUserError(null);

    try {
      const raw = await svc.fetchUserSettings();
      const data = sanitizeUserSettings(raw);
      setUserBase(data);
      setUserDraft(data);
      applyDisplayPreferences(data);
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

  const loadInstanceResources =
    useCallback(async () => {
      setInstanceResourcesLoading(
        true
      );

      setInstanceResourcesError(
        null
      );

      try {
        const resources =
          await svc.fetchInstanceResources();

        setInstanceResources(
          resources
        );

      } catch (e: any) {
        setInstanceResourcesError(
          getErrorMsg(e)
        );

      } finally {
        setInstanceResourcesLoading(
          false
        );

        setInstanceResourcesLoadedOnce(
          true
        );
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
    if (tab !== "instance") {
      return;
    }

    if (
      instanceResourcesLoadedOnce
    ) {
      return;
    }

    void loadInstanceResources();
  }, [
    tab,
    instanceResourcesLoadedOnce,
    loadInstanceResources,
  ]);

  useEffect(() => {
    // lazyLoadEnvironmentOnFirstOpen
    if (tab !== "environment") return;
    if (environmentLoadedOnce) return;
    void loadEnvironmentVariables();
  }, [tab, environmentLoadedOnce, loadEnvironmentVariables]);


  const handleSaveHost = useCallback(async () => {
    if (!hostAvailable || !hostDraft || !hostBase) return;

    const patch = buildHostPatch(hostBase, hostDraft);
    if (!Object.keys(patch).length) return;

    setHostLoading(true);
    setHostError(null);

    try {
      const savedRaw = await svc.patchHostSettings(patch);
      const saved = sanitizeHostSettings(savedRaw ?? hostDraft);
      setHostBase(saved);
      setHostDraft(saved);
      toast.success("Host settings saved.");
    } catch (e: any) {
      if (isForbidden(e)) {
        setHostAvailable(false);
        toast.error("Forbidden: admin permissions required.");
        return;
      }

      const msg = getErrorMsg(e);
      setHostError(msg);
      toast.error(msg);
    } finally {
      setHostLoading(false);
    }
  }, [svc, hostAvailable, hostBase, hostDraft]);

  const handleResetHost = useCallback(() => {
    if (hostBase) setHostDraft(hostBase);
  }, [hostBase]);

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
      // The saved theme is the one shown (also the header's toggle uses it).
      setThemePreference(saved.theme);
      applyDisplayPreferences(saved);
      toast.success("User settings saved.");
    } catch (e: any) {
      const msg = getErrorMsg(e);
      setUserError(msg);
      toast.error(msg);
    } finally {
      setUserLoading(false);
    }
  }, [setThemePreference, svc, userBase, userDraft]);

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

  const handleResetEnvironmentVariable = useCallback(
    async (
      variableName: string
    ) => {
      // handleResetEnvironmentVariable
      if (
        !environmentAvailable
        || environmentLoading
      ) {
        return;
      }

      const pendingPatch =
        buildEnvironmentPatch(
          environmentBase,
          environmentDraft,
        );

      if (
        Object.keys(
          pendingPatch
        ).length
      ) {
        toast.error(
          "Save or discard pending changes before resetting an override."
        );
        return;
      }

      setEnvironmentLoading(true);
      setEnvironmentError(null);

      try {
        const savedRaw =
          await svc.resetEnvironmentVariable(
            variableName
          );

        const saved =
          normalizeEnvironmentRows(
            savedRaw
          );

        setEnvironmentBase(saved);
        setEnvironmentDraft(saved);

        toast.success(
          `${variableName} override reset.`
        );
      } catch (e: any) {
        if (isForbidden(e)) {
          setEnvironmentAvailable(false);
        }

        const message = getErrorMsg(e);
        setEnvironmentError(message);
        toast.error(message);
      } finally {
        setEnvironmentLoading(false);
      }
    },
    [
      svc,
      environmentAvailable,
      environmentLoading,
      environmentBase,
      environmentDraft,
    ],
  );

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

  const headerRight = useMemo(() => {
    // The panels with their own actions (Save, Reload…) have none up here
    if (tab === "tags" || tab === "jobs" || tab === "users" || tab === "roles" || tab === "groups"
        || tab === "audit" || tab === "disk" || tab === "notifications" || tab === "assistant") return null;

    const isUser = tab === "user";
    const isInstance = tab === "instance";
    const isHost = tab === "host";

    const busy = isUser
      ? userLoading
      : isInstance
        ? instanceLoading
        : isHost
          ? hostLoading
          : environmentLoading;

    const patch = isUser
      ? userPatch
      : isInstance
        ? instancePatch
        : isHost
          ? hostPatch
          : environmentPatch;

    const hasChanges = Boolean(patch);

    const canSave = isUser
      ? Boolean(userDraft)
      : isInstance
        ? instanceAvailable && Boolean(instanceDraft)
        : isHost
          ? hostAvailable && Boolean(hostDraft)
          : environmentAvailable;

    const onReload = isUser
      ? loadUserSettings
      : isInstance
        ? loadInstanceSettings
        : isHost
          ? loadHostSettings
          : loadEnvironmentVariables;

    const onReset = isUser
      ? handleResetUser
      : isInstance
        ? handleResetInstance
        : isHost
          ? handleResetHost
          : handleResetEnvironment;

    const onSave = isUser
      ? handleSaveUser
      : isInstance
        ? handleSaveInstance
        : isHost
          ? handleSaveHost
          : handleSaveEnvironment;

    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
        {hasChanges && (
          <Stack direction="row" spacing={0.75} alignItems="center" role="status" sx={{ pr: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#f59e0b" }} />
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: colors.muted }}>Unsaved changes</Typography>
          </Stack>
        )}

        <Button
          sx={actionButtonSx}
          variant="outlined"
          onClick={onReload}
          disabled={busy}
          size="small"
          startIcon={<RefreshCw size={15} />}
        >
          Reload
        </Button>

        <Button
          sx={actionButtonSx}
          variant="outlined"
          onClick={onReset}
          disabled={busy || !hasChanges}
          size="small"
          startIcon={<RotateCcw size={15} />}
        >
          Reset
        </Button>

        <Button
          sx={saveButtonSx}
          variant="contained"
          onClick={onSave}
          disabled={busy || !canSave || !hasChanges}
          size="small"
          startIcon={<Save size={15} />}
        >
          Save
        </Button>
      </Stack>
    );
  }, [
    tab,
    userLoading,
    instanceLoading,
    hostLoading,
    environmentLoading,
    userPatch,
    instancePatch,
    hostPatch,
    environmentPatch,
    instanceAvailable,
    hostAvailable,
    environmentAvailable,
    userDraft,
    instanceDraft,
    hostDraft,
    loadUserSettings,
    loadInstanceSettings,
    loadHostSettings,
    loadEnvironmentVariables,
    handleResetUser,
    handleResetInstance,
    handleResetHost,
    handleResetEnvironment,
    handleSaveUser,
    handleSaveInstance,
    handleSaveHost,
    handleSaveEnvironment,
    actionButtonSx,
    saveButtonSx,
    colors.muted,
  ]);

  const renderHostContent = () => {
    if (!hostAvailable) {
      return <Alert severity="info">Host settings are restricted to admin users.</Alert>;
    }

    return (
      <HostSettingsPanel
        value={hostDraft}
        onChange={setHostDraft}
        loading={hostLoading}
        error={hostError}
        fieldSx={fieldSx}
        cardSx={cardSx}
        cardHeaderSx={cardHeaderSx}
        dividerSx={dividerSx}
        colors={colors}
      />
    );
  };

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

    return (
      <Stack spacing={1.75}>
        {userError && <Alert severity="error">{userError}</Alert>}
        <UserPreferencesPanel
          value={userDraft}
          onChange={(update) => setUserDraft((prev) => (prev ? update(prev) : prev))}
          timeZoneOptions={timeZoneOptions}
          colors={colors}
          isDarkMode={isDarkMode}
          fieldSx={fieldSx}
          menuPaperSx={menuPaperSx}
        />
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

        <InstancePanel
          value={instanceDraft}
          onChange={(update) => setInstanceDraft((prev) => (prev ? update(prev) : prev))}
          queueNames={hostAvailable && hostLoadedOnce ? (hostBase?.queues ?? []).map((queue) => queue.name)
            .filter(Boolean) : null}
          colors={colors}
          isDarkMode={isDarkMode}
          fieldSx={fieldSx}
          menuPaperSx={menuPaperSx}
        />
        <SignInProvidersCard cardSx={cardSx} cardHeaderSx={cardHeaderSx} fieldSx={fieldSx}
                             actionButtonSx={actionButtonSx} colors={colors} />
        <ResourcesPanel server={instanceResources} />
      </Stack>
    );
  };

  const renderEnvironmentContent = () => {
    if (!environmentAvailable) {
      return <Alert severity="info">Environment variables are restricted to admin users.</Alert>;
    }
    return (
      <EnvironmentPanel
        rows={environmentDraft}
        savedRows={environmentBase}
        loading={environmentLoading}
        error={environmentError}
        onChange={handleEnvironmentValueChange}
        onAdd={handleAddEnvironmentVariable}
        onBackToDefault={(name) => void handleResetEnvironmentVariable(name)}
      />
    );
  };

  return (
    <>
      <PageMeta title="Scipion | Settings" description="Settings page" />
      <PageBreadcrumb pageTitle="Settings" />

      <div
        className="relative flex h-[calc(100dvh-132px)] min-h-0 flex-col overflow-hidden rounded-2xl border p-5 lg:p-6"
        style={{
          maxWidth: wrapperMaxWidth,
          width: "100%",
          background: colors.surface,
          borderColor: colors.border,
          color: colors.text,
        }}
      >
        <Stack spacing={1.75} sx={{ width: "100%", height: "100%", minHeight: 0 }}>
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "transparent",
              borderColor: colors.border,
              color: colors.text,
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
            }}
          >
            <Box sx={{ px: 2, pt: 1.75, pb: 1.25, flexShrink: 0 }}>
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
              sx={{ ...tabsSx, flexShrink: 0 }}
            >
              <Tab value="user" label="User" icon={<UserRound size={16} />} iconPosition="start" />
              {can("settings.manage") && <Tab value="instance" label="Instance" icon={<Server size={16} />} iconPosition="start" />}
              {can("jobs.manage") && <Tab value="jobs" label="Jobs" icon={<Cpu size={16} />} iconPosition="start" />}
              {can("settings.manage") && <Tab value="host" label="Host" icon={<Network size={16} />} iconPosition="start" />}
              {can("users.manage") && <Tab value="users" label="Users" icon={<UserCog size={16} />} iconPosition="start" />}
              {can("roles.manage") && <Tab value="roles" label="Roles" icon={<ShieldCheck size={16} />} iconPosition="start" />}
              {can("groups.manage") && <Tab value="groups" label="Groups" icon={<UsersRound size={16} />} iconPosition="start" />}
              {can("audit.view") && <Tab value="audit" label="Audit" icon={<ScrollText size={16} />} iconPosition="start" />}
              {can("storage.view") && <Tab value="disk" label="Usage" icon={<HardDrive size={16} />} iconPosition="start" />}
              <Tab value="notifications" label="Notifications" icon={<BellRing size={16} />} iconPosition="start" />
              <Tab value="tags" label="Tags" icon={<Tag size={16} />} iconPosition="start" />
              {can("settings.manage") && <Tab value="assistant" label="Assistant" icon={<Bot size={16} />} iconPosition="start" />}
              {can("settings.manage") && <Tab value="environment" label="Environment" icon={<Braces size={16} />} iconPosition="start" />}
            </Tabs>

            <Divider sx={dividerSx} />

            <Box
              className="bg-gray-100 dark:bg-gray-950"
              sx={{
                // Behind the cards, the grey of the projects list
                p: 2,
                minHeight: 0,
                flex: 1,
                overflowY: "auto",
                overscrollBehavior: "contain",
              }}
            >
              {tab === "user"
                ? renderUserContent()
                : tab === "instance"
                  ? renderInstanceContent()
                  : tab === "jobs"
                    ? <JobsSettingsPanel />
                    : tab === "host"
                      ? renderHostContent()
                      : tab === "users"
                        ? (
                          <UserManagementPanel currentUserId={currentUser?.id ?? null} />
                        )
                        : tab === "roles"
                          ? <RolesPanel />
                          : tab === "groups"
                            ? (
                              <GroupsPanel />
                            )
                            : tab === "audit"
                              ? (
                                <AuditPanel />
                              )
                              : tab === "disk"
                                ? (
                                  <UsagePanel />
                                )
                              : tab === "notifications"
                                ? <NotificationsPanel canManage={can("settings.manage")} />
                              : tab === "tags"
                                ? <TagsPanel />
                              : tab === "assistant"
                                ? <AssistantPanel />
                                : renderEnvironmentContent()}

            </Box>

          </Paper>

        </Stack>

      </div>
    </>
  );
}