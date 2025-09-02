import { NodeProps } from 'reactflow';
import StatusNode from './ProtocolNodeCard';

export const createStatusNodeWrapper = (
  onClick: (data: any) => void,
  onDoubleClick: (data: any) => void,
  selectedNodeId?: string,
  hoveredNodeId?: string,
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>
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
