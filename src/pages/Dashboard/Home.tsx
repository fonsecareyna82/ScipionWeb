// src/pages/Home/Home.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Alert from "../../components/ui/alert/Alert";

import { useProjectService } from "@/ProjectServiceContext";
import {
  BookOpen,
  FolderKanban,
  RefreshCw,
  Settings as SettingsIcon,
  Pin,
  PinOff,
  ArrowRight,
  Search,
  GraduationCap,
  LifeBuoy,
  Folder,
  Plus,
} from "lucide-react";
import { TreeIcon } from "@/icons";

type ProjectRow = {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
};

const PIN_STORAGE_KEY = "scipion.home.pins.v1";
const LAST_OPEN_STORAGE_KEY = "scipion.home.lastOpenedProjectId.v1";

function normalizeProjects(raw: any): ProjectRow[] {
  // normalizeProjects
  if (!Array.isArray(raw)) return [];

  return raw
    .map((p: any) => {
      const id = String(p?.id ?? p?.projectId ?? "").trim();
      const name = String(p?.name ?? p?.title ?? "").trim();
      if (!id || !name) return null;

      return {
        id,
        name,
        description: typeof p?.description === "string" ? p.description : undefined,
        createdAt:
          typeof p?.createdAt === "string"
            ? p.createdAt
            : typeof p?.created_at === "string"
              ? p.created_at
              : undefined,
        updatedAt:
          typeof p?.updatedAt === "string"
            ? p.updatedAt
            : typeof p?.updated_at === "string"
              ? p.updated_at
              : undefined,
        status: typeof p?.status === "string" ? p.status : undefined,
      } as ProjectRow;
    })
    .filter(Boolean) as ProjectRow[];
}

function readPinnedIds(): string[] {
  // readPinnedIds
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x)).filter((x) => x.trim().length > 0);
  } catch {
    return [];
  }
}

