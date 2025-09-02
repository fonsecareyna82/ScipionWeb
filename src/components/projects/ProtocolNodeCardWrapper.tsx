import { NodeProps } from 'reactflow';
import StatusNode from './ProtocolNodeCard';

export const createStatusNodeWrapper = (
  onClick: (data: any) => void,
  onDoubleClick: (data: any) => void,
  selectedNodeId?: string,
  hoveredNodeId?: string | null,
  setHoveredNodeId?: (id: string | null) => void
) => {
  return function StatusNodeWrapper(props: NodeProps) {
    return (
      <StatusNode
        {...props}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        setHoveredNodeId={setHoveredNodeId}
        onClick={() => onClick(props.data)}
        onDoubleClick={() => onDoubleClick(props.data)}
      />
    );
  };
};
