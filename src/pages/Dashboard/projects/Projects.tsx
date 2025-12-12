// src/pages/projects/Projects.tsx
import { useEffect, useState, useRef, useCallback } from "react";
import PageBreadcrumb from "../../../components/common/PageBreadCrumb";
import PageMeta from "../../../components/common/PageMeta";
import ProjectCard from "../../../components/projects/ProjectsCard";
import { ChevronDownIcon } from "@/icons";
import NewProjectModal from "@/components/projects/NewProjectModal";
import { useProjectService } from "@/ProjectServiceContext";
import type { ProjectService } from "@/services/ProjectService";
import { Project } from "@/types/project";
import { CloudDownload, Download, PlusCircle } from "lucide-react";
import ShareProjectModal from "@/components/projects/ShareProjectModal";

/** Tweak this if your header/breadcrumb/top paddings differ */
const GRID_VPORT_OFFSET_PX = 220;

/** Normalize any backend project shape into our internal Project type. */
function normalizeProject(raw: any): Project {
  const p = raw ?? {};
  const createdRaw = p.createdAt ?? p.created_at;
  const updatedRaw = p.updatedAt ?? p.updated_at;

  // Normalize flags from backend
  const isSharedFlag = Boolean(p.isShared);
  const isOwnerFlag =
    p.isOwner !== undefined && p.isOwner !== null
      ? Boolean(p.isOwner)
      : !isSharedFlag; // fallback: si no hay isOwner, asumimos que no compartido => owner

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
      p.protocolsCount ??
      p.protocols_count ??
      (Array.isArray(p.protocols) ? p.protocols.length : 0),
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
    projectOwnerId: string | number;
  } | null>(null);

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
    (async () => {
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
    })();
  }, [fetchList, svc]);

  // Local search
  const filteredProjects = projects.filter((p) => {
    const term = search.toLowerCase();
    return (
      String(p.name ?? "").toLowerCase().includes(term) ||
      String(p.id ?? "").toLowerCase().includes(term)
    );
  });

  // Local removal after backend deletion
  const handleDeleteProject = useCallback((id: number | string) => {
    setProjects((prev) => prev.filter((p) => String(p.id) !== String(id)));
  }, []);

  // Local rename after backend rename
  const handleRenameProject = useCallback((id: number | string, newName: string, newDescription: string) => {
    setProjects((prev) =>
      prev.map((p) => (String(p.id) === String(id) ? { ...p, name: newName, description: newDescription } : p))
    );
  }, []);

  // After modal created a project successfully (modal already calls svc.createProject)
  const handleCreateProject = useCallback((rawCreated: any) => {
    const unwrapped = (rawCreated && (rawCreated.project || rawCreated.data || rawCreated.result)) ?? rawCreated;
    const normalized = normalizeProject(unwrapped);
    setProjects((prev) => [normalized, ...prev]);
    setSearch("");
  }, []);

  const handleShareProject = useCallback((id: number | string, name: string, projectOwnerId: number | string,) => {
    setShareProject({ id, name, projectOwnerId });
  }, []);

  return (
    <>
      <PageMeta title="Scipion | Projects" description="Projects page" />
      <PageBreadcrumb pageTitle="Projects" />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 ">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4 w-full">
          {/* Search */}
          <div className="relative w-full max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-gray-400 dark:text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search project..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white text-black"
            />
          </div>

          {/* Dropdown */}
          <div className="relative ml-4" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown((prev) => !prev)}
              className="px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:text-white bg-green-200 hover:bg-green-300 dark:hover:bg-gray-700"
            >
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap mr-2">Projects</span>
                <ChevronDownIcon className="shrink-0 w-5 h-5 text-gray-500 dark:text-black-400" />
              </div>
            </button>

            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50">
                <ul className="text-sm text-gray-700 dark:text-gray-200">
                  <li
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => {
                      setShowDropdown(false);
                      setShowCreate(true);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <PlusCircle className="shrink-0 w-4 h-4 text-gray-500 dark:text-white" />
                      <span className="whitespace-nowrap">New project</span>
                    </div>
                  </li>
                  <li
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => {
                      setShowDropdown(false);
                      console.log("Import Project");
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Download className="shrink-0 w-4 h-4 text-gray-500 dark:text-white" />
                      <span className="whitespace-nowrap">Import project</span>
                    </div>
                  </li>
                  <li
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => {
                      setShowDropdown(false);
                      console.log("Import Workflow");
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <CloudDownload className="shrink-0 w-4 h-4 text-gray-500 dark:text-white" />
                      <span className="whitespace-nowrap">Import workflow</span>
                    </div>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Scroll container: always vertical scroll available on mobile */}
        <div
          className="overscroll-contain"
          style={{
            height: `calc(100vh - ${GRID_VPORT_OFFSET_PX}px)`,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            paddingRight: 4, // keep content from touching the scrollbar
          }}
        >
          {/* Projects grid — left aligned, responsive columns */}
          <div
            className="
              grid gap-6
              grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
              items-start
            "
            aria-label="Projects list"
          >
            {loading && (
              <p className="col-span-full text-center text-gray-500">Loading projects...</p>
            )}

            {!loading && loadError && (
              <p className="col-span-full text-center text-red-500">
                Error loading projects: {loadError}
              </p>
            )}

            {!loading && !loadError && filteredProjects.length === 0 && (
              <p className="col-span-full text-center text-gray-500">No projects found.</p>
            )}

            {!loading &&
              !loadError &&
              filteredProjects.map((project) => (
                <div key={String(project.id)} className="h-full">
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
                    onShare={(id) => handleShareProject(id, project.name, project.projectOwnerId)}
                    isShared={project.isShared}
                    isOwner={project.isOwner}
                    permission={project.permission?.toString()}
                    projectOwnerId={project.projectOwnerId}
                  />
                </div>
              ))}
          </div>
        </div>
      </div>

      <NewProjectModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreateProject} />

      <ShareProjectModal
        open={!!shareProject}
        projectId={shareProject?.id ?? null}
        projectName={shareProject?.name}
        projectOwnerId={shareProject?.projectOwnerId}
        onClose={() => setShareProject(null)}
      />
    </>
  );
}
