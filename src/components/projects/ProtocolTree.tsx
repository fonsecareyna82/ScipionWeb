import React, { useState } from "react";
import { DocsIcon, FolderIcon, OpenFolderIcon, ChevronDownIcon, ChevronUpIcon } from "@/icons";

// BetaIcon.tsx
export const BetaIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg width="72" height="72" viewBox="0 0 140 60" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect width="140" height="60" fill="#dc3545" rx="14" ry="14" />
        <text x="70" y="30" fill="#ffffff" fontSize="30" fontFamily="Arial" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
            BETA
        </text>
    </svg>
);

// NewIcon.tsx
export const NewIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg width="72" height="72" viewBox="0 0 140 60" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect width="140" height="60" fill="#28a745" rx="14" ry="14" />
        <text x="70" y="30" fill="#ffffff" fontSize="28" fontFamily="Arial" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
            NEW
        </text>
    </svg>
);

// UpdatedIcon.tsx
export const UpdatedIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg width="72" height="72" viewBox="0 0 140 60" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect width="140" height="60" fill="#ffc107" rx="14" ry="14" />
        <text x="70" y="30" fill="#000000" fontSize="28" fontFamily="Arial" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
            UPDATED
        </text>
    </svg>
);

export const ProtocolIcons: Record<string, React.FC<{ className?: string }>> = {
    beta: BetaIcon,
    new: NewIcon,
    updated: UpdatedIcon,
};

// Types
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
}

// Recursive search function
const filterTree = (nodes: ProtocolNode[], search: string): ProtocolNode[] => {
    const lowerSearch = search.toLowerCase();
    return nodes
        .map(node => {
            const matches = node.text.toLowerCase().includes(lowerSearch);
            let filteredChildren: ProtocolNode[] | undefined;
            if (node.childs) filteredChildren = filterTree(node.childs, search);
            if (matches || (filteredChildren && filteredChildren.length > 0)) {
                return { ...node, childs: filteredChildren };
            }
            return null;
        })
        .filter(Boolean) as ProtocolNode[];
};

// Main tree component
export const ProtocolsTree: React.FC<ProtocolsTreeProps> = ({ data }) => {
    const [searchText, setSearchText] = useState("");

    const filteredData = searchText ? filterTree(data, searchText) : data;

    return (
        <div className="flex flex-col h-full">
            {/* Search fixed at the top */}
            <div className="relative w-full max-w-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input
                    type="text"
                    placeholder="Search protocols..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full px-3 py-2 pl-10 pr-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                />
            </div>
            {/* Separator */}
            <div className="my-2 border-t border-gray-300 dark:border-gray-700" />



            {/* Scrollable tree */}
            <div className="flex-1 overflow-y-auto p-2">
                {filteredData.map((node, idx) => (
                    <ProtocolNodeItem key={idx} node={node} />
                ))}
            </div>
        </div>
    );
};

// Recursive node rendering
const ProtocolNodeItem: React.FC<{ node: ProtocolNode }> = ({ node }) => {
    const [expanded, setExpanded] = useState(node.openItem === true || node.openItem === "True");
    const hasChildren = node.childs && node.childs.length > 0;

    const tagIcon = () => {
        if (node.tag === "protocol" && node.icon?.name) {
            const key = node.icon.name.split(".")[0];
            const IconComponent = ProtocolIcons[key];
            return IconComponent ? <IconComponent className="w-12 h-5" /> : <DocsIcon className="w-12 h-6" />;
        }
        switch (node.tag) {
            case "protocol_group":
            case "section":
                return expanded ? <OpenFolderIcon className="w-6 h-6" /> : <FolderIcon className="w-6 h-6" />;
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
                {hasChildren && (
                    <span className="flex items-center">
                        {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                    </span>
                )}
                {tagIcon()}
                <span>{node.text}</span>
            </div>

            {hasChildren && (
                <div className={`pl-5 border-l border-gray-300 dark:border-gray-600 ${expanded ? "block" : "hidden"}`}>
                    {node.childs!.map((child, idx) => (
                        <ProtocolNodeItem key={idx} node={child} />
                    ))}
                </div>
            )}
        </div>
    );
};
