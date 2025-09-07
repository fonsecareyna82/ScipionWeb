// types.ts
export type ProtocolNode = {
    text: string;
    value: string | null;
    tag: string;
    open: boolean;
    visible: boolean;
    icon?: string | null;
    children: ProtocolNode[];
  };
  
export function normalizeNode(node: any): ProtocolNode {
  return {
    text: node.text,
    value: node.value,
    tag: node.tag,
    open: node.openItem === true || node.openItem === "true" || node.openItem === "True",
    visible: !!node.visible,
    icon: node.icon?.name || null,
    children: (node.childs || []).map((c: any) => normalizeNode(c)),
  };
}

export function normalizeRoots(data: Record<string, any>): ProtocolNode[] {
  return Object.keys(data).map((key) => normalizeNode(data[key]));
}
