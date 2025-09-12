import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import './ProtocolNodeCard.css';

const STATUS_COLORS: Record<string, string> = {
  running: '#FCCE62',
  saved: '#D9F1FA',
  launched: '#D9F1FA',
  finished: '#D2F5CB',
  failed: '#F5CCCB',
  aborted: '#F5CCCB',
  interactive: '#f7f3bf',
  root: '#D9F1FA',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  running: '#918516',
  saved: '#1E90FF',
  launched: '#1E90FF',
  finished: '#28A745',
  failed: '#DC3545',
  aborted: '#DC3545',
  interactive: '#FFC107',
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
    numberOfSteps?: number;
    stepsDone?: number;
    outputs?: any[];
  };
  selectedNodeId?: string;
  hoveredNodeId?: string;
  setHoveredNodeId?: React.Dispatch<React.SetStateAction<string | null>>;
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
  onClick,
  onDoubleClick,
}: StatusNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = selectedNodeId === data.id;

  const bgColor =
    STATUS_COLORS[data.status ?? 'finished'] ?? STATUS_COLORS['root'];
  data.color = bgColor;

  const classNames = [
    'status-node',
    isHovered ? 'hovered' : '',
    isSelected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      style={{ backgroundColor: bgColor }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div
        className={`node-header flex ${data.id === 'PROJECT'
          ? 'flex-col items-center text-center'
          : 'flex-row items-center space-x-2'
          }`}
      >
        {data.id !== 'PROJECT' && (
          <div
            className={`node-id-badge ${data.status === 'running' ? 'glow-badge' : ''
              }`}
          >
            {data.id}
          </div>
        )}
        {data.id === 'PROJECT' ? (
          <div className="text-4xl text-black">{data.label}</div>
        ) : (
          <div className="node-label">{data.label}</div>
        )}
      </div>

      {/* IO Section */}
      {data.id !== 'PROJECT' && (
        <>
          <hr className="node-divider" />
          {/* Outputs list draggable */}
          {Array.isArray(data.outputs) && data.outputs.length > 0 && (
            <div className="outputs-list mt-3 ml-6 space-y-2">
              {data.outputs.map((outputObj, idx) => {
                const [key, rawValue] = Object.entries(outputObj)[0];
                const value = rawValue as {
                  info: string;
                  _class: string;
                  _objValue: string;
                };

                return (
                  <div
                    key={idx}
                    className="nodrag group cursor-grab active:cursor-grabbing flex items-center px-3 py-2 rounded-lg bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 border border-gray-300 dark:border-gray-600 shadow-sm hover:shadow-md hover:from-blue-50 hover:to-blue-100 dark:hover:from-gray-700 dark:hover:to-gray-600 transition-all"
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData(
                        'application/scipion-output',
                        JSON.stringify({
                          parentId: data.id,
                          key,
                          ...value,
                        })
                      );
                    }}
                  >
                    {/* Colored dot */}
                    <div className="w-3 h-3 rounded-full bg-blue-500 group-hover:bg-blue-400 mr-3" />

                    {/* Info text */}
                    <span className="font-normal text-gray-900 dark:text-gray-100 text-2xl tracking-tight">
                      {value.info}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <hr className="node-divider" />
        </>
      )}

      {/* Status badge */}
      {data.status && (
        <div className="flex items-center justify-between text-2xl text-white-800 dark:text-black-100">
          <span
            className="node-status-badge px-2 py-1 rounded text-sm flex items-center gap-2"
            style={{
              backgroundColor:
                STATUS_BADGE_COLORS[data.status] || '#999',
              color: 'white',
              minWidth: '120px',
            }}
          >
            {data.status}

            {(data.status === 'running' ||
              data.status === 'failed' ||
              data.status === 'aborted') && (
                <div className="flex items-center gap-1 flex-1">
                  <div className="w-16 h-3 bg-white/30 rounded overflow-hidden">
                    <div
                      className="h-3 bg-white"
                      style={{
                        width: `${((data.stepsDone ?? 0) /
                          (data.numberOfSteps ?? 1)) *
                          100
                          }%`,
                      }}
                    />
                  </div>
                  <span className="text-2xl opacity-80 ml-4">
                    {data.stepsDone}/{data.numberOfSteps}
                  </span>
                </div>
              )}
          </span>

          <span className="flex items-center space-x-1 ml-6">
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
            <span>
              {formatCpuTime(data.tick ?? Number(data.elapsedTime) ?? 0)}
            </span>
          </span>
        </div>
      )}

      {/* React Flow handles (edges normales) */}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
