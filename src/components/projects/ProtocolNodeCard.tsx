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
    cpuTime?: string;
    elapsedTime?: string;
    tick?: number;
  };
  selectedNodeId?: string;
  hoveredNodeId?: string | null;        
  setHoveredNodeId?: (id: string | null) => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
};

const formatCpuTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}h:${pad(minutes)}m:${pad(secs)}s`;
};

export default function StatusNode({
  data,
  selectedNodeId,
  hoveredNodeId,
  setHoveredNodeId,
  onClick,
  onDoubleClick,
}: StatusNodeProps) {
  const isSelected = selectedNodeId === data.id;
  const isHovered = hoveredNodeId === data.id;

  // Compute background color
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
      onMouseEnter={() => setHoveredNodeId?.(data.id)}
      onMouseLeave={() => setHoveredNodeId?.(null)}
      style={{ backgroundColor: bgColor }}
    >
      <div
        className={`node-header flex ${
          data.id === 'PROJECT'
            ? 'flex-col items-center text-center'
            : 'flex-row items-center space-x-2'
        }`}
      >
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
        <div className="flex items-center justify-between text-2xl text-gray-800 dark:text-black-100">
          <span>Status: {data.status}</span>
          <span className="flex items-center space-x-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-gray-500 dark:text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{formatCpuTime(Number(data.tick ?? data.elapsedTime ?? 0))}</span>
          </span>
        </div>
      )}

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
