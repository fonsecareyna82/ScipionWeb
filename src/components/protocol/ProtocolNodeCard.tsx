// ProtocolNodeCard.tsx
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
// Use shadcn ContextMenu for right-click (auto flip/collision)
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
  id?: string; // optional
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
  };
  selectedNodeId?: string;
  hoveredNodeId?: string; // new (optional)
  isHovered?: boolean;    // new (optional)
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>; // new (optional)
  graphDirection?: "TB" | "LR";
  onClick?: () => void;
  onDoubleClick?: () => void;
  zoomLevel?: number;
  compactThreshold?: number;
};

const formatCpuTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}h:${pad(minutes)}m:${pad(secs)}s`;
};

export default function StatusNodeCard({
  data,
  selectedNodeId,
  graphDirection = "TB",
  onClick,
  onDoubleClick,
  zoomLevel = 0.6,
  compactThreshold = 0.3
}: StatusNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const isSelected = selectedNodeId === data.id;
  const { setCurrentDraggedOutput } = useDrag();

  const bgColor =
    STATUS_COLORS[data.status ?? "finished"] ?? STATUS_COLORS["root"];
  data.color = bgColor;

  const classNames = [
    "status-node-card",
    "rounded-2xl border transition-shadow transform",
    isHovered ? "shadow-xl scale-[1.03]" : "shadow-md",
    isSelected
      ? "border-3 border-blue-600 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
      : "border-gray-300",
  ].filter(Boolean).join(" ");

  const isCompactView = zoomLevel <= compactThreshold;

  // Wrap the whole node with ContextMenu to get proper right-click behavior
  return (
    <ContextMenu>
      {/* Use the node card as the context menu trigger */}
      <ContextMenuTrigger asChild>
        <div
          className={classNames}
          style={{ backgroundColor: bgColor }}
          onClick={onClick}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClick?.();
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onContextMenu={(e) => {
            // Prevent canvas/global handlers from also opening their menus
            e.stopPropagation();
          }}
        >
          {/* Header */}
          <div
            className={`node-card-header p-3 border-b flex ${data.id === "PROJECT"
              ? "flex-col items-center text-center"
              : "flex-row items-center justify-between"
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
                <div
                  className={`node-label dark:text-black ${isCompactView ? "compact" : ""}`}
                  title={data.label}
                >
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
                <DropdownMenuContent className="w-56">
                  <DropdownMenuItem onSelect={(e) => {
                    e.stopPropagation();
                    onDoubleClick?.();
                  }}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <FolderOpen className="mr-2 h-4 w-4" /> Browse
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Pencil className="mr-2 h-4 w-4" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Copy className="mr-2 h-4 w-4" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <ArrowDownLeft className="mr-2 h-4 w-4" /> Select from
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <ArrowUpRight className="mr-2 h-4 w-4" /> Select to
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* Stop ABOVE "Restart all" when running */}
                  {data.status === "running" && (
                    <>
                      <DropdownMenuItem>
                        <Square className="mr-2 h-4 w-4" /> Stop
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem>
                    <RefreshCw className="mr-2 h-4 w-4" /> Restart all
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Play className="mr-2 h-4 w-4" /> Continue all
                  </DropdownMenuItem>
                  <DropdownMenuItem>
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

          {/* Content with animation */}
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${isCompactView ? "opacity-0 max-h-0" : "opacity-100 max-h-[2000px]"
              }`}
          >
            {/* Content */}
            {data.id !== "PROJECT" && (
              <div
                className="node-card-content p-3 mt-4"
                style={{ minHeight: "120px", maxHeight: "300px", overflowY: "auto" }}
              >
                {/* Outputs */}
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
                            className={`nodrag mt-3 group cursor-grab flex items-center px-3 py-1 rounded-full border border-gray-400 dark:border-gray-600 shadow-sm hover:shadow-md transition-transform ${isDragging
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
                                _parentId: value._parentId
                              };
                              setCurrentDraggedOutput(output);
                              e.dataTransfer.setData("application/scipion-output", JSON.stringify(output));
                              const dragGhost = document.createElement("div");
                              dragGhost.style.position = "absolute";
                              dragGhost.style.top = "-1000px";
                              dragGhost.style.left = "-1000px";
                              dragGhost.style.padding = "6px 12px";
                              dragGhost.style.background = "white";
                              dragGhost.style.border = "1px solid #ccc";
                              dragGhost.style.color = 'black'
                              dragGhost.style.borderRadius = "0.5rem";
                              dragGhost.innerText = `${value._class} (${value.info})`;
                              document.body.appendChild(dragGhost);
                              e.dataTransfer.setDragImage(dragGhost, 0, 15);
                              setTimeout(() => document.body.removeChild(dragGhost), 0);
                            }}
                            onDragEnd={() => {
                              setDraggingIdx(null);
                              setCurrentDraggedOutput(null);
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
                    fontSize: "2rem"
                  }}
                >
                  {data.status}
                  {(data.status === "running" ||
                    data.status === "failed" ||
                    data.status === "aborted") && (
                      <div className="flex items-center gap-1 flex-1 ml-2 transition-all duration-300">
                        <div className="w-16 h-3 bg-white/30 rounded overflow-hidden">
                          <div
                            className="h-3 bg-white transition-all duration-500"
                            style={{
                              width: `${((data.stepsDone ?? 0) / (data.numberOfSteps ?? 1)) * 100}%`,
                            }}
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{formatCpuTime(data.tick ?? Number(data.elapsedTime) ?? 0)}</span>
                </span>
              </div>
            )}
          </div>

          {/* React Flow handles by graphDirection (siempre visibles) */}
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

      {/* Right-click context menu (auto flip & collision so it's always fully visible) */}
      <ContextMenuContent
        className="w-56"
        // Note: no sideOffset here; Radix handles viewport collision automatically.
        onContextMenu={(e) => e.stopPropagation()} // extra safety against canvas
        onClick={(e) => e.stopPropagation()}
      >
        <ContextMenuItem onSelect={(e) => {
          e.stopPropagation();
          onDoubleClick?.();
        }}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </ContextMenuItem>
        <ContextMenuItem>
          <FolderOpen className="mr-2 h-4 w-4" /> Browse
        </ContextMenuItem>
        <ContextMenuItem>
          <Pencil className="mr-2 h-4 w-4" /> Rename
        </ContextMenuItem>
        <ContextMenuItem>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </ContextMenuItem>
        <ContextMenuItem>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>
          <ArrowDownLeft className="mr-2 h-4 w-4" /> Select from
        </ContextMenuItem>
        <ContextMenuItem>
          <ArrowUpRight className="mr-2 h-4 w-4" /> Select to
        </ContextMenuItem>
        <ContextMenuSeparator />
        {data.status === "running" && (
          <>
            <ContextMenuItem>
              <Square className="mr-2 h-4 w-4" /> Stop
            </ContextMenuItem>
          </>
        )}
        <ContextMenuItem>
          <RefreshCw className="mr-2 h-4 w-4" /> Restart all
        </ContextMenuItem>
        <ContextMenuItem>
          <Play className="mr-2 h-4 w-4" /> Continue all
        </ContextMenuItem>
        <ContextMenuItem>
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
