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
  const [searchText, setSearchText] = useState("");

  // Load protocols from API
  const handleLoadProtocols = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const data = await loadProtocols(projectId);
      const normalizedData = Array.isArray(data) ? data : Object.values(data);
      setProtocols(normalizedData);

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

  // Close drawer on Escape
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  const filteredProtocols = selectedRoot
    ? searchText
      ? [selectedRoot]
      : [selectedRoot]
    : [];

  return (
    <>
      {/* Button */}
      <button
        onClick={handleLoadProtocols}
        disabled={loading || projectId == null}
        className="px-3 py-1 rounded-lg text-sm flex items-center gap-1 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
      >
        <BoxCubeIcon className="w-4 h-4" />
        {loading ? "Loading…" : "Protocols"}
      </button>

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-130 bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out z-50
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Close */}
        <div className="relative">
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 z-50 text-gray-500 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-800 rounded-full w-6 h-6 shadow-lg"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        {/* Header */}
        <div className="flex flex-col p-3 bg-gradient-to-r from-gray-100 to-gray-500 dark:from-gray-700 dark:to-gray-800 border-b border-gray-300 shadow-sm mt-14">
          <h2 className="text-lg">Protocols</h2>
        </div>

        {/* Root selector */}
        {protocols.length > 1 && (
          <div className="p-1 ml-3 border-b border-gray-200 dark:border-gray-700">
            <select
              className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={selectedRoot ? protocols.indexOf(selectedRoot) : 0}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setSelectedRoot(protocols[idx]);
                setSearchText(""); // reset search
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

        {/* Search input */}
        <div className="p-1 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-40 ml-3">
          <div className="relative w-full max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search protocols..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-125 px-3 py-2 pl-10 pr-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>

        {/* Tree */}
        <div className="p-3 overflow-y-auto h-[calc(100%-192px)] scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent">
          {selectedRoot ? (
            <ProtocolsTree data={[selectedRoot]} searchText={searchText} />
          ) : (
            <div className="text-gray-500">No protocols found</div>
          )}
        </div>
      </div>
    </>
  );
};
