import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useEffect, useState } from 'react';
import { fetchProjects, Project } from '../../api/projects';
import ProjectCard from "../../components/projects/ProjectsCard";

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(err => console.error(err));
  }, []);

  return (
    <>
      <PageMeta
        title="Projects"
        description="Projects page"
      />
      <PageBreadcrumb pageTitle="Projects" />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          Project List
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              label={project.name}
              value={project.protocolsCount}
              createdAt={project.created_at.toString()}
              diskUsage={project.diskUsage.toString()}
            />
          ))}
        </div>
      </div>
    </>
  );
}
