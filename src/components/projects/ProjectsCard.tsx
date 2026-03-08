// src/components/projects/ProjectsCard.tsx
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { X, UserPlus2 } from "lucide-react";

import {
  CalendarIcon,
  FolderIcon,
  StorageIcon,
  OpenFolderIcon,
  RenameIcon,
  TrashBinIcon,
} from "../../icons";
import ProjectAction from "./ProjectActions";
import { useProjectService } from "@/ProjectServiceContext";

interface ProjectCardProps {
  id: string | number;
  label: string;
  value: string | number;
  badgeValue?: string;
  icon?: React.ReactNode;
  createdAt?: string;
  diskUsage?: string;
  isSelected?: boolean;
  onSelect?: () => void;

  isExpanded?: boolean;
  onToggleExpand?: () => void;

  description?: string;
  status?: string;
  onDelete?: (id: number | string) => void;
  onRename?: (id: number | string, newLabel: string, newDescription: string) => void;
  onShare?: (id: number | string) => void;

  projectOwnerId: string | number | null;
  isShared?: boolean | string | number;
  isOwner?: boolean | string | number;
  permission?: string;
}

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
};

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

function normalizeBooleanFlag(value: boolean | string | number | undefined | null): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "owner" || v === "yes";
  }
  return false;
}

