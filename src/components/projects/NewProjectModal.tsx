// src/components/projects/NewProjectModal.tsx
import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useProjectService } from "@/ProjectServiceContext";

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate?: (proj: any) => void;
}

export default function NewProjectModal({ open, onClose, onCreate }: NewProjectModalProps) {
  const svc = useProjectService();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setLoading(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setLoading(true);
    try {
      const created = await svc.createProject({ name: name.trim(), description: description.trim() });
      toast.success("Project created");
      onCreate?.(created);
      onClose();
    } catch (err) {
      console.error("Failed to create project", err);
      toast.error("Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md shadow-lg">
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">New Project</h3>
        <div className="flex flex-col gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className="w-full px-3 py-2 border rounded-md" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full px-3 py-2 border rounded-md" />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={onClose} className="px-3 py-1 rounded-md bg-gray-200 dark:bg-gray-700">Cancel</button>
            <button onClick={handleCreate} disabled={loading} className="px-3 py-1 rounded-md bg-blue-600 text-white">{loading ? "Creating..." : "Create"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
