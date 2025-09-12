import { NodeProps, Position } from 'reactflow';
import StatusNode from './ProtocolNodeCard';

type StatusNodeWrapperProps = NodeProps & {
  selectedNodeId?: string;
  hoveredNodeId?: string;
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>;
};

export const createStatusNodeWrapper = (
  onClick: (data: any) => void,
  onDoubleClick: (data: any) => void,
  selectedNodeId?: string,
  hoveredNodeId?: string,
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>
) => {
  return function StatusNodeWrapper(props: StatusNodeWrapperProps) {
    const { data, ...rest } = props;

    return (
      <StatusNode
        {...rest} // aquí pasan style, className, draggable, etc.
        data={data}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        setHoveredNodeId={setHoveredNodeId}
        onClick={() => onClick(data)}
        onDoubleClick={() => onDoubleClick(data)}
      />
    );
  };
};
