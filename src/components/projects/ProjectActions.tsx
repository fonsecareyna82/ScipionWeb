// src/components/projects/ProjectActions.tsx
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { OpenFolderIcon, RenameIcon, TrashBinIcon, HorizontaLDots } from "@/icons";
import { UserPlus2 } from "lucide-react";

interface Props {
  icon?: React.ReactNode;
  label?: string;
  onOpen?: () => void;
  onRename?: () => void;
  onRemove?: () => void;
  onShare?: () => void;
  className?: string;
}

const ProjectAction: React.FC<Props> = ({
  onOpen,
  onRename,
  onRemove,
  onShare,
  className,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const menuId = useId();

  const openDisabled = !onOpen;
  const renameDisabled = !onRename;
  const shareDisabled = !onShare;
  const removeDisabled = !onRemove;

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    // Return focus to trigger after close
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

  // Focus first enabled item on open
  useEffect(() => {
    if (isMenuOpen) {
      queueMicrotask(() => {
        const items = itemRefs.current.filter(Boolean) as HTMLLIElement[];
        const firstEnabled = items.find(
          (el) => el.dataset.disabled !== "true"
        );
        firstEnabled?.focus();
      });
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
      if (
        e.key === "Enter" ||
        e.key === " " ||
        e.key === "F10" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        e.stopPropagation();
        setIsMenuOpen(true);
      }
    },
    []
  );

  // Keyboard navigation within the menu (skipping disabled items)
  const onMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const items = itemRefs.current.filter(Boolean) as HTMLLIElement[];
      if (!items.length) return;

      const isDisabled = (el: HTMLLIElement | null) =>
        el?.dataset.disabled === "true";

      const currentIndex = items.findIndex(
        (el) => el === document.activeElement
      );

      const moveFocus = (direction: 1 | -1) => {
        if (!items.length) return;
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
        case "Tab":
          // Close on tab to move focus out naturally
          setIsMenuOpen(false);
          break;
        case "Escape":
          e.preventDefault();
          closeMenu();
          break;
      }
    },
    [closeMenu]
  );

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

  const baseItemClass =
    "px-4 py-2 outline-none flex items-center gap-2";
  const enabledItemClass =
    "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700";
  const disabledItemClass =
    "cursor-not-allowed opacity-50 text-gray-400 dark:text-gray-500";

  return (
    <div
      className={`relative flex items-center justify-between px-0 py-0 rounded-lg ${
        className || ""
      }`}
    >
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
              {/* Open */}
              <li
                ref={setItemRef(0)}
                tabIndex={-1}
                role="menuitem"
                aria-disabled={openDisabled}
                data-disabled={openDisabled ? "true" : "false"}
                className={`${baseItemClass} ${
                  openDisabled ? disabledItemClass : enabledItemClass
                }`}
                onClick={openDisabled ? undefined : handleItemClick(onOpen)}
                onKeyDown={
                  openDisabled
                    ? undefined
                    : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen?.();
                          setIsMenuOpen(false);
                        }
                      }
                }
              >
                <OpenFolderIcon
                  className={`w-5 h-5 ${
                    openDisabled
                      ? "text-gray-400 dark:text-gray-500"
                      : "text-gray-500 dark:text-white"
                  }`}
                />
                <span>Open</span>
              </li>

              {/* Rename */}
              <li
                ref={setItemRef(1)}
                tabIndex={-1}
                role="menuitem"
                aria-disabled={renameDisabled}
                data-disabled={renameDisabled ? "true" : "false"}
                className={`${baseItemClass} ${
                  renameDisabled ? disabledItemClass : enabledItemClass
                }`}
                onClick={
                  renameDisabled ? undefined : handleItemClick(onRename)
                }
                onKeyDown={
                  renameDisabled
                    ? undefined
                    : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRename?.();
                          setIsMenuOpen(false);
                        }
                      }
                }
              >
                <RenameIcon
                  className={`w-5 h-5 ${
                    renameDisabled
                      ? "text-gray-400 dark:text-gray-500"
                      : "text-gray-500 dark:text-white"
                  }`}
                />
                <span>Rename</span>
              </li>

              {/* Share */}
              <li
                ref={setItemRef(2)}
                tabIndex={-1}
                role="menuitem"
                aria-disabled={shareDisabled}
                data-disabled={shareDisabled ? "true" : "false"}
                className={`${baseItemClass} ${
                  shareDisabled ? disabledItemClass : enabledItemClass
                }`}
                onClick={
                  shareDisabled ? undefined : handleItemClick(onShare)
                }
                onKeyDown={
                  shareDisabled
                    ? undefined
                    : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onShare?.();
                          setIsMenuOpen(false);
                        }
                      }
                }
              >
                <UserPlus2
                  className={`w-4 h-4 ${
                    shareDisabled
                      ? "text-gray-400 dark:text-gray-500"
                      : "text-gray-500 dark:text-white"
                  }`}
                />
                <span>Share</span>
              </li>

              {/* Remove */}
              <li
                ref={setItemRef(3)}
                tabIndex={-1}
                role="menuitem"
                aria-disabled={removeDisabled}
                data-disabled={removeDisabled ? "true" : "false"}
                className={`${baseItemClass} ${
                  removeDisabled ? disabledItemClass : enabledItemClass
                }`}
                onClick={
                  removeDisabled ? undefined : handleItemClick(onRemove)
                }
                onKeyDown={
                  removeDisabled
                    ? undefined
                    : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRemove?.();
                          setIsMenuOpen(false);
                        }
                      }
                }
              >
                <TrashBinIcon
                  className={`w-5 h-5 ${
                    removeDisabled
                      ? "text-gray-400 dark:text-gray-500"
                      : "text-gray-500 dark:text-white"
                  }`}
                />
                <span>Remove</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectAction;
