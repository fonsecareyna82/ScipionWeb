import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CalendarDays, Database, FolderOpen, Hash, Layers3 } from "lucide-react";

import ProjectAction from "./ProjectActions";
import { useProjectService } from "@/ProjectServiceContext";

interface ProjectListRowProps {
  id: string | number;
  name: string;
  description?: string | null;
  protocolsCount?: string | number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  diskUsage?: string | number | null;
  status?: string | null;
  isSelected?: boolean;
  onSelect?: () => void;
  onDelete?: (id: string | number) => void;
  onRename?: (id: string | number, newName: string, newDescription: string) => void;
  onShare?: (id: string | number) => void;
  isShared?: boolean | string | number | null;
  isOwner?: boolean | string | number | null;
  permission?: string | null;
}

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

function normalizeBooleanFlag(value: boolean | string | number | undefined | null): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "owner" || v === "yes";
  }
  return false;
}

function formatDateShort(raw?: string | Date | null): string {
  if (!raw) return "—";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function getStatusToneClasses(raw?: string | null): string {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!value) {
    return classNames(
      "border-gray-300/80 bg-white text-gray-700",
      "dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200",
    );
  }

  if (
    value.includes("done") ||
    value.includes("finished") ||
    value.includes("complete") ||
    value.includes("success")
  ) {
    return classNames(
      "border-emerald-300/80 bg-emerald-50 text-emerald-800",
      "dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200",
    );
  }

  if (
    value.includes("running") ||
    value.includes("active") ||
    value.includes("progress") ||
    value.includes("queue")
  ) {
    return classNames(
      "border-sky-300/80 bg-sky-50 text-sky-800",
      "dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200",
    );
  }

  if (value.includes("fail") || value.includes("error") || value.includes("stopped") || value.includes("aborted")) {
    return classNames(
      "border-rose-300/80 bg-rose-50 text-rose-800",
      "dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-200",
    );
  }

  return classNames(
    "border-violet-300/80 bg-violet-50 text-violet-800",
    "dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-200",
  );
}

