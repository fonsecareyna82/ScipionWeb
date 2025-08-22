// src/pages/projects/Projects.tsx

import { useEffect, useState } from "react";
import PageBreadcrumb from "../../../components/common/PageBreadCrumb";
import PageMeta from "../../../components/common/PageMeta";
import { fetchProjects, Project } from "../../../api/projects";
import ProjectCard from "../../../components/projects/ProjectsCard";

export default function Projects() {
  // Estados
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState<string>("");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

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
        <div className="relative mb-6 w-full max-w-md">
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
