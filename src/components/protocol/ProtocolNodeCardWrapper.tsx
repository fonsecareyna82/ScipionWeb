// File: src/components/protocol/ProtocolNodeCardWrapper.tsx
import React from "react";
import { NodeProps, useReactFlow } from "reactflow";
import StatusNode from "./ProtocolNodeCard";

/**
 * Wrapper liviano: NO renderiza <Handle>.
 * Los Handle viven dentro de StatusNode y ahí se posicionan con
 * props.sourcePosition / props.targetPosition (LR/TB).
 */
export const createStatusNodeWrapper = (
  onClick: (data: any, evt?: React.MouseEvent) => void,
  onDoubleClick: (data: any) => void,
  selectedNodeId?: string,
  hoveredNodeId?: string,
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>,
  graphDirection: "TB" | "LR" = "TB"
) => {
  const Wrapper: React.FC<NodeProps<any>> = (props) => {
    const { id, data } = props as any;

    // Hover helpers
    const isHovered =
      typeof hoveredNodeId === "string" && String(id) === String(hoveredNodeId);
    const handleEnter = () => setHoveredNodeId?.(String(id));
    const handleLeave = () => setHoveredNodeId?.(null);

    // Zoom (por si tu card lo usa)
    const { getViewport } = useReactFlow();
    const { zoom } = getViewport();

    return (
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{ display: "inline-block", position: "relative" }}
      >
        <StatusNode
          {...props}
          id={String(id)}
          data={data}
          selectedNodeId={selectedNodeId}
          hoveredNodeId={hoveredNodeId}
          setHoveredNodeId={setHoveredNodeId}
          isHovered={isHovered}
          zoomLevel={zoom}
          graphDirection={graphDirection} 
          onClick={(evt?: React.MouseEvent) => onClick({ id, data }, evt)}
          onDoubleClick={() => onDoubleClick({ id, data })}
        />
      </div>
    );
  };

  return Wrapper;
};
