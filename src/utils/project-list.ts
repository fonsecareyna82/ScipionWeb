// Sorting, filtering and dates of the projects page.

export type ProjectSort = "activity" | "name" | "size" | "created";
export type ProjectFilter = "all" | "mine" | "shared";

export const PROJECT_SORTS: Array<{ value: ProjectSort; label: string }> = [
  { value: "activity", label: "Last activity" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
  { value: "created", label: "Date created" },
];

export const PROJECT_FILTERS: Array<{ value: ProjectFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "shared", label: "Shared with me" },
];

// The statuses of protocols that are going on, and those that went wrong
export const ACTIVE_STATUSES = ["running", "launched", "scheduled"];
export const FAILED_STATUSES = ["failed", "aborted"];

export type ListedProject = {
  id: string | number;
  name: string;
  createdAt: Date;
  updatedAt?: Date;
  diskUsageBytes?: number | null;
  isOwner?: boolean;
  isShared?: boolean;
  statusCounts?: Record<string, number> | null;
};

export function countIn(counts: Record<string, number> | null | undefined, statuses: string[]): number {
  if (!counts) return 0;
  return statuses.reduce((sum, status) => sum + (Number(counts[status]) || 0), 0);
}

export function isSharedWithMe(project: ListedProject): boolean {
  return Boolean(project.isShared) && !project.isOwner;
}

export function matchesFilter(project: ListedProject, filter: ProjectFilter): boolean {
  switch (filter) {
    case "mine":
      return Boolean(project.isOwner);
    case "shared":
      return isSharedWithMe(project);
    default:
      return true;
  }
}

function lastActivity(project: ListedProject): number {
  return (project.updatedAt ?? project.createdAt).getTime();
}

/** The projects in the order asked, the pinned ones first (in the order they were pinned). */
export function sortProjects<T extends ListedProject>(projects: T[], sort: ProjectSort, pinnedIds: string[] = []): T[] {
  const pinRank = new Map(pinnedIds.map((id, index) => [String(id), index]));
  const compare = (a: T, b: T): number => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      case "size":
        return (b.diskUsageBytes ?? -1) - (a.diskUsageBytes ?? -1) || lastActivity(b) - lastActivity(a);
      case "created":
        return b.createdAt.getTime() - a.createdAt.getTime();
      default:
        return lastActivity(b) - lastActivity(a);
    }
  };
  return [...projects].sort((a, b) => {
    const pinA = pinRank.get(String(a.id));
    const pinB = pinRank.get(String(b.id));
    if (pinA !== undefined || pinB !== undefined) {
      if (pinA === undefined) return 1;
      if (pinB === undefined) return -1;
      return pinA - pinB;
    }
    return compare(a, b);
  });
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function formatRelativeDate(value: Date | string | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.ceil((startOfToday - date.getTime()) / 86_400_000);
  if (days <= 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function formatFullDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
