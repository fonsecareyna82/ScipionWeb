import React, { useState, useCallback, useEffect } from "react";
import { ProtocolsTree, ProtocolNode } from "./ProtocolTree";
import { loadProtocols } from "@/api/projects";
import { BoxCubeIcon } from "@/icons";

interface ProtocolsDrawerProps {
    projectId: number | null;
}

export const ProtocolsDrawer: React.FC<ProtocolsDrawerProps> = ({ projectId }) => {
    const [protocols, setProtocols] = useState<ProtocolNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [selectedRoot, setSelectedRoot] = useState<ProtocolNode | null>(null);

    // Load protocols from API
    const handleLoadProtocols = useCallback(async () => {
        if (!projectId) return;

        setLoading(true);
        try {
            const data = await loadProtocols(projectId);
            const normalizedData = Array.isArray(data) ? data : Object.values(data);
            setProtocols(normalizedData);

            // Select first root node by default
            if (normalizedData.length > 0) {
                setSelectedRoot(normalizedData[0]);
            }

            setOpen(true);
        } catch (err) {
            console.error("Error loading protocols:", err);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    // Close drawer on Escape key
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, []);

    return (
        <>
            {/* Button to load protocols */}
            <button
                onClick={handleLoadProtocols}
                disabled={loading || projectId == null}
                className="px-3 py-1 rounded-lg text-sm flex items-center gap-1 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
            >
                <BoxCubeIcon className="w-4 h-4" />
                {loading ? "Loading…" : "Protocols"}
            </button>

            {/* Drawer panel */}
            <div
                className={`fixed top-0 right-0 h-full w-130 bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out z-50
${open ? "translate-x-0" : "translate-x-full"}`}
            >
                {/* Close button always visible */}
                <div className="relative">
                    <button
                        onClick={() => setOpen(false)}
                        className="absolute top-24 right-4 z-50 text-gray-500 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-800 rounded-full w-6 h-6 shadow-lg"
                        aria-label="Close drawer"
                    >
                        ✕
                    </button>

                </div>

                {/* Header with title */}
                <div className="flex flex-col p-4 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 border-b border-gray-300 shadow-sm mt-20">
                    <h2 className="text-lg font-semibold">Protocols</h2>
                    {selectedRoot && (
                        <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">{selectedRoot.text}</p>
                    )}
                </div>

                {/* Dropdown for root nodes */}
                {protocols.length > 1 && (
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 relative z-50">
                        <select
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={selectedRoot ? protocols.indexOf(selectedRoot) : 0}
                            onChange={(e) => {
                                const idx = Number(e.target.value);
                                setSelectedRoot(protocols[idx]);
                            }}
                        >
                            {protocols.map((node, idx) => (
                                <option key={idx} value={idx}>
                                    {node.text}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Drawer content: Tree view */}
                <div className="p-4 overflow-y-auto h-[calc(100%-128px)] scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent">
                    {selectedRoot ? (

                        <ProtocolsTree data={[selectedRoot]} />
                    ) : (
                        <div className="text-gray-500">No protocols loaded</div>
                    )}
                </div>
            </div>
        </>
    );
};
