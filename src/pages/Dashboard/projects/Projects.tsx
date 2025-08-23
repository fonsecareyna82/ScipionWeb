// src/pages/projects/Projects.tsx

import { useEffect, useState, useRef } from "react";
import PageBreadcrumb from "../../../components/common/PageBreadCrumb";
import PageMeta from "../../../components/common/PageMeta";
import { fetchProjects, Project } from "../../../api/projects";
import ProjectCard from "../../../components/projects/ProjectsCard";
import { ChevronDownIcon, DownloadIcon, ImportIcon, PlusIcon, TrashBinIcon } from "@/icons";

export default function Projects() {
  // Estados
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState<string>("");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Carga inicial
  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch((err) => console.error(err));
  }, []);

  // Filtrar por name o id
  const filteredProjects = projects.filter((p) => {
    const term = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.id.toString().toLowerCase().includes(term)
    );
  });

  return (
    <>
      <PageMeta title="Projects" description="Projects page" />
      <PageBreadcrumb pageTitle="Projects" />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">

        {/* Campo de búsqueda con ícono inline */}
        <div className="flex items-center justify-between mb-6 w-full">
          {/* Campo de búsqueda */}
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
              className="
        w-full 
        pl-10 pr-3 py-2 
        border border-gray-300 rounded-md
        focus:outline-none focus:ring-2 focus:ring-blue-500
        dark:bg-gray-800 dark:border-gray-700 dark:text-white
      "
            />
          </div>

          <div className="relative ml-4" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown((prev) => !prev)}
              className="px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:text-white bg-green-200 hover:bg-green-300 dark:hover:bg-gray-700"
            >
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap mr-2 ">Projects</span>
                <ChevronDownIcon className="shrink-0 w-5 h-5 text-gray-500 dark:text-black-400" />
              </div>
            </button>

            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50">
                <ul className="text-sm text-gray-700 dark:text-gray-200">
                  <li
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => console.log("Create Project")}
                  >
                    <div className="flex items-center gap-2">
                      <PlusIcon className="shrink-0 w-5 h-5 text-gray-500 dark:text-black-400" />
                      <span className="whitespace-nowrap">New project</span>
                    </div>
                  </li>
                  <li
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => console.log("Import Project")}
                  >
                    <div className="flex items-center gap-2">
                      <DownloadIcon className="shrink-0 w-5 h-5 text-gray-500 dark:text-black-400" />
                      <span className="whitespace-nowrap">Import project</span>
                    </div>
                  </li>
                  <li
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => console.log("Import Workflow")}
                  >
                    <div className="flex items-center gap-2">
                      <ImportIcon className="shrink-0 w-5 h-5 text-gray-500 dark:text-black-400" />
                      <span className="whitespace-nowrap">Import workflow</span>
                    </div>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Grid de tarjetas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              label={project.name}
              value={project.protocolsCount}
              createdAt={project.created_at.toString()}
              diskUsage={project.diskUsage.toString()}
              isSelected={selectedLabel === project.name}
              onSelect={() => setSelectedLabel(project.name)}
            />
          ))}

          {filteredProjects.length === 0 && (
            <p className="col-span-full text-center text-gray-500">
              No projects found.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
