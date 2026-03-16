import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import PageMeta from "../../../components/common/PageMeta";
import ProjectCard from "../../../components/projects/ProjectsCard";
import { ChevronDownIcon } from "@/icons";
import NewProjectModal from "@/components/projects/NewProjectModal";
import { useProjectService } from "@/ProjectServiceContext";
import type { ProjectService } from "@/services/ProjectService";
import type { Project } from "@/types/project";
import { CloudDownload, Download, PlusCircle, Search } from "lucide-react";
import ShareProjectModal from "@/components/projects/ShareProjectModal";

/** Tweak this if your header/breadcrumb/top paddings differ */
const GRID_VPORT_OFFSET_PX = 250;

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

type ProjectCardProject = Project & {
  thumbnailUrl?: string | null;
  thumbnailRebuildUrl?: string | null;
  thumbnailItemsUrl?: string | null;
};

/** Normalize any backend project shape into our internal Project type. */
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
    protocols: p.protocols ?? p.protocolsMap ?? undefined,
    isShared: isSharedFlag,
    isOwner: isOwnerFlag,
    permission: p.permission ?? "full",
    projectOwnerId: p.projectOwnerId ?? p.ownerId ?? p.owner_id ?? null,
    thumbnailUrl: p.thumbnailUrl ?? p.thumbnail_url ?? null,
    thumbnailRebuildUrl: p.thumbnailRebuildUrl ?? p.thumbnail_rebuild_url ?? null,
    thumbnailItemsUrl: p.thumbnailItemsUrl ?? p.thumbnail_items_url ?? null,
  };
}

interface ProjectsPageProps {
  service?: ProjectService;
  fetchList?: () => Promise<Project[]>;
}

function StatCard(props: { label: string; value: React.ReactNode }) {
  return (
    <div
      className={classNames(
        crispText,
        "rounded-xl border p-3 shadow-sm",
        "border-gray-300/80 bg-white",
        "dark:border-gray-700 dark:bg-slate-900",
      )}
    >
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{props.label}</div>
      <div className="mt-1 text-xl font-bold tracking-[-0.01em] text-gray-950 dark:text-white">
        {props.value}
      </div>
    </div>
  );
}

