// src/pages/Home/Home.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import PageMeta from "../../components/common/PageMeta";

import { useProjectService } from "@/ProjectServiceContext";
import {
  BookOpen,
  FolderKanban,
  RefreshCw,
  Pin,
  PinOff,
  ArrowRight,
  Search,
  GraduationCap,
  LifeBuoy,
  Folder,
  Plus,
  LucideSettings2,
  Sparkles,
  Clock3,
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

type IconTone = "indigo" | "violet" | "emerald" | "amber" | "sky" | "rose";

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

function getIconToneClasses(tone: IconTone): string {
  // getIconToneClasses
  switch (tone) {
    case "indigo":
      return classNames(
        "bg-indigo-50 ring-indigo-200 text-indigo-700",
        "dark:bg-indigo-950/30 dark:ring-indigo-800 dark:text-indigo-200",
      );
    case "violet":
      return classNames(
        "bg-violet-50 ring-violet-200 text-violet-700",
        "dark:bg-violet-950/30 dark:ring-violet-800 dark:text-violet-200",
      );
    case "emerald":
      return classNames(
        "bg-emerald-50 ring-emerald-200 text-emerald-700",
        "dark:bg-emerald-950/30 dark:ring-emerald-800 dark:text-emerald-200",
      );
    case "amber":
      return classNames(
        "bg-amber-50 ring-amber-200 text-amber-700",
        "dark:bg-amber-950/30 dark:ring-amber-800 dark:text-amber-200",
      );
    case "sky":
      return classNames(
        "bg-sky-50 ring-sky-200 text-sky-700",
        "dark:bg-sky-950/30 dark:ring-sky-800 dark:text-sky-200",
      );
    case "rose":
      return classNames(
        "bg-rose-50 ring-rose-200 text-rose-700",
        "dark:bg-rose-950/30 dark:ring-rose-800 dark:text-rose-200",
      );
    default:
      return classNames(
        "bg-gray-100 ring-gray-200 text-gray-900",
        "dark:bg-slate-800 dark:ring-gray-700 dark:text-white",
      );
  }
}

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

function Surface(props: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  // Surface
  return (
    <section
      className={classNames(
        crispText,
        "overflow-hidden rounded-[10px] border",
        "border-gray-300/85 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        "dark:border-gray-700 dark:bg-slate-900",
        props.className,
      )}
    >
      {props.title || props.subtitle || props.right ? (
        <div
          className={classNames(
            "flex flex-col gap-3 border-b px-5 py-4",
            "border-gray-200/90 dark:border-gray-700",
            "md:flex-row md:items-start md:justify-between md:gap-6",
            "lg:px-6",
          )}
        >
          <div className="min-w-0">
            {props.title ? (
              <h2 className="text-[15px] font-semibold tracking-[0.01em] text-gray-950 dark:text-white">
                {props.title}
              </h2>
            ) : null}
            {props.subtitle ? (
              <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">{props.subtitle}</p>
            ) : null}
          </div>
          {props.right ? <div className="shrink-0">{props.right}</div> : null}
        </div>
      ) : null}

      <div className={classNames("p-5 lg:p-6", props.bodyClassName)}>{props.children}</div>
    </section>
  );
}

function SectionLabel(props: { children: ReactNode }) {
  // SectionLabel
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
      {props.children}
    </div>
  );
}

