// src/components/projects/ProjectActions.tsx
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type MenuPos = { left: number; top: number };

function classNames(...xs: Array<string | false | null | undefined>): string {
  // classNames
  return xs.filter(Boolean).join(" ");
}

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

const focusOnHoverIfEnabled =
  (disabled: boolean) => (e: React.PointerEvent<HTMLLIElement>) => {
    // focusOnHoverIfEnabled
    if (disabled) return;
    const el = e.currentTarget;
    if (document.activeElement !== el) el.focus();
  };

const ProjectAction: React.FC<Props> = ({ onOpen, onRename, onRemove, onShare, className }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos>({ left: 0, top: 0 });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const menuId = useId();

  const portalRoot = typeof document !== "undefined" ? document.body : null;

  const openDisabled = !onOpen;
  const renameDisabled = !onRename;
  const shareDisabled = !onShare;
  const removeDisabled = !onRemove;

  const computeMenuPosition = useCallback(() => {
    // computeMenuPosition
    const btn = triggerRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const pad = 8;
    const menuW = 176;
    const menuH = 184;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.right - menuW;
    let top = rect.bottom + 8;

    left = Math.max(pad, Math.min(left, vw - menuW - pad));

    if (top + menuH > vh - pad) {
      top = rect.top - menuH - 8;
    }

    top = Math.max(pad, Math.min(top, vh - menuH - pad));

    setMenuPos({ left, top });
  }, []);

  const closeMenu = useCallback(() => {
    // closeMenu
    setIsMenuOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  const toggleMenu = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      // toggleMenu
      e.preventDefault();
      e.stopPropagation();

      setIsMenuOpen((prev) => {
        const next = !prev;
        if (next) queueMicrotask(() => computeMenuPosition());
        return next;
      });
    },
    [computeMenuPosition],
  );

  const openMenu = useCallback(() => {
    // openMenu
    setIsMenuOpen(true);
    queueMicrotask(() => computeMenuPosition());
  }, [computeMenuPosition]);

  const handleTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      // handleTriggerKeyDown
      if (e.key === "Enter" || e.key === " " || e.key === "F10" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        openMenu();
      }
    },
    [openMenu],
  );

  useEffect(() => {
    if (!isMenuOpen) return;

    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;

      if (menuRef.current && menuRef.current.contains(target)) return;
      if (triggerRef.current && triggerRef.current.contains(target)) return;

      closeMenu();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        closeMenu();
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isMenuOpen, closeMenu]);

  useEffect(() => {
    if (!isMenuOpen) return;

    computeMenuPosition();
    const onWin = () => computeMenuPosition();

    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);

    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [isMenuOpen, computeMenuPosition]);

  useEffect(() => {
    if (!isMenuOpen) return;

    queueMicrotask(() => {
      const items = itemRefs.current.filter(Boolean) as HTMLLIElement[];
      const firstEnabled = items.find((el) => el.dataset.disabled !== "true");
      firstEnabled?.focus();
    });
  }, [isMenuOpen]);

  const setItemRef = useCallback(
    (idx: number) => (el: HTMLLIElement | null) => {
      // setItemRef
      itemRefs.current[idx] = el;
    },
    [],
  );

  const handleItemClick =
    (fn?: () => void) =>
    (e: React.MouseEvent) => {
      // handleItemClick
      e.preventDefault();
      e.stopPropagation();
      fn?.();
      closeMenu();
    };

  const onMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // onMenuKeyDown
      const items = itemRefs.current.filter(Boolean) as HTMLLIElement[];
      if (!items.length) return;

      const isDisabled = (el: HTMLLIElement | null) => el?.dataset.disabled === "true";
      const currentIndex = items.findIndex((el) => el === document.activeElement);

      const moveFocus = (direction: 1 | -1) => {
        // moveFocus
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
          closeMenu();
          break;
        case "Escape":
          e.preventDefault();
          closeMenu();
          break;
      }
    },
    [closeMenu],
  );

  const baseItemClass = "px-4 py-2.5 outline-none flex items-center gap-2 text-sm font-medium";
  const enabledItemClass =
    "cursor-pointer transition hover:bg-gray-50 focus:bg-gray-100 dark:hover:bg-slate-800/70 dark:focus:bg-slate-800/70";
  const disabledItemClass = "cursor-not-allowed opacity-50 text-gray-400 dark:text-gray-500";

  const triggerClass = classNames(
    crispText,
    "flex h-9 w-9 items-center justify-center rounded-xl border transition",
    "border-gray-300/80 bg-white text-gray-700 shadow-sm hover:border-gray-400 hover:shadow-md",
    "dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:border-gray-600",
    isMenuOpen ? "border-indigo-500/40 ring-2 ring-indigo-500/15" : "",
  );

  const menu = (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      tabIndex={-1}
      onKeyDown={onMenuKeyDown}
      className={classNames(
        crispText,
        "fixed z-[10000] w-44 overflow-hidden rounded-xl border shadow-2xl",
        "border-gray-300/90 bg-white",
        "dark:border-gray-700 dark:bg-slate-900",
      )}
      style={{ left: menuPos.left, top: menuPos.top }}
      onMouseDown={(e) => {
        // keepOpenOnMenuMouseDown
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <ul className="py-1 text-gray-800 dark:text-gray-200">
        <li
          ref={setItemRef(0)}
          tabIndex={-1}
          role="menuitem"
          aria-disabled={openDisabled}
          data-disabled={openDisabled ? "true" : "false"}
          className={classNames(baseItemClass, openDisabled ? disabledItemClass : enabledItemClass)}
          onClick={openDisabled ? undefined : handleItemClick(onOpen)}
          onPointerMove={focusOnHoverIfEnabled(openDisabled)}
          onKeyDown={
            openDisabled
              ? undefined
              : (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen?.();
                    closeMenu();
                  }
                }
          }
        >
          <OpenFolderIcon
            className={classNames(
              "h-5 w-5",
              openDisabled ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-200",
            )}
          />
          <span>Open</span>
        </li>

        <li
          ref={setItemRef(1)}
          tabIndex={-1}
          role="menuitem"
          aria-disabled={renameDisabled}
          data-disabled={renameDisabled ? "true" : "false"}
          className={classNames(baseItemClass, renameDisabled ? disabledItemClass : enabledItemClass)}
          onClick={renameDisabled ? undefined : handleItemClick(onRename)}
          onPointerMove={focusOnHoverIfEnabled(renameDisabled)}
          onKeyDown={
            renameDisabled
              ? undefined
              : (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRename?.();
                    closeMenu();
                  }
                }
          }
        >
          <RenameIcon
            className={classNames(
              "h-5 w-5",
              renameDisabled ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-200",
            )}
          />
          <span>Rename</span>
        </li>

        <li
          ref={setItemRef(2)}
          tabIndex={-1}
          role="menuitem"
          aria-disabled={shareDisabled}
          data-disabled={shareDisabled ? "true" : "false"}
          className={classNames(baseItemClass, shareDisabled ? disabledItemClass : enabledItemClass)}
          onClick={shareDisabled ? undefined : handleItemClick(onShare)}
          onPointerMove={focusOnHoverIfEnabled(shareDisabled)}
          onKeyDown={
            shareDisabled
              ? undefined
              : (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onShare?.();
                    closeMenu();
                  }
                }
          }
        >
          <UserPlus2
            className={classNames(
              "h-4 w-4",
              shareDisabled ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-200",
            )}
          />
          <span>Share</span>
        </li>

        <li
          ref={setItemRef(3)}
          tabIndex={-1}
          role="menuitem"
          aria-disabled={removeDisabled}
          data-disabled={removeDisabled ? "true" : "false"}
          className={classNames(
            baseItemClass,
            removeDisabled ? disabledItemClass : enabledItemClass,
            !removeDisabled ? "hover:bg-red-50 focus:bg-red-50 dark:hover:bg-red-950/20 dark:focus:bg-red-950/20" : "",
          )}
          onClick={removeDisabled ? undefined : handleItemClick(onRemove)}
          onPointerMove={focusOnHoverIfEnabled(removeDisabled)}
          onKeyDown={
            removeDisabled
              ? undefined
              : (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRemove?.();
                    closeMenu();
                  }
                }
          }
        >
          <TrashBinIcon
            className={classNames(
              "h-5 w-5",
              removeDisabled ? "text-gray-400 dark:text-gray-500" : "text-red-700 dark:text-red-300",
            )}
          />
          <span className={!removeDisabled ? "text-red-700 dark:text-red-300" : undefined}>Remove</span>
        </li>
      </ul>
    </div>
  );

  return (
    <div className={classNames("relative flex items-center", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        onKeyDown={handleTriggerKeyDown}
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-controls={menuId}
      >
        <HorizontaLDots
          className={classNames("h-6 w-6", isMenuOpen ? "text-indigo-600 dark:text-indigo-300" : "")}
        />
      </button>

      {isMenuOpen && portalRoot ? createPortal(menu, portalRoot) : null}
    </div>
  );
};

export default ProjectAction;