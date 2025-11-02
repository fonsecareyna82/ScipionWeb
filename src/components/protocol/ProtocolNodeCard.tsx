import { useRef, useState } from "react";
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
  Upload,
  Square,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  SquareDashed,
  Scan,
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
    parents?: string[];
    children?: string[];
    __pathVer?: number;
    /** opcional: si lo tienes en tu dato */
    projectId?: string | number;
  };
  selectedNodeId?: string;
  hoveredNodeId?: string;
  isHovered?: boolean;
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>;
  graphDirection?: "TB" | "LR";
  onClick?: (evt?: React.MouseEvent) => void;
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
  onStop?: (id: string) => void;
  onBrowse?: (protocolId: string, projectId?: string | number, protocolLabel?: string) => void;

  inPathSelection?: boolean;
  pathSelectionActive?: boolean;
};

const formatCpuTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}h:${pad(minutes)}m:${pad(secs)}s`;
};

export default function StatusNode({
  data,
  selectedNodeId,
  graphDirection = "TB",
  onClick,
  onDoubleClick,
  zoomLevel = 0.6,
  compactThreshold = 0.25,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  onRestartAll,
  onContinueAll,
  onResetFrom,
  onSelectFrom,
  onSelectTo,
  onStop,
  onBrowse,
  inPathSelection = false,
  pathSelectionActive = false,
}: StatusNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const isSelected = selectedNodeId === data.id;
  const { setCurrentDraggedOutput } = useDrag();

  const rootRef = useRef<HTMLDivElement | null>(null);

  const bgColor = STATUS_COLORS[data.status ?? "finished"] ?? STATUS_COLORS["root"];
  data.color = bgColor;

  const classNames = [
    "status-node-card",
    "rounded-2xl border transition-shadow",
    "crisp-text",
    isHovered ? "shadow-xl" : "shadow-md",
    isSelected
      ? "border-[3px] border-blue-600 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
      : "border-gray-300",
  ].join(" ");

  const nodeStyle: React.CSSProperties = { backgroundColor: bgColor };
  if (isSelected) {
    nodeStyle.borderColor = "#0070f3";
    nodeStyle.borderStyle = "solid";
    nodeStyle.borderWidth = 4;
  }
  if (inPathSelection) {
    nodeStyle.borderColor = "#cf0d2eff";
    nodeStyle.borderStyle = "solid";
    nodeStyle.borderWidth = 5;
    nodeStyle.outline = "4px #0070f3";
    nodeStyle.outlineOffset = "2px";
  }

  const isCompactView = zoomLevel <= compactThreshold;

  const handleEdit = () => onEdit?.(data.id);
  const handleRename = () => onRename?.(data.id);
  const handleDuplicate = () => onDuplicate?.(data.id);
  const handleDelete = () => onDelete?.(data.id);
  const handleRestartAll = () => onRestartAll?.(data.id);
  const handleContinueAll = () => onContinueAll?.(data.id);
  const handleResetFrom = () => onResetFrom?.(data.id);
  const handleSelectFrom = () => { if (data.id !== "PROJECT") onSelectFrom?.(data.id); };
  const handleSelectTo = () => { if (data.id !== "PROJECT") onSelectTo?.(data.id); };
  const handleStop = () => { if (data.id !== "PROJECT") onStop?.(data.id); };
  const handleBrowse = () => {
    if (data.id !== "PROJECT") onBrowse?.(data.id, data.projectId, data.label);
  };

  const reduceMenus = pathSelectionActive || inPathSelection;

  const FromIcon = graphDirection === "TB" ? ArrowDown : ArrowRight;
  const ToIcon = graphDirection === "TB" ? ArrowUp : ArrowLeft;

  const forwardClickToRFNode = (e: React.MouseEvent) => {
    const nodeEl =
      (e.currentTarget as HTMLElement).closest(".react-flow__node") ||
      rootRef.current?.closest(".react-flow__node");
    if (!nodeEl) return;

    const opts: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: e.clientX,
      clientY: e.clientY,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    };

    nodeEl.dispatchEvent(new MouseEvent("mousedown", opts));
    nodeEl.dispatchEvent(new MouseEvent("mouseup", opts));
    nodeEl.dispatchEvent(new MouseEvent("click", opts));
  };

  const truncateLabel = (text: string = "", max: number = 32) =>
    text.length > max ? `${text.slice(0, max)}…` : text;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={rootRef}
          className={classNames}
          style={nodeStyle}
          onClick={onClick}
          onDoubleClick={(e: React.MouseEvent) => { e.stopPropagation(); onDoubleClick?.(); }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onContextMenu={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className={`node-card-header p-3 border-b flex ${data.id === "PROJECT" ? "flex-col items-center text-center" : "flex-row items-center justify-between"}`}
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
                  {truncateLabel(
                    data.label,
                    data.id === "PROJECT" ? 60 : (isCompactView ? 35 : 35)
                  )}
                </div>
              </div>
            </div>

            {data.id !== "PROJECT" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-200 ml-4"
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-12 w-12 ml-2 text-black dark:text-black" />
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  className="w-56"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  {!reduceMenus && (
                    <>
                      <DropdownMenuItem onClick={handleEdit}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={handleBrowse}>
                        <FolderOpen className="mr-2 h-4 w-4" /> Browse
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={handleRename}>
                        <Pencil className="mr-2 h-4 w-4" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSelectFrom}>
                        <FromIcon className="mr-2 h-4 w-4" /> Select from
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleSelectTo}>
                        <ToIcon className="mr-2 h-4 w-4" /> Select to
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {(data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
                        <DropdownMenuItem onSelect={handleStop}>
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
                    </>
                  )}

                  {reduceMenus && (data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
                    <>
                      <DropdownMenuItem onSelect={handleStop}>
                        <Square className="mr-2 h-4 w-4" /> Stop selection
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* Always visible */}
                  <DropdownMenuItem onClick={handleDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDuplicate}>
                    <Copy className="mr-2 h-4 w-4" /> Duplicate
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
            {data.id !== "PROJECT" && (
              <button
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-200 ml-4"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <Scan onClick={handleEdit} className="h-11 w-11 text-black dark:text-black" />
              </button>

            )}
          </div>

          {/* Content */}
          <div
            className={`transition-[max-height] duration-300 ease-in-out overflow-hidden ${isCompactView ? "max-h-0" : "max-h-[2000px]"
              }`}
            aria-hidden={isCompactView}
          >
            {data.id !== "PROJECT" && (
              <div className="node-card-content p-3 mt-4" style={{ minHeight: "120px", maxHeight: "300px", overflowY: "auto" }}>
                {Array.isArray(data.outputs) && data.outputs.length > 0 && (
                  <div className="outputs-list">
                    <div className="section-header flex items-center px-2 py-1 bg-green-50 dark:bg-green-50 rounded-t-lg border-b border-green-800 dark:border-green-800">
                      <span className="text-black dark:text-black font-normal text-4xl">Outputs</span>
                    </div>
                    <div className="section-content p-2 bg-green-100 dark:bg-green-200 rounded-b-lg space-y-2">
                      {data.outputs.map((outputObj, idx) => {
                        const [_, rawValue] = Object.entries(outputObj)[0];
                        const value = rawValue as { info: string; _class: string; _objValue: string; _parentId: string };
                        const isDragging = draggingIdx === idx;

                        return (
                          <div
                            key={idx}
                            className={`nodrag mt-3 group cursor-grab flex items-center px-3 py-1 rounded-full border border-gray-400 dark:border-gray-400 shadow-sm ${isDragging ? "scale-100 opacity-70" : "bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-200 dark:to-gray-300"}`}
                            draggable
                            onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
                              if (e.ctrlKey || e.metaKey) {
                                e.preventDefault();
                                e.stopPropagation();
                                forwardClickToRFNode(e);
                              }
                            }}
                            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                              e.preventDefault();
                              e.stopPropagation();
                              forwardClickToRFNode(e);
                            }}
                            onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                              e.stopPropagation();
                              setDraggingIdx(idx);
                              const output = {
                                _class: value._class,
                                _expectedClass: value._class,
                                _objValue: value._objValue,
                                info: value.info,
                                _parentId: value._parentId,
                              };
                              setCurrentDraggedOutput(output);
                              e.dataTransfer.setData("application/scipion-output", JSON.stringify(output));
                              const ghost = document.createElement("div");
                              ghost.style.position = "absolute";
                              ghost.style.top = "-1000px";
                              ghost.style.left = "-1000px";
                              ghost.style.padding = "6px 12px";
                              ghost.style.background = "white";
                              ghost.style.border = "1px solid #ccc";
                              ghost.style.color = "black";
                              ghost.style.borderRadius = "0.5rem";
                              ghost.innerText = `${value._class} (${value.info})`;
                              document.body.appendChild(ghost);
                              e.dataTransfer.setDragImage(ghost, 0, 15);
                              setTimeout(() => document.body.removeChild(ghost), 0);
                            }}
                            onDragEnd={() => {
                              setDraggingIdx(null);
                              setCurrentDraggedOutput(null);
                            }}
                          >
                            <ArrowUpRight className="h-7 w-7 mr-2 text-black-700 dark:text-black" />
                            <span className="outputs text-gray-800 dark:text-black mt-1">{value.info}</span>
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
                    fontSize: "2.2rem",
                  }}
                >
                  {data.status}
                  {(data.status === "running" || data.status === "failed" || data.status === "aborted") && (
                    <div className="flex items-center gap-1 flex-1 ml-2">
                      <div className="w-16 h-3 bg-white/30 rounded overflow-hidden">
                        <div
                          className="h-3 bg-white transition-[width] duration-500"
                          style={{ width: `${((data.stepsDone ?? 0) / (data.numberOfSteps ?? 1)) * 100}%` }}
                        />
                      </div>
                      <span className="text-3xl opacity-80 ml-4">
                        {data.stepsDone}/{data.numberOfSteps}
                      </span>
                    </div>
                  )}
                </span>

                <span className="flex items-center space-x-1 ml-6 text-3xl dark:text-black">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-500 dark:text-gray-400 mr-2" fill="none" viewBox="0 0 22 24" stroke="currentColor" strokeWidth={2}>
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

      {/* Node-specific context menu */}
      <ContextMenuContent className="w-56" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        {!reduceMenus && (
          <>
            <ContextMenuItem onClick={handleEdit}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </ContextMenuItem>
            {/* >>>>>> También desde el click derecho */}
            <ContextMenuItem onClick={handleBrowse}>
              <FolderOpen className="mr-2 h-4 w-4" /> Browse
            </ContextMenuItem>
            <ContextMenuItem onClick={handleRename}>
              <Pencil className="mr-2 h-4 w-4" /> Rename
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleSelectFrom}>
              <FromIcon className="mr-2 h-4 w-4" /> Select from
            </ContextMenuItem>
            <ContextMenuItem onClick={handleSelectTo}>
              <ToIcon className="mr-2 h-4 w-4" /> Select to
            </ContextMenuItem>
            <ContextMenuSeparator />
            {(data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
              <ContextMenuItem onClick={handleStop}>
                <Square className="mr-2 h-4 w-4" /> Stop
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={handleRestartAll}>
              <RefreshCw className="mr-2 h-4 w-4" /> Restart all
            </ContextMenuItem>
            <ContextMenuItem onClick={handleContinueAll}>
              <Play className="mr-2 h-4 w-4" /> Continue all
            </ContextMenuItem>
            <ContextMenuItem onClick={handleResetFrom}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset from
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {reduceMenus && (data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
          <>
            <ContextMenuItem onClick={handleStop}>
              <Square className="mr-2 h-4 w-4" /> Stop selection
            </ContextMenuItem>
          </>
        )}

        {/* Always visible */}
        <ContextMenuItem onClick={handleDelete}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </ContextMenuItem>
        <ContextMenuItem onClick={handleDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
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
