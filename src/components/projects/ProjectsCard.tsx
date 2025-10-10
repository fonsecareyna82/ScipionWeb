// src/components/projects/projects-card.tsx
import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarIcon, FolderIcon, StorageIcon } from "../../icons";
import ProjectAction from "./ProjectActions";
import toast from "react-hot-toast";
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
  icon = <FolderIcon className="w-5 h-5 text-gray-800 dark:text-white/90" />,
  onDelete,
  onRename,
}: ProjectCardProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newLabel, setNewLabel] = useState(label);
  const [newDescription, setNewDescription] = useState(description);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const svc = useProjectService();

  /** Navigate to project details unless we are in rename mode. */
  const handleOpen = useCallback(async () => {
    if (!isRenaming) navigate(`/project/load/${id}`);
  }, [id, isRenaming, navigate]);

  const handleDoubleClick = useCallback(() => {
    handleOpen();
  }, [handleOpen]);

  /** Enter rename mode with current values. */
  const handleRename = useCallback(() => {
    setNewLabel(label);
    setNewDescription(description || "");
    setIsRenaming(true);
    setErrorMessage("");
  }, [label, description]);

  /** Open delete confirmation modal. */
  const handleRemove = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  /** Confirm deletion using the service. */
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

  /** Apply rename + description using the service. */
  const handleRenameSubmit = useCallback(async () => {
    if (!newLabel.trim()) {
      setErrorMessage("Project name cannot be empty.");
      return;
    }
    // Optional description minimum length guard
    if (newDescription && newDescription.trim().length < 3) {
      setErrorMessage("Description must be at least 3 characters.");
      return;
    }

    try {
      await svc.renameProject(String(id), newLabel.trim(), (newDescription || "").trim());
      toast.success(`Project renamed to "${newLabel}"`);
      setIsRenaming(false);
      setErrorMessage("");
      onRename?.(id, newLabel.trim(), (newDescription || "").trim());
    } catch (error: any) {
      toast.error(error?.message || "Failed to rename project");
      setErrorMessage("Failed to update project.");
    }
  }, [svc, id, newLabel, newDescription, onRename]);

  /** Keep local state in sync when props change. */
  useEffect(() => {
    setNewLabel(label);
    setNewDescription(description || "");
  }, [label, description]);

  return (
    <>
      <motion.div
        ref={cardRef}
        onClick={onSelect}
        onDoubleClick={handleDoubleClick}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={`relative cursor-pointer rounded-2xl border p-5 md:p-6 transition-all duration-300
          ${isRenaming ? "" : "transform hover:scale-[1.03] hover:shadow-xl"}
          ${isSelected ? "border-blue-700 shadow-blue-100" : "border-gray-200 dark:border-gray-800"}
          bg-gray-100 dark:bg-white/5 backdrop-blur-md`}
      >
        <div className="mb-2 rounded-xl bg-gradient-to-r from-green-100 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4 py-2 border transition-all duration-300">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3 group min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 dark:bg-yellow-900/30 group-hover:scale-110 transition-transform duration-300">
                {icon}
              </div>

              {isRenaming ? (
                <div className="flex flex-col gap-2 w-full">
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Project name"
                    className="text-lg text-gray-800 dark:text-white/90 bg-transparent border-b border-gray-400 focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit()}
                  />
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Project description"
                    className="text-sm text-gray-700 dark:text-gray-300 bg-transparent border border-gray-300 dark:border-gray-600 rounded-md p-2"
                    rows={3}
                  />
                  {errorMessage && (
                    <span className="text-red-500 text-sm">{errorMessage}</span>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={handleRenameSubmit}
                      className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRenaming(false)}
                      className="px-3 py-1 bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-white rounded-md hover:bg-gray-400 dark:hover:bg-gray-600 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <span
                  className="text-lg text-gray-800 dark:text-white/90 truncate flex-grow"
                  title={label}
                >
                  {newLabel}
                </span>
              )}
            </div>

            {!isRenaming && (
              <div className="shrink-0">
                <ProjectAction
                  icon={null}
                  label=""
                  onOpen={handleOpen}
                  onRename={handleRename}
                  onRemove={handleRemove}
                />
              </div>
            )}
          </div>
        </div>

        <div className="my-2 border-t border-gray-300 dark:border-gray-700" />

        <div className="mt-4 space-y-3 text-sm text-gray-500 dark:text-gray-400">
          {createdAt && (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl dark:bg-gray-800 bg-blue-50">
                <CalendarIcon className="w-6 h-6 text-blue-600 dark:text-white" />
              </div>
              <div className="text-black dark:text-gray-400">
                Created at: {new Date(createdAt).toLocaleDateString()}
              </div>
            </div>
          )}

          {diskUsage && (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl dark:bg-gray-800 bg-gray-100">
                <StorageIcon className="w-7 h-7 text-gray-600 dark:text-white" />
              </div>
              <div className="text-black dark:text-gray-400">{diskUsage}</div>
            </div>
          )}

          <div className="my-2 border-t border-gray-300 dark:border-gray-700" />

          <div className="mt-2 ml-7">
            <span className="text-sm text-gray-800 dark:text-white/90">
              {value} protocols
            </span>
          </div>
        </div>
      </motion.div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-xl max-w-sm w-full"
            >
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
                Delete project?
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                This action cannot be undone. Are you sure you want to delete{" "}
                <strong>{label}</strong>?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRemove}
                  className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition"
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