function formatDateShort(raw?: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export default function ProjectCard(props: ProjectCardProps) {
  const {
    id,
    label,
    value,
    createdAt,
    diskUsage,
    isSelected,
    onSelect,
    isExpanded,
    onToggleExpand,
    description = "",
    icon = <FolderIcon className="w-5 h-5 text-gray-900 dark:text-white" />,
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
  const [newLabel, setNewLabel] = useState(label);
  const [newDescription, setNewDescription] = useState(description);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Context menu (right click)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ open: false, x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const contextItemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const portalRoot = typeof document !== "undefined" ? document.body : null;

  const normalizedIsOwner = normalizeBooleanFlag(isOwner);
  const normalizedIsShared = normalizeBooleanFlag(isShared);
  const showGuestBadge = Boolean(normalizedIsShared && !normalizedIsOwner);
  const canModify = normalizedIsOwner;

  const canToggleExpand = useMemo(() => {
    const d = (description ?? "").trim();
    return d.length > 140 && typeof onToggleExpand === "function";
  }, [description, onToggleExpand]);

  useEffect(() => {
    setNewLabel(label);
    setNewDescription(description || "");
  }, [label, description]);

  const handleOpen = useCallback(() => {
    if (isRenaming) return;
    navigate(`/project/load/${id}`);
  }, [id, isRenaming, navigate]);

  const handleDoubleClick = useCallback(() => {
    handleOpen();
  }, [handleOpen]);

  const handleRename = useCallback(() => {
    setNewLabel(label);
    setNewDescription(description || "");
    setIsRenaming(true);
    setErrorMessage("");
  }, [label, description]);

  const handleRemove = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleShare = useCallback(() => {
    if (!canModify) return;
    onShare?.(id);
  }, [canModify, id, onShare]);

  const confirmRemove = useCallback(async () => {
    try {
      await svc.deleteProject(String(id));
      toast.success(`Project "${label}" deleted successfully`);
      setShowDeleteModal(false);
      onDelete?.(id);
    } catch (error: any) {
      toast.error(error?.message || "Error deleting project");
    }
  }, [svc, id, label, onDelete]);

  const handleRenameSubmit = useCallback(async () => {
    if (!newLabel.trim()) {
      setErrorMessage("Project name cannot be empty.");
      return;
    }
    if (newDescription && newDescription.trim().length > 0 && newDescription.trim().length < 3) {
      setErrorMessage("Description must be at least 3 characters.");
      return;
    }

    try {
      await svc.renameProject(String(id), newLabel.trim(), (newDescription || "").trim());
      toast.success("Project renamed successfully");
      setIsRenaming(false);
      setErrorMessage("");
      onRename?.(id, newLabel.trim(), (newDescription || "").trim());
    } catch (error: any) {
      toast.error(error?.message || "Failed to rename project");
      setErrorMessage("Failed to update project.");
    }
  }, [svc, id, newLabel, newDescription, onRename]);

  // ───────────────────────── Context menu helpers ─────────────────────────

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  const openContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isRenaming || showDeleteModal) return;

      e.preventDefault();
      e.stopPropagation();
      onSelect?.();

      // Clamp position to viewport
      const pad = 8;
      const menuW = 192; // w-48
      const menuH = 196; // approx
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const rawX = e.clientX;
      const rawY = e.clientY;

      const x = Math.max(pad, Math.min(rawX, vw - menuW - pad));
      const y = Math.max(pad, Math.min(rawY, vh - menuH - pad));

      setContextMenu({ open: true, x, y });
    },
    [isRenaming, showDeleteModal, onSelect],
  );

  const setContextItemRef = useCallback(
    (idx: number) => (el: HTMLLIElement | null) => {
      contextItemRefs.current[idx] = el;
    },
    [],
  );

  const focusOnHoverIfEnabled =
    (disabled: boolean) => (e: React.PointerEvent<HTMLLIElement>) => {
      if (disabled) return;
      const el = e.currentTarget;
      if (document.activeElement !== el) el.focus();
    };

  const runContextItem =
    (disabled: boolean, fn?: () => void) =>
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        fn?.();
        closeContextMenu();
      };

  const onContextMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const items = contextItemRefs.current.filter(Boolean) as HTMLLIElement[];
      if (!items.length) return;

      const isDisabled = (el: HTMLLIElement | null) => el?.dataset.disabled === "true";
      const currentIndex = items.findIndex((el) => el === document.activeElement);

      const moveFocus = (direction: 1 | -1) => {
        let idx = currentIndex;
        for (let i = 0; i < items.length; i++) {
          idx = (idx + direction + items.length) % items.length;
          if (!isDisabled(items[idx])) {
            items[idx].focus();
            break;
          }
        }
      };

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveFocus(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          moveFocus(-1);
          break;
        case "Home": {
          e.preventDefault();
          const first = items.find((el) => !isDisabled(el));
          first?.focus();
          break;
        }
        case "End": {
          e.preventDefault();
          for (let i = items.length - 1; i >= 0; i--) {
            if (!isDisabled(items[i])) {
              items[i].focus();
              break;
            }
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          closeContextMenu();
          break;
      }
    },
    [closeContextMenu],
  );

  useEffect(() => {
    if (isRenaming || showDeleteModal) closeContextMenu();
  }, [isRenaming, showDeleteModal, closeContextMenu]);

  useEffect(() => {
    if (!contextMenu.open) return;

    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) closeContextMenu();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeContextMenu();
    };

    const onAnyScroll = () => closeContextMenu();

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onAnyScroll, true);
    window.addEventListener("wheel", onAnyScroll, true);
    window.addEventListener("touchmove", onAnyScroll, true);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onAnyScroll, true);
      window.removeEventListener("wheel", onAnyScroll, true);
      window.removeEventListener("touchmove", onAnyScroll, true);
    };
  }, [contextMenu.open, closeContextMenu]);

  useEffect(() => {
    if (!contextMenu.open) return;

    queueMicrotask(() => {
      const items = contextItemRefs.current.filter(Boolean) as HTMLLIElement[];
      const firstEnabled = items.find((el) => el.dataset.disabled !== "true");
      firstEnabled?.focus();
    });
  }, [contextMenu.open]);

  // ───────────────────────── Styles ─────────────────────────

  const cardClass = classNames(
    "relative cursor-pointer rounded-2xl border p-5 md:p-6 subpixel-antialiased transition overflow-hidden",
    "bg-white/80 border-gray-200/70 shadow-sm backdrop-blur",
    "dark:bg-white/[0.03] dark:border-gray-800/80",
    // Hover should NOT override selected border
    !isSelected ? "hover:border-gray-300/80 dark:hover:border-gray-700/80" : "",
    // Disable lift while renaming; also don't lift selected cards (feels cleaner)
    !isRenaming && !isSelected ? "hover:-translate-y-px hover:shadow-lg" : "",
    // Immediate feedback on click (even before state update)
    "active:border-indigo-500/40 active:ring-2 active:ring-inset active:ring-indigo-500/15",
    "after:pointer-events-none after:absolute after:content-['']",
    "after:inset-px after:rounded-[15px]",
    "after:bg-gradient-to-br after:from-indigo-500/[0.04] after:via-transparent after:to-cyan-500/[0.04]",
    "dark:after:from-indigo-400/[0.10] dark:after:to-cyan-400/[0.10]",

    // Selected must win ALWAYS (even on hover)
    isSelected ? "border-indigo-500/50 ring-2 ring-inset ring-indigo-500/18" : "",
    "min-h-[200px]",
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="relative"
      >
         <div
          tabIndex={0}
          onClick={onSelect}
          onDoubleClick={handleDoubleClick}
          onContextMenu={openContextMenu}
          className={cardClass}
        >
          <div className="relative">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/15 via-sky-500/10 to-cyan-500/15">
                  {icon}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-base font-semibold text-gray-900 dark:text-white/90" title={label}>
                      {newLabel}
                    </span>

                    {showGuestBadge ? (
                      <span className="shrink-0 rounded-full border border-sky-500/20 bg-sky-500/[0.10] px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-400/[0.12] dark:text-sky-200">
                        Guest
                      </span>
                    ) : null}

                    {permission ? (
                      <span className="shrink-0 rounded-full border border-gray-200/70 bg-white/60 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-200">
                        {permission}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {String(value)} protocols
                  </div>
                </div>
              </div>

              {/* ... actions */}
              <div className="shrink-0">
                <ProjectAction
                  icon={null}
                  label=""
                  onOpen={handleOpen}
                  onRename={canModify ? handleRename : undefined}
                  onRemove={canModify ? handleRemove : undefined}
                  onShare={canModify ? handleShare : undefined}
                />
              </div>
            </div>

            {/* Description */}
            <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              <div className={classNames(isExpanded ? "" : "line-clamp-2")}>
                {description?.trim() ? description : "No description available."}
              </div>

              {canToggleExpand ? (
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-200/70 bg-white/70 px-2 py-1 text-xs font-semibold text-gray-700 hover:shadow-sm dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-200"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleExpand?.();
                  }}
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              ) : null}
            </div>

            {/* Meta */}
            <div className="mt-16 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
              {createdAt ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-200" />
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{formatDateShort(createdAt)}</span>
                </span>
              ) : null}

              {diskUsage ? (
                <span className="inline-flex items-center gap-1.5">
                  <StorageIcon className="h-4 w-4 text-cyan-700 dark:text-cyan-200" />
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{diskUsage}</span>
                </span>
              ) : null}
            </div>
          </div>

          {/* Rename: FULL-CARD editor (always fits) */}
          <AnimatePresence>
            {isRenaming && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={classNames(
                  "absolute inset-0 z-20 rounded-2xl border overflow-hidden",
                  "bg-white/95 dark:bg-gray-900/95",
                  "border-gray-200/70 dark:border-gray-800/80",
                )}
                role="dialog"
                aria-modal="true"
                onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Escape") setIsRenaming(false);
                  const tag = (e.target as HTMLElement)?.tagName;
                  if (e.key === "Enter" && tag !== "TEXTAREA") {
                    e.preventDefault();
                    handleRenameSubmit();
                  }
                }}
              >
                <div className="flex h-full flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between gap-3 border-b border-gray-200/70 px-4 py-3 dark:border-gray-800/70">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/15 via-sky-500/10 to-cyan-500/15">
                        {icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">Rename project</div>
                        <div className="truncate text-xs text-gray-500 dark:text-gray-400">{label}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsRenaming(false)}
                      className={classNames(
                        "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition",
                        "border-gray-200/70 bg-white/70 text-gray-700 hover:shadow-sm",
                        "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-200",
                      )}
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Body (scrollable if needed) */}
                  <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
                    <div className="flex flex-col gap-3">
                      <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Name
                        <input
                          type="text"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          placeholder="Project name"
                          className={classNames(
                            "mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none",
                            "border-gray-200/70 bg-white text-gray-900",
                            "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                            "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white",
                          )}
                          autoFocus
                        />
                      </label>

                      <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Description
                        <textarea
                          value={newDescription}
                          onChange={(e) => setNewDescription(e.target.value)}
                          placeholder="Project description"
                          rows={4}
                          className={classNames(
                            "mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none",
                            "border-gray-200/70 bg-white text-gray-900",
                            "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                            "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white",
                          )}
                        />
                      </label>

                      {errorMessage ? (
                        <div className="rounded-xl border border-red-200/70 bg-red-50/80 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                          {errorMessage}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Footer (always visible) */}
                  <div className="flex items-center justify-end gap-2 border-t border-gray-200/70 bg-white/80 px-4 py-3 dark:border-gray-800/70 dark:bg-gray-900/70">
                    <button
                      type="button"
                      onClick={() => setIsRenaming(false)}
                      className={classNames(
                        "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                        "border-gray-200/70 bg-white/70 text-gray-700 hover:shadow-sm",
                        "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-200",
                      )}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={handleRenameSubmit}
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:brightness-[0.98] bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Right-click context menu (PORTAL) */}
      {contextMenu.open && portalRoot
        ? createPortal(
          <div
            className="fixed inset-0 z-[9999]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              closeContextMenu();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              closeContextMenu();
            }}
          >
            <div
              ref={contextMenuRef}
              role="menu"
              tabIndex={-1}
              onKeyDown={onContextMenuKeyDown}
              className="fixed w-48 overflow-hidden rounded-xl border border-gray-200/70 bg-white/95 shadow-2xl backdrop-blur dark:border-gray-800/80 dark:bg-gray-900/90"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {(() => {
                const openDisabled = false;
                const renameDisabled = !canModify;
                const shareDisabled = !canModify;
                const removeDisabled = !canModify;

                const baseItemClass = "px-4 py-2.5 outline-none flex items-center gap-2";
                const enabledItemClass =
                  "cursor-pointer transition hover:bg-gradient-to-r hover:from-indigo-500/[0.06] hover:via-transparent hover:to-cyan-500/[0.06] focus:bg-gray-100/80 dark:focus:bg-gray-800/70";
                const disabledItemClass = "cursor-not-allowed opacity-50 text-gray-400 dark:text-gray-500";

                const itemClass = (disabled: boolean) =>
                  classNames(baseItemClass, disabled ? disabledItemClass : enabledItemClass);

                return (
                  <ul className="py-1 text-sm text-gray-700 dark:text-gray-200">
                    <li
                      ref={setContextItemRef(0)}
                      tabIndex={-1}
                      role="menuitem"
                      aria-disabled={openDisabled}
                      data-disabled={openDisabled ? "true" : "false"}
                      className={itemClass(openDisabled)}
                      onPointerMove={focusOnHoverIfEnabled(openDisabled)}
                      onClick={runContextItem(openDisabled, handleOpen)}
                    >
                      <OpenFolderIcon className="w-5 h-5 text-gray-600 dark:text-gray-200" />
                      <span>Open</span>
                    </li>

                    <li
                      ref={setContextItemRef(1)}
                      tabIndex={-1}
                      role="menuitem"
                      aria-disabled={renameDisabled}
                      data-disabled={renameDisabled ? "true" : "false"}
                      className={itemClass(renameDisabled)}
                      onPointerMove={focusOnHoverIfEnabled(renameDisabled)}
                      onClick={runContextItem(renameDisabled, handleRename)}
                    >
                      <RenameIcon
                        className={classNames(
                          "w-5 h-5",
                          renameDisabled ? "text-gray-400 dark:text-gray-500" : "text-gray-600 dark:text-gray-200",
                        )}
                      />
                      <span>Rename</span>
                    </li>

                    <li
                      ref={setContextItemRef(2)}
                      tabIndex={-1}
                      role="menuitem"
                      aria-disabled={shareDisabled}
                      data-disabled={shareDisabled ? "true" : "false"}
                      className={itemClass(shareDisabled)}
                      onPointerMove={focusOnHoverIfEnabled(shareDisabled)}
                      onClick={runContextItem(shareDisabled, handleShare)}
                    >
                      <UserPlus2
                        className={classNames(
                          "w-4 h-4",
                          shareDisabled ? "text-gray-400 dark:text-gray-500" : "text-gray-600 dark:text-gray-200",
                        )}
                      />
                      <span>Share</span>
                    </li>

                    <li
                      ref={setContextItemRef(3)}
                      tabIndex={-1}
                      role="menuitem"
                      aria-disabled={removeDisabled}
                      data-disabled={removeDisabled ? "true" : "false"}
                      className={classNames(
                        itemClass(removeDisabled),
                        !removeDisabled ? "hover:from-red-500/[0.08] hover:to-orange-500/[0.06]" : "",
                      )}
                      onPointerMove={focusOnHoverIfEnabled(removeDisabled)}
                      onClick={runContextItem(removeDisabled, handleRemove)}
                    >
                      <TrashBinIcon
                        className={classNames(
                          "w-5 h-5"
                        )}
                      />
                      <span>Remove</span>
                    </li>
                  </ul>
                );
              })()}
            </div>
          </div>,
          portalRoot,
        )
        : null}

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px]"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-2xl max-w-sm w-full subpixel-antialiased border border-gray-200/70 dark:border-gray-800/80"
              onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Delete project?</h2>
              <p className="text-sm text-gray-700 dark:text-gray-200 mb-6">
                This action cannot be undone. Are you sure you want to delete <strong>{label}</strong>?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-xl border border-gray-200/70 bg-white/70 px-4 py-2 text-sm font-semibold text-gray-700 hover:shadow-sm dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRemove}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 hover:brightness-[0.98] hover:shadow-md transition"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}