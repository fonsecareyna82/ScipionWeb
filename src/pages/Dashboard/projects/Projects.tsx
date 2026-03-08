// src/pages/projects/Projects.tsx
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import PageBreadcrumb from "../../../components/common/PageBreadCrumb";
import PageMeta from "../../../components/common/PageMeta";
import ProjectCard from "../../../components/projects/ProjectsCard";
import { ChevronDownIcon } from "@/icons";
import NewProjectModal from "@/components/projects/NewProjectModal";
import { useProjectService } from "@/ProjectServiceContext";
import type { ProjectService } from "@/services/ProjectService";
import { Project } from "@/types/project";
import { CloudDownload, Download, PlusCircle, Search, RefreshCw } from "lucide-react";
import ShareProjectModal from "@/components/projects/ShareProjectModal";

/** Tweak this if your header/breadcrumb/top paddings differ */
const GRID_VPORT_OFFSET_PX = 250;

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

/** Normalize any backend project shape into our internal Project type. */
function normalizeProject(raw: any): Project {
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
  } as Project;
}

interface ProjectsPageProps {
  service?: ProjectService;
  fetchList?: () => Promise<Project[]>;
}

export default function Projects({ service, fetchList }: ProjectsPageProps) {
  const svcFromCtx = useProjectService();
  const svc = service ?? svcFromCtx;

  const [projects, setProjects] = useState<Project[]>([]);
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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch projects on mount
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

  // Local removal after backend deletion
  const handleDeleteProject = useCallback((id: number | string) => {
    setProjects((prev) => prev.filter((p) => String(p.id) !== String(id)));
  }, []);

  // Local rename after backend rename
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

  // After modal created a project successfully (modal already calls svc.createProject)
  const handleCreateProject = useCallback((rawCreated: any) => {
    const unwrapped = (rawCreated && (rawCreated.project || rawCreated.data || rawCreated.result)) ?? rawCreated;
    const normalized = normalizeProject(unwrapped);
    setProjects((prev) => [normalized, ...prev]);
    setSearch("");
  }, []);

  const handleShareProject = useCallback((id: number | string, name: string, projectOwnerId: number | string | null) => {
    setShareProject({ id, name, projectOwnerId: projectOwnerId ?? null });
  }, []);

  return (
    <>
      <PageMeta title="Scipion | Projects" description="Projects page" />
      <PageBreadcrumb pageTitle="Projects" />

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
          {/* Header row */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Projects</h3>
                <span className="rounded-full border border-indigo-500/20 bg-indigo-500/[0.08] px-2 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-400/[0.12] dark:text-indigo-200">
                  {stats.total}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Browse your projects, open workflows, and manage sharing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
              {/*
              <button
                type="button"
                onClick={() => void loadProjects()}
                className={classNames(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                  "border-gray-200/70 bg-white/70 text-gray-800 shadow-sm hover:border-gray-300/80 hover:shadow-md",
                  "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white/90 dark:hover:border-gray-700",
                  "hover:bg-gradient-to-br hover:from-indigo-500/[0.06] hover:via-transparent hover:to-cyan-500/[0.06]",
                  loading ? "pointer-events-none opacity-70" : "",
                )}
                title="Reload projects"
              >
                <RefreshCw className={classNames("h-4 w-4", loading ? "animate-spin" : "")} />
                Reload
              </button>
              */}

              {/* Actions dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowDropdown((prev) => !prev)}
                  className={classNames(
                    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
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
                      "absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border shadow-xl z-50",
                      "border-gray-200/70 bg-white/90 backdrop-blur",
                      "dark:border-gray-800/80 dark:bg-gray-900/90",
                    )}
                  >
                    <ul className="text-sm text-gray-700 dark:text-gray-200">
                      <li>
                        <button
                          type="button"
                          className={classNames(
                            "w-full px-4 py-3 flex items-center gap-2 text-left transition",
                            "hover:bg-gradient-to-r hover:from-indigo-500/[0.06] hover:via-transparent hover:to-cyan-500/[0.06]",
                            "dark:hover:from-indigo-400/[0.10] dark:hover:to-cyan-400/[0.10]",
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
                            "w-full px-4 py-3 flex items-center gap-2 text-left transition",
                            "hover:bg-gradient-to-r hover:from-indigo-500/[0.06] hover:via-transparent hover:to-cyan-500/[0.06]",
                            "dark:hover:from-indigo-400/[0.10] dark:hover:to-cyan-400/[0.10]",
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
                            "w-full px-4 py-3 flex items-center gap-2 text-left transition",
                            "hover:bg-gradient-to-r hover:from-indigo-500/[0.06] hover:via-transparent hover:to-cyan-500/[0.06]",
                            "dark:hover:from-indigo-400/[0.10] dark:hover:to-cyan-400/[0.10]",
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

          {/* Search + stats */}
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search projects…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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

            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                className={classNames(
                  "rounded-xl border p-3 shadow-sm",
                  "border-gray-200/70 bg-white/70",
                  "dark:border-gray-800/80 dark:bg-white/[0.02]",
                  "border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] via-transparent to-transparent dark:from-indigo-400/[0.12]",
                )}
              >
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">Total</div>
                <div className="mt-1 text-lg font-bold text-gray-800 dark:text-white/90">{stats.total}</div>
              </div>

              <div
                className={classNames(
                  "rounded-xl border p-3 shadow-sm",
                  "border-gray-200/70 bg-white/70",
                  "dark:border-gray-800/80 dark:bg-white/[0.02]",
                  "border-sky-500/20 bg-gradient-to-br from-sky-500/[0.08] via-transparent to-transparent dark:from-sky-400/[0.12]",
                )}
              >
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">Owned</div>
                <div className="mt-1 text-lg font-bold text-gray-800 dark:text-white/90">{stats.owned}</div>
              </div>

              <div
                className={classNames(
                  "rounded-xl border p-3 shadow-sm",
                  "border-gray-200/70 bg-white/70",
                  "dark:border-gray-800/80 dark:bg-white/[0.02]",
                  "border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.08] via-transparent to-transparent dark:from-cyan-400/[0.12]",
                )}
              >
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">Shared</div>
                <div className="mt-1 text-lg font-bold text-gray-800 dark:text-white/90">{stats.shared}</div>
              </div>
            </div>
          </div>

          {/* Scroll container */}
          <div
            className="overscroll-contain"
            style={{
              height: `calc(100vh - ${GRID_VPORT_OFFSET_PX}px)`,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              paddingRight: 4,
            }}
          >
            {/* States */}
            {loading && (
              <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-start">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={classNames(
                      "h-[210px] rounded-2xl border p-5 shadow-sm animate-pulse",
                      "border-gray-200/70 bg-white/70",
                      "dark:border-gray-800/80 dark:bg-white/[0.02]",
                    )}
                  >
                    <div className="h-5 w-2/3 rounded bg-gray-200/70 dark:bg-gray-800/70" />
                    <div className="mt-3 h-3 w-1/2 rounded bg-gray-200/70 dark:bg-gray-800/70" />
                    <div className="mt-6 h-12 rounded bg-gray-200/50 dark:bg-gray-800/50" />
                    <div className="mt-3 h-3 w-1/3 rounded bg-gray-200/70 dark:bg-gray-800/70" />
                  </div>
                ))}
              </div>
            )}

            {!loading && loadError && (
              <div className="rounded-2xl border border-red-200/70 bg-red-50/80 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                Error loading projects: {loadError}
              </div>
            )}

            {!loading && !loadError && filteredProjects.length === 0 && (
              <div className="rounded-2xl border border-gray-200/70 bg-white/70 p-6 text-sm text-gray-600 dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-400">
                No projects found.
              </div>
            )}

            {!loading && !loadError && filteredProjects.length > 0 && (
              <div
                className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-start"
                aria-label="Projects list"
              >
                {filteredProjects.map((project) => (
                  <div key={String(project.id)} className="h-full mt-2">
                    <ProjectCard
                      id={project.id}
                      label={project.name}
                      value={project.protocolsCount ?? "0"}
                      createdAt={project.createdAt ? String(project.createdAt) : undefined}
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
                      onShare={(id) => handleShareProject(id, project.name, project.projectOwnerId ?? null)}
                      isShared={project.isShared}
                      isOwner={project.isOwner}
                      permission={project.permission?.toString()}
                      projectOwnerId={project.projectOwnerId ?? null}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <NewProjectModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreateProject} />

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