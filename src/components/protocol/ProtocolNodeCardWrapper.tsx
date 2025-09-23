import { NodeProps, useReactFlow } from 'reactflow';
import StatusNode from './ProtocolNodeCard';

type StatusNodeWrapperProps = NodeProps & {
  selectedNodeId?: string;
  hoveredNodeId?: string;
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>;
  graphDirection: 'TB' | 'LR';
};

export const createStatusNodeWrapper = (
  onClick: (data: any) => void,
  onDoubleClick: (data: any) => void,
  selectedNodeId?: string,
  hoveredNodeId?: string,
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>,
  graphDirection: 'TB' | 'LR' = 'TB'
) => {
  return function StatusNodeWrapper(props: NodeProps) {
    const { data, ...rest } = props;
    const { getViewport } = useReactFlow();
    const { zoom } = getViewport();

    return (
      <StatusNode
        {...rest}
        data={data}
        selectedNodeId={selectedNodeId}
        onClick={() => onClick(data)}
        onDoubleClick={() => onDoubleClick(data)}
        graphDirection={graphDirection}
        zoomLevel={zoom} 
      />
    );
  };
};
