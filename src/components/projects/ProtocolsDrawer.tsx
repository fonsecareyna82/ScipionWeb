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
                className={`fixed top-0 right-0 h-full w-96 bg-white dark:bg-gray-800 shadow-xl transform transition-transform z-50
          ${open ? "translate-x-0" : "translate-x-full"}`}
            >
                {/* Header with title and close button above everything */}
                <div className="flex justify-between items-center p-4 bg-gray-300 dark:bg-white dark:text-black border-b border-gray-200 dark:border-gray-700 mt-20">
                    {/* Title on the left */}
                    <h2 className="text-lg">Protocols</h2>

                    {/* Close button aligned to the right */}
                    <button
                        onClick={() => setOpen(false)}
                        className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
                        aria-label="Close drawer"
                    >
                        ✕
                    </button>
                </div>

                {/* Dropdown for root nodes */}
                {protocols.length > 1 && (
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 relative z-50">
                        <select
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-white"
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
                <div className="p-4 overflow-y-auto h-[calc(100%-128px)]">
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
