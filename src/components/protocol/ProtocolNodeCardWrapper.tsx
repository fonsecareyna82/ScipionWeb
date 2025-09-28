import { NodeProps, useReactFlow } from "reactflow";
import StatusNode from "./ProtocolNodeCard";

export const createStatusNodeWrapper = (
  onClick: (data: any) => void,
  onDoubleClick: (data: any) => void,
  selectedNodeId?: string,
  hoveredNodeId?: string,
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>,
  graphDirection: "TB" | "LR" = "TB"
) => {
  return function StatusNodeWrapper(props: NodeProps) {
    const { data, id, ...rest } = props;
    const { getViewport } = useReactFlow();
    const { zoom } = getViewport();

    // helpers for hover: sólo actúan si setHoveredNodeId fue inyectado
    const handleMouseEnter = () => {
      setHoveredNodeId?.(String(id));
    };
    const handleMouseLeave = () => {
      setHoveredNodeId?.(null);
    };

    const isHovered = typeof hoveredNodeId === "string" && String(id) === String(hoveredNodeId);

    return (
      <div
        // envolvemos para poder usar eventos DOM si StatusNode no expone props onMouse...
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        // evita que el wrapper cambie la apariencia por defecto, estilo inline neutral
        style={{ display: "inline-block" }}
      >
        <StatusNode
          {...rest}
          id={String(id)}
          data={data}
          selectedNodeId={selectedNodeId}
          onClick={() => onClick(data)}
          onDoubleClick={() => onDoubleClick(data)}
          graphDirection={graphDirection}
          zoomLevel={zoom}
          // pasamos info de hover por si StatusNode la necesita para pintar distinto
          hoveredNodeId={hoveredNodeId}
          setHoveredNodeId={setHoveredNodeId}
          isHovered={isHovered}
        />
      </div>
    );
  };
};
