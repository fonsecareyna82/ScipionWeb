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
};

type StatusNodeProps = {
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
  };
  selectedNodeId?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
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
  onClick,
  onDoubleClick,
}: StatusNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [rightClickOpen, setRightClickOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isSelected = selectedNodeId === data.id;
  const { setCurrentDraggedOutput } = useDrag();

  const bgColor =
    STATUS_COLORS[data.status ?? "finished"] ?? STATUS_COLORS["root"];
  data.color = bgColor;

  const classNames = [
    "status-node-card",
    "rounded-2xl border transition-shadow transform",
    isHovered ? "shadow-xl scale-[1.03]" : "shadow-md",
    isSelected ? "border-blue-600" : "border-gray-300",
  ]
    .filter(Boolean)
    .join(" ");

  // Handler right-click
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setRightClickOpen(true);
  };

  return (
    <div
      className={classNames}
      style={{ backgroundColor: bgColor }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu} // <-- right-click
    >
      {/* Header */}
      <div
        className={`node-card-header p-3 border-b flex ${
          data.id === "PROJECT"
            ? "flex-col items-center text-center"
            : "flex-row items-center justify-between"
        }`}
      >
        <div className="flex items-center space-x-2">
          {data.id !== "PROJECT" && (
            <div
              className={`node-id-badge ${
                data.status === "running" ? "glow-badge" : ""
              }`}
            >
              {data.id}
            </div>
          )}
          <div
            className={
              data.id === "PROJECT"
                ? "text-4xl text-black"
                : "node-label dark:text-black"
            }
          >
            {data.label}
          </div>
        </div>

        {/* Botón "..." */}
        {data.id !== "PROJECT" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-200 ml-4"
                onClick={(e) => e.stopPropagation()} // evita propagar click al nodo
              >
                <MoreHorizontal className="h-7 w-7 text-black dark:text-black ml-1" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuItem onSelect={onDoubleClick}>
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


      <div
        className={
          data.id !== "PROJECT"
            ? "border-t-1 border-gray-400 dark:border-gray-600"
            : ""
        }
      />

      {/* Content */}
      {data.id !== "PROJECT" && (
        <div
          className="node-card-content p-3 mt-4"
          style={{ minHeight: "120px", maxHeight: "300px", overflowY: "auto" }}
        >
          {Array.isArray(data.outputs) && data.outputs.length > 0 && (
            <div className="outputs-list space-y-2">
              {data.outputs.map((outputObj, idx) => {
                const [key, rawValue] = Object.entries(outputObj)[0];
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
                    className={`nodrag group cursor-grab flex items-center px-3 py-1 rounded-full border border-gray-400 dark:border-gray-600 shadow-sm hover:shadow-md transition-transform ${isDragging
                        ? "scale-100 opacity-70"
                        : "bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700"
                      }`}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setDraggingIdx(idx);

                      const output = {
                        _class: value._class,
                        _objValue: value._objValue,
                        info: value.info,
                        _parentId: value._parentId,
                      };

                      setCurrentDraggedOutput(output);

                      const payload = JSON.stringify(output);
                      e.dataTransfer.setData(
                        "application/scipion-output",
                        payload
                      );

                      const dragGhost = document.createElement("div");
                      dragGhost.style.position = "absolute";
                      dragGhost.style.top = "-1000px";
                      dragGhost.style.left = "-1000px";
                      dragGhost.style.padding = "6px 12px";
                      dragGhost.style.background = "#eee";
                      dragGhost.style.border = "1px solid #ccc";
                      dragGhost.style.borderRadius = "0.5rem";
                      dragGhost.innerText = `${value._class} (${value.info})`;
                      document.body.appendChild(dragGhost);
                      e.dataTransfer.setDragImage(dragGhost, 0, 15);
                      setTimeout(
                        () => document.body.removeChild(dragGhost),
                        0
                      );
                    }}
                    onDragEnd={() => {
                      setDraggingIdx(null);
                      setCurrentDraggedOutput(null);
                    }}
                  >
                    <span className="font-normal text-gray-900 dark:text-gray-100 text-2xl">
                      {value.info}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="border-t-1 border-gray-400 dark:border-gray-600 mt-3" />

      {/* Footer / Status + Progress */}
      {data.status && (
        <div className="node-card-footer p-3 border-t flex items-center justify-between">
          <span
            className="node-status-badge px-2 py-1 rounded text-sm flex items-center gap-2"
            style={{
              backgroundColor: STATUS_BADGE_COLORS[data.status] || "#999",
              color: "white",
              minWidth: "120px",
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
                        width: `${((data.stepsDone ?? 0) / (data.numberOfSteps ?? 1)) *
                          100
                          }%`,
                      }}
                    />
                  </div>
                  <span className="text-xl opacity-80 ml-4">
                    {data.stepsDone}/{data.numberOfSteps}
                  </span>
                </div>
              )}
          </span>

          <span className="flex items-center space-x-1 ml-6 text-2xl dark:text-black">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-gray-500 dark:text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
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

      {/* React Flow handles */}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      {/* Menú para right-click */}
      {rightClickOpen && (
        <DropdownMenu open={rightClickOpen} onOpenChange={setRightClickOpen}>
          <DropdownMenuContent
            className="w-56 absolute"
            style={{ top: menuPosition.y, left: menuPosition.x }}
          >
            <DropdownMenuItem onSelect={onDoubleClick}>
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
  );
}
