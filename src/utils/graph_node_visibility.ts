// How graph nodes look under focus mode and the tag filter: dimmed, or hidden
// when the filter is set to hide what does not match.
import type { Node } from "reactflow";

export const DIMMED_NODE_OPACITY = 0.18;

type NodeVisibilityOptions = {
  /** Focus mode: the protocols in focus; null when focus mode is off. */
  focusIds: ReadonlySet<string> | null;
  /** The tag filter; null when no tag is selected. */
  matchesFilter: ((protocolId: string, data: any) => boolean) | null;
  /** Hide what the filter leaves out instead of dimming it. */
  hideOutsideFilter: boolean;
};

/** Same array when nothing changes, and untouched nodes keep their identity. */
export function applyNodeVisibility<T extends Node>(nodes: T[], options: NodeVisibilityOptions): T[] {
  const { focusIds, matchesFilter, hideOutsideFilter } = options;
  const focusActive = focusIds != null;
  let anyChanged = false;

  const next = nodes.map((n) => {
    const nodeId = String(n.id);
    if (nodeId === "PROJECT") return n;

    const matches = matchesFilter ? matchesFilter(nodeId, (n as any).data ?? {}) : true;
    const inFocus = focusActive ? focusIds.has(nodeId) : true;

    const desiredOpacity = (focusActive && !inFocus) || !matches ? DIMMED_NODE_OPACITY : 1;
    const desiredHidden = hideOutsideFilter && matchesFilter != null && !matches;

    const baseStyle: any = n.style ?? {};
    const curOpacity = typeof baseStyle.opacity === "number" ? baseStyle.opacity : 1;
    const nextStyle =
      curOpacity === desiredOpacity && (!focusActive || baseStyle.zIndex === (inFocus ? 10 : 0))
        ? baseStyle
        : {
          ...baseStyle,
          opacity: desiredOpacity,
          zIndex: focusActive ? (inFocus ? 10 : 0) : baseStyle.zIndex,
        };

    const styleChanged = nextStyle !== baseStyle;
    const hiddenChanged = Boolean(n.hidden) !== desiredHidden;
    if (!styleChanged && !hiddenChanged) return n;

    anyChanged = true;
    return { ...n, style: nextStyle, hidden: desiredHidden };
  });

  return anyChanged ? next : nodes;
}
