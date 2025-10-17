// File: src/components/protocol/ProtocolNodeCard.tsx
import { useState } from "react";
import { Handle, Position } from "reactflow";
import "./ProtocolNodeCard.css";
import { useDrag } from "./DragContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";

import {
  MoreHorizontal,
  Pencil,
  FolderOpen,
  Copy,
  Trash2,
  FileUp,
  RefreshCw,
  Play,
  RotateCcw,
  ArrowUpRight,
  ArrowDownLeft,
  Upload,
  Square,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  running: "#FCCE62",
  saved: "#D9F1FA",
  launched: "#D9F1FA",
  finished: "#D2F5CB",
  failed: "#F5CCCB",
  aborted: "#F5CCCB",
  interactive: "#f7f3bf",
  root: "#D9F1FA",
  scheduled: "#f7f3bf",
  new: "#1E90FF",
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  running: "#918516",
  saved: "#1E90FF",
  launched: "#1E90FF",
  finished: "#28A745",
  failed: "#DC3545",
  aborted: "#DC3545",
  interactive: "#FFC107",
  scheduled: "#918516",
  new: "#1E90FF",
};

type StatusNodeProps = {
  id?: string;
  data: {
    label: string;
    status?: string;
    id: string;
    color?: string;
    cpuTime?: string;
    elapsedTime?: string;
    tick?: number;
    numberOfSteps?: number;
    stepsDone?: number;
    outputs?: any[];
    inputs?: any[];
    children?: string[];
    parents?: string[];
    __pathSelected?: boolean; // provided by parent for path selection
  };
  selected?: boolean; // React Flow "selected" prop for instant visual update
  hoveredNodeId?: string;
  isHovered?: boolean;
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>;
  graphDirection?: "TB" | "LR";
  onClick?: () => void;
  onDoubleClick?: () => void;
  zoomLevel?: number;
  compactThreshold?: number;

  onEdit?: (id: string) => void;
  onRename?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRestartAll?: (id: string) => void;
  onContinueAll?: (id: string) => void;
  onResetFrom?: (id: string) => void;
  onSelectFrom?: (id: string) => void;
  onSelectTo?: (id: string) => void;
};

const formatCpuTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}h:${pad(minutes)}m:${pad(secs)}s`;
};

export default function StatusNode({
  data,
  selected = false,
  graphDirection = "TB",
  onClick,
  onDoubleClick,
  zoomLevel = 0.6,
  compactThreshold = 0.3,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  onRestartAll,
  onContinueAll,
  onResetFrom,
  onSelectFrom,
  onSelectTo,
}: StatusNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const isSelected = !!selected;                 // single or multi selection (React Flow prop)
  const isPathSelected = !!data.__pathSelected;  // extra ring for path selection
  const { setCurrentDraggedOutput } = useDrag();

  const bgColor = STATUS_COLORS[data.status ?? "finished"] ?? STATUS_COLORS["root"];
  data.color = bgColor;

  // Keep your original rounded/card styles; add only a subtle outline when selected or path-selected
  const classNames = [
    "status-node-card",
    "rounded-2xl border transition-shadow transform",
    isHovered ? "shadow-xl scale-[1.01]" : "shadow-md",
    isSelected ? "border-3 border-blue-600 shadow-[0_0_20px_rgba(59,130,246,0.5)]" : "border-gray-300",
  ]
    .filter(Boolean)
    .join(" ");

  // Extra visual without touching global CSS: inline boxShadow ring when path-selected
  const pathSelectedStyle = isPathSelected
    ? { boxShadow: "0 0 0 3px rgba(59,130,246,0.75), 0 8px 16px rgba(0,0,0,0.10)" }
    : undefined;

  const isCompactView = zoomLevel <= compactThreshold;

  const handleEdit = () => onEdit?.(data.id);
  const handleRename = () => onRename?.(data.id);
  const handleDuplicate = () => onDuplicate?.(data.id);
  const handleDelete = () => onDelete?.(data.id);
  const handleRestartAll = () => onRestartAll?.(data.id);
  const handleContinueAll = () => onContinueAll?.(data.id);
  const handleResetFrom = () => onResetFrom?.(data.id);
  const handleSelectFrom = () => onSelectFrom?.(data.id);
  const handleSelectTo = () => onSelectTo?.(data.id);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={classNames}
          style={{ backgroundColor: bgColor, ...(pathSelectedStyle || {}) }}
          onClick={onClick}
          onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Header */}
          <div
            className={`node-card-header p-3 border-b flex ${
              data.id === "PROJECT" ? "flex-col items-center text-center" : "flex-row items-center justify-between"
            }`}
          >
            <div className="flex items-center space-x-2">
              {data.id !== "PROJECT" && (
                <div
                  className={`node-id-badge ${data.status === "running" ? "glow-badge" : ""}`}
                  style={isCompactView ? { fontSize: "2.4rem" } : { fontSize: "2.3rem" }}
                >
                  <span>{data.id}</span>
                </div>
              )}
              <div
                className={data.id === "PROJECT" ? "text-4xl text-black" : "node-label dark:text-black"}
                style={isCompactView ? { fontSize: "2.8rem" } : {}}
              >
                <div className={`node-label dark:text-black ${isCompactView ? "compact" : ""}`} title={data.label}>
                  {data.label}
                </div>
              </div>
            </div>

            {data.id !== "PROJECT" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-200 ml-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-12 w-12 text-black dark:text-black" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onClick={handleEdit}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <FolderOpen className="mr-2 h-4 w-4" /> Browse
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRename}>
                    <Pencil className="mr-2 h-4 w-4" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDuplicate}>
                    <Copy className="mr-2 h-4 w-4" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSelectFrom}>
                    <ArrowDownLeft className="mr-2 h-4 w-4" /> Select from
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSelectTo}>
                    <ArrowUpRight className="mr-2 h-4 w-4" /> Select to
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {data.status === "running" && (
                    <DropdownMenuItem>
                      <Square className="mr-2 h-4 w-4" /> Stop
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleRestartAll}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Restart all
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleContinueAll}>
                    <Play className="mr-2 h-4 w-4" /> Continue all
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleResetFrom}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset from
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <FileUp className="mr-2 h-4 w-4" /> Export
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Upload className="mr-2 h-4 w-4" /> Export & upload
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Content */}
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${
              isCompactView ? "opacity-0 max-h-0" : "opacity-100 max-h-[2000px]"
            }`}
          >
            {data.id !== "PROJECT" && (
              <div
                className="node-card-content p-3 mt-4"
                style={{ minHeight: "120px", maxHeight: "300px", overflowY: "auto" }}
              >
                {Array.isArray(data.outputs) && data.outputs.length > 0 && (
                  <div className="outputs-list">
                    <div className="section-header flex items-center px-2 py-1 bg-green-50 dark:bg-green-50 rounded-t-lg border-b border-green-800 dark:border-green-800">
                      <span className="text-black dark:text-black font-normal text-3xl">Outputs</span>
                    </div>
                    <div className="section-content p-2 bg-green-100 dark:bg-green-200 rounded-b-lg space-y-2">
                      {data.outputs.map((outputObj, idx) => {
                        const [_, rawValue] = Object.entries(outputObj)[0];
                        const value = rawValue as {
                          info: string;
                          _class: string;
                          _objValue: string;
                          _parentId: string;
                        };
                        const isDragging = draggingIdx === idx;

                        return (
                          <div
                            key={idx}
                            className={`nodrag mt-3 group cursor-grab flex items-center px-3 py-1 rounded-full border border-gray-400 dark:border-gray-600 shadow-sm hover:shadow-md transition-transform ${
                              isDragging
                                ? "scale-100 opacity-70"
                                : "bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-200 dark:to-gray-300"
                            }`}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setDraggingIdx(idx);
                              const output = {
                                _class: value._class,
                                _expectedClass: value._class,
                                _objValue: value._objValue,
                                info: value.info,
                                _parentId: value._parentId,
                              };
                              setCurrentDraggedOutput?.(output);
                              e.dataTransfer.setData("application/scipion-output", JSON.stringify(output));
                              const dragGhost = document.createElement("div");
                              dragGhost.style.position = "absolute";
                              dragGhost.style.top = "-1000px";
                              dragGhost.style.left = "-1000px";
                              dragGhost.style.padding = "6px 12px";
                              dragGhost.style.background = "white";
                              dragGhost.style.border = "1px solid #ccc";
                              dragGhost.style.color = "black";
                              dragGhost.style.borderRadius = "0.5rem";
                              dragGhost.innerText = `${value._class} (${value.info})`;
                              document.body.appendChild(dragGhost);
                              e.dataTransfer.setDragImage(dragGhost, 0, 15);
                              setTimeout(() => document.body.removeChild(dragGhost), 0);
                            }}
                            onDragEnd={() => {
                              setDraggingIdx(null);
                              setCurrentDraggedOutput?.(null);
                            }}
                          >
                            <ArrowUpRight className="h-6 w-6 mr-2 text-black-700 dark:text-black" />
                            <span className="outputs dark:text-black">{value.info}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer / Status + Progress */}
            {data.status && (
              <div className="node-card-footer p-3 border-t flex items-center justify-between">
                <span
                  className="node-status-badge px-2 py-1 rounded text-sm flex items-center gap-2"
                  style={{
                    backgroundColor: STATUS_BADGE_COLORS[data.status] || "#999",
                    color: "white",
                    minWidth: "120px",
                    fontSize: "2rem",
                  }}
                >
                  {data.status}
                  {(data.status === "running" || data.status === "failed" || data.status === "aborted") && (
                    <div className="flex items-center gap-1 flex-1 ml-2 transition-all duration-300">
                      <div className="w-16 h-3 bg-white/30 rounded overflow-hidden">
                        <div
                          className="h-3 bg-white transition-all duration-500"
                          style={{ width: `${((data.numberOfSteps ?? 1) ? ((data.stepsDone ?? 0) / (data.numberOfSteps ?? 1)) : 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-3xl opacity-80 ml-4">
                        {data.stepsDone}/{data.numberOfSteps}
                      </span>
                    </div>
                  )}
                </span>

                <span className="flex items-center space-x-1 ml-6 text-3xl dark:text-black">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-10 w-10 text-gray-500 dark:text-gray-400 mr-2"
                    fill="none"
                    viewBox="0 0 22 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{formatCpuTime(data.tick ?? Number(data.elapsedTime) ?? 0)}</span>
                </span>
              </div>
            )}
          </div>

          {/* React Flow handles */}
          <Handle
            type="target"
            position={graphDirection === "TB" ? Position.Top : Position.Left}
            style={graphDirection === "TB" ? {} : { top: "50%", transform: "translateY(-50%)" }}
          />
          <Handle
            type="source"
            position={graphDirection === "TB" ? Position.Bottom : Position.Right}
            style={graphDirection === "TB" ? {} : { top: "50%", transform: "translateY(-50%)" }}
          />
        </div>
      </ContextMenuTrigger>

      {/* Right-click context menu over the node */}
      <ContextMenuContent className="w-56" onClick={(e) => e.stopPropagation()}>
        <ContextMenuItem onSelect={handleEdit}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </ContextMenuItem>
        <ContextMenuItem>
          <FolderOpen className="mr-2 h-4 w-4" /> Browse
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleRename}>
          <Pencil className="mr-2 h-4 w-4" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleDelete}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleSelectFrom}>
          <ArrowDownLeft className="mr-2 h-4 w-4" /> Select from
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleSelectTo}>
          <ArrowUpRight className="mr-2 h-4 w-4" /> Select to
        </ContextMenuItem>
        <ContextMenuSeparator />
        {data.status === "running" && (
          <ContextMenuItem>
            <Square className="mr-2 h-4 w-4" /> Stop
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={handleRestartAll}>
          <RefreshCw className="mr-2 h-4 w-4" /> Restart all
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleContinueAll}>
          <Play className="mr-2 h-4 w-4" /> Continue all
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleResetFrom}>
          <RotateCcw className="mr-2 h-4 w-4" /> Reset from
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>
          <FileUp className="mr-2 h-4 w-4" /> Export
        </ContextMenuItem>
        <ContextMenuItem>
          <Upload className="mr-2 h-4 w-4" /> Export & upload
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
