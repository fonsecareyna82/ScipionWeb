import React, { useState } from "react";
import { DocsIcon, FolderIcon, OpenFolderIcon, ChevronDownIcon, ChevronUpIcon } from "@/icons";

// BetaIcon.tsx
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

// NewIcon.tsx
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

// UpdatedIcon.tsx
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
        // If it's a protocol with an icon defined, render the corresponding SVG
        if (node.tag === "protocol" && node.icon?.name) {
            const key = node.icon.name.split(".")[0]; // remove extension if present
            const IconComponent = ProtocolIcons[key];
            return IconComponent ? <IconComponent className="w-12 h-5" /> : <DocsIcon className="w-12 h-6" />;
        }

        // Otherwise, use default icons for folders
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

                {/* Icon per tag */}
                {tagIcon()}

                {/* Node text */}
                <span>{node.text}</span>
            </div>

            {/* Children Recursive rendering */}
            {hasChildren && (
                <div
                    className={`pl-5 border-l border-gray-300 dark:border-gray-600 overflow-hidden transition-all duration-300 ${expanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
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
