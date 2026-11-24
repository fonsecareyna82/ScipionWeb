import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CalendarDays, Database, FolderOpen, Layers3 } from "lucide-react";

import ProjectAction from "./ProjectActions";
import { DeleteProjectDialog, RenameProjectDialog } from "./ProjectDialogs";
import { useProjectService } from "@/ProjectServiceContext";
import { projectAccessLabel } from "@/utils/project-access";
import { Pin } from "lucide-react";
import { RunningDot } from "./ProjectStatusSummary";
import { ACTIVE_STATUSES, countIn, formatFullDate, formatRelativeDate } from "@/utils/project-list";

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
  accessVia?: string | null;
  statusCounts?: Record<string, number> | null;
  isPinned?: boolean;
  onTogglePin?: () => void;
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


function getStatusToneClasses(raw?: string | null): string {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!value) {
    return classNames(
      "border-gray-300/80 bg-white text-gray-700",
      "dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200",
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
    accessVia,
    statusCounts,
    isPinned = false,
    onTogglePin,
  } = props;
  const runningCount = countIn(statusCounts, ACTIVE_STATUSES);

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

  const accessLabel = useMemo(
    () => projectAccessLabel({ isOwner: normalizedIsOwner, isShared: normalizedIsShared, permission, accessVia }),
    [normalizedIsOwner, normalizedIsShared, permission, accessVia],
  );

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
          "group grid cursor-pointer grid-cols-1 gap-3 rounded-[10px] border bg-white px-4 py-3.5 outline-none transition-[border-color,box-shadow] duration-200",
          "shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-gray-900",
          "xl:grid-cols-[minmax(260px,1fr)_130px_150px_130px_minmax(160px,220px)_auto] xl:items-center",
          isSelected
            ? "border-brand-400 ring-2 ring-brand-500/15 dark:border-brand-600"
            : "border-gray-300 shadow-[0_1px_3px_rgba(15,23,42,0.08)] hover:border-gray-400 hover:shadow-[0_6px_18px_rgba(15,23,42,0.12)] dark:border-gray-700 dark:hover:border-gray-500",
        )}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={classNames(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                "border-gray-200 bg-gray-50 text-gray-700",
                "dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200",
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
                <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[13px] font-semibold tabular-nums leading-5 text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/30">
                  {projectIdLabel}
                </span>
                {runningCount > 0 ? <RunningDot count={runningCount} /> : null}
              </div>

              <p className="line-clamp-1 text-[13.5px] leading-6 text-gray-600 dark:text-gray-300">
                {description?.trim() || "No description available."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <Layers3 className="h-4 w-4 text-gray-400" />
          <div>
            <div className="text-[13px] text-gray-500 dark:text-gray-400">
              Protocols
            </div>
            <div className="font-semibold text-slate-950 dark:text-white">{protocolsCount ?? "0"}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <div>
            <div className="text-[13px] text-gray-500 dark:text-gray-400">
              Updated
            </div>
            <div className="font-medium text-slate-950 dark:text-white" title={formatFullDate(updatedAt ?? createdAt)}>
              {formatRelativeDate(updatedAt ?? createdAt) || "—"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <Database className="h-4 w-4 text-slate-400" />
          <div>
            <div className="text-[13px] text-gray-500 dark:text-gray-400">
              Storage
            </div>
            <div className="font-medium text-slate-950 dark:text-white">{diskUsage ?? "—"}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={classNames(
              "inline-flex rounded-md border px-2 py-0.5 text-[13px] font-medium",
              getStatusToneClasses(statusLabel),
            )}
          >
            {statusLabel}
          </span>
          <span className="inline-flex rounded-md border border-gray-300/80 bg-white px-2 py-0.5 text-[13px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
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
            className="hidden h-9 items-center gap-2 rounded-[10px] bg-brand-500 px-3.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-brand-600 xl:inline-flex"
          >
            Open
          </button>

          {onTogglePin ? (
            <button
              type="button"
              aria-label={isPinned ? `Unpin ${name}` : `Pin ${name}`}
              aria-pressed={isPinned}
              title={isPinned ? "Unpin" : "Pin to the top"}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onTogglePin();
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              className={classNames(
                "flex h-8 w-8 items-center justify-center rounded-[10px] transition",
                isPinned
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"
                  : "text-gray-400 hover:bg-amber-50 hover:text-amber-500 dark:text-gray-500 dark:hover:bg-amber-500/10",
              )}
            >
              <Pin className={classNames("h-4 w-4", isPinned ? "fill-current" : "")} />
            </button>
          ) : null}

          <ProjectAction
            onOpen={handleOpen}
            onRename={canModify ? handleRename : undefined}
            onRemove={canModify ? () => setShowDeleteModal(true) : undefined}
            onShare={canModify ? handleShare : undefined}
          />
        </div>
      </div>

      <RenameProjectDialog open={isRenaming} name={newName} description={newDescription} error={errorMessage}
                           onName={setNewName} onDescription={setNewDescription}
                           onSave={() => void handleRenameSubmit()} onClose={() => setIsRenaming(false)} />

      <DeleteProjectDialog open={showDeleteModal} name={name} protocols={protocolsCount} diskUsage={diskUsage}
                           statusCounts={statusCounts} onConfirm={() => void confirmRemove()}
                           onClose={() => setShowDeleteModal(false)} />
    </>
  );
}
