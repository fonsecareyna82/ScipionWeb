// src/components/projects/ProjectActions.tsx
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { OpenFolderIcon, RenameIcon, TrashBinIcon, HorizontaLDots } from "@/icons";

interface Props {
  icon?: React.ReactNode;
  label?: string;
  onOpen?: () => void;
  onRename?: () => void;
  onRemove?: () => void;
  className?: string;
}

const ProjectAction: React.FC<Props> = ({ onOpen, onRename, onRemove, className }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const menuId = useId();

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    // return focus to trigger after close
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  // Click outside + Escape
  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (
        isMenuOpen &&
        menuRef.current &&
        !menuRef.current.contains(ev.target as Node) &&
        !triggerRef.current?.contains(ev.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [isMenuOpen, closeMenu]);

  // Focus first item on open
  useEffect(() => {
    if (isMenuOpen) {
      queueMicrotask(() => itemRefs.current[0]?.focus());
    }
  }, [isMenuOpen]);

  const toggleMenu = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      setIsMenuOpen((p) => !p);
    },
    []
  );

  const handleTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " " || e.key === "F10" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setIsMenuOpen(true);
      }
    },
    []
  );

  // Keyboard navigation within the menu
  const onMenuKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter(Boolean) as HTMLLIElement[];
    if (!items.length) return;

    const currentIndex = items.findIndex((el) => el === document.activeElement);
    const focusByIndex = (idx: number) => items[idx]?.focus();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusByIndex((currentIndex + 1) % items.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusByIndex((currentIndex - 1 + items.length) % items.length);
        break;
      case "Home":
        e.preventDefault();
        focusByIndex(0);
        break;
      case "End":
        e.preventDefault();
        focusByIndex(items.length - 1);
        break;
      case "Tab":
        // close on tab to move focus out naturally
        setIsMenuOpen(false);
        break;
      case "Escape":
        e.preventDefault();
        closeMenu();
        break;
    }
  }, [closeMenu]);

  const handleItemClick =
    (fn?: () => void) =>
    (e: React.MouseEvent) => {
      e.stopPropagation();
      fn?.();
      setIsMenuOpen(false);
    };

  const setItemRef = (idx: number) => (el: HTMLLIElement | null) => {
    itemRefs.current[idx] = el;
  };

  return (
    <div className={`relative flex items-center justify-between px-0 py-0 rounded-lg ${className || ""}`}>
      <div className="relative" ref={menuRef}>
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleMenu}
          onKeyDown={handleTriggerKeyDown}
          className="flex items-center justify-center h-8 w-8 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
        >
          <HorizontaLDots className="text-gray-600 dark:text-gray-300 w-6 h-6" />
        </button>

        {isMenuOpen && (
          <div
            id={menuId}
            role="menu"
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50"
          >
            <ul className="text-sm text-gray-700 dark:text-gray-200">
              <li
                ref={setItemRef(0)}
                tabIndex={-1}
                role="menuitem"
                className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer focus:bg-gray-100 dark:focus:bg-gray-700 outline-none"
                onClick={handleItemClick(onOpen)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen?.();
                    setIsMenuOpen(false);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <OpenFolderIcon className="w-5 h-5 text-gray-500 dark:text-white" />
                  <span>Open</span>
                </div>
              </li>

              <li
                ref={setItemRef(1)}
                tabIndex={-1}
                role="menuitem"
                className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer focus:bg-gray-100 dark:focus:bg-gray-700 outline-none"
                onClick={handleItemClick(onRename)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRename?.();
                    setIsMenuOpen(false);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <RenameIcon className="w-5 h-5 text-gray-500 dark:text-white" />
                  <span>Rename</span>
                </div>
              </li>

              <li
                ref={setItemRef(2)}
                tabIndex={-1}
                role="menuitem"
                className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer focus:bg-gray-100 dark:focus:bg-gray-700 outline-none"
                onClick={handleItemClick(onRemove)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRemove?.();
                    setIsMenuOpen(false);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <TrashBinIcon className="w-5 h-5 text-gray-500 dark:text-white" />
                  <span>Remove</span>
                </div>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectAction;
