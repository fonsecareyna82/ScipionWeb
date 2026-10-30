// The badge of a project: how the user reaches it (see the API's accessVia)
export type ProjectAccessVia = "owner" | "share" | "group" | "role";

export function projectAccessLabel({
  isOwner,
  isShared,
  permission,
  accessVia,
}: {
  isOwner: boolean;
  isShared: boolean;
  permission?: string | null;
  accessVia?: string | null;
}): string {
  const level = permission?.trim() ?? "";
  // A PI of a group the owner is in, or a role that reaches every project
  if (!isOwner && accessVia === "group") return level ? `Group · ${level}` : "Group";
  if (!isOwner && accessVia === "role") return level ? `All projects · ${level}` : "All projects";
  if (isShared && !isOwner) return level ? `Shared · ${level}` : "Shared";
  if (level) return level;
  return isOwner ? "Owner" : "Private";
}