function writePinnedIds(ids: string[]): void {
  // writePinnedIds
  try {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function readLastOpenedProjectId(): string | null {
  // readLastOpenedProjectId
  try {
    const raw = localStorage.getItem(LAST_OPEN_STORAGE_KEY);
    const id = String(raw ?? "").trim();
    return id ? id : null;
  } catch {
    return null;
  }
}

function writeLastOpenedProjectId(id: string): void {
  // writeLastOpenedProjectId
  try {
    localStorage.setItem(LAST_OPEN_STORAGE_KEY, String(id));
  } catch {
    // ignore
  }
}

function formatDateTime(raw?: string): string {
  // formatDateTime
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function classNames(...xs: Array<string | false | null | undefined>): string {
  // classNames
  return xs.filter(Boolean).join(" ");
}

function CardShell(props: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  // CardShell
  return (
    <div
      className={classNames(
        "relative overflow-hidden rounded-2xl border p-5 shadow-sm backdrop-blur",
        "border-gray-200/70 bg-white/80",
        "dark:border-gray-800/80 dark:bg-white/[0.03]",
        "lg:p-6",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[1px] before:content-['']",
        "before:bg-gradient-to-r before:from-indigo-500/40 before:via-sky-500/30 before:to-cyan-500/40",
        "after:pointer-events-none after:absolute after:inset-0 after:content-['']",
        "after:bg-gradient-to-br after:from-indigo-500/[0.06] after:via-transparent after:to-cyan-500/[0.06]",
        "dark:after:from-indigo-400/[0.10] dark:after:to-cyan-400/[0.10]",
      )}
    >
      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{props.title}</h3>
            {props.subtitle ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{props.subtitle}</p> : null}
          </div>
          {props.right ? <div className="shrink-0">{props.right}</div> : null}
        </div>
        {props.children}
      </div>
    </div>
  );
}

function ActionButton(props: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick?: () => void;
  to?: string;
  href?: string;
  openInNewTab?: boolean;
  disabled?: boolean;
}) {
  // ActionButton
  const content = (
    <div
      className={classNames(
        "group relative flex w-full items-start gap-3 rounded-xl border p-4 text-left transition",
        "border-gray-200/70 bg-white/70 shadow-sm hover:border-gray-300/80 hover:shadow-md",
        "dark:border-gray-800/80 dark:bg-white/[0.02] dark:hover:border-gray-700",
        props.disabled ? "pointer-events-none opacity-60" : "",
        "hover:bg-gradient-to-br hover:from-indigo-500/[0.05] hover:via-transparent hover:to-cyan-500/[0.05]",
        "dark:hover:from-indigo-400/[0.10] dark:hover:to-cyan-400/[0.10]",
      )}
    >
      <div
        className={classNames(
          "mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg",
          "bg-gradient-to-br from-indigo-500/20 via-sky-500/15 to-cyan-500/20",
          "ring-1 ring-indigo-500/20",
          "text-gray-800 dark:text-white/85",
          "dark:ring-indigo-400/20",
        )}
      >
        {props.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{props.title}</div>
          <ArrowRight className="h-4 w-4 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300" />
        </div>
        <div className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{props.description}</div>
      </div>
    </div>
  );

  if (props.href) {
    const newTab = props.openInNewTab !== false;
    return (
      <a
        href={props.href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noreferrer" : undefined}
        className="block"
      >
        {content}
      </a>
    );
  }

  if (props.to) {
    return (
      <Link to={props.to} className="block">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={props.onClick} className="block w-full">
      {content}
    </button>
  );
}

function StatCard(props: { label: string; value: React.ReactNode; accent: "indigo" | "sky" | "cyan" }) {
  // StatCard
  const accentClasses =
    props.accent === "indigo"
      ? "border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] via-transparent to-transparent dark:from-indigo-400/[0.12]"
      : props.accent === "sky"
        ? "border-sky-500/20 bg-gradient-to-br from-sky-500/[0.08] via-transparent to-transparent dark:from-sky-400/[0.12]"
        : "border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.08] via-transparent to-transparent dark:from-cyan-400/[0.12]";

  return (
    <div
      className={classNames(
        "rounded-xl border p-4 shadow-sm",
        "border-gray-200/70 bg-white/70",
        "dark:border-gray-800/80 dark:bg-white/[0.02]",
        accentClasses,
      )}
    >
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{props.label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-800 dark:text-white/90">{props.value}</div>
    </div>
  );
}

export default function Home() {
  const svc = useProjectService() as any;
  const navigate = useNavigate();

  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  const [pinnedIds, setPinnedIds] = useState<string[]>(() => readPinnedIds());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    // persistPinnedIds
    writePinnedIds(pinnedIds);
  }, [pinnedIds]);

  const loadProjects = useCallback(async () => {
    // loadProjects
    setProjectsLoading(true);
    setProjectsError(null);

    try {
      const raw = await svc.fetchList();
      const list = normalizeProjects(raw);

      list.sort((a, b) => {
        const da = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const db = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return db - da;
      });

      setProjects(list);
    } catch (e: any) {
      const msg = typeof e?.message === "string" && e.message.trim() ? e.message : "Failed to load projects";
      setProjectsError(msg);
    } finally {
      setProjectsLoading(false);
    }
  }, [svc]);

  useEffect(() => {
    // initialLoad
    void loadProjects();
  }, [loadProjects]);

  const togglePin = useCallback((projectId: string) => {
    // togglePin
    setPinnedIds((prev) => {
      const id = String(projectId);
      const has = prev.some((x) => String(x) === id);
      if (has) return prev.filter((x) => String(x) !== id);
      return [id, ...prev].slice(0, 12);
    });
  }, []);

  const openProject = useCallback(
    (projectId: string) => {
      // openProject
      writeLastOpenedProjectId(projectId);
      navigate(`/project/load/${encodeURIComponent(String(projectId))}`);
    },
    [navigate],
  );

  const normalizedFilter = filter.trim().toLowerCase();

  const filteredProjects = useMemo(() => {
    // filteredProjects
    if (!normalizedFilter) return projects;
    return projects.filter((p) => {
      const name = (p.name ?? "").toLowerCase();
      const desc = (p.description ?? "").toLowerCase();
      return (
        name.includes(normalizedFilter) ||
        desc.includes(normalizedFilter) ||
        String(p.id).includes(normalizedFilter)
      );
    });
  }, [projects, normalizedFilter]);

  const pinnedProjects = useMemo(() => {
    // pinnedProjects
    const set = new Set(pinnedIds.map(String));
    return filteredProjects.filter((p) => set.has(String(p.id)));
  }, [filteredProjects, pinnedIds]);

  const recentProjects = useMemo(() => {
    // recentProjects
    const set = new Set(pinnedIds.map(String));
    return filteredProjects.filter((p) => !set.has(String(p.id))).slice(0, 8);
  }, [filteredProjects, pinnedIds]);

  const stats = useMemo(() => {
    // stats
    const total = projects.length;
    const pinned = pinnedIds.length;
    const lastUpdated = projects.length > 0 ? formatDateTime(projects[0].updatedAt ?? projects[0].createdAt) : "—";
    return { total, pinned, lastUpdated };
  }, [projects, pinnedIds.length]);

  const lastOpenedId = useMemo(() => readLastOpenedProjectId(), []);
  const lastProjectId = useMemo(() => {
    // lastProjectId
    const exists = lastOpenedId && projects.some((p) => String(p.id) === String(lastOpenedId));
    if (exists) return String(lastOpenedId);
    return projects[0]?.id;
  }, [lastOpenedId, projects]);

  const hasAnyProjects = projects.length > 0;

  return (
    <>
      <PageMeta title="Scipion" description="Scipion Home" />
      <PageBreadcrumb pageTitle="Home" />

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* Top: Quick actions */}
        <div className="col-span-12 xl:col-span-8">
          <CardShell
            title="Quick actions"
            subtitle="Start fast: create a project, jump back to your work, or open settings."
            right={
              <button
                type="button"
                onClick={() => void loadProjects()}
                className={classNames(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                  "border-gray-200/70 bg-white/70 text-gray-800 shadow-sm hover:border-gray-300/80 hover:shadow-md",
                  "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white/90 dark:hover:border-gray-700",
                  "hover:bg-gradient-to-br hover:from-indigo-500/[0.06] hover:via-transparent hover:to-cyan-500/[0.06]",
                  "dark:hover:from-indigo-400/[0.12] dark:hover:to-cyan-400/[0.12]",
                  projectsLoading ? "pointer-events-none opacity-70" : "",
                )}
              >
                <RefreshCw className={classNames("h-4 w-4", projectsLoading ? "animate-spin" : "")} />
                Refresh
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ActionButton
                title="Projects"
                description="Browse your projects, open a workflow, or manage tags."
                icon={<FolderKanban className="h-4 w-4" />}
                to="/projects"
              />
              <ActionButton
                title="Workflows"
                description="Load workflow templates"
                icon={<TreeIcon className="h-4 w-4" />}
                to="/workflows"
              />
              <ActionButton
                title="Plugins"
                description="Install, uninstall or update available Scipion plugins"
                icon={<Folder className="h-4 w-4" />}
                to="/plugins"
              />
              <ActionButton
                title="Settings"
                description="User preferences, instance configuration, tags, and environment variables."
                icon={<SettingsIcon className="h-4 w-4" />}
                to="/settings"
              />
              <ActionButton
                title="Documentation"
                description="Learn how to use Scipion workflows and protocols."
                icon={<BookOpen className="h-4 w-4" />}
                href="https://scipion-em.github.io/docs/release-3.0.0/index.html"
                openInNewTab
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label="Projects" value={stats.total} accent="indigo" />
              <StatCard label="Pinned" value={stats.pinned} accent="sky" />
              <div
                className={classNames(
                  "rounded-xl border p-4 shadow-sm",
                  "border-gray-200/70 bg-white/70",
                  "dark:border-gray-800/80 dark:bg-white/[0.02]",
                  "border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.08] via-transparent to-transparent dark:from-cyan-400/[0.12]",
                )}
              >
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">Last update</div>
                <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">{stats.lastUpdated}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => (lastProjectId ? openProject(lastProjectId) : navigate("/project/load"))}
                className={classNames(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
                  "text-white shadow-sm",
                  "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600",
                  "hover:brightness-[0.98] hover:shadow-md",
                )}
              >
                <ArrowRight className="h-4 w-4" />
                {lastProjectId ? "Open last project" : "Open projects"}
              </button>
            </div>
          </CardShell>
        </div>

        {/* Top right: What's new */}
        <div className="col-span-12 xl:col-span-4">
          <CardShell title="What’s new" subtitle="Release notes and useful links.">
            <Alert
              variant="success"
              title="Welcome to Scipion v4.0.0 - Flavius"
              message="To learn more about Scipion you can go to our documentation"
              showLink={true}
              linkHref="https://scipion-em.github.io/docs/release-3.0.0/index.html"
              linkText="Learn more"
            />

            <div
              className={classNames(
                "mt-4 rounded-xl border p-4 text-sm shadow-sm",
                "border-gray-200/70 bg-white/70 text-gray-700",
                "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-300",
                "bg-gradient-to-br from-indigo-500/[0.06] via-transparent to-cyan-500/[0.06]",
                "dark:from-indigo-400/[0.10] dark:to-cyan-400/[0.10]",
              )}
            >
              <div className="font-semibold text-gray-800 dark:text-white/90">Instance snapshot</div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 dark:text-gray-400">API</span>
                  <span className="font-semibold text-gray-800 dark:text-white/90">{projectsError ? "Degraded" : "OK"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 dark:text-gray-400">Projects loaded</span>
                  <span className="font-semibold text-gray-800 dark:text-white/90">
                    {projectsLoading ? "Loading…" : String(projects.length)}
                  </span>
                </div>
              </div>

              {projectsError ? (
                <div className="mt-3 rounded-lg border border-red-200/70 bg-red-50/80 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                  {projectsError}
                </div>
              ) : null}
            </div>

            {/* Docs shortcuts */}
            <div className="mt-4 grid grid-cols-1 gap-3">
              <a
                href="https://scipion-em.github.io/docs/release-3.0.0/index.html"
                target="_blank"
                rel="noreferrer"
                className={classNames(
                  "group flex items-center justify-between rounded-xl border p-4 text-sm font-semibold transition",
                  "border-gray-200/70 bg-white/70 text-gray-800 shadow-sm hover:border-gray-300/80 hover:shadow-md",
                  "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white/90 dark:hover:border-gray-700",
                  "hover:bg-gradient-to-br hover:from-indigo-500/[0.06] hover:via-transparent hover:to-cyan-500/[0.06]",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 via-sky-500/15 to-cyan-500/20 ring-1 ring-indigo-500/20">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  Quickstart
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300" />
              </a>

              <a
                href="https://scipion-em.github.io/docs/"
                target="_blank"
                rel="noreferrer"
                className={classNames(
                  "group flex items-center justify-between rounded-xl border p-4 text-sm font-semibold transition",
                  "border-gray-200/70 bg-white/70 text-gray-800 shadow-sm hover:border-gray-300/80 hover:shadow-md",
                  "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white/90 dark:hover:border-gray-700",
                  "hover:bg-gradient-to-br hover:from-indigo-500/[0.06] hover:via-transparent hover:to-cyan-500/[0.06]",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 via-sky-500/15 to-cyan-500/20 ring-1 ring-indigo-500/20">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  Tutorials
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300" />
              </a>

              <Link
                to="/settings"
                className={classNames(
                  "group flex items-center justify-between rounded-xl border p-4 text-sm font-semibold transition",
                  "border-gray-200/70 bg-white/70 text-gray-800 shadow-sm hover:border-gray-300/80 hover:shadow-md",
                  "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white/90 dark:hover:border-gray-700",
                  "hover:bg-gradient-to-br hover:from-indigo-500/[0.06] hover:via-transparent hover:to-cyan-500/[0.06]",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 via-sky-500/15 to-cyan-500/20 ring-1 ring-indigo-500/20">
                    <LifeBuoy className="h-4 w-4" />
                  </div>
                  Support & diagnostics
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300" />
              </Link>
            </div>
          </CardShell>
        </div>

        {/* If no projects: guided empty state */}
        {!hasAnyProjects ? (
          <div className="col-span-12">
            <CardShell
              title="Get started"
              subtitle="Create your first project and start building a workflow."
              right={
                <Link
                  to="/project/new"
                  className={classNames(
                    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-sm transition",
                    "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600 hover:shadow-md hover:brightness-[0.98]",
                  )}
                >
                  <Plus className="h-4 w-4" />
                  New project
                </Link>
              }
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200/70 bg-white/70 p-4 text-sm text-gray-600 shadow-sm dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-400">
                  <div className="font-semibold text-gray-800 dark:text-white/90">1) Create a project</div>
                  <div className="mt-1 text-xs">Define a name and description for your dataset.</div>
                </div>
                <div className="rounded-xl border border-gray-200/70 bg-white/70 p-4 text-sm text-gray-600 shadow-sm dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-400">
                  <div className="font-semibold text-gray-800 dark:text-white/90">2) Import data</div>
                  <div className="mt-1 text-xs">Upload or browse remote files and configure inputs.</div>
                </div>
                <div className="rounded-xl border border-gray-200/70 bg-white/70 p-4 text-sm text-gray-600 shadow-sm dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-400">
                  <div className="font-semibold text-gray-800 dark:text-white/90">3) Run protocols</div>
                  <div className="mt-1 text-xs">Build a workflow and inspect results in viewers.</div>
                </div>
              </div>
            </CardShell>
          </div>
        ) : null}

        {/* Pinned projects */}
        <div className="col-span-12">
          <CardShell
            title="Pinned projects"
            subtitle="Keep your most used projects at the top."
            right={
              pinnedProjects.length > 0 ? (
                <Link
                  to="/projects"
                  className={classNames(
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                    "border-gray-200/70 bg-white/70 text-gray-800 shadow-sm hover:border-gray-300/80 hover:shadow-md",
                    "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white/90 dark:hover:border-gray-700",
                  )}
                >
                  <FolderKanban className="h-4 w-4" />
                  View all
                </Link>
              ) : null
            }
          >
            {pinnedProjects.length === 0 ? (
              <div className="rounded-xl border border-gray-200/70 bg-white/70 p-4 text-sm text-gray-600 dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-400">
                No pinned projects yet. Pin a project from the list below.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {pinnedProjects.map((p) => (
                  <div
                    key={p.id}
                    className={classNames(
                      "rounded-xl border p-4 shadow-sm transition",
                      "border-gray-200/70 bg-white/70 hover:shadow-md",
                      "dark:border-gray-800/80 dark:bg-white/[0.02] dark:hover:border-gray-700",
                      "hover:bg-gradient-to-br hover:from-indigo-500/[0.05] hover:via-transparent hover:to-cyan-500/[0.05]",
                      "dark:hover:from-indigo-400/[0.10] dark:hover:to-cyan-400/[0.10]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{p.name}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                          {p.description?.trim() ? p.description : "No description"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => togglePin(p.id)}
                        className={classNames(
                          "inline-flex items-center justify-center rounded-lg border p-2 transition",
                          "border-gray-200/70 bg-white/70 shadow-sm hover:border-gray-300/80 hover:shadow-md",
                          "dark:border-gray-800/80 dark:bg-white/[0.02] dark:hover:border-gray-700",
                        )}
                        title="Unpin"
                      >
                        <PinOff className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Updated:{" "}
                        <span className="font-semibold text-gray-700 dark:text-gray-200">
                          {formatDateTime(p.updatedAt ?? p.createdAt)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openProject(p.id)}
                        className={classNames(
                          "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition",
                          "text-white shadow-sm hover:shadow-md hover:brightness-[0.98]",
                          "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600",
                        )}
                      >
                        Open
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardShell>
        </div>

        {/* Recent projects + search */}
        <div className="col-span-12">
          <CardShell
            title="Recent projects"
            subtitle="Jump back to where you left off."
            right={
              <div className="w-full max-w-[360px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search projects…"
                    className={classNames(
                      "w-full rounded-xl border py-2 pl-9 pr-3 text-sm font-semibold outline-none transition",
                      "border-gray-200/70 bg-white/70 text-gray-800 placeholder:text-gray-400",
                      "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                      "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white/90 dark:placeholder:text-gray-500",
                      "dark:focus:border-indigo-400/40 dark:focus:ring-indigo-400/15",
                    )}
                  />
                </div>
              </div>
            }
          >
            {projectsLoading && projects.length === 0 ? (
              <div className="rounded-xl border border-gray-200/70 bg-white/70 p-4 text-sm text-gray-600 dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-400">
                Loading projects…
              </div>
            ) : recentProjects.length === 0 && pinnedProjects.length === 0 ? (
              <div className="rounded-xl border border-gray-200/70 bg-white/70 p-4 text-sm text-gray-600 dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-400">
                No projects match your search.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200/70 bg-white/70 shadow-sm dark:border-gray-800/80 dark:bg-white/[0.01]">
                <div
                  className={classNames(
                    "grid grid-cols-12 gap-0 px-4 py-3 text-xs font-semibold",
                    "bg-gradient-to-r from-gray-50/80 via-white/60 to-gray-50/80 text-gray-600",
                    "dark:from-white/[0.02] dark:via-white/[0.01] dark:to-white/[0.02] dark:text-gray-300",
                  )}
                >
                  <div className="col-span-5">Project</div>
                  <div className="col-span-4 hidden md:block">Description</div>
                  <div className="col-span-3 text-right">Updated</div>
                </div>

                <div className="divide-y divide-gray-200/70 dark:divide-gray-800/70">
                  {recentProjects.map((p) => {
                    const isPinned = pinnedIds.some((x) => String(x) === String(p.id));
                    return (
                      <div
                        key={p.id}
                        className={classNames(
                          "grid grid-cols-12 items-center gap-0 px-4 py-3 transition",
                          "hover:bg-gradient-to-r hover:from-indigo-500/[0.03] hover:via-transparent hover:to-cyan-500/[0.03]",
                          "dark:hover:from-indigo-400/[0.06] dark:hover:to-cyan-400/[0.06]",
                        )}
                      >
                        <div className="col-span-5 min-w-0">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => togglePin(p.id)}
                              className={classNames(
                                "inline-flex items-center justify-center rounded-lg border p-1.5 transition",
                                "border-gray-200/70 bg-white/70 shadow-sm hover:border-gray-300/80 hover:shadow-md",
                                "dark:border-gray-800/80 dark:bg-white/[0.02] dark:hover:border-gray-700",
                              )}
                              title={isPinned ? "Unpin" : "Pin"}
                            >
                              {isPinned ? (
                                <PinOff className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                              ) : (
                                <Pin className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => openProject(p.id)}
                              className="min-w-0 truncate text-sm font-semibold text-gray-800 hover:underline dark:text-white/90"
                            >
                              {p.name}
                            </button>
                          </div>
                        </div>

                        <div className="col-span-4 hidden min-w-0 md:block">
                          <div className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                            {p.description?.trim() ? p.description : "—"}
                          </div>
                        </div>

                        <div className="col-span-3 text-right">
                          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                            {formatDateTime(p.updatedAt ?? p.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardShell>
        </div>
      </div>
    </>
  );
}