// src/components/protocol/ProtocolNodeCardWrapper.tsx
import { NodeProps, useReactFlow } from "reactflow";
import StatusNode from "./ProtocolNodeCard";

type NodeActions = {
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
};

export const createStatusNodeWrapper = (
  onClick: (data: any, evt?: React.MouseEvent) => void,
  onDoubleClick: (data: any) => void,
  getSelectedNodeId: () => string | undefined,
  getHoveredNodeId: () => string | undefined,
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>,
  getGraphDirection?: () => "TB" | "LR",
  getViewMode?: () => "hierarchical" | "grid" | "table",
  getNodeActions?: () => NodeActions,
  getPathSelectionNodeIds?: () => Set<string>,
  onBrowse?: (protocolId: string, projectId?: string | number, protocolLabel?: string) => void
) => {
  return function StatusNodeWrapper(props: NodeProps) {
    const { data, id, ...rest } = props;
    const { getViewport } = useReactFlow();
    const { zoom } = getViewport();

    const selectedNodeId = getSelectedNodeId?.();
    const hoveredNodeId = getHoveredNodeId?.();
    const graphDirection = getGraphDirection?.() ?? "TB";

    const viewMode = getViewMode?.() ?? "hierarchical";
    const showHandles = viewMode !== "grid";

    const handleMouseEnter = () => setHoveredNodeId?.(String(id));
    const handleMouseLeave = () => setHoveredNodeId?.(null);
    const isHovered =
      typeof hoveredNodeId === "string" && String(id) === String(hoveredNodeId);

    const actions = getNodeActions?.() ?? {};
    const pathSelectedSet = getPathSelectionNodeIds?.() ?? new Set<string>();
    const inPathSelection = pathSelectedSet.has(String(id));
    const pathSelectionActive = pathSelectedSet.size > 0;

    return (
      <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ display: "inline-block" }}>
        <StatusNode
          {...rest}
          id={String(id)}
          data={data as any}
          selectedNodeId={selectedNodeId}
          onClick={(evt?: React.MouseEvent) => onClick(data, evt)}
          onDoubleClick={() => onDoubleClick(data)}
          graphDirection={graphDirection}
          zoomLevel={zoom}
          hoveredNodeId={hoveredNodeId}
          setHoveredNodeId={setHoveredNodeId}
          isHovered={isHovered}
          // actions
          onEdit={actions.onEdit}
          onRename={actions.onRename}
          onDuplicate={actions.onDuplicate}
          onDelete={actions.onDelete}
          onRestartAll={actions.onRestartAll}
          onContinueAll={actions.onContinueAll}
          onResetFrom={actions.onResetFrom}
          onSelectFrom={actions.onSelectFrom}
          onSelectTo={actions.onSelectTo}
          onStop={actions.onStop}
          inPathSelection={inPathSelection}
          pathSelectionActive={pathSelectionActive}
          onBrowse={onBrowse}
          showHandles={viewMode !== "grid"} 
        />
      </div>
    );
  };
};
