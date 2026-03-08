// src/components/projects/NewProjectModal.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useProjectService } from "@/ProjectServiceContext";
import { PlusCircle, X } from "lucide-react";

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate?: (proj: any) => void;
}

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

export default function NewProjectModal({ open, onClose, onCreate }: NewProjectModalProps) {
  const svc = useProjectService();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setLoading(false);
      setErrorMsg("");
    }
  }, [open]);

  useEffect(() => {
    if (open) {
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

  const onOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !(e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCreate();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={onOverlayClick}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
      aria-describedby="new-project-desc"
    >
      <div
        ref={dialogRef}
        className={classNames(
          "relative w-full max-w-md overflow-hidden rounded-2xl border p-5 shadow-2xl",
          "border-gray-200/70 bg-white/90 backdrop-blur",
          "dark:border-gray-800/80 dark:bg-gray-900/90",
          "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[1px] before:content-['']",
          "before:bg-gradient-to-r before:from-indigo-500/40 before:via-sky-500/30 before:to-cyan-500/40",
          "after:pointer-events-none after:absolute after:inset-0 after:content-['']",
          "after:bg-gradient-to-br after:from-indigo-500/[0.06] after:via-transparent after:to-cyan-500/[0.06]",
          "dark:after:from-indigo-400/[0.10] dark:after:to-cyan-400/[0.10]",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/15 via-sky-500/10 to-cyan-500/15 text-indigo-700 dark:text-indigo-200">
                <PlusCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="new-project-title" className="text-base font-semibold text-gray-900 dark:text-white">
                  New project
                </h3>
                <p id="new-project-desc" className="text-sm text-gray-600 dark:text-gray-300">
                  Create a new project with a name and optional description.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={classNames(
                "inline-flex items-center justify-center rounded-xl border p-2 transition",
                "border-gray-200/70 bg-white/70 text-gray-700 hover:shadow-sm",
                "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-200",
                loading ? "opacity-60" : "",
              )}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Name <span className="text-red-500">*</span>
              <input
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Project name"
                className={classNames(
                  "mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none transition",
                  "border-gray-200/70 bg-white/80 text-gray-900 placeholder:text-gray-400",
                  "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                  "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white dark:placeholder:text-gray-500",
                )}
                aria-invalid={!!errorMsg}
                aria-describedby={errorMsg ? "new-project-error" : undefined}
                maxLength={120}
              />
            </label>

            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Description <span className="text-gray-400 font-medium">(optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="A short description"
                className={classNames(
                  "mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none transition",
                  "border-gray-200/70 bg-white/80 text-gray-900 placeholder:text-gray-400",
                  "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                  "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white dark:placeholder:text-gray-500",
                )}
                rows={3}
                maxLength={2000}
              />
            </label>

            {errorMsg && (
              <div id="new-project-error" className="text-sm text-red-600 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className={classNames(
                  "rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60",
                  "border-gray-200/70 bg-white/70 text-gray-700 hover:shadow-sm",
                  "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-200",
                )}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleCreate}
                disabled={loading}
                className={classNames(
                  "rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60",
                  "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600 hover:brightness-[0.98] hover:shadow-md",
                )}
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}