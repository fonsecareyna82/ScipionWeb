import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import {
  CalendarIcon,
  FileIcon,
  FolderIcon,
  StorageIcon,
  TrashBinIcon,
} from "../../icons";
import ComponentCard from "../common/ComponentCard";
import DefaultInputs from "../form/form-elements/DefaultInputs";
import { CardContent, CardHeader } from "@mui/material";
import Form from "../form/Form";

interface ProjectCardProps {
  label: string;
  value: string | number;
  badgeValue?: string;
  icon?: React.ReactNode;
  createdAt?: string;
  diskUsage?: string;
}

export default function ProjectCard({
  label,
  value,
  icon = <FolderIcon className="text-yellow-600 text-gray-800 size-5 dark:text-white/90" />,
  createdAt,
  diskUsage,
}: ProjectCardProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const projectSlug = label;

  const handleClick = () => {
    navigate(`/project/load/${projectSlug}`);
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
    <div
    
      ref={cardRef}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className="relative cursor-pointer rounded-2xl border border-gray-200 bg-gray-150 p-5
                 dark:border-gray-800 dark:bg-white/[0.03] md:p-6
                 transform transition duration-300 hover:scale-105"
    >
      {/* Icon + Label */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl dark:bg-gray-800">
          {icon}
        </div>
        <span className="text-base text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      {/* Separator */}
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

      {/* Value */}
      <div className="mt-5 text-center">
        <h5 className="text-title-sm font-bold text-gray-800 dark:text-white/90">
          {value} protocols
        </h5>
      </div>

      {/* Extra Info */}
      <div className="mt-4 space-y-1 text-sm text-gray-500 dark:text-gray-400">
        {createdAt && (
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl dark:bg-gray-800">
              <CalendarIcon className="w-7 h-7 text-blue-600 dark:text-gray-100" />
            </div>
            <div>Created: {createdAt}</div>
          </div>
        )}
        {diskUsage && (
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl dark:bg-gray-800">
              <StorageIcon className="w-6 h-9 text-blue-600 dark:text-gray-100" />
            </div>
            <div>Disk Usage: {diskUsage}</div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ul
          className="absolute w-44 rounded border shadow-lg"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: document.documentElement.classList.contains("dark")
              ? "#111827"
              : "#ffffff",
            color: document.documentElement.classList.contains("dark")
              ? "#f9fafb"
              : "#1f2937",
            zIndex: 9999,
          }}
        >
          <li
            className="flex cursor-pointer items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600"
            onClick={() => {
              navigate(`/project/load/${projectSlug}`);
              setContextMenu(null);
            }}
          >
            <FolderIcon className="shrink-0 w-5 h-5 text-gray-600 dark:text-gray-300" />
            <span className="whitespace-nowrap">Open</span>
          </li>
          <li className="flex cursor-pointer items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
            <TrashBinIcon className="shrink-0 w-5 h-5 text-red-500 dark:text-red-400" />
            <span className="whitespace-nowrap">Remove</span>
          </li>
          <li className="flex cursor-pointer items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
            <FileIcon className="shrink-0 w-5 h-5 text-blue-500 dark:text-blue-400" />
            <span className="whitespace-nowrap">Rename</span>
          </li>
        </ul>
      )}
    </div>
  );
}
