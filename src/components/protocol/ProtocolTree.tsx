import React, { useState, useEffect } from "react";
import {
  DocsIcon,
  FolderIcon,
  OpenFolderIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@/icons";

// --- Icon components ---
export const BetaIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="72"
    height="72"
    viewBox="0 0 140 60"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect width="140" height="60" fill="#dc3545" rx="14" ry="14" />
    <text
      x="70"
      y="30"
      fill="#ffffff"
      fontSize="30"
      fontFamily="Arial"
      fontWeight="bold"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      BETA
    </text>
  </svg>
);

export const NewIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="72"
    height="72"
    viewBox="0 0 140 60"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect width="140" height="60" fill="#28a745" rx="14" ry="14" />
    <text
      x="70"
      y="30"
      fill="#ffffff"
      fontSize="28"
      fontFamily="Arial"
      fontWeight="bold"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      NEW
    </text>
  </svg>
);

export const UpdatedIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="72"
    height="72"
    viewBox="0 0 140 60"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect width="140" height="60" fill="#ffc107" rx="14" ry="14" />
    <text
      x="70"
      y="30"
      fill="#000000"
      fontSize="28"
      fontFamily="Arial"
      fontWeight="bold"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      UPDATED
    </text>
  </svg>
);

export const ProtocolIcons: Record<string, React.FC<{ className?: string }>> = {
  beta: BetaIcon,
  new: NewIcon,
  updated: UpdatedIcon,
};

// --- Types ---
export interface IconData {
  name: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface ProtocolNode {
  text: string;
  value?: string | null;
  icon?: IconData;
  tag?: string;
  openItem?: boolean | string;
  visible?: boolean;
  childs?: ProtocolNode[];
}

interface ProtocolsTreeProps {
  data: ProtocolNode[];
  searchText?: string;
  onNodeDoubleClick?: (protocolId: string) => void;
}

// --- Recursive search ---
const filterTree = (nodes: ProtocolNode[], search: string): ProtocolNode[] => {
  const lowerSearch = search.toLowerCase();
  return nodes
    .map((node) => {
      const matches = node.text.toLowerCase().includes(lowerSearch);
      const filteredChildren = node.childs
        ? filterTree(node.childs, search)
        : undefined;
      if (matches || (filteredChildren && filteredChildren.length > 0)) {
        return { ...node, childs: filteredChildren };
      }
      return null;
    })
    .filter(Boolean) as ProtocolNode[];
};

// --- Highlight function ---
const highlightText = (text: string, search: string) => {
  if (!search) return text;
  const regex = new RegExp(`(${search})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, idx) =>
    regex.test(part) ? (
      <span
        key={idx}
        className="bg-yellow-300 dark:bg-yellow-600 font-bold"
      >
        {part}
      </span>
    ) : (
      part
    )
  );
};

// --- Main tree ---
export const ProtocolsTree: React.FC<ProtocolsTreeProps> = ({
  data,
  searchText = "",
  onNodeDoubleClick,
}) => {
  const filteredData = searchText ? filterTree(data, searchText) : data;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2">
        {filteredData.map((node, idx) => (
          <ProtocolNodeItem
            key={idx}
            node={node}
            searchText={searchText}
            isRoot
            onNodeDoubleClick={onNodeDoubleClick}
          />
        ))}
      </div>
    </div>
  );
};

// --- Recursive node component ---
const ProtocolNodeItem: React.FC<{
  node: ProtocolNode;
  searchText?: string;
  isRoot?: boolean;
  onNodeDoubleClick?: (protocolId: string) => void;
}> = ({ node, searchText, isRoot = false, onNodeDoubleClick }) => {
  const hasChildren = node.childs && node.childs.length > 0;

  const [expanded, setExpanded] = useState<boolean>(
    !!(node.openItem === true || node.openItem === "True")
  );

  // Expand automatically si es root o durante búsqueda
  useEffect(() => {
    if (searchText && searchText.length > 0) {
      setExpanded(
        !!(
          hasChildren &&
          (node.tag === "section" || node.tag === "protocol_group" || isRoot)
        )
      );
    } else {
      setExpanded(!!(node.openItem === true || node.openItem === "True"));
    }
  }, [searchText, hasChildren, node.openItem, node.tag, isRoot]);

  const tagIcon = () => {
    if (node.tag === "protocol" && node.icon?.name) {
      const key = node.icon.name.split(".")[0];
      const IconComponent = ProtocolIcons[key];
      return IconComponent ? (
        <IconComponent className="w-12 h-5" />
      ) : (
        <DocsIcon className="w-12 h-6" />
      );
    }
    switch (node.tag) {
      case "protocol_group":
      case "section":
        return expanded ? (
          <OpenFolderIcon className="w-6 h-6" />
        ) : (
          <FolderIcon className="w-6 h-6" />
        );
      default:
        return null;
    }
  };

  const handleDoubleClick = () => {
    if (node.tag === "protocol" && node.value && onNodeDoubleClick) {
      onNodeDoubleClick(node.value);
    }
  };

  return (
    <div className="flex flex-col mb-0">
      <div
        className="flex items-center gap-2 cursor-pointer select-none p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        onClick={() => hasChildren && setExpanded(!expanded)}
        onDoubleClick={handleDoubleClick}
      >
        {hasChildren && (
          <span className="flex items-center">
            {expanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
          </span>
        )}
        {tagIcon()}
        <span>{highlightText(node.text, searchText || "")}</span>
      </div>

      {hasChildren && (
        <div
          className={`pl-5 border-l border-gray-300 dark:border-gray-600 ${
            expanded ? "block" : "hidden"
          }`}
        >
          {node.childs!.map((child, idx) => (
            <ProtocolNodeItem
              key={idx}
              node={child}
              searchText={searchText}
              onNodeDoubleClick={onNodeDoubleClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};
