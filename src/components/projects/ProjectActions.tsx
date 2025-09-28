import React, { useEffect, useRef, useState } from "react";
import { OpenFolderIcon, RenameIcon, TrashBinIcon, HorizontaLDots } from "@/icons";

interface Props {
  icon?: React.ReactNode;
  label?: string;
  onOpen?: () => void;
  onRename?: () => void;
  onRemove?: () => void;
}

const ProjectAction: React.FC<Props> = ({ onOpen, onRename, onRemove }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node) && !triggerRef.current?.contains(ev.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative flex items-center justify-between px-0 py-0 rounded-lg">
      <div className="relative" ref={menuRef}>
        <button ref={triggerRef} type="button" onClick={() => setIsMenuOpen((p) => !p)} className="flex items-center justify-center h-8 w-8 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" aria-haspopup="true" aria-expanded={isMenuOpen}>
          <HorizontaLDots className="text-gray-600 dark:text-gray-300 w-6 h-6" />
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50">
            <ul className="text-sm text-gray-700 dark:text-gray-200">
              <li className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" role="menuitem" onClick={() => { onOpen?.(); setIsMenuOpen(false); }}>
                <div className="flex items-center gap-2"><OpenFolderIcon className="w-5 h-5 text-gray-500 dark:text-white" /> <span>Open</span></div>
              </li>
              <li className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" role="menuitem" onClick={() => { onRename?.(); setIsMenuOpen(false); }}>
                <div className="flex items-center gap-2"><RenameIcon className="w-5 h-5 text-gray-500 dark:text-white" /> <span>Rename</span></div>
              </li>
              <li className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" role="menuitem" onClick={() => { onRemove?.(); setIsMenuOpen(false); }}>
                <div className="flex items-center gap-2"><TrashBinIcon className="w-5 h-5 text-gray-500 dark:text-white" /> <span>Remove</span></div>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectAction;
