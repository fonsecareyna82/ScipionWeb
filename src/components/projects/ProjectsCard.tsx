import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CalendarIcon,
  FolderIcon,
  StorageIcon,
} from "../../icons";
import ProjectAction from "./ProjectActions";

interface ProjectCardProps {
  id: number,
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
}

export default function ProjectCard({
  id,
  label,
  value,
  createdAt,
  diskUsage,
  isSelected,
  onSelect,
  isExpanded = false,
  onToggleExpand,
  description = "No description available.",
  status = "Active",
  icon = (
    <FolderIcon className="text-yellow-600 text-gray-800 size-5 dark:text-white/90" />
  ),
}: ProjectCardProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const projectId = id;

  const handleDoubleClick = () => {
    navigate(`/project/load/${projectId}`);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setContextMenu({ x, y });
    }
  };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <motion.div
      ref={cardRef}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`relative cursor-pointer rounded-2xl border p-5 md:p-6
        transform transition-all duration-300 ease-in-out hover:scale-[1.03] hover:shadow-xl
        ${isSelected ? "border-blue-700 shadow-blue-100" : "border-gray-200 dark:border-gray-800"}
        bg-gray-100 dark:bg-white/5 backdrop-blur-md`}
    >
      {/* Header wrapped in compact mini-card */}
      <div className="mb-2 rounded-xl bg-gradient-to-r from-green-100 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4 py-2 border transition-all duration-300">
        <div className="flex justify-between items-center">
          {/* Project name */}
          <div className="flex items-center gap-3 group min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white-100 dark:bg-yellow-900 group-hover:scale-110 transition-transform duration-300">
              {icon}
            </div>
            <span
              className="text-lg text-gray-800 dark:text-white/90 truncate flex-grow"
              title={label}
            >
              {label}
            </span>
          </div>

          {/* Actions */}
          <div className="shrink-0">
            <ProjectAction
              icon={null}
              label=""
              onOpen={handleDoubleClick}
              onRename={() => console.log("Rename", label)}
              onRemove={() => console.log("Remove", label)}
            />
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="my-2 border-t border-gray-300 dark:border-gray-700" />

      {/* Extra Info */}
      <div className="mt-4 space-y-3 text-sm text-gray-500 dark:text-gray-400">
        {createdAt && (
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl dark:bg-gray-800 bg-blue-50">
              <CalendarIcon className="w-6 h-6 text-blue-600 dark:text-white" />
            </div>
            <div className="text-black dark:text-gray-400">
              Created at: {createdAt.split("T")[0]}
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

        {/* Separator */}
        <div className="my-2 border-t border-gray-300 dark:border-gray-700" />

        {/* Value */}
        <div className="mt-2 ml-7">
          <span className="text-sm text-gray-800 dark:text-white/90">
            {value} protocols
          </span>
        </div>
      </div>

      {/* Sección expandida (comentada) */}
      {/*
      {isExpanded && (
        <div className="mt-5 px-3 py-4 rounded-xl bg-gray-50 dark:bg-gray-800 transition-all duration-300">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            <strong>Description:</strong> {description}
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <strong>Status:</strong> {status}
          </p>
        </div>
      )}
      */}
    </motion.div>
  );
}
