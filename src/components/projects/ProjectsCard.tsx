import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import {
  CalendarIcon,
  FolderIcon,
  StorageIcon,
} from "../../icons";
import ProjectAction from './ProjectActions'

interface ProjectCardProps {
  label: string;
  value: string | number;
  badgeValue?: string;
  icon?: React.ReactNode;
  createdAt?: string;
  diskUsage?: string;
  isSelected?: boolean;
  onSelect?: () => void;
}

export default function ProjectCard({
  label,
  value,
  icon = <FolderIcon className="text-yellow-600 text-gray-800 size-5 dark:text-white/90" />,
  createdAt,
  diskUsage,
  isSelected,
  onSelect,
}: ProjectCardProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const projectSlug = label;

  const handleDoubleClick = () => {
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
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      className={`relative cursor-pointer rounded-2xl border p-5 md:p-6
    transform transition duration-300 hover:scale-105
    ${isSelected ? 'border-blue-700' : 'border-gray-200 dark:border-gray-800'}
    bg-gray-100 dark:bg-white/[0.03]`}
    >
      {/* Icon + Label */}
      <div className="px-3 pt-1 pb-2 rounded-lg">
        {/* First line: only ProjectAction right aligned */}
        <div className="flex justify-end mb-0">
          <ProjectAction
            icon={null}
            label=""
            onOpen={handleDoubleClick}
            onRename={() => console.log('Rename', label)}
            onRemove={() => console.log('Remove', label)}
          />
        </div>

        {/* Second line: icon + label aligned to the left */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl">
            {icon}
          </div>
          <span className="text-black dark:text-gray-400">{label}</span>
        </div>
      </div>
      {/* Separator */}
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

      {/* Extra Info */}
      <div className="mt-4 space-y-1 text-sm text-gray-500 dark:text-gray-400">
        {createdAt && (
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl dark:bg-gray-800">
              <CalendarIcon className="ml-4 w-7 h-7 text-blue-600 dark:text-gray-100" />
            </div>
            <div className="text-black dark:text-gray-400 ">Created at: {createdAt.split('T')[0]}</div>
          </div>
        )}
        {diskUsage && (
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl dark:bg-gray-800">
              <StorageIcon className="ml-4 w-7 h-9 text-gray-600 dark:text-gray-100" />
            </div>
            <div className="text-black dark:text-gray-400 ">{diskUsage}</div>
          </div>
        )}
        {/* Separator */}
        <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
        {/* Value */}
        <div className="mt-3 ml-7">
          <span className="text-sm text-gray-800 dark:text-white/90">
            {value} protocols
          </span>
        </div>

      </div>
    </div>
  );
}
