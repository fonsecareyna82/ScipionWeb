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

/**
 * normalizeProject:
 * Takes any "project-like" object coming from the backend and converts it
 * into our internal Project shape.
 * This is used for initial loading AND for newly created projects.
 */
function normalizeProject(raw: any): Project {
  const p = raw ?? {};

  const createdRaw = p.createdAt ?? p.created_at;
  const updatedRaw = p.updatedAt ?? p.updated_at;

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
  } as Project;
}

interface ProjectsPageProps {
  // Optional injection of a ProjectService (useful for tests/mocks).
  service?: ProjectService;
  // Optional injection of a custom fetchList() (also for tests/mocks).
  fetchList?: () => Promise<Project[]>;
}

export default function Projects({ service, fetchList }: ProjectsPageProps) {
  // Prefer the injected service if provided; otherwise take it from context.
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

  /**
   * Close the dropdown menu if the user clicks outside of it.
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /**
   * Fetch project list on mount.
   * We accept several possible response shapes:
   *   - [ {...}, {...} ]
   *   - { results: [ {...}, {...} ] }
   *   - { someId: {...}, otherId: {...} }  (dictionary-like)
   *
   * Everything is normalized via normalizeProject() before storing.
   */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const raw = await (fetchList ? fetchList() : svc.fetchList());

        let list: any[] = [];
        if (Array.isArray(raw)) {
          list = raw;
        } else if (raw && Array.isArray((raw as any).results)) {
          list = (raw as any).results;
        } else if (raw && typeof raw === "object") {
          // Fallback: assume it's an object whose values are project objects
          list = Object.values(raw);
        }

        const normalized = list.map(normalizeProject);
        setProjects(normalized);
      } catch (err: any) {
        console.error("[Projects] failed to load projects:", err);
        setLoadError(err?.message ?? String(err));
        setProjects([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchList, svc]);

  /**
   * Local search filter.
   * Matches either by project name or project id.
   */
  const filteredProjects = projects.filter((p) => {
    const term = search.toLowerCase();
    return (
      String(p.name ?? "").toLowerCase().includes(term) ||
      String(p.id ?? "").toLowerCase().includes(term)
    );
  });

  /**
   * Handler to delete a project in local state.
   * This assumes the backend deletion succeeded somewhere else
   * (ProjectCard calls onDelete after its own API call).
   */
  const handleDeleteProject = useCallback((id: number | string) => {
    setProjects((prev) => prev.filter((p) => String(p.id) !== String(id)));
  }, []);

  /**
   * Handler to update project name/description after rename.
   * Again, assumes backend rename was successful first.
   */
  const handleRenameProject = useCallback(
    (id: number | string, newName: string, newDescription: string) => {
      setProjects((prev) =>
        prev.map((p) =>
          String(p.id) === String(id)
            ? { ...p, name: newName, description: newDescription }
            : p
        )
      );
    },
    []
  );

  /**
   * handleCreateProject:
   *
   * IMPORTANT:
   * The modal (NewProjectModal) already calls svc.createProject(...) itself.
   * Then it calls onCreate(...) with whatever the backend returned.
   *
   * So here we MUST NOT call svc.createProject again.
   *
   * We only:
   *   1. unwrap the response (some backends return {project:{...}} / {data:{...}} / {result:{...}})
   *   2. normalize it
   *   3. prepend it to "projects"
   *   4. clear the search box so the newly created project is visible
   */
  const handleCreateProject = useCallback((rawCreated: any) => {
    // Unwrap common backend shapes
    const unwrapped =
      (rawCreated &&
        (rawCreated.project ||
          rawCreated.data ||
          rawCreated.result)) ??
      rawCreated;

    const normalized = normalizeProject(unwrapped);

    setProjects((prev) => [normalized, ...prev]);

    // Clear any active search filter, so the new project is not hidden
    setSearch("");
  }, []);

  return (
    <>
      <PageMeta title="Scipion | Projects" description="Projects page" />
      <PageBreadcrumb pageTitle="Projects" />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        {/* Top bar: search input + dropdown button */}
        <div className="flex items-center justify-between mb-6 w-full">
          {/* Search input */}
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
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

          {/* Dropdown trigger (New project / Import / etc.) */}
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
                      // TODO: implement import project flow
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
                      // TODO: implement import workflow flow
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <CloudDownload className="shrink-0 w-4 h-4 text-gray-500 dark:text-white" />
                      <span className="whitespace-nowrap">
                        Import workflow
                      </span>
                    </div>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Projects grid */}
        <div className="flex flex-wrap gap-6 items-stretch">
          {/* Loading state */}
          {loading && (
            <p className="w-full text-center text-gray-500">
              Loading projects...
            </p>
          )}

          {/* Error state */}
          {!loading && loadError && (
            <p className="w-full text-center text-red-500">
              Error loading projects: {loadError}
            </p>
          )}

          {/* Empty state (after filtering) */}
          {!loading && !loadError && filteredProjects.length === 0 && (
            <p className="w-full text-center text-gray-500">
              No projects found.
            </p>
          )}

          {/* Normal state */}
          {!loading &&
            !loadError &&
            filteredProjects.map((project) => (
              <div key={String(project.id)} className="w-full sm:w-[550px]">
                <ProjectCard
                  id={project.id}
                  label={project.name}
                  value={project.protocolsCount ?? "0"}
                  createdAt={
                    project.createdAt ? String(project.createdAt) : undefined
                  }
                  diskUsage={project.diskUsage?.toString()}
                  isSelected={selectedLabel === project.name}
                  onSelect={() => setSelectedLabel(project.name)}
                  isExpanded={expandedLabel === project.name}
                  description={
                    project.description ?? "No description available."
                  }
                  onToggleExpand={() =>
                    setExpandedLabel((prev) =>
                      prev === project.name ? null : project.name
                    )
                  }
                  onDelete={handleDeleteProject}
                  onRename={handleRenameProject}
                />
              </div>
            ))}
        </div>
      </div>

      {/* New project modal:
         - It talks to the backend itself (svc.createProject).
         - After backend success it calls onCreate(...) with the result.
         - We then add that project to local state in handleCreateProject.
      */}
      <NewProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreateProject}
      />
    </>
  );
}
