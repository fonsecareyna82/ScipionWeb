import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import './ProtocolNodeCard.css';
import { ArrowDownIcon, ArrowUpIcon } from '../../icons';

const STATUS_COLORS: Record<string, string> = {
  running: '#FCCE62',
  saved: '#D9F1FA',
  launched: '#D9F1FA',
  finished: '#D2F5CB',
  failed: '#F5CCCB',
  aborted: '#F5CCCB',
  interactive: '#f7f3bf',
};

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

export default function StatusNode({
  data,
  selectedNodeId,
  onClick,
  onDoubleClick,
}: StatusNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = selectedNodeId === data.id;

  const bgColor =
    STATUS_COLORS[data.status ?? 'finished'] ?? STATUS_COLORS['finished'];
  data.color = bgColor;

  const classNames = [
    'status-node',
    isHovered ? 'hovered' : '',
    isSelected ? 'selected' : '',
    data.status === 'running' ? 'pulsing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ backgroundColor: bgColor }}
    >
      <div className="node-header">
        {data.id !== 'PROJECT' && (
          <div className="node-id-badge">{data.id}</div>
        )}
        <div className="node-label">{data.label}</div>
      </div>

      {data.id !== 'PROJECT' && (
        <>
          <hr className="node-divider" />
          <div className="io-section">
            <div className="inputs">
              <ArrowDownIcon />
              <span>Inputs</span>
            </div>
            <div className="outputs">
              <ArrowUpIcon />
              <span>Outputs</span>
            </div>
          </div>
          <hr className="node-divider" />
        </>
      )}

      {data.status && (
        <div className="node-status-text">Status: {data.status}</div>
      )}

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