export default function Projects({ service, fetchList }: ProjectsPageProps) {
  const svcFromCtx = useProjectService();
  const svc = service ?? svcFromCtx;

  const [projects, setProjects] = useState<ProjectCardProject[]>([]);
  const [search, setSearch] = useState<string>("");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [shareProject, setShareProject] = useState<{
    id: string | number;
    name: string;
    projectOwnerId: string | number | null;
  } | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const raw = await (fetchList ? fetchList() : svc.fetchList());
      let list: any[] = [];

      if (Array.isArray(raw)) list = raw;
      else if (raw && Array.isArray((raw as any).results)) list = (raw as any).results;
      else if (raw && typeof raw === "object") list = Object.values(raw);

      setProjects(list.map(normalizeProject));
    } catch (err: any) {
      console.error("[Projects] failed to load projects:", err);
      setLoadError(err?.message ?? String(err));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [fetchList, svc]);

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
    void loadProjects();
  }, [loadProjects]);

  const normalizedTerm = search.trim().toLowerCase();

  const filteredProjects = useMemo(() => {
    if (!normalizedTerm) return projects;

    return projects.filter((p) => {
      const name = String(p.name ?? "").toLowerCase();
      const id = String(p.id ?? "").toLowerCase();
      const desc = String(p.description ?? "").toLowerCase();
      return name.includes(normalizedTerm) || id.includes(normalizedTerm) || desc.includes(normalizedTerm);
    });
  }, [projects, normalizedTerm]);

  const stats = useMemo(() => {
    const total = projects.length;
    const shared = projects.filter((p) => Boolean(p.isShared) && !Boolean(p.isOwner)).length;
    const owned = projects.filter((p) => Boolean(p.isOwner)).length;
    return { total, shared, owned };
  }, [projects]);

  const handleDeleteProject = useCallback((id: number | string) => {
    setProjects((prev) => prev.filter((p) => String(p.id) !== String(id)));
  }, []);

  const handleRenameProject = useCallback(
    (id: number | string, newName: string, newDescription: string) => {
      setProjects((prev) =>
        prev.map((p) =>
          String(p.id) === String(id) ? { ...p, name: newName, description: newDescription } : p,
        ),
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

  return (
    <>
      <PageMeta title="Scipion | Projects" description="Projects page" />

      <div
        className={classNames(
          crispText,
          "relative overflow-hidden rounded-2xl border p-5 shadow-sm",
          "border-gray-300/90 bg-white",
          "dark:border-gray-700 dark:bg-slate-900",
          "lg:p-6",
        )}
      >
        <div className="relative">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold tracking-[0.01em] text-gray-950 dark:text-white">
                  Projects
                </h3>
                <span className="rounded-full border border-gray-300/80 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-800 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200">
                  {stats.total}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">
                Browse your projects, open workflows, and manage sharing.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowDropdown((prev) => !prev)}
                  className={classNames(
                    "inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-semibold transition",
                    "text-white shadow-sm hover:shadow-md hover:brightness-[0.98]",
                    "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600",
                  )}
                >
                  <span className="whitespace-nowrap">Actions</span>
                  <ChevronDownIcon className="h-5 w-5 opacity-90" />
                </button>

                {showDropdown && (
                  <div
                    className={classNames(
                      crispText,
                      "absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border shadow-xl",
                      "border-gray-300/90 bg-white",
                      "dark:border-gray-700 dark:bg-slate-900",
                    )}
                  >
                    <ul className="text-sm text-gray-800 dark:text-gray-200">
                      <li>
                        <button
                          type="button"
                          className={classNames(
                            "flex w-full items-center gap-2 px-4 py-3 text-left transition",
                            "hover:bg-gray-50 dark:hover:bg-slate-800/70",
                          )}
                          onClick={() => {
                            setShowDropdown(false);
                            setShowCreate(true);
                          }}
                        >
                          <PlusCircle className="h-4 w-4" />
                          <span>New project</span>
                        </button>
                      </li>

                      <li>
                        <button
                          type="button"
                          className={classNames(
                            "flex w-full items-center gap-2 px-4 py-3 text-left transition",
                            "hover:bg-gray-50 dark:hover:bg-slate-800/70",
                          )}
                          onClick={() => {
                            setShowDropdown(false);
                            console.log("Import Project");
                          }}
                        >
                          <Download className="h-4 w-4" />
                          <span>Import project</span>
                        </button>
                      </li>

                      <li>
                        <button
                          type="button"
                          className={classNames(
                            "flex w-full items-center gap-2 px-4 py-3 text-left transition",
                            "hover:bg-gray-50 dark:hover:bg-slate-800/70",
                          )}
                          onClick={() => {
                            setShowDropdown(false);
                            console.log("Import Workflow");
                          }}
                        >
                          <CloudDownload className="h-4 w-4" />
                          <span>Import workflow</span>
                        </button>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                <input
                  type="text"
                  placeholder="Search projects…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={classNames(
                    crispText,
                    "w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm font-medium outline-none transition",
                    "border-gray-300/80 bg-white text-gray-950 placeholder:text-gray-400",
                    "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                    "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500",
                    "dark:focus:border-indigo-400/40 dark:focus:ring-indigo-400/15",
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:col-span-6 sm:grid-cols-3">
              <StatCard label="Total" value={stats.total} />
              <StatCard label="Owned" value={stats.owned} />
              <StatCard label="Shared" value={stats.shared} />
            </div>
          </div>

          <div
            className="overscroll-contain"
            style={{
              height: `calc(100vh - ${GRID_VPORT_OFFSET_PX}px)`,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              paddingRight: 4,
            }}
          >
            {loading && (
              <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={classNames(
                      "h-[210px] animate-pulse rounded-2xl border p-5 shadow-sm",
                      "border-gray-300/80 bg-white",
                      "dark:border-gray-700 dark:bg-slate-900",
                    )}
                  >
                    <div className="h-5 w-2/3 rounded bg-gray-200 dark:bg-slate-700" />
                    <div className="mt-3 h-4 w-1/2 rounded bg-gray-200 dark:bg-slate-700" />
                    <div className="mt-6 h-12 rounded bg-gray-100 dark:bg-slate-800" />
                    <div className="mt-3 h-4 w-1/3 rounded bg-gray-200 dark:bg-slate-700" />
                  </div>
                ))}
              </div>
            )}

            {!loading && loadError && (
              <div className="rounded-2xl border border-red-200/80 bg-red-50 p-4 text-sm leading-6 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                Error loading projects: {loadError}
              </div>
            )}

            {!loading && !loadError && filteredProjects.length === 0 && (
              <div className="rounded-2xl border border-gray-300/80 bg-white p-6 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300">
                No projects found.
              </div>
            )}

            {!loading && !loadError && filteredProjects.length > 0 && (
              <div
                className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3"
                aria-label="Projects list"
              >
                {filteredProjects.map((project) => (
                  <div key={String(project.id)} className="mt-2 h-full">
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
                      projectOwnerId={project.projectOwnerId ?? null}
                      thumbnailUrl={project.thumbnailUrl ?? null}
                      thumbnailRebuildUrl={project.thumbnailRebuildUrl ?? null}
                      thumbnailItemsUrl={project.thumbnailItemsUrl ?? null}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <NewProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreateProject}
      />

      <ShareProjectModal
        open={!!shareProject}
        projectId={shareProject?.id ?? null}
        projectName={shareProject?.name}
        projectOwnerId={shareProject?.projectOwnerId ?? undefined}
        onClose={() => setShareProject(null)}
      />
    </>
  );
}