function HeroAction(props: {
  title: string;
  description: string;
  icon: ReactNode;
  tone: IconTone;
  onClick?: () => void;
  to?: string;
}) {
  // HeroAction
  const content = (
    <div
      className={classNames(
        "group flex items-start gap-3 rounded-2xl px-3 py-3 transition",
        "hover:bg-white/90 dark:hover:bg-slate-900/90",
      )}
    >
      <div
        className={classNames(
          "mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl ring-1",
          getIconToneClasses(props.tone),
        )}
      >
        {props.icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-semibold text-gray-950 dark:text-white">{props.title}</div>
          <ArrowRight className="h-4 w-4 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-200" />
        </div>
        <div className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">{props.description}</div>
      </div>
    </div>
  );

  if (props.to) {
    return (
      <Link to={props.to} className="block">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={props.onClick} className="block w-full text-left">
      {content}
    </button>
  );
}

function MetricPill(props: { label: string; value: ReactNode; icon?: ReactNode }) {
  // MetricPill
  return (
    <div
      className={classNames(
        "rounded-2xl border px-4 py-3",
        "border-gray-300/70 bg-white/80",
        "dark:border-gray-700 dark:bg-slate-900/80",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
        {props.icon ? <span className="text-gray-500 dark:text-gray-400">{props.icon}</span> : null}
        <span>{props.label}</span>
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{props.value}</div>
    </div>
  );
}

function ResourceLink(props: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  tone: IconTone;
  href?: string;
  to?: string;
  openInNewTab?: boolean;
}) {
  // ResourceLink
  const content = (
    <div
      className={classNames(
        "group flex items-center justify-between gap-3 rounded-2xl px-3 py-3 transition",
        "hover:bg-gray-100/80 dark:hover:bg-slate-800/70",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={classNames(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
            getIconToneClasses(props.tone),
          )}
        >
          {props.icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-950 dark:text-white">{props.title}</div>
          <div className="truncate text-sm text-gray-700 dark:text-gray-300">{props.subtitle}</div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-gray-700 dark:group-hover:text-gray-200" />
    </div>
  );

  if (props.href) {
    const newTab = props.openInNewTab !== false;
    return (
      <a href={props.href} target={newTab ? "_blank" : undefined} rel={newTab ? "noreferrer" : undefined}>
        {content}
      </a>
    );
  }

  if (props.to) {
    return <Link to={props.to}>{content}</Link>;
  }

  return <div>{content}</div>;
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
    return filteredProjects.filter((p) => !set.has(String(p.id))).slice(0, 10);
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

      <div className={classNames(crispText, "grid grid-cols-12 gap-4 md:gap-6")}>
        <div className="col-span-12">
          <Surface className="overflow-hidden">
            <div className="grid gap-6 xl:grid-cols-12">
              <div className="xl:col-span-8">
                <div
                  className={classNames(
                    "rounded-[10px] border px-5 py-5",
                    "border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-sky-50",
                    "dark:border-indigo-900/50 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900 dark:to-slate-950",
                    "lg:px-6 lg:py-6",
                  )}
                >
                  <div className="inline-flex items-center gap-2 rounded-[10px] border border-indigo-200/80 bg-white/80 px-3 py-1 text-xs font-semibold tracking-[0.02em] text-black-700 dark:border-indigo-800 dark:bg-slate-900/80 dark:text-indigo-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    Scipion v4.0.0 — Flavius
                  </div>

                  <h1 className="mt-4 text-2xl font-bold tracking-[-0.02em] text-gray-950 dark:text-white md:text-[2.2rem]">
                    Welcome back
                  </h1>

                  <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-700 dark:text-gray-300 md:text-base">
                    Start from where you left off, jump into your projects, and keep the most important workspace
                    actions close at hand without overloading the page.
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => (lastProjectId ? openProject(lastProjectId) : navigate("/projects"))}
                      className={classNames(
                        "inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold transition",
                        "text-white shadow-sm hover:shadow-md hover:brightness-[0.98]",
                        "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600",
                      )}
                    >
                      <ArrowRight className="h-4 w-4" />
                      {lastProjectId ? "Open last project" : "Open projects"}
                    </button>

                    

                    <a
                      href="https://scipion-em.github.io/docs/release-3.0.0/index.html"
                      target="_blank"
                      rel="noreferrer"
                      className={classNames(
                        "inline-flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-sm font-semibold transition",
                        "border-gray-300/80 bg-white text-gray-950 hover:bg-gray-50",
                        "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800/80",
                      )}
                    >
                      <BookOpen className="h-4 w-4" />
                      Release notes
                    </a>
                  </div>

                  <div className="mt-6 border-t border-white/70 pt-4 dark:border-slate-800">
                    <SectionLabel>Workspace actions</SectionLabel>
                    <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      <HeroAction
                        title="Projects"
                        description="Browse your projects, open a workflow, or manage tags."
                        icon={<FolderKanban className="h-4 w-4" />}
                        tone="indigo"
                        to="/projects"
                      />
                      <HeroAction
                        title="Workflows"
                        description="Load workflow templates and jump directly into execution."
                        icon={<TreeIcon className="h-4 w-4" />}
                        tone="violet"
                        to="/workflows"
                      />
                      <HeroAction
                        title="Plugins"
                        description="Install, uninstall or update available Scipion plugins."
                        icon={<Folder className="h-4 w-4" />}
                        tone="emerald"
                        to="/plugins"
                      />
                      <HeroAction
                        title="Settings"
                        description="User preferences, tags, instance configuration and environment values."
                        icon={<LucideSettings2 className="h-4 w-4" />}
                        tone="amber"
                        to="/settings"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-4">
                <div className="flex h-full flex-col gap-4">
                  <div
                    className={classNames(
                      "rounded-[10px] border px-4 py-4",
                      "border-gray-300/80 bg-gray-50/75",
                      "dark:border-gray-700 dark:bg-slate-950/40",
                    )}
                  >
                    <SectionLabel>Workspace</SectionLabel>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                      <MetricPill label="Projects" value={stats.total} icon={<FolderKanban className="h-4 w-4" />} />
                      <MetricPill label="Pinned" value={stats.pinned} icon={<Pin className="h-4 w-4" />} />
                      <MetricPill
                        label="Last update"
                        value={stats.lastUpdated}
                        icon={<Clock3 className="h-4 w-4" />}
                      />
                    </div>

                    <div className="mt-4 border-t border-gray-200/90 pt-4 dark:border-gray-800">
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-gray-700 dark:text-gray-300">API status</span>
                          <span className="font-semibold text-gray-950 dark:text-white">
                            {projectsError ? "Degraded" : "OK"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-gray-700 dark:text-gray-300">Projects loaded</span>
                          <span className="font-semibold text-gray-950 dark:text-white">
                            {projectsLoading ? "Loading…" : String(projects.length)}
                          </span>
                        </div>
                      </div>

                      {projectsError ? (
                        <div className="mt-3 rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                          {projectsError}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={classNames(
                      "rounded-[10px] border px-4 py-4",
                      "border-gray-300/80 bg-gray-50/75",
                      "dark:border-gray-700 dark:bg-slate-950/40",
                    )}
                  >
                    <SectionLabel>Resources</SectionLabel>
                    <div className="mt-2 space-y-1">
                      <ResourceLink
                        title="Quickstart"
                        subtitle="Get productive fast"
                        icon={<GraduationCap className="h-4 w-4" />}
                        tone="violet"
                        href="https://scipion-em.github.io/docs/release-3.0.0/index.html"
                        openInNewTab
                      />
                      <ResourceLink
                        title="Documentation"
                        subtitle="Browse full docs and tutorials"
                        icon={<BookOpen className="h-4 w-4" />}
                        tone="sky"
                        href="https://scipion-em.github.io/docs/"
                        openInNewTab
                      />
                      <ResourceLink
                        title="Support & diagnostics"
                        subtitle="Review settings and environment"
                        icon={<LifeBuoy className="h-4 w-4" />}
                        tone="rose"
                        to="/settings"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Surface>
        </div>
        <div className="col-span-12">
          <Surface
            className="border-gray-300/90 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:shadow-none"
            title="Projects"
            subtitle="Pinned projects stay visible at the top. Recent projects remain the main working list."
            right={
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
                <div className="relative w-full md:w-[320px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search projects…"
                    className={classNames(
                      "w-full rounded-[10px] border py-2.5 pl-9 pr-3 text-sm font-medium outline-none transition",
                      "border-gray-300/80 bg-white text-gray-950 placeholder:text-gray-400",
                      "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                      "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500",
                      "dark:focus:border-indigo-400/40 dark:focus:ring-indigo-400/15",
                    )}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void loadProjects()}
                  className={classNames(
                    "inline-flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 text-sm font-medium transition",
                    "border-gray-300/80 bg-white text-gray-950 hover:bg-gray-50",
                    "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800/80",
                    projectsLoading ? "pointer-events-none opacity-70" : "",
                  )}
                >
                  <RefreshCw
                    className={classNames(
                      "h-4 w-4 text-sky-700 dark:text-sky-300",
                      projectsLoading ? "animate-spin" : "",
                    )}
                  />
                  Refresh
                </button>

                <Link
                  to="/projects"
                  className={classNames(
                    "inline-flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 text-sm font-medium transition",
                    "border-gray-300/80 bg-white text-gray-950 hover:bg-gray-50",
                    "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800/80",
                  )}
                >
                  <FolderKanban className="h-4 w-4 text-indigo-700 dark:text-indigo-300" />
                  View all
                </Link>
              </div>
            }
          >
            {projectsLoading && projects.length === 0 ? (
              <div className="rounded-[10px] border border-gray-300/80 bg-white px-4 py-4 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300">
                Loading projects…
              </div>
            ) : recentProjects.length === 0 && pinnedProjects.length === 0 ? (
              <div className="rounded-[10px] border border-gray-300/80 bg-white px-4 py-4 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300">
                No projects match your search.
              </div>
            ) : (
              <div className="space-y-7">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <SectionLabel>Pinned</SectionLabel>
                      <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        Your most used projects stay one click away.
                      </div>
                    </div>
                  </div>

                  {pinnedProjects.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-gray-300/90 bg-gray-50/80 px-4 py-3 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:bg-slate-950/40 dark:text-gray-300">
                      No pinned projects yet. Pin a project from the list below.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                      {pinnedProjects.map((p) => (
                        <div
                          key={p.id}
                          className={classNames(
                            "flex items-center justify-between gap-3 rounded-[10px] border px-4 py-4 transition",
                            "border-gray-300/75 bg-gradient-to-br from-white to-gray-50 hover:border-gray-400",
                            "dark:border-gray-700 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-950 dark:hover:border-gray-600",
                          )}
                        >
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openProject(p.id)}
                              className="block min-w-0 truncate text-left text-[15px] font-semibold text-gray-950 hover:underline dark:text-white"
                            >
                              {p.name}
                            </button>
                            <div className="mt-1 line-clamp-1 text-sm text-gray-700 dark:text-gray-300">
                              {p.description?.trim() ? p.description : "No description"}
                            </div>
                            <div className="mt-2 text-xs font-medium  text-gray-500 dark:text-gray-400">
                              Updated {formatDateTime(p.updatedAt ?? p.createdAt)}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => togglePin(p.id)}
                              className={classNames(
                                "inline-flex items-center justify-center rounded-[10px] border p-2.5 transition",
                                "border-amber-300/70 bg-amber-50 hover:bg-amber-100",
                                "dark:border-amber-700 dark:bg-amber-950/20 dark:hover:bg-amber-950/35",
                              )}
                              title="Unpin"
                            >
                              <PinOff className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                            </button>

                            <button
                              type="button"
                              onClick={() => openProject(p.id)}
                              className={classNames(
                                "inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2.5 text-sm font-semibold transition",
                                "text-white shadow-sm hover:shadow-md hover:brightness-[0.98]",
                                "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600",
                              )}
                            >
                              Open
                              <ArrowRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200/90 pt-6 dark:border-gray-700">
                  <div className="mb-3">
                    <SectionLabel>Recent</SectionLabel>
                    <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                      Jump back to where you left off.
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-[10px] border border-gray-300/85 bg-white dark:border-gray-700 dark:bg-slate-900">
                    <div
                      className={classNames(
                        "grid grid-cols-12 gap-0 px-4 py-3.5",
                        "bg-gray-50 text-gray-700 dark:bg-slate-800/70 dark:text-gray-200",
                      )}
                    >
                      <div className="col-span-5 text-xs font-semibold uppercase tracking-[0.12em]">Project</div>
                      <div className="col-span-4 hidden text-xs font-semibold uppercase tracking-[0.12em] md:block">
                        Description
                      </div>
                      <div className="col-span-3 text-right text-xs font-semibold uppercase tracking-[0.12em]">
                        Updated
                      </div>
                    </div>

                    <div className="divide-y divide-gray-200/90 dark:divide-gray-700">
                      {recentProjects.map((p) => {
                        const isPinned = pinnedIds.some((x) => String(x) === String(p.id));
                        return (
                          <div
                            key={p.id}
                            className={classNames(
                              "grid grid-cols-12 items-center gap-0 px-4 py-4 transition",
                              "hover:bg-gray-50 dark:hover:bg-slate-800/60",
                            )}
                          >
                            <div className="col-span-5 min-w-0">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => togglePin(p.id)}
                                  className={classNames(
                                    "inline-flex items-center justify-center rounded-[10px] p-2 transition",
                                    isPinned
                                      ? "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/45"
                                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700",
                                  )}
                                  title={isPinned ? "Unpin" : "Pin"}
                                >
                                  {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openProject(p.id)}
                                  className="min-w-0 truncate text-left text-[15px] font-medium text-gray-950 hover:underline dark:text-white"
                                >
                                  {p.name}
                                </button>
                              </div>
                            </div>

                            <div className="col-span-4 hidden min-w-0 md:block">
                              <div className="line-clamp-1 text-sm text-gray-700 dark:text-gray-300">
                                {p.description?.trim() ? p.description : "—"}
                              </div>
                            </div>

                            <div className="col-span-3 text-right">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {formatDateTime(p.updatedAt ?? p.createdAt)}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {recentProjects.length === 0 ? (
                        <div className="px-4 py-4 text-sm leading-6 text-gray-700 dark:text-gray-300">
                          No recent unpinned projects match your search.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Surface>
        </div>
      </div>
    </>
  );
}