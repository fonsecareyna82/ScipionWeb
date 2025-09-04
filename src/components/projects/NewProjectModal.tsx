// src/components/projects/NewProjectModal.tsx

import { useState } from "react";
import { PlusIcon } from "@/icons";
import { createProject, Project } from "../../api/projects";

interface NewProjectModalProps {
  onProjectCreated: (project: Project) => void;
}

export default function NewProjectModal({ onProjectCreated }: NewProjectModalProps) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const project = await createProject(name, description);
      onProjectCreated(project);
      setName("");
      setDescription("");
      setShowModal(false);
    } catch (err: any) {
      setError(err.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <li
        className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2"
        onClick={() => setShowModal(true)}
      >
        <PlusIcon className="shrink-0 w-5 h-5 text-gray-500 dark:text-black-400" />
        <span className="whitespace-nowrap">New project</span>
      </li>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black opacity-30"
            onClick={() => setShowModal(false)}
          ></div>

          {/* Modal content */}
          <div className="relative bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md z-50">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Create New Project
            </h2>

            {error && (
              <p className="text-red-400 mb-2">{error}</p>
            )}

            <input
              type="text"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mb-3 px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full mb-3 px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
