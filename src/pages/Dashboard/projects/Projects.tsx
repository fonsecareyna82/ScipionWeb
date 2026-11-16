import { Fragment, useEffect, useState, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageMeta from "@/components/common/PageMeta";
import ProjectCard from "@/components/projects/ProjectsCard";
import ProjectListRow from "@/components/projects/ProjectListRow";
import { ChevronDownIcon } from "@/icons";
import NewProjectModal from "@/components/projects/NewProjectModal";
import { useProjectService } from "@/ProjectServiceContext";
import type { ImportProjectPayload, ProjectService } from "@/services/ProjectService";
import type { Project } from "@/types/project";
import { formatBytes } from "@/components/projects/ProjectOverviewPanel";
import { CloudDownload, Download, LayoutGrid, List, PlusCircle, Search, X } from "lucide-react";
import ShareProjectModal from "@/components/projects/ShareProjectModal";
import toast from "react-hot-toast";
import ImportProjectDialog from "@/components/projects/ImportProjectDialog";
import ProjectPage from "./ProjectPage";
import "./project-workspaces.css";
import ImportWorkflowDialog from "@/components/projects/ImportWorkflowDialog";
import { myStorageQuotas, type StorageQuota } from "@/api/storage";
//import ProjectWorkspaceCompareDialog from "@/components/projects/ProjectWorkspaceCompareDialog";

const WORKSPACE_TABS_STORAGE_KEY = "scipion.projects.workspaceTabs.v1";
const PROJECTS_VIEW_MODE_STORAGE_KEY = "scipion.projects.viewMode.v1";
const LAST_OPENED_PROJECT_STORAGE_KEY = "scipion.home.lastOpenedProjectId.v1";

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

type ProjectsViewMode = "cards" | "list";

type ProjectCardProject = Project & {
  thumbnailUrl?: string | null;
  thumbnailRebuildUrl?: string | null;
  thumbnailItemsUrl?: string | null;
  thumbnailVersion?: string | number | null;
};

type WorkspaceTab =
  | {
    type: "projects";
    id: "projects";
    title: string;
  }
  | {
    type: "project";
    id: string;
    projectName: string;
    title: string;
  };

const projectsWorkspaceTab: WorkspaceTab = {
  type: "projects",
  id: "projects",
  title: "Projects",
};

function normalizeProject(raw: any): ProjectCardProject {
  const p = raw ?? {};
  const createdRaw = p.createdAt ?? p.created_at;
  const updatedRaw = p.updatedAt ?? p.updated_at;

  const isSharedFlag = Boolean(p.isShared);
  const isOwnerFlag =
    p.isOwner !== undefined && p.isOwner !== null ? Boolean(p.isOwner) : !isSharedFlag;

  return {
    id: p.id ?? p.pk ?? p._id ?? p.name ?? "",
    name: p.name ?? p.label ?? p.title ?? "Untitled project",
    shortName:
      p.shortName ??
      p.short_name ??
      p.slug ??
      (p.name ? String(p.name).slice(0, 20) : ""),
    description: p.description ?? p.desc ?? "",
    createdAt: createdRaw ? new Date(createdRaw) : new Date(),
    updatedAt: updatedRaw ? new Date(updatedRaw) : undefined,
    status: p.status ?? "unknown",
    protocolsCount:
      p.protocolsCount ?? p.protocols_count ?? (Array.isArray(p.protocols) ? p.protocols.length : 0),
    diskUsage: p.diskUsage ?? p.disk_usage ?? p.storage ?? undefined,
    diskUsageBytes: typeof p.diskUsageBytes === "number" ? p.diskUsageBytes : null,
    protocols: p.protocols ?? p.protocolsMap ?? undefined,
    isShared: isSharedFlag,
    isOwner: isOwnerFlag,
    permission: p.permission ?? "full",
    accessVia: p.accessVia ?? null,
    projectOwnerId: p.projectOwnerId ?? p.ownerId ?? p.owner_id ?? null,
    thumbnailUrl: p.thumbnailUrl ?? p.thumbnail_url ?? null,
    thumbnailRebuildUrl: p.thumbnailRebuildUrl ?? p.thumbnail_rebuild_url ?? null,
    thumbnailItemsUrl: p.thumbnailItemsUrl ?? p.thumbnail_items_url ?? null,
    thumbnailVersion: p.thumbnailVersion ?? p.thumbnail_version ?? null,
  };
}

function getProjectCardKey(project: ProjectCardProject): string {
  return [
    String(project.id ?? ""),
    String(project.thumbnailVersion ?? ""),
    String(project.thumbnailItemsUrl ?? ""),
    String(project.thumbnailUrl ?? ""),
    String(project.protocolsCount ?? ""),
  ].join("|");
}

function getProjectWorkspaceId(projectName: string | number): string {
  return `project:${String(projectName)}`;
}

function getProjectWorkspacePath(projectName: string | number): string {
  return `/project/load/${encodeURIComponent(String(projectName))}`;
}

function readStoredProjectsViewMode(): ProjectsViewMode {
  if (typeof window === "undefined") return "cards";

  try {
    return window.localStorage.getItem(PROJECTS_VIEW_MODE_STORAGE_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

function readStoredWorkspaceTabs(): WorkspaceTab[] {
  if (typeof window === "undefined") return [projectsWorkspaceTab];

  try {
    const raw = window.sessionStorage.getItem(WORKSPACE_TABS_STORAGE_KEY);
    if (!raw) return [projectsWorkspaceTab];

    const parsed = JSON.parse(raw);
    const projectTabs = Array.isArray(parsed)
      ? parsed
        .filter((tab) => tab?.type === "project" && tab?.projectName)
        .map((tab) => {
          const projectName = String(tab.projectName);
          return {
            type: "project" as const,
            id: getProjectWorkspaceId(projectName),
            projectName,
            title: String(tab.title || projectName),
          };
        })
      : [];

    return [projectsWorkspaceTab, ...projectTabs];
  } catch {
    return [projectsWorkspaceTab];
  }
}

function storeWorkspaceTabs(tabs: WorkspaceTab[]): void {
  if (typeof window === "undefined") return;

  try {
    const projectTabs = tabs.filter((tab): tab is Extract<WorkspaceTab, { type: "project" }> => tab.type === "project");
    window.sessionStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(projectTabs));
  } catch {
    // noOp
  }
}

function findProjectForWorkspaceName(
  projects: ProjectCardProject[],
  projectName: string,
): ProjectCardProject | undefined {
  return projects.find((p) => String(p.id) === projectName || String(p.name) === projectName);
}

function updateWorkspaceTitlesFromProjects(
  tabs: WorkspaceTab[],
  projects: ProjectCardProject[],
): WorkspaceTab[] {
  return tabs.map((tab) => {
    if (tab.type !== "project") return tab;

    const project = findProjectForWorkspaceName(projects, tab.projectName);
    return project ? { ...tab, title: project.name } : tab;
  });
}

interface ProjectsPageProps {
  service?: ProjectService;
  fetchList?: () => Promise<Project[]>;
}

export default function Projects({ service, fetchList }: ProjectsPageProps) {
  const svcFromCtx = useProjectService();
  const svc = service ?? svcFromCtx;
  const navigate = useNavigate();
  const params = useParams<{ projectName?: string }>();

  const routeProjectName = useMemo(() => {
    const raw = params.projectName ?? "";
    return raw ? decodeURIComponent(raw).trim() : "";
  }, [params.projectName]);

  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>(readStoredWorkspaceTabs);
  const [viewMode, setViewMode] = useState<ProjectsViewMode>(readStoredProjectsViewMode);
  const activeWorkspaceId = routeProjectName ? getProjectWorkspaceId(routeProjectName) : projectsWorkspaceTab.id;
  const isProjectsWorkspaceActive = activeWorkspaceId === projectsWorkspaceTab.id;

  const [projects, setProjects] = useState<ProjectCardProject[]>([]);
  const [search, setSearch] = useState<string>("");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasLoadedProjectsRef = useRef(false);
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showImportProject, setShowImportProject] = useState(false);
  const [showImportWorkflow, setShowImportWorkflow] = useState(false);

  const [shareProject, setShareProject] = useState<{
    id: string | number;
    name: string;
    projectOwnerId: string | number | null;
  } | null>(null);

  const loadProjects = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const { silent = false } = opts;

      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }

      try {
        const raw = await (fetchList ? fetchList() : svc.fetchList());
        let list: any[] = [];

        if (Array.isArray(raw)) list = raw;
        else if (raw && Array.isArray((raw as any).results)) list = (raw as any).results;
        else if (raw && typeof raw === "object") list = Object.values(raw);

        const normalizedProjects = list.map(normalizeProject);
        hasLoadedProjectsRef.current = true;
        setProjects(normalizedProjects);
        setWorkspaceTabs((prev) => updateWorkspaceTitlesFromProjects(prev, normalizedProjects));
      } catch (err: any) {
        console.error("[Projects] failed to load projects:", err);

        if (!silent) {
          setLoadError(err?.message ?? String(err));
          setProjects([]);
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [fetchList, svc],
  );

  const handleImportProject = useCallback(
    async (payload: ImportProjectPayload) => {
      await svc.importProject(payload);

      toast.success("Project imported successfully.");
      await loadProjects({ silent: true });
    },
    [svc, loadProjects],
  );

  useEffect(() => {
    if (!isProjectsWorkspaceActive) {
      setLoading(false);

      if (!hasLoadedProjectsRef.current) {
        void loadProjects({ silent: true });
      }

      return;
    }

    void loadProjects({ silent: hasLoadedProjectsRef.current });
  }, [isProjectsWorkspaceActive, loadProjects]);

  useEffect(() => {
    if (!isProjectsWorkspaceActive) return;

    const refreshSilently = () => {
      if (document.visibilityState === "visible") {
        void loadProjects({ silent: true });
      }
    };

    const intervalId = window.setInterval(refreshSilently, 15000);

    window.addEventListener("focus", refreshSilently);
    document.addEventListener("visibilitychange", refreshSilently);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshSilently);
      document.removeEventListener("visibilitychange", refreshSilently);
    };
  }, [isProjectsWorkspaceActive, loadProjects]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!routeProjectName) return;

    const project = findProjectForWorkspaceName(projects, routeProjectName);

    setWorkspaceTabs((prev) => {
      const tabId = getProjectWorkspaceId(routeProjectName);
      const existingTab = prev.find((tab) => tab.id === tabId);

      const storedTitle =
        existingTab?.type === "project" &&
          existingTab.title &&
          existingTab.title !== routeProjectName
          ? existingTab.title
          : null;

      const title = project?.name ?? storedTitle ?? "Loading…";

      if (existingTab) {
        return prev.map((tab) =>
          tab.id === tabId && tab.type === "project"
            ? { ...tab, title }
            : tab,
        );
      }

      return [
        ...prev,
        {
          type: "project",
          id: tabId,
          projectName: routeProjectName,
          title,
        },
      ];
    });
  }, [routeProjectName, projects]);

  // Remember confirmed visits without modifying the project's updatedAt.
  useEffect(() => {
    if (!routeProjectName) return;
    const openedProject = findProjectForWorkspaceName(projects, routeProjectName);
    if (!openedProject) return;
    try {
      window.localStorage.setItem(
        LAST_OPENED_PROJECT_STORAGE_KEY,
        String(openedProject.id),
      );
    } catch {
      // Storage may be unavailable.
    }
  }, [routeProjectName, projects]);

  useEffect(() => {
    storeWorkspaceTabs(workspaceTabs);
  }, [workspaceTabs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PROJECTS_VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // noOp
    }
  }, [viewMode]);

  const normalizedTerm = search.trim().toLowerCase();

  const filteredProjects = useMemo(() => {
    const filtered = normalizedTerm
      ? projects.filter((p) => {
        const name = String(p.name ?? "").toLowerCase();
        const id = String(p.id ?? "").toLowerCase();
        const desc = String(p.description ?? "").toLowerCase();
        return name.includes(normalizedTerm) || id.includes(normalizedTerm) || desc.includes(normalizedTerm);
      })
      : projects;

    return [...filtered].sort(
      (a, b) =>
        (b.updatedAt ?? b.createdAt).getTime() -
        (a.updatedAt ?? a.createdAt).getTime(),
    );
  }, [projects, normalizedTerm]);

  // The disk quotas the user's projects count against (none set: nothing shown)
  const [myQuotas, setMyQuotas] = useState<StorageQuota[]>([]);
  useEffect(() => {
    let cancelled = false;
    myStorageQuotas()
      .then((quotas) => { if (!cancelled) setMyQuotas(quotas); })
      .catch(() => { /* only a hint: the list works without it */ });
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const total = projects.length;
    const shared = projects.filter((p) => Boolean(p.isShared) && !Boolean(p.isOwner)).length;
    const ownedProjects = projects.filter((p) => p.isOwner);
    const owned = ownedProjects.length;
    // What the user's own projects take on the disk, as last measured
    const ownedBytes = ownedProjects.reduce((sum, p) => sum + (p.diskUsageBytes ?? 0), 0);
    const ownedNotMeasured = ownedProjects.filter((p) => p.diskUsageBytes == null).length;
    return { total, shared, owned, ownedBytes, ownedNotMeasured };
  }, [projects]);

  const activeProjectTitle = useMemo(() => {
    if (!routeProjectName) return "Projects";
    const activeTab = workspaceTabs.find((tab) => tab.id === activeWorkspaceId);
    return activeTab?.title ?? routeProjectName;
  }, [activeWorkspaceId, routeProjectName, workspaceTabs]);

  const openWorkspaceTab = useCallback(
    (tab: WorkspaceTab) => {
      if (tab.type === "projects") {
        navigate("/projects");
        void loadProjects();
        return;
      }

      navigate(getProjectWorkspacePath(tab.projectName));
    },
    [loadProjects, navigate],
  );

  const closeWorkspaceTab = useCallback(
    (tabId: string) => {
      if (tabId === projectsWorkspaceTab.id) return;

      setWorkspaceTabs((prev) => {
        const next = prev.filter((tab) => tab.id !== tabId);

        if (tabId === activeWorkspaceId) {
          const fallback = next[next.length - 1] ?? projectsWorkspaceTab;
          if (fallback.type === "project") {
            navigate(getProjectWorkspacePath(fallback.projectName));
          } else {
            navigate("/projects");
          }
        }

        return next.length ? next : [projectsWorkspaceTab];
      });
    },
    [activeWorkspaceId, navigate],
  );

  const handleDeleteProject = useCallback(
    (id: number | string) => {
      const key = String(id);
      const tabId = getProjectWorkspaceId(key);

      setProjects((prev) => prev.filter((p) => String(p.id) !== key));
      setWorkspaceTabs((prev) => prev.filter((tab) => tab.id !== tabId));

      if (activeWorkspaceId === tabId) {
        navigate("/projects");
      }
    },
    [activeWorkspaceId, navigate],
  );

  const handleRenameProject = useCallback(
    (id: number | string, newName: string, newDescription: string) => {
      const key = String(id);
      const tabId = getProjectWorkspaceId(key);

      setProjects((prev) =>
        prev.map((p) =>
          String(p.id) === key ? { ...p, name: newName, description: newDescription } : p,
        ),
      );

      setWorkspaceTabs((prev) =>
        prev.map((tab) => (tab.id === tabId && tab.type === "project" ? { ...tab, title: newName } : tab)),
      );
    },
    [],
  );

  const handleCreateProject = useCallback((rawCreated: any) => {
    const unwrapped = (rawCreated && (rawCreated.project || rawCreated.data || rawCreated.result)) ?? rawCreated;
    const normalized = normalizeProject(unwrapped);

    setProjects((prev) => [normalized, ...prev]);
    setSearch("");
  }, []);

  const handleShareProject = useCallback(
    (id: number | string, name: string, projectOwnerId: number | string | null) => {
      setShareProject({ id, name, projectOwnerId: projectOwnerId ?? null });
    },
    [],
  );

  const renderWorkspaceTabs = () => (
    <div
      className={classNames(
        crispText,
        "flex min-w-0 shrink-0 items-center gap-2 overflow-x-auto rounded-2xl border px-3 py-2 shadow-sm",
        "border-gray-300/90 bg-white",
        "dark:border-gray-700 dark:bg-gray-900",
      )}
      aria-label="Project workspaces"
    >
      {workspaceTabs.map((tab, index) => {
        const active = tab.id === activeWorkspaceId;

        return (
          <Fragment key={tab.id}>
            {index === 1 && tab.type === "project" ? (
              <span
                aria-hidden="true"
                className="shrink-0 select-none px-1 text-gray-300 dark:text-gray-600"
              >
                |
              </span>
            ) : null}

            <div
              className={classNames(
                "group inline-flex max-w-[260px] shrink-0 items-center overflow-hidden rounded-xl border text-sm transition",
                active
                  ? "border-indigo-400 bg-indigo-50 text-indigo-900 shadow-sm dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-100"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800",
              )}
            >
              <button
                type="button"
                onClick={() => openWorkspaceTab(tab)}
                className="min-w-0 flex-1 truncate px-3 py-2 text-left"
                title={tab.title}
              >
                {tab.title}
              </button>

              {tab.type === "project" ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeWorkspaceTab(tab.id);
                  }}
                  className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white"
                  aria-label={`Close ${tab.title}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </Fragment>
        );
      })}
    </div>
  );

  const renderViewModeToggle = () => (
    <div
      role="group"
      aria-label="Projects view mode"
      className="inline-flex shrink-0 rounded-[10px] border border-gray-300/85 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800/60"
    >
      {([
        ["cards", LayoutGrid, "Cards"],
        ["list", List, "List"],
      ] as const).map(([mode, Icon, title]) => (
        <button
          key={mode}
          type="button"
          title={title}
          aria-label={`${title} view`}
          aria-pressed={viewMode === mode}
          onClick={() => setViewMode(mode)}
          className={classNames(
            "inline-flex h-9 w-10 items-center justify-center rounded-lg transition",
            viewMode === mode
              ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-300/80 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
              : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );

  const renderLoadingSkeleton = () => {
    if (viewMode === "list") {
      return (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={classNames(
                "h-[76px] animate-pulse rounded-[10px] border px-4 py-4",
                "border-gray-300/80 bg-white",
                "dark:border-gray-700 dark:bg-gray-900",
              )}
            >
              <div className="h-5 w-1/3 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="mt-3 h-4 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={classNames(
              "h-[380px] animate-pulse rounded-[10px] border p-5",
              "border-gray-300/80 bg-white",
              "dark:border-gray-700 dark:bg-gray-900",
            )}
          >
            <div className="h-5 w-2/3 rounded bg-gray-200 dark:bg-slate-700" />
            <div className="mt-3 h-4 w-1/2 rounded bg-gray-200 dark:bg-slate-700" />
            <div className="mt-6 h-12 rounded bg-gray-100 dark:bg-gray-800" />
            <div className="mt-3 h-4 w-1/3 rounded bg-gray-200 dark:bg-slate-700" />
          </div>
        ))}
      </div>
    );
  };

  const renderProjectGrid = () => (
    <div
      className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Projects cards"
    >
      {filteredProjects.map((project) => (
        <div key={getProjectCardKey(project)} className="h-full">
          <ProjectCard
            id={project.id}
            label={project.name}
            value={project.protocolsCount ?? "0"}
            createdAt={project.createdAt ? String(project.createdAt) : undefined}
            updatedAt={project.updatedAt ? String(project.updatedAt) : undefined}
            diskUsage={project.diskUsage?.toString()}
            isSelected={selectedLabel === project.name}
            onSelect={() => setSelectedLabel(project.name)}
            isExpanded={expandedLabel === project.name}
            description={project.description ?? "No description available."}
            onToggleExpand={() =>
              setExpandedLabel((prev) => (prev === project.name ? null : project.name))
            }
            onDelete={handleDeleteProject}
            onRename={handleRenameProject}
            onShare={(cardId) =>
              handleShareProject(cardId, project.name, project.projectOwnerId ?? null)
            }
            isShared={project.isShared}
            isOwner={project.isOwner}
            permission={project.permission?.toString()}
            accessVia={project.accessVia ?? null}
            projectOwnerId={project.projectOwnerId ?? null}
            thumbnailUrl={project.thumbnailUrl ?? null}
            thumbnailRebuildUrl={project.thumbnailRebuildUrl ?? null}
            thumbnailItemsUrl={project.thumbnailItemsUrl ?? null}
            thumbnailVersion={project.thumbnailVersion ?? 0}
          />
        </div>
      ))}
    </div>
  );

  const renderProjectList = () => (
    <div className="space-y-3" aria-label="Projects list">

      {filteredProjects.map((project) => (
        <ProjectListRow
          key={String(project.id)}
          id={project.id}
          name={project.name}
          description={project.description ?? "No description available."}
          protocolsCount={project.protocolsCount ?? "0"}
          createdAt={project.createdAt}
          updatedAt={project.updatedAt}
          diskUsage={project.diskUsage ?? null}
          status={project.status}
          isSelected={selectedLabel === project.name}
          onSelect={() => setSelectedLabel(project.name)}
          onDelete={handleDeleteProject}
          onRename={handleRenameProject}
          onShare={(rowId) => handleShareProject(rowId, project.name, project.projectOwnerId ?? null)}
          isShared={project.isShared}
          isOwner={project.isOwner}
          permission={project.permission?.toString()}
          accessVia={project.accessVia ?? null}
        />
      ))}
    </div>
  );

  const menuItemClass = classNames(
    "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[14px] transition",
    "hover:bg-gray-50 dark:hover:bg-gray-800/70",
  );

  const renderProjectsListWorkspace = () => (
    <div
      className={classNames(
        crispText,
        "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border",
        "border-gray-300/85 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        "dark:border-gray-700 dark:bg-gray-900",
      )}
    >
      <div className="relative flex min-h-0 flex-1 flex-col bg-gray-100 dark:bg-gray-950">
        <div className="shrink-0 border-b border-gray-200/90 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-900 lg:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-[19px] font-semibold text-gray-900 dark:text-white">Projects</h1>
                <span className="rounded-full bg-gray-200/80 px-2.5 py-0.5 text-[13px] font-semibold tabular-nums text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                  {stats.total}
                </span>
              </div>
              <p className="mt-0.5 text-[13.5px] text-gray-500 dark:text-gray-400">
                Your projects and the ones shared with you
              </p>
              {/* Only a warning: a quota near its limit, or full */}
              {myQuotas.filter((quota) => quota.full || (quota.percent ?? 0) >= 80).map((quota) => (
                <p key={`${quota.kind}-${quota.targetId}`} data-testid="own-disk-quota"
                   className={classNames("mt-1 text-[13.5px] leading-6",
                     quota.full ? "font-semibold text-red-700 dark:text-red-300"
                       : (quota.percent ?? 0) >= 80 ? "text-amber-800 dark:text-amber-300" : "text-gray-700 dark:text-gray-300")}>
                  {quota.kind === "user" ? "Your disk quota" : `The disk quota of ${quota.name ?? "your group"}`}:{" "}
                  {formatBytes(quota.usedBytes)} of {formatBytes(quota.limitBytes)}
                  {quota.percent != null ? ` (${Math.round(quota.percent)} %)` : ""}
                  {quota.full ? ". It is full: nothing new can be launched in its projects until space is freed." : "."}
                </p>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-brand-600"
              >
                <PlusCircle className="h-4 w-4" />
                New project
              </button>

              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={showDropdown}
                  onClick={() => setShowDropdown((prev) => !prev)}
                  className={classNames(
                    "inline-flex h-10 items-center gap-1.5 rounded-[10px] border px-3.5 text-[14px] font-medium transition",
                    "border-gray-300 bg-white text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-900",
                    "dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-white/[0.05]",
                  )}
                >
                  <Download className="h-4 w-4" />
                  Import
                  <ChevronDownIcon className="h-4 w-4 opacity-70" />
                </button>

                {showDropdown && (
                  <div
                    role="menu"
                    className={classNames(
                      crispText,
                      "absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-[10px] border py-1 shadow-lg",
                      "border-gray-300/90 bg-white text-gray-800",
                      "dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200",
                    )}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className={menuItemClass}
                      onClick={() => {
                        setShowDropdown(false);
                        setShowImportProject(true);
                      }}
                    >
                      <Download className="h-4 w-4" />
                      <span>Import project</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={menuItemClass}
                      onClick={() => {
                        setShowDropdown(false);
                        setShowImportWorkflow(true);
                      }}
                    >
                      <CloudDownload className="h-4 w-4" />
                      <span>Import workflow</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 px-5 pt-4 pb-4 lg:px-6">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects…"
              aria-label="Search projects"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={classNames(
                crispText,
                "h-10 w-full rounded-[10px] border pl-9 pr-3 text-[14.5px] outline-none transition",
                "border-gray-300 bg-white text-gray-900 placeholder:text-gray-400",
                "focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10",
                "dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500",
                "dark:focus:border-brand-800",
              )}
            />
          </div>
          <div className="ml-auto">{renderViewModeToggle()}</div>
        </div>

        <div
          className="min-h-0 flex-1 overscroll-contain px-5 pb-5 lg:px-6"
          style={{
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {loading && renderLoadingSkeleton()}

          {!loading && loadError && (
            <div className="rounded-[10px] border border-red-200/80 bg-red-50 p-4 text-[14px] leading-6 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              Error loading projects: {loadError}
            </div>
          )}

          {!loading && !loadError && filteredProjects.length === 0 && (
            <div className="rounded-[10px] border border-dashed border-gray-300 px-6 py-12 text-center text-[15px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No projects found.
            </div>
          )}

          {!loading && !loadError && filteredProjects.length > 0 && (
            viewMode === "list" ? renderProjectList() : renderProjectGrid()
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <PageMeta title={`Scipion | ${activeProjectTitle}`} description="Projects page" />

      <div className="flex h-[calc(100dvh-64px)] min-h-0 flex-col gap-2 overflow-hidden">
        {renderWorkspaceTabs()}
        {activeWorkspaceId === projectsWorkspaceTab.id ? (
          renderProjectsListWorkspace()
        ) : (
          <div className="project-workspace-panel min-h-0">
            <ProjectPage key={activeWorkspaceId} />
          </div>
        )}
      </div>

      <NewProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreateProject}
      />

      <ImportProjectDialog
        open={showImportProject}
        onClose={() => setShowImportProject(false)}
        onImport={handleImportProject}
        resolveBrowserPaths={() => svc.resolveBrowserPaths(-1, -1)}
        listRemoteDirectory={(p) => svc.listRemoteDirectory(-1, -1, p)}
        previewRemoteEntry={(p) => svc.previewRemoteEntry(-1, -1, p)}
        buildDownloadUrl={(p, inline) => svc.buildProtocolDownloadUrl("-1", "-1", p, !!inline)}
        getDownloadLink={svc.createProtocolDownloadLink ? (p) => svc.createProtocolDownloadLink!(-1, -1, p) : undefined}
      />

      <ImportWorkflowDialog
        open={showImportWorkflow}
        onClose={() => setShowImportWorkflow(false)}
        onImported={() =>
          loadProjects({ silent: true })
        }
      />

      <ShareProjectModal
        open={!!shareProject}
        projectId={shareProject?.id ?? null}
        projectName={shareProject?.name}
        projectOwnerId={shareProject?.projectOwnerId ?? undefined}
        onClose={() => setShareProject(null)}
      />

      {/* <ProjectWorkspaceCompareDialog
        open={compareOpen}
        tabs={projectWorkspaceTabs}
        onClose={() => setCompareOpen(false)}
        fetchProject={fetchProjectForComparison}
        fetchProtocolDetails={fetchProtocolDetailsForComparison}
      /> */}
    </>
  );
}