function DialogShell(props: { children: React.ReactNode; onClose: () => void }) {
  const portalRoot = typeof document !== "undefined" ? document.body : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props]);

  const dialog = (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
      onMouseDown={props.onClose}
    >
      <div
        className={classNames(
          crispText,
          "w-full max-w-lg rounded-2xl border p-5 shadow-2xl",
          "border-gray-300/90 bg-white text-gray-950",
          "dark:border-gray-700 dark:bg-slate-900 dark:text-white",
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {props.children}
      </div>
    </div>
  );

  return portalRoot ? createPortal(dialog, portalRoot) : dialog;
}

export default function ProjectListRow(props: ProjectListRowProps) {
  const {
    id,
    name,
    description,
    protocolsCount,
    createdAt,
    updatedAt,
    diskUsage,
    status,
    isSelected,
    onSelect,
    onDelete,
    onRename,
    onShare,
    isShared,
    isOwner,
    permission,
  } = props;

  const navigate = useNavigate();
  const svc = useProjectService();

  const [isRenaming, setIsRenaming] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [newName, setNewName] = useState(name);
  const [newDescription, setNewDescription] = useState(description ?? "");
  const [errorMessage, setErrorMessage] = useState("");

  const normalizedIsOwner = normalizeBooleanFlag(isOwner);
  const normalizedIsShared = normalizeBooleanFlag(isShared);
  const canModify = normalizedIsOwner;

  const projectIdLabel = useMemo(() => `P${String(id)}`, [id]);

  const accessLabel = useMemo(() => {
    if (normalizedIsShared && !normalizedIsOwner) {
      return permission?.trim() ? `Shared · ${permission}` : "Shared";
    }
    if (permission?.trim()) return permission;
    return normalizedIsOwner ? "Owner" : "Private";
  }, [normalizedIsOwner, normalizedIsShared, permission]);

  const statusLabel = String(status ?? "").trim() || "unknown";

  useEffect(() => {
    setNewName(name);
    setNewDescription(description ?? "");
  }, [name, description]);

  const handleOpen = useCallback(() => {
    navigate(`/project/load/${encodeURIComponent(String(id))}`);
  }, [id, navigate]);

  const handleRename = useCallback(() => {
    setNewName(name);
    setNewDescription(description ?? "");
    setErrorMessage("");
    setIsRenaming(true);
  }, [name, description]);

  const handleShare = useCallback(() => {
    if (!canModify) return;
    onShare?.(id);
  }, [canModify, id, onShare]);

  const handleRenameSubmit = useCallback(async () => {
    const cleanName = newName.trim();
    const cleanDescription = newDescription.trim();

    if (!cleanName) {
      setErrorMessage("Project name cannot be empty.");
      return;
    }

    if (cleanDescription && cleanDescription.length < 3) {
      setErrorMessage("Description must be at least 3 characters.");
      return;
    }

    try {
      await svc.renameProject(String(id), cleanName, cleanDescription);
      toast.success("Project renamed successfully");
      setIsRenaming(false);
      setErrorMessage("");
      onRename?.(id, cleanName, cleanDescription);
    } catch (error: any) {
      toast.error(error?.message || "Failed to rename project");
      setErrorMessage("Failed to update project.");
    }
  }, [svc, id, newName, newDescription, onRename]);

  const confirmRemove = useCallback(async () => {
    try {
      await svc.deleteProject(String(id));
      toast.success(`Project "${name}" deleted successfully`);
      setShowDeleteModal(false);
      onDelete?.(id);
    } catch (error: any) {
      toast.error(error?.message || "Error deleting project");
    }
  }, [svc, id, name, onDelete]);

  return (
    <>
      <div
        tabIndex={0}
        role="button"
        onClick={onSelect}
        onDoubleClick={handleOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter") handleOpen();
        }}
        className={classNames(
          crispText,
          "group grid cursor-pointer grid-cols-1 gap-3 rounded-2xl border px-4 py-4 transition-all duration-200",
          "border-slate-200/90 bg-white shadow-sm hover:border-slate-300 hover:shadow-md",
          "dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-slate-700",
          "xl:grid-cols-[minmax(260px,1fr)_120px_120px_150px_130px_52px] xl:items-center",
          isSelected ? "border-indigo-400 ring-2 ring-indigo-500/15 dark:border-indigo-600" : "",
        )}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={classNames(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm",
                "border-indigo-200 bg-indigo-50 text-indigo-700",
                "dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200",
              )}
            >
              <FolderOpen className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className="truncate text-[15px] font-semibold tracking-[0.01em] text-slate-950 dark:text-white"
                  title={name}
                >
                  {name}
                </span>
                <span className="rounded-full border border-indigo-300/80 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200">
                  {projectIdLabel}
                </span>
              </div>

              <p className="mt-1 line-clamp-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {description?.trim() || "No description available."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <Layers3 className="h-4 w-4 text-slate-400" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-500">
              Protocols
            </div>
            <div className="font-semibold text-slate-950 dark:text-white">{protocolsCount ?? "0"}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-500">
              Updated
            </div>
            <div className="font-medium text-slate-950 dark:text-white">{formatDateShort(updatedAt ?? createdAt)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <Database className="h-4 w-4 text-slate-400" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-500">
              Storage
            </div>
            <div className="font-medium text-slate-950 dark:text-white">{diskUsage ?? "—"}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={classNames(
              "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
              getStatusToneClasses(statusLabel),
            )}
          >
            {statusLabel}
          </span>
          <span className="inline-flex rounded-full border border-slate-300/80 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {accessLabel}
          </span>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleOpen();
            }}
            className="hidden h-9 items-center gap-2 rounded-xl border border-slate-300/80 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 xl:inline-flex"
          >
            <Hash className="h-3.5 w-3.5" />
            Open
          </button>

          <ProjectAction
            onOpen={handleOpen}
            onRename={canModify ? handleRename : undefined}
            onRemove={canModify ? () => setShowDeleteModal(true) : undefined}
            onShare={canModify ? handleShare : undefined}
          />
        </div>
      </div>

      {isRenaming ? (
        <DialogShell onClose={() => setIsRenaming(false)}>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Rename project</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Update the project name and description.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Name
              </label>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Description
              </label>
              <textarea
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            {errorMessage ? <p className="text-sm font-medium text-red-600 dark:text-red-300">{errorMessage}</p> : null}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsRenaming(false)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRenameSubmit}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Save changes
            </button>
          </div>
        </DialogShell>
      ) : null}

      {showDeleteModal ? (
        <DialogShell onClose={() => setShowDeleteModal(false)}>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Delete project</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              This will delete <span className="font-semibold text-slate-950 dark:text-white">{name}</span>. This action cannot be undone.
            </p>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRemove}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </DialogShell>
      ) : null}
    </>
  );
}
