// src/components/projects/NewProjectModal.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

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

  // Drawn on the page's body, above everything (the top bar too), so the dimmed backdrop covers the whole screen
  return createPortal(
    <div
      className={classNames(
        crispText,
        "fixed inset-0 z-[99999] flex items-center justify-center p-4",
        "bg-gray-900/45 backdrop-blur-[2px] dark:bg-black/60",
      )}
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
          crispText,
          "relative w-full max-w-md overflow-hidden rounded-[14px] border shadow-2xl",
          "border-gray-300/90 bg-white",
          "dark:border-gray-700 dark:bg-gray-900",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* A coloured header, so the dialog stands out from the page behind */}
        <div className="flex items-start justify-between gap-3 bg-[#333d49] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-white/10 ring-1 ring-inset ring-white/20">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="new-project-title" className="text-[18px] font-semibold leading-6">
                New project
              </h3>
              <p id="new-project-desc" className="text-[14px] leading-6 text-white/85">
                Create a new project with a name and optional description.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={classNames(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white/85 transition",
              "hover:bg-white/10 hover:text-white",
              loading ? "opacity-60" : "",
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 pt-5 pb-5">
          <label className="text-[14px] font-medium text-gray-700 dark:text-gray-300">
            Name <span className="text-red-500">*</span>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Project name"
              className={classNames(
                crispText,
                "mt-1.5 w-full rounded-[10px] border px-3 py-2.5 text-[14.5px] outline-none transition",
                "border-gray-300 bg-white text-gray-900 placeholder:text-gray-400",
                "focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10",
                "dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-800",
              )}
              aria-invalid={!!errorMsg}
              aria-describedby={errorMsg ? "new-project-error" : undefined}
              maxLength={120}
            />
          </label>

          <label className="text-[14px] font-medium text-gray-700 dark:text-gray-300">
            Description <span className="font-normal text-gray-400">(optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="A short description"
              className={classNames(
                crispText,
                "mt-1.5 w-full resize-none rounded-[10px] border px-3 py-2.5 text-[14.5px] leading-6 outline-none transition",
                "border-gray-300 bg-white text-gray-900 placeholder:text-gray-400",
                "focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10",
                "dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-800",
              )}
              rows={3}
              maxLength={2000}
            />
          </label>

          {errorMsg && (
            <div
              id="new-project-error"
              className="rounded-[10px] border border-red-200/80 bg-red-50 px-3 py-2 text-[14px] leading-6 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
            >
              {errorMsg}
            </div>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={classNames(
                "inline-flex h-10 items-center rounded-[10px] border px-4 text-[14px] font-medium transition disabled:opacity-60",
                "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                "dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200",
              )}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
              className={classNames(
                "inline-flex h-10 items-center rounded-[10px] px-4 text-[14px] font-semibold text-white shadow-sm transition disabled:opacity-60",
                "bg-brand-500 hover:bg-brand-600",
              )}
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}