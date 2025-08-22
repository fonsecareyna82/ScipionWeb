import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import './StatusNode.css';
import { ArrowDownIcon, ArrowUpIcon } from '../../icons';

const STATUS_SAVED = '#D9F1FA';
const STATUS_RUNNING = '#FCCE62';
const STATUS_FINISHED = '#D2F5CB';
const STATUS_FAILED = '#F5CCCB';
const STATUS_INTERACTIVE = '#f7f3bfff';

type StatusNodeProps = {
  data: {
    label: string;
    status?: string;
    id: string;
    color?: string;
  };
  selectedNodeId?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
};

export default function StatusNode({ data, selectedNodeId, onClick, onDoubleClick }: StatusNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = selectedNodeId === data.id;

  let bgColor = STATUS_FINISHED;
  if (data.status === 'running') bgColor = STATUS_RUNNING;
  else if (data.status === '' || data.status === 'saved' || data.status === 'launched') bgColor = STATUS_SAVED;
  else if (data.status === 'failed' || data.status === 'aborted') bgColor = STATUS_FAILED;
  else if (data.status === 'interactive') bgColor = STATUS_INTERACTIVE;

  data.color = bgColor;

  const pulseClass = data.status === 'running' ? 'pulsing' : '';
  const borderStyle = isSelected ? '2px solid #0070f3' : isHovered ? '2px solid #999' : '1px solid #ccc';
  const boxShadow = isSelected ? '0 0 10px rgba(0,112,243,0.5)' : 'none';

  return (
    <div
      className={`node-hover ${pulseClass}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        backgroundColor: bgColor,
        color: 'black',
        minWidth: 160,
        textAlign: 'left',
        lineHeight: 1.4,
        transition: 'transform 0.2s ease-in-out, border 0.2s ease',
        position: 'relative',
        transform: isHovered ? 'scale(1.1)' : 'scale(1)',
        border: borderStyle,
        boxShadow,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        {data.id !== 'PROJECT' && (
          <div className="inline-flex items-center justify-center rounded-full bg-gray-700 text-white text-xl  px-4 py-2">
            {data.id}
          </div>
        )}
        <div className="text-2xl ">{data.label}</div>
      </div>

      {data.id !== 'PROJECT' && (
        <>
          <div className="border-t border-gray-400 my-2" />
          <div className="flex items-center gap-2 text-sm text-gray-700 font-medium mt-2">
            <ArrowDownIcon />
            <span>Inputs:</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700 font-medium mt-1">
            <ArrowUpIcon />
            <span>Outputs:</span>
          </div>
          <div className="border-t border-gray-400 my-2" />
        </>
      )}

      <div className="text-sm text-gray-700 font-medium">
        {data.status ? `Status: ${data.status}` : ''}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
