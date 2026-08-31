export const PROJECT_REFRESH_REQUESTED_EVENT =
  "scipionProjectRefreshRequested";

export type ProjectRefreshRequestedDetail = {
  projectId: number;
};

export function requestProjectRefresh(
  projectId: string | number | null | undefined,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedProjectId = Number(projectId);

  if (!Number.isFinite(normalizedProjectId)) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ProjectRefreshRequestedDetail>(
      PROJECT_REFRESH_REQUESTED_EVENT,
      {
        detail: {
          projectId: normalizedProjectId,
        },
      },
    ),
  );
}