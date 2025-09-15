import { FileIcon, FolderIcon, HorizontaLDots, OpenFolderIcon, RenameIcon, TrashBinIcon } from "@/icons";
import { useState, useRef, useEffect } from "react";

interface ProjectActionProps {
    icon: React.ReactNode;
    label: string;
    onOpen?: () => void;
    onRename?: () => void;
    onRemove?: () => void;
}

const ProjectAction: React.FC<ProjectActionProps> = ({ icon, label, onOpen, onRename, onRemove }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Cierra el menú si haces clic fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <div className="relative flex items-center justify-between px-0 py-0 rounded-lg">
            <div className="relative" ref={menuRef}>
                <button
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    className="flex items-center justify-center h-1 w-10"
                >
                    <HorizontaLDots className="text-gray-600 dark:text-gray-300 w-7 h-7" />
                </button>

                {isMenuOpen && (
                    <div
                        className={`absolute right-0 mt-2 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50
            transition-all duration-400 ease-out
            ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}
          `}
                    >
                        <ul className="text-sm text-gray-700 dark:text-gray-200">
                            <li
                                className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                onClick={() => {
                                    onOpen?.();
                                    setIsMenuOpen(false);
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <OpenFolderIcon className="shrink-0 w-5 h-5 text-gray-500 dark:text-white" />
                                    <span className="whitespace-nowrap">Open</span>
                                </div>
                            </li>
                            <li
                                className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                onClick={() => {
                                    onRename?.();
                                    setIsMenuOpen(false);
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <RenameIcon className="shrink-0 w-5 h-5 text-gray-500 dark:text-white" />
                                    <span className="whitespace-nowrap">Rename</span>
                                </div>
                            </li>
                            <li
                                className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                onClick={() => {
                                    onRemove?.();
                                    setIsMenuOpen(false);
                                }}
                            >
                                 <div className="flex items-center gap-2">
                                    <TrashBinIcon className="shrink-0 w-5 h-5 text-gray-500 dark:text-white" />
                                    <span className="whitespace-nowrap">Remove</span>
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
