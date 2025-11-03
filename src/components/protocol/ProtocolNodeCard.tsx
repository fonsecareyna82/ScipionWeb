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
    /** optional: if present in your data */
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
    const doc = (e.target as HTMLElement | null)?.ownerDocument || document;
    const win = doc.defaultView || window;

    const nodeEl =
      (e.currentTarget as HTMLElement)?.closest(".react-flow__node") ??
      rootRef.current?.closest(".react-flow__node") ??
      doc.querySelector(`.react-flow__node[data-id="${CSS.escape(String(data.id))}"]`);

    if (!nodeEl) return;

    const opts: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: e.clientX,
      clientY: e.clientY,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      view: win,                  
    };

    nodeEl.dispatchEvent(new MouseEvent("pointerdown", opts));
    nodeEl.dispatchEvent(new MouseEvent("pointerup", opts));
    nodeEl.dispatchEvent(new MouseEvent("mousedown", opts));
    nodeEl.dispatchEvent(new MouseEvent("mouseup", opts));
    nodeEl.dispatchEvent(new MouseEvent("click", opts));
  };


  const truncateLabel = (text: string = "", max: number = 120) =>
    text.length > max ? `${text.slice(0, max)}…` : text;

  const outputsArray = Array.isArray(data.outputs) ? data.outputs : [];
  const hasOutputs = outputsArray.length > 0;

  // --- Shortcut labels (mac vs win/linux) ---
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  const mod = isMac ? "⌘" : "Ctrl";
  const modShift = isMac ? "⌘⇧" : "Ctrl+Shift";

  // Centralize strings so we re-use consistently in both menus
  const s = {
    edit: "Space / Db-Click",
    browse: `${mod} + B`,
    rename: "F2",
    delete: "Del",
    duplicate: `${mod} + D`,
    restartAll: `${modShift} + R`,
    continueAll: `${modShift} + C`,
    resetFrom: `${modShift} + F`,
    stop: `${modShift} + S`,
    selectFrom: "Alt + ↓",
    selectTo: "Alt + ↑",
  } as const;

  // Small helper for right-aligned shortcut hint
  const ShortcutHint = ({ text }: { text?: string }) =>
    text ? (
      <span className="ml-6 text-xs text-gray-500 font-mono tabular-nums">
        {text}
      </span>
    ) : null;

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
            <div className="flex items-center space-x-2 header-left">
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
                    data.id === "PROJECT" ? 120 : 120
                  )}
                </div>
              </div>
            </div>

            {data.id !== "PROJECT" && (
              <div className="flex items-center header-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-200 ml-4 nodrag"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onContextMenu={(e) => e.stopPropagation()}
                      draggable={false}
                      data-nodrag
                      aria-label="Open node menu"
                    >
                      <MoreHorizontal className="h-12 w-12 ml-2 text-black dark:text-black pointer-events-none" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    className="w-56"
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    {!reduceMenus && (
                      <>
                        <DropdownMenuItem onClick={handleEdit}>
                          <div className="flex w-full items-center justify-between">
                            <span className="flex items-center gap-2">
                              <Pencil className="h-4 w-4" />
                              <span>Edit</span>
                            </span>
                            <ShortcutHint text={s.edit} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={handleBrowse}>
                          <div className="flex w-full items-center justify-between">
                            <span className="flex items-center gap-2">
                              <FolderOpen className="h-4 w-4" />
                              <span>Browse</span>
                            </span>
                            <ShortcutHint text={s.browse} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={handleRename}>
                          <div className="flex w-full items-center justify-between">
                            <span className="flex items-center gap-2">
                              <Pencil className="h-4 w-4" />
                              <span>Rename</span>
                            </span>
                            <ShortcutHint text={s.rename} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={handleSelectFrom}>
                          <div className="flex w-full items-center justify-between">
                            <span className="flex items-center gap-2">
                              <FromIcon className="h-4 w-4" />
                              <span>Select from</span>
                            </span>
                            <ShortcutHint text={s.selectFrom} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={handleSelectTo}>
                          <div className="flex w-full items-center justify-between">
                            <span className="flex items-center gap-2">
                              <ToIcon className="h-4 w-4" />
                              <span>Select to</span>
                            </span>
                            <ShortcutHint text={s.selectTo} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        {(data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
                          <DropdownMenuItem onSelect={handleStop}>
                            <div className="flex w-full items-center justify-between">
                              <span className="flex items-center gap-2">
                                <Square className="h-4 w-4" />
                                <span>Stop</span>
                              </span>
                              <ShortcutHint text={s.stop} />
                            </div>
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuItem onClick={handleRestartAll}>
                          <div className="flex w-full items-center justify-between">
                            <span className="flex items-center gap-2">
                              <RefreshCw className="h-4 w-4" />
                              <span>Restart all</span>
                            </span>
                            <ShortcutHint text={s.restartAll} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={handleContinueAll}>
                          <div className="flex w-full items-center justify-between">
                            <span className="flex items-center gap-2">
                              <Play className="h-4 w-4" />
                              <span>Continue all</span>
                            </span>
                            <ShortcutHint text={s.continueAll} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={handleResetFrom}>
                          <div className="flex w-full items-center justify-between">
                            <span className="flex items-center gap-2">
                              <RotateCcw className="h-4 w-4" />
                              <span>Reset from</span>
                            </span>
                            <ShortcutHint text={s.resetFrom} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                      </>
                    )}

                    {reduceMenus && (data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
                      <>
                        <DropdownMenuItem onSelect={handleStop}>
                          <div className="flex w-full items-center justify-between">
                            <span className="flex items-center gap-2">
                              <Square className="h-4 w-4" />
                              <span>Stop selection</span>
                            </span>
                            <ShortcutHint text={s.stop} />
                          </div>
                        </DropdownMenuItem>
                      </>
                    )}

                    <DropdownMenuItem onClick={handleDelete}>
                      <div className="flex w-full items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </span>
                        <ShortcutHint text={s.delete} />
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={handleDuplicate}>
                      <div className="flex w-full items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Copy className="h-4 w-4" />
                          <span>Duplicate</span>
                        </span>
                        <ShortcutHint text={s.duplicate} />
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem>
                      <div className="flex w-full items-center justify-between">
                        <span className="flex items-center gap-2">
                          <FileUp className="h-4 w-4" />
                          <span>Export</span>
                        </span>
                        <ShortcutHint text={undefined} />
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuItem>
                      <div className="flex w-full items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          <span>Export & upload</span>
                        </span>
                        <ShortcutHint text={undefined} />
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  type="button"
                  className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-200 ml-4 nodrag"
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); handleEdit(); }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => e.stopPropagation()}
                  draggable={false}
                  data-nodrag
                  aria-label="Edit protocol"
                >
                  <Scan className="h-11 w-11 text-black dark:text-black pointer-events-none" />
                </button>
              </div>
            )}
          </div>

          {/* Content (reserved height for up to 3 outputs) */}
          <div
            className={`transition-[max-height] duration-300 ease-in-out overflow-hidden ${isCompactView ? "max-h-0" : "max-h-[2000px]"}`}
            aria-hidden={isCompactView}
          >
            {data.id !== "PROJECT" && (
              <div className="node-card-content p-3 mt-4">
                <div className="outputs-reserved">
                  {hasOutputs ? (
                    <div className="outputs-list">
                      <div className="section-header flex items-center px-2 py-1 bg-green-50 dark:bg-green-50 rounded-t-lg border-b border-green-800 dark:border-green-800">
                        <span className="text-black dark:text-black font-normal text-4xl">Outputs</span>
                      </div>

                      <div className="section-content">
                        {outputsArray.map((outputObj, idx) => {
                          const [, rawValue] = Object.entries(outputObj)[0];
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
                              <span className="outputs output-text text-gray-800 dark:text-black mt-1">
                                {value.info}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="outputs-placeholder" aria-hidden="true" />
                  )}
                </div>
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
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2">
                  <Pencil className="h-4 w-4" />
                  <span>Edit</span>
                </span>
                <ShortcutHint text={s.edit} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleBrowse}>
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  <span>Browse</span>
                </span>
                <ShortcutHint text={s.browse} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleRename}>
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2">
                  <Pencil className="h-4 w-4" />
                  <span>Rename</span>
                </span>
                <ShortcutHint text={s.rename} />
              </div>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={handleSelectFrom}>
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2">
                  <FromIcon className="h-4 w-4" />
                  <span>Select from</span>
                </span>
                <ShortcutHint text={s.selectFrom} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleSelectTo}>
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2">
                  <ToIcon className="h-4 w-4" />
                  <span>Select to</span>
                </span>
                <ShortcutHint text={s.selectTo} />
              </div>
            </ContextMenuItem>

            <ContextMenuSeparator />

            {(data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
              <ContextMenuItem onClick={handleStop}>
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Square className="h-4 w-4" />
                    <span>Stop</span>
                  </span>
                  <ShortcutHint text={s.stop} />
                </div>
              </ContextMenuItem>
            )}

            <ContextMenuItem onClick={handleRestartAll}>
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  <span>Restart all</span>
                </span>
                <ShortcutHint text={s.restartAll} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleContinueAll}>
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  <span>Continue all</span>
                </span>
                <ShortcutHint text={s.continueAll} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleResetFrom}>
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  <span>Reset from</span>
                </span>
                <ShortcutHint text={s.resetFrom} />
              </div>
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        )}

        {reduceMenus && (data.status === "running" || data.status === "launched" || data.status === "scheduled") && (
          <>
            <ContextMenuItem onClick={handleStop}>
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2">
                  <Square className="h-4 w-4" />
                  <span>Stop selection</span>
                </span>
                <ShortcutHint text={s.stop} />
              </div>
            </ContextMenuItem>
          </>
        )}

        <ContextMenuItem onClick={handleDelete}>
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </span>
            <ShortcutHint text={s.delete} />
          </div>
        </ContextMenuItem>

        <ContextMenuItem onClick={handleDuplicate}>
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2">
              <Copy className="h-4 w-4" />
              <span>Duplicate</span>
            </span>
            <ShortcutHint text={s.duplicate} />
          </div>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem>
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2">
              <FileUp className="h-4 w-4" />
              <span>Export</span>
            </span>
            <ShortcutHint text={undefined} />
          </div>
        </ContextMenuItem>

        <ContextMenuItem>
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span>Export & upload</span>
            </span>
            <ShortcutHint text={undefined} />
          </div>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
