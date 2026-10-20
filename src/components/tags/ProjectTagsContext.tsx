// src/components/tags/ProjectTagsContext.tsx
// Hands the project's tags (useProjectTags) to graph cards, which React Flow
// renders without props from the page.
import { createContext, useContext } from "react";

import type { ProtocolTag } from "./tagTypes";
import type { ProtocolTagAssignments } from "@/utils/protocol_tags";

export type ProjectTagsContextValue = {
  tags: ProtocolTag[];
  tagsById: Map<string, ProtocolTag>;
  loading: boolean;
  assignments: ProtocolTagAssignments;
  toggleTag: (protocolIds: string[], tagId: string) => void;
  /** Asks for a new tag that will be given to these protocols. */
  requestCreateTag: (protocolIds: string[]) => void;
  /** Opens the tag manager; absent when the policy hides it. */
  openManager?: () => void;
};

export const ProjectTagsContext = createContext<ProjectTagsContextValue | null>(null);

export function useProjectTagsContext(): ProjectTagsContextValue | null {
  return useContext(ProjectTagsContext);
}
