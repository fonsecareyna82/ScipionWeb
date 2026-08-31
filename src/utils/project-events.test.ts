import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  PROJECT_REFRESH_REQUESTED_EVENT,
  requestProjectRefresh,
  type ProjectRefreshRequestedDetail,
} from "@/utils/project-events";

describe("project events", () => {
  it("requests a refresh for the specified project", () => {
    const listener = vi.fn();

    window.addEventListener(
      PROJECT_REFRESH_REQUESTED_EVENT,
      listener,
    );

    try {
      requestProjectRefresh(42);

      expect(listener).toHaveBeenCalledTimes(1);

      const event = listener.mock.calls[0][0] as
        CustomEvent<ProjectRefreshRequestedDetail>;

      expect(event.detail).toEqual({
        projectId: 42,
      });
    } finally {
      window.removeEventListener(
        PROJECT_REFRESH_REQUESTED_EVENT,
        listener,
      );
    }
  });

  it("does not dispatch a refresh for an invalid project id", () => {
    const listener = vi.fn();

    window.addEventListener(
      PROJECT_REFRESH_REQUESTED_EVENT,
      listener,
    );

    try {
      requestProjectRefresh(undefined);

      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(
        PROJECT_REFRESH_REQUESTED_EVENT,
        listener,
      );
    }
  });
});