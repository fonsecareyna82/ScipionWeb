// src/components/projects/NewProjectModal.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const [errorMsg, setErrorMsg] = useState<string>("");

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setLoading(false);
      setErrorMsg("");
    }
  }, [open]);

  // Focus the name input on open
  useEffect(() => {
    if (open) {
      // microtask ensures the node exists
      queueMicrotask(() => nameInputRef.current?.focus());
    }
  }, [open]);

  const validate = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg("Project name is required.");
      return false;
    }
    if (trimmed.length < 2) {
      setErrorMsg("Project name must be at least 2 characters.");
      return false;
    }
    if (trimmed.length > 120) {
      setErrorMsg("Project name is too long (max 120).");
      return false;
    }
    setErrorMsg("");
    return true;
  }, [name]);

  const handleCreate = useCallback(async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const created = await svc.createProject({
        name: name.trim(),
        description: description.trim(),
      });
      toast.success(`Project "${name}" created successfully`);
      onCreate?.(created);
      onClose();
    } catch (err: any) {
      console.error("Failed to create project", err);
      toast.error(err?.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  }, [svc, name, description, onCreate, onClose, validate]);

  // Close on overlay click (but ignore clicks inside the dialog)
  const onOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  // Escape to close; Enter to submit when focused on inputs
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  // Submit on Enter in inputs (avoid newline submit for textarea unless Ctrl/Cmd+Enter)
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !(e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCreate();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={onOverlayClick}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
      aria-describedby="new-project-desc"
    >
      <div
        ref={dialogRef}
        className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md shadow-lg"
        onMouseDown={(e) => e.stopPropagation()} // prevent overlay close when clicking inside
      >
        <h3 id="new-project-title" className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
          New Project
        </h3>
        <p id="new-project-desc" className="sr-only">
          Create a new project by providing a name and an optional description.
        </p>

        <div className="flex flex-col gap-3">
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Name <span className="text-red-500">*</span>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Project name"
              className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white"
              aria-invalid={!!errorMsg}
              aria-describedby={errorMsg ? "new-project-error" : undefined}
              maxLength={120}
            />
          </label>

          <label className="text-sm text-gray-700 dark:text-gray-300">
            Description <span className="text-gray-400">(optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="A short description"
              className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white"
              rows={3}
              maxLength={2000}
            />
          </label>

          {errorMsg && (
            <div id="new-project-error" className="text-sm text-red-600">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
              className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
