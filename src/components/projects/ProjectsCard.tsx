// src/components/projects/ProjectsCard.tsx
import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarIcon, FolderIcon, StorageIcon } from "../../icons";
import ProjectAction from "./ProjectActions";
import toast from "react-hot-toast";
import { useProjectService } from "@/ProjectServiceContext";
import * as React from "react";

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
  projectOwnerId: string | number;
  isShared?: boolean | string | number;
  isOwner?: boolean | string | number;
  permission?: string;
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

export default function ProjectCard({
  id,
  label,
  value,
  createdAt,
  diskUsage,
  isSelected,
  onSelect,
  description = "",
  icon = <FolderIcon className="w-5 h-5 text-gray-900 dark:text-white" />,
  onDelete,
  onRename,
  onShare,
  projectOwnerId,
  isShared,
  isOwner,
  permission,
}: ProjectCardProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);

  const [isRenaming, setIsRenaming] = useState(false);
  const [newLabel, setNewLabel] = useState(label);
  const [newDescription, setNewDescription] = useState(description);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const svc = useProjectService();

  // Normalize flags so "false", 0, "0" etc. do not behave as true
  const normalizedIsOwner = normalizeBooleanFlag(isOwner);
  const normalizedIsShared = normalizeBooleanFlag(isShared);

  // Only owners can share, rename, remove the project
  const canModify = normalizedIsOwner;

  const handleOpen = useCallback(async () => {
    if (!isRenaming) navigate(`/project/load/${id}`);
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
    if (!canModify) {
      return;
    }
    onShare?.(id);
  }, [onShare, id, canModify]);

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
    if (newDescription && newDescription.trim().length < 3) {
      setErrorMessage("Description must be at least 3 characters.");
      return;
    }
    try {
      await svc.renameProject(String(id), newLabel.trim(), (newDescription || "").trim());
      toast.success(`Project renamed successfully`);
      setIsRenaming(false);
      setErrorMessage("");
      onRename?.(id, newLabel.trim(), (newDescription || "").trim());
    } catch (error: any) {
      toast.error(error?.message || "Failed to rename project");
      setErrorMessage("Failed to update project.");
    }
  }, [svc, id, newLabel, newDescription, onRename]);

  useEffect(() => {
    setNewLabel(label);
    setNewDescription(description || "");
  }, [label, description]);

  const showGuestBadge = Boolean(normalizedIsShared && !normalizedIsOwner);

  return (
    <>
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative mt-1"
      >
        <div
          onClick={onSelect}
          onDoubleClick={handleDoubleClick}
          className={`relative cursor-pointer rounded-2xl border p-5 md:p-6 transition-transform duration-200 subpixel-antialiased
                      ${isSelected ? "border-blue-700 shadow-blue-100" : "border-gray-200 dark:border-gray-800"}
                      bg-gray-100 dark:bg-gray-900 hover:-translate-y-px hover:shadow-xl`}
          style={{
            WebkitFontSmoothing: "auto",
            MozOsxFontSmoothing: "auto",
            textRendering: "optimizeLegibility",
          }}
        >
          {/* Guest badge for invited projects */}
          {showGuestBadge && (
            <div
              className="absolute bottom-3 right-3 flex items-center gap-1.5
               rounded-full border border-slate-200/80 dark:border-slate-700
               bg-white/90 dark:bg-slate-900/90
               px-2.5 py-1 text-[0.7rem] font-medium
               text-slate-700 dark:text-slate-100
               shadow-md shadow-slate-900/10 backdrop-blur-sm"
            >
              <span
                className="inline-flex h-4 w-4 items-center justify-center
                 rounded-full border border-indigo-200/80 dark:border-indigo-500/60
                 bg-indigo-50 dark:bg-indigo-950/60
                 text-indigo-600 dark:text-indigo-300"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  aria-hidden="true"
                >
                  <path
                    d="M12 12c2.209 0 4-1.791 4-4s-1.791-4-4-4-4 1.791-4 4 1.791 4 4 4zm0 2c-3.337 0-6 1.791-6 4v1h12v-1c0-2.209-2.663-4-6-4z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span>Guest</span>
            </div>
          )}


          {/* Header */}
          <div className="mb-2 rounded-xl bg-gradient-to-r from-green-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 px-4 py-2 border transition-all duration-200">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3 group min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 dark:bg-gray-800">
                  {icon}
                </div>

                {/* Title */}
                <span
                  className="text-gray-700 dark:text-white truncate flex-grow"
                  title={label}
                  style={{ fontSize: "1.1rem" }}
                >
                  {newLabel}
                </span>
              </div>

              {/* Kebab actions */}
              <div className="shrink-0">
                <ProjectAction
                  icon={null}
                  label=""
                  onOpen={handleOpen}
                  onRename={canModify ? handleRename : undefined}
                  onRemove={canModify ? handleRemove : undefined}
                  // Only owners can share; for non-owners this will be undefined
                  onShare={canModify ? handleShare : undefined}
                />
              </div>
            </div>
          </div>

          <div className="my-2 border-t border-gray-300 dark:border-gray-700" />

          {/* Body */}
          <div className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-100">
            {createdAt && (
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl dark:bg-gray-800 bg-blue-50">
                  <CalendarIcon className="w-6 h-6 text-blue-600 dark:text-white" />
                </div>
                <div className="text-gray-900 dark:text-gray-100">
                  Created at: {new Date(createdAt).toLocaleDateString()}
                </div>
              </div>
            )}

            {diskUsage && (
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl dark:bg-gray-800 bg-gray-100">
                  <StorageIcon className="w-7 h-7 text-gray-700 dark:text-white" />
                </div>
                <div className="inline-flex items-center justify-center rounded-full bg-gray-300 text-gray-900 text-xs px-2 py-1">
                  {diskUsage}
                </div>
              </div>
            )}

            <div className="my-2 border-t border-gray-300 dark:border-gray-700" />

            <div className="mt-2 ml-7">
              <span className="text-sm text-gray-900 dark:text-white">
                {value} protocols
              </span>
            </div>
          </div>

          {/* Rename overlay */}
          <AnimatePresence>
            {isRenaming && (
              <motion.div
                initial={{ opacity: 0.0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`absolute inset-0 z-20 rounded-2xl border 
                            bg-gray-100/98 dark:bg-gray-900/98 
                            ${isSelected ? "border-blue-700" : "border-gray-200 dark:border-gray-800"}`}
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
                {/* Header clone */}
                <div className="px-4 py-2 border-b rounded-t-2xl bg-gradient-to-r from-green-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 dark:bg-gray-800">
                      {icon}
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Rename project
                    </span>
                  </div>
                </div>

                {/* Body (form) */}
                <div className="p-5 md:p-6">
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      value={newLabel}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLabel(e.target.value)}
                      placeholder="Project name"
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />

                    <textarea
                      value={newDescription}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewDescription(e.target.value)}
                      placeholder="Project description"
                      rows={3}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    {errorMessage && (
                      <span className="text-red-500 text-sm">{errorMessage}</span>
                    )}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsRenaming(false)}
                        className="px-5 py-2 rounded-md text-sm min-w-[100px] bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-600 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleRenameSubmit}
                        className="px-5 py-2 rounded-md text-sm min-w-[100px] bg-blue-600 text-white hover:bg-blue-700 transition"
                      >
                        Save
                      </button>
                      
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-xl max-w-sm w-full subpixel-antialiased"
              onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Delete project?
              </h2>
              <p className="text-sm text-gray-700 dark:text-gray-200 mb-6">
                This action cannot be undone. Are you sure you want to delete{" "}
                <strong>{label}</strong>?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-5 py-2 rounded-md text-sm min-w-[100px] bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRemove}
                  className="px-5 py-2 rounded-md text-sm min-w-[100px] bg-red-600 text-white hover:bg-red-700 transition"
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
