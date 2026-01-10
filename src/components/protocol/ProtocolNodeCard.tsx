import { useRef, useState } from "react";
import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  SetStateAction,
} from "react";

import { Handle, Position } from "reactflow";
import styles from "./ProtocolNodeCard.module.css";

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

const statusColors: Record<string, string> = {
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

const statusBadgeColors: Record<string, string> = {
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
    projectId?: string | number;
  };

  selectedNodeId?: string;
  hoveredNodeId?: string;
  isHovered?: boolean;
  setHoveredNodeId?: Dispatch<SetStateAction<string | null>>;
  graphDirection?: "TB" | "LR";
  onClick?: (evt?: ReactMouseEvent) => void;
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
  onBrowse?: (
    protocolId: string,
    projectId?: string | number,
    protocolLabel?: string
  ) => void;

  inPathSelection?: boolean;
  pathSelectionActive?: boolean;

  sourcePosition?: Position;
  targetPosition?: Position;

  showHandles?: boolean;
};

const formatCpuTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}h:${pad(minutes)}m:${pad(secs)}s`;
};

type NormalizedOutput = {
  name?: string;
  info?: string;
  paramClass: string;
  pointerClass?: string;
  _objValue?: string;
  parentId?: string | number;
};

const normalizeOutputItem = (outputObj: unknown): NormalizedOutput | null => {
  // Supports both shapes:
  // 1) Flat:
  //    { name, paramClass: "PointerParam", pointerClass, info, _objValue, parentId }
  // 2) Wrapped legacy:
  //    { SomeName: { paramClass: "PointerParam", pointerClass, info, _objValue, parentId } }
  // Also tolerates older fields (_class) during transition.
  if (!outputObj || typeof outputObj !== "object") return null;

  const flatCandidate = outputObj as Record<string, unknown>;

  const hasFlatSignature =
    "paramClass" in flatCandidate &&
    (("info" in flatCandidate) || ("name" in flatCandidate) || ("pointerClass" in flatCandidate));

  if (hasFlatSignature) {
    const normalized: NormalizedOutput = {
      name: typeof flatCandidate.name === "string" ? flatCandidate.name : undefined,
      info: typeof flatCandidate.info === "string" ? flatCandidate.info : undefined,
      paramClass: String(flatCandidate.paramClass ?? ""),
      pointerClass:
        typeof flatCandidate.pointerClass === "string"
          ? flatCandidate.pointerClass
          : typeof flatCandidate._class === "string"
            ? (flatCandidate._class as string)
            : undefined,
      _objValue: typeof flatCandidate._objValue === "string" ? flatCandidate._objValue : undefined,
      parentId:
        typeof flatCandidate.parentId === "string" || typeof flatCandidate.parentId === "number"
          ? flatCandidate.parentId
          : undefined,
    };

    return normalized.paramClass ? normalized : null;
  }

  const entries = Object.entries(flatCandidate);
  if (entries.length === 1) {
    const [wrappedName, wrappedValue] = entries[0];
    if (wrappedValue && typeof wrappedValue === "object") {
      const wrappedDef = wrappedValue as Record<string, unknown>;
      if ("paramClass" in wrappedDef || "_class" in wrappedDef) {
        const normalized: NormalizedOutput = {
          name: wrappedName,
          info: typeof wrappedDef.info === "string" ? wrappedDef.info : undefined,
          paramClass: String(wrappedDef.paramClass ?? wrappedDef._class ?? ""),
          pointerClass:
            typeof wrappedDef.pointerClass === "string"
              ? wrappedDef.pointerClass
              : typeof wrappedDef._class === "string"
                ? (wrappedDef._class as string)
                : undefined,
          _objValue: typeof wrappedDef._objValue === "string" ? wrappedDef._objValue : undefined,
          parentId:
            typeof wrappedDef.parentId === "string" || typeof wrappedDef.parentId === "number"
              ? wrappedDef.parentId
              : undefined,
        };

        return normalized.paramClass ? normalized : null;
      }
    }
  }

  return null;
};

export default function ProtocolNodeCard({
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
  showHandles = true,
}: StatusNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const isSelected = selectedNodeId === data.id;

  const { setCurrentDraggedOutput } = useDrag();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isProjectNode = data.id === "PROJECT";
  const isCompactView = zoomLevel <= compactThreshold;

  const bgColor = statusColors[data.status ?? "finished"] ?? statusColors.root;
  data.color = bgColor;

  const nodeStyle: React.CSSProperties = {
    backgroundColor: bgColor,
  };

  const classNames = [
    styles.card,
    styles.crispText,
    isHovered ? styles.hovered : "",
    isSelected ? styles.selected : "",
    inPathSelection ? styles.inPathSelection : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleEdit = () => onEdit?.(data.id);
  const handleRename = () => onRename?.(data.id);
  const handleDuplicate = () => onDuplicate?.(data.id);
  const handleDelete = () => onDelete?.(data.id);
  const handleRestartAll = () => onRestartAll?.(data.id);
  const handleContinueAll = () => onContinueAll?.(data.id);
  const handleResetFrom = () => onResetFrom?.(data.id);

  const handleSelectFrom = () => {
    if (!isProjectNode) onSelectFrom?.(data.id);
  };

  const handleSelectTo = () => {
    if (!isProjectNode) onSelectTo?.(data.id);
  };

  const handleStop = () => {
    if (!isProjectNode) onStop?.(data.id);
  };

  const handleBrowse = () => {
    if (!isProjectNode) onBrowse?.(data.id, data.projectId, data.label);
  };

  const reduceMenus = pathSelectionActive || inPathSelection;

  const FromIcon = graphDirection === "TB" ? ArrowDown : ArrowRight;
  const ToIcon = graphDirection === "TB" ? ArrowUp : ArrowLeft;

  const forwardClickToRFNode = (e: ReactMouseEvent) => {
    const doc = (e.target as HTMLElement | null)?.ownerDocument || document;
    const win = doc.defaultView || window;

    const nodeEl =
      (e.currentTarget as HTMLElement)?.closest(".react-flow__node") ??
      rootRef.current?.closest(".react-flow__node") ??
      doc.querySelector(
        `.react-flow__node[data-id="${CSS.escape(String(data.id))}"]`
      );

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

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  const mod = isMac ? "⌘" : "Ctrl";
  const modShift = isMac ? "⌘⇧" : "Ctrl+Shift";

  const shortcuts = {
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

  const ShortcutHint = ({ text }: { text?: string }) =>
    text ? <span className={styles.shortcutHint}>{text}</span> : null;

  const shouldRenderProtocolBody = !isProjectNode;
  const isContentExpanded = !isCompactView;

  const contentClassName = [
    styles.content,
    isContentExpanded ? styles.contentExpanded : styles.contentCollapsed,
  ].join(" ");

  const contentStyle: React.CSSProperties = {
    opacity: isContentExpanded ? 1 : 0,
    transition:
      "max-height 520ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 260ms ease-in-out",
    willChange: "max-height, opacity",
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={rootRef}
          className={classNames}
          style={nodeStyle}
          onClick={onClick}
          onDoubleClick={(e: ReactMouseEvent) => {
            e.stopPropagation();
            onDoubleClick?.();
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            className={[
              styles.header,
              isProjectNode ? styles.headerProject : styles.headerProtocol,
            ].join(" ")}
          >
            <div className={styles.headerLeft}>
              {!isProjectNode && (
                <div
                  className={[
                    styles.nodeIdBadge,
                    data.status === "running" ? styles.glowBadge : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={
                    isCompactView ? { fontSize: "2.4rem" } : { fontSize: "2.3rem" }
                  }
                >
                  <span>{data.id}</span>
                </div>
              )}

              {isProjectNode ? (
                <div
                  className={styles.projectLabelWrapper}
                  style={isCompactView ? { fontSize: "2.8rem" } : {}}
                >
                  <div title={data.label}>{truncateLabel(data.label, 120)}</div>
                </div>
              ) : (
                <div
                  className={[
                    styles.label,
                    isCompactView ? styles.labelCompact : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={data.label}
                >
                  {truncateLabel(data.label, 120)}
                </div>
              )}
            </div>

            {!isProjectNode && (
              <div className={styles.headerRight}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`${styles.iconButton} nodrag`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      draggable={false}
                      data-nodrag
                      aria-label="Open node menu"
                    >
                      <MoreHorizontal className={styles.menuIcon} />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    className={styles.menuContent}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!reduceMenus && (
                      <>
                        <DropdownMenuItem onClick={handleEdit}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <Pencil className={styles.menuItemIcon} />
                              <span>Edit</span>
                            </span>
                            <ShortcutHint text={shortcuts.edit} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={handleBrowse}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <FolderOpen className={styles.menuItemIcon} />
                              <span>Browse</span>
                            </span>
                            <ShortcutHint text={shortcuts.browse} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={handleRename}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <Pencil className={styles.menuItemIcon} />
                              <span>Rename</span>
                            </span>
                            <ShortcutHint text={shortcuts.rename} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={handleSelectFrom}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <FromIcon className={styles.menuItemIcon} />
                              <span>Select from</span>
                            </span>
                            <ShortcutHint text={shortcuts.selectFrom} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={handleSelectTo}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <ToIcon className={styles.menuItemIcon} />
                              <span>Select to</span>
                            </span>
                            <ShortcutHint text={shortcuts.selectTo} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        {(data.status === "running" ||
                          data.status === "launched" ||
                          data.status === "scheduled") && (
                          <DropdownMenuItem onClick={handleStop}>
                            <div className={styles.menuRow}>
                              <span className={styles.menuLeft}>
                                <Square className={styles.menuItemIcon} />
                                <span>Stop</span>
                              </span>
                              <ShortcutHint text={shortcuts.stop} />
                            </div>
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuItem onClick={handleRestartAll}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <RefreshCw className={styles.menuItemIcon} />
                              <span>Restart all</span>
                            </span>
                            <ShortcutHint text={shortcuts.restartAll} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={handleContinueAll}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <Play className={styles.menuItemIcon} />
                              <span>Continue all</span>
                            </span>
                            <ShortcutHint text={shortcuts.continueAll} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={handleResetFrom}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <RotateCcw className={styles.menuItemIcon} />
                              <span>Reset from</span>
                            </span>
                            <ShortcutHint text={shortcuts.resetFrom} />
                          </div>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                      </>
                    )}

                    {reduceMenus &&
                      (data.status === "running" ||
                        data.status === "launched" ||
                        data.status === "scheduled") && (
                        <DropdownMenuItem onClick={handleStop}>
                          <div className={styles.menuRow}>
                            <span className={styles.menuLeft}>
                              <Square className={styles.menuItemIcon} />
                              <span>Stop selection</span>
                            </span>
                            <ShortcutHint text={shortcuts.stop} />
                          </div>
                        </DropdownMenuItem>
                      )}

                    <DropdownMenuItem onClick={handleDelete}>
                      <div className={styles.menuRow}>
                        <span className={styles.menuLeft}>
                          <Trash2 className={styles.menuItemIcon} />
                          <span>Delete</span>
                        </span>
                        <ShortcutHint text={shortcuts.delete} />
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={handleDuplicate}>
                      <div className={styles.menuRow}>
                        <span className={styles.menuLeft}>
                          <Copy className={styles.menuItemIcon} />
                          <span>Duplicate</span>
                        </span>
                        <ShortcutHint text={shortcuts.duplicate} />
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem>
                      <div className={styles.menuRow}>
                        <span className={styles.menuLeft}>
                          <FileUp className={styles.menuItemIcon} />
                          <span>Export</span>
                        </span>
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuItem>
                      <div className={styles.menuRow}>
                        <span className={styles.menuLeft}>
                          <Upload className={styles.menuItemIcon} />
                          <span>Export & upload</span>
                        </span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  type="button"
                  className={`${styles.iconButton} nodrag`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit();
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  draggable={false}
                  data-nodrag
                  aria-label="Edit protocol"
                >
                  <Scan className={styles.scanIcon} />
                </button>
              </div>
            )}
          </div>

          {shouldRenderProtocolBody && (
            <div
              className={contentClassName}
              style={contentStyle}
              aria-hidden={!isContentExpanded}
            >
              <div className={styles.cardContent}>
                <div className={styles.outputsReserved}>
                  {hasOutputs ? (
                    <div className={styles.outputsList}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Outputs</span>
                      </div>

                      <div className={styles.sectionContent} data-has-scroll>
                        {outputsArray.map((outputObj, idx) => {
                          const value = normalizeOutputItem(outputObj);
                          if (!value) return null;

                          const isDragging = draggingIdx === idx;

                          const labelText =
                            value.info ??
                            value.name ??
                            value.pointerClass ??
                            value.paramClass ??
                            "Output";

                          const displayClass =
                            value.pointerClass ?? value.paramClass ?? "PointerParam";

                          const pillKey =
                            value._objValue ??
                            `${String(value.parentId ?? "")}:${String(value.name ?? idx)}`;

                          return (
                            <div
                              key={pillKey}
                              className={[
                                styles.outputPill,
                                isDragging ? styles.outputPillDragging : "",
                                "nodrag",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              draggable
                              onMouseDown={(e: ReactMouseEvent<HTMLDivElement>) => {
                                if (e.ctrlKey || e.metaKey) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  forwardClickToRFNode(e);
                                }
                              }}
                              onClick={(e: ReactMouseEvent<HTMLDivElement>) => {
                                e.preventDefault();
                                e.stopPropagation();
                                forwardClickToRFNode(e);
                              }}
                              onDragStart={(e: ReactDragEvent<HTMLDivElement>) => {
                                e.stopPropagation();
                                setDraggingIdx(idx);

                                const output = {
                                  paramClass: value.paramClass,
                                  pointerClass: value.pointerClass ?? "",
                                  _expectedClass: value.pointerClass ?? "",
                                  _objValue: value._objValue ?? "",
                                  info: value.info ?? "",
                                  parentId: value.parentId ?? "",
                                  name: value.name ?? "",
                                };

                                setCurrentDraggedOutput(output);
                                e.dataTransfer.setData(
                                  "application/scipion-output",
                                  JSON.stringify(output)
                                );

                                const ghost = document.createElement("div");
                                ghost.style.position = "absolute";
                                ghost.style.top = "-1000px";
                                ghost.style.left = "-1000px";
                                ghost.style.padding = "6px 12px";
                                ghost.style.background = "white";
                                ghost.style.border = "1px solid #ccc";
                                ghost.style.color = "black";
                                ghost.style.borderRadius = "0.5rem";
                                ghost.innerText = `${displayClass} (${labelText})`;
                                document.body.appendChild(ghost);
                                e.dataTransfer.setDragImage(ghost, 0, 15);
                                setTimeout(() => document.body.removeChild(ghost), 0);
                              }}
                              onDragEnd={() => {
                                setDraggingIdx(null);
                                setCurrentDraggedOutput(null);
                              }}
                            >
                              <ArrowUpRight className={styles.outputIcon} />
                              <span className={styles.outputText}>{labelText}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.outputsPlaceholder} aria-hidden="true" />
                  )}
                </div>
              </div>

              {data.status && (
                <div className={styles.footer}>
                  <span
                    className={styles.statusBadge}
                    style={{
                      backgroundColor: statusBadgeColors[data.status] || "#999",
                    }}
                  >
                    {data.status}

                    {(data.status === "running" ||
                      data.status === "failed" ||
                      data.status === "aborted") && (
                      <span className={styles.progress}>
                        <span className={styles.progressTrack}>
                          <span
                            className={styles.progressFill}
                            style={{
                              width: `${((data.stepsDone ?? 0) / (data.numberOfSteps ?? 1)) * 100}%`,
                            }}
                          />
                        </span>
                        <span className={styles.progressText}>
                          {data.stepsDone}/{data.numberOfSteps}
                        </span>
                      </span>
                    )}
                  </span>

                  <span className={styles.timeRow}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={styles.timeIcon}
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
          )}

          {showHandles && (
            <>
              <Handle
                type="target"
                position={graphDirection === "TB" ? Position.Top : Position.Left}
                style={
                  graphDirection === "TB"
                    ? {}
                    : { top: "50%", transform: "translateY(-50%)" }
                }
              />
              <Handle
                type="source"
                position={graphDirection === "TB" ? Position.Bottom : Position.Right}
                style={
                  graphDirection === "TB"
                    ? {}
                    : { top: "50%", transform: "translateY(-50%)" }
                }
              />
            </>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent
        className={styles.menuContent}
        onClick={(e) => e.stopPropagation()}
      >
        {!reduceMenus && (
          <>
            <ContextMenuItem onClick={handleEdit}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <Pencil className={styles.menuItemIcon} />
                  <span>Edit</span>
                </span>
                <ShortcutHint text={shortcuts.edit} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleBrowse}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <FolderOpen className={styles.menuItemIcon} />
                  <span>Browse</span>
                </span>
                <ShortcutHint text={shortcuts.browse} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleRename}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <Pencil className={styles.menuItemIcon} />
                  <span>Rename</span>
                </span>
                <ShortcutHint text={shortcuts.rename} />
              </div>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={handleSelectFrom}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <FromIcon className={styles.menuItemIcon} />
                  <span>Select from</span>
                </span>
                <ShortcutHint text={shortcuts.selectFrom} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleSelectTo}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <ToIcon className={styles.menuItemIcon} />
                  <span>Select to</span>
                </span>
                <ShortcutHint text={shortcuts.selectTo} />
              </div>
            </ContextMenuItem>

            <ContextMenuSeparator />

            {(data.status === "running" ||
              data.status === "launched" ||
              data.status === "scheduled") && (
              <ContextMenuItem onClick={handleStop}>
                <div className={styles.menuRow}>
                  <span className={styles.menuLeft}>
                    <Square className={styles.menuItemIcon} />
                    <span>Stop</span>
                  </span>
                  <ShortcutHint text={shortcuts.stop} />
                </div>
              </ContextMenuItem>
            )}

            <ContextMenuItem onClick={handleRestartAll}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <RefreshCw className={styles.menuItemIcon} />
                  <span>Restart all</span>
                </span>
                <ShortcutHint text={shortcuts.restartAll} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleContinueAll}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <Play className={styles.menuItemIcon} />
                  <span>Continue all</span>
                </span>
                <ShortcutHint text={shortcuts.continueAll} />
              </div>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleResetFrom}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <RotateCcw className={styles.menuItemIcon} />
                  <span>Reset from</span>
                </span>
                <ShortcutHint text={shortcuts.resetFrom} />
              </div>
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        )}

        {reduceMenus &&
          (data.status === "running" ||
            data.status === "launched" ||
            data.status === "scheduled") && (
            <ContextMenuItem onClick={handleStop}>
              <div className={styles.menuRow}>
                <span className={styles.menuLeft}>
                  <Square className={styles.menuItemIcon} />
                  <span>Stop selection</span>
                </span>
                <ShortcutHint text={shortcuts.stop} />
              </div>
            </ContextMenuItem>
          )}

        <ContextMenuItem onClick={handleDelete}>
          <div className={styles.menuRow}>
            <span className={styles.menuLeft}>
              <Trash2 className={styles.menuItemIcon} />
              <span>Delete</span>
            </span>
            <ShortcutHint text={shortcuts.delete} />
          </div>
        </ContextMenuItem>

        <ContextMenuItem onClick={handleDuplicate}>
          <div className={styles.menuRow}>
            <span className={styles.menuLeft}>
              <Copy className={styles.menuItemIcon} />
              <span>Duplicate</span>
            </span>
            <ShortcutHint text={shortcuts.duplicate} />
          </div>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem>
          <div className={styles.menuRow}>
            <span className={styles.menuLeft}>
              <FileUp className={styles.menuItemIcon} />
              <span>Export</span>
            </span>
          </div>
        </ContextMenuItem>

        <ContextMenuItem>
          <div className={styles.menuRow}>
            <span className={styles.menuLeft}>
              <Upload className={styles.menuItemIcon} />
              <span>Export & upload</span>
            </span>
          </div>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
