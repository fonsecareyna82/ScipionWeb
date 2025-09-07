import React, { useState } from "react";
import { DocsIcon, FolderIcon, OpenFolderIcon, ChevronDownIcon, ChevronUpIcon } from "@/icons";

export interface ProtocolNode {
  text: string;
  value?: string | null;
  icon?: { name: string };
  tag?: string;
  openItem?: boolean | string;
  visible?: boolean;
  childs?: ProtocolNode[];
}

interface ProtocolsTreeProps {
  data: ProtocolNode[];
}

export const ProtocolsTree: React.FC<ProtocolsTreeProps> = ({ data }) => {
  return (
    <div className="flex flex-col gap-1">
      {data.map((node, idx) => (
        <ProtocolNodeItem key={idx} node={node} />
      ))}
    </div>
  );
};

const ProtocolNodeItem: React.FC<{ node: ProtocolNode }> = ({ node }) => {
  const [expanded, setExpanded] = useState(
    node.openItem === true || node.openItem === "True"
  );

  const hasChildren = node.childs && node.childs.length > 0;

  const tagIcon = () => {
    switch (node.tag) {
      case "protocol":
        return <DocsIcon className="w-4 h-4" />;
      case "protocol_group":
      case "section":
        return expanded ? <OpenFolderIcon className="w-4 h-4" /> : <FolderIcon className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-2 cursor-pointer select-none p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* Chevron a la izquierda si hay hijos */}
        {hasChildren && (
          <span className="flex items-center">
            {expanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
          </span>
        )}

        {/* Icono según tag */}
        {tagIcon()}

        {/* Texto del nodo */}
        <span>{node.text}</span>
      </div>

      {/* Renderizado recursivo de hijos */}
      {hasChildren && (
        <div
          className={`pl-5 border-l border-gray-300 dark:border-gray-600 overflow-hidden transition-all duration-300 ${
            expanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {node.childs!.map((child, idx) => (
            <ProtocolNodeItem key={idx} node={child} />
          ))}
        </div>
      )}
    </div>
  );
};
