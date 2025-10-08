// ProtocolNodeCardWrapper.tsx
import { NodeProps, useReactFlow } from "reactflow";
import StatusNode from "./ProtocolNodeCard";

export const createStatusNodeWrapper = (
  onClick: (data: any, evt?: React.MouseEvent) => void,
  onDoubleClick: (data: any) => void,
  getSelectedNodeId: () => string | undefined,
  getHoveredNodeId: () => string | undefined,
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>,
  getGraphDirection?: () => "TB" | "LR"
) => {
  return function StatusNodeWrapper(props: NodeProps) {
    const { data, id, ...rest } = props;
    const { getViewport } = useReactFlow();
    const { zoom } = getViewport();

    // read latest values from getters (no re-creations of nodeTypes)
    const selectedNodeId = getSelectedNodeId?.();
    const hoveredNodeId = getHoveredNodeId?.();
    const graphDirection = getGraphDirection?.() ?? "TB";

    const handleMouseEnter = () => setHoveredNodeId?.(String(id));
    const handleMouseLeave = () => setHoveredNodeId?.(null);
    const isHovered =
      typeof hoveredNodeId === "string" && String(id) === String(hoveredNodeId);

    return (
      <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ display: "inline-block" }}>
        <StatusNode
          {...rest}
          id={String(id)}
          data={data}
          selectedNodeId={selectedNodeId}
          onClick={(evt?: React.MouseEvent) => onClick(data, evt)}
          onDoubleClick={() => onDoubleClick(data)}
          graphDirection={graphDirection}
          zoomLevel={zoom}
          hoveredNodeId={hoveredNodeId}
          setHoveredNodeId={setHoveredNodeId}
          isHovered={isHovered}
        />
      </div>
    );
  };
};
