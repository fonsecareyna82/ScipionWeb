import { NodeProps } from 'reactflow';
import StatusNode from './ProtocolNodeCard';

export const createStatusNodeWrapper = (
  onClick: (data: any) => void,
  onDoubleClick: (data: any) => void,
  selectedNodeId?: string
) => {
  return function StatusNodeWrapper(props: NodeProps) {
    return (
      <StatusNode
        {...props}
        selectedNodeId={selectedNodeId}
        onClick={() => onClick(props.data)}
        onDoubleClick={() => onDoubleClick(props.data)}
      />
    );
  };
};
