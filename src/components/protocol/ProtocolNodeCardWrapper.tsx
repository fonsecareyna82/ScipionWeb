// File: src/components/protocol/ProtocolNodeCardWrapper.tsx
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
};

export const createStatusNodeWrapper = (
  onClick: (data: any, evt?: React.MouseEvent) => void,
  onDoubleClick: (data: any) => void,
  getSelectedNodeId: () => string | undefined, // kept for backward-compat; not used now
  getHoveredNodeId: () => string | undefined,
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>,
  getGraphDirection?: () => "TB" | "LR",
  getNodeActions?: () => NodeActions
) => {
  return function StatusNodeWrapper(props: NodeProps) {
    const { data, id, selected, ...rest } = props;
    const { getViewport } = useReactFlow();
    const { zoom } = getViewport();

    const hoveredNodeId = getHoveredNodeId?.();
    const graphDirection = getGraphDirection?.() ?? "TB";

    const handleMouseEnter = () => setHoveredNodeId?.(String(id));
    const handleMouseLeave = () => setHoveredNodeId?.(null);
    const isHovered = typeof hoveredNodeId === "string" && String(id) === String(hoveredNodeId);

    const actions = getNodeActions?.() ?? {};

    return (
      <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ display: "inline-block" }}>
        <StatusNode
          {...rest}
          id={String(id)}
          data={data}
          selected={selected}            // <-- use React Flow's selected for instant visual update
          onClick={(evt?: React.MouseEvent) => onClick(data, evt)}
          onDoubleClick={() => onDoubleClick(data)}
          graphDirection={graphDirection}
          zoomLevel={zoom}
          hoveredNodeId={hoveredNodeId}
          setHoveredNodeId={setHoveredNodeId}
          isHovered={isHovered}
          onEdit={actions.onEdit}
          onRename={actions.onRename}
          onDuplicate={actions.onDuplicate}
          onDelete={actions.onDelete}
          onRestartAll={actions.onRestartAll}
          onContinueAll={actions.onContinueAll}
          onResetFrom={actions.onResetFrom}
          onSelectFrom={actions.onSelectFrom}
          onSelectTo={actions.onSelectTo}
        />
      </div>
    );
  };
};
