import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWithAuth } from "@/api/auth";
import {
  fetchTomogramReviewContext,
  saveTomogramReview,
} from "@/api/projects";

vi.mock("@/api/auth", () => ({
  fetchWithAuth: vi.fn(),
}));

const reviewContext = {
  setId: 47,
  schema: null,
  progress: {
    total: 120,
    reviewed: 37,
  },
  reviews: {
    "31": {
      id: 9,
      setId: 47,
      scipionItemId: 31,
      reviewed: true,
      values: {
        quality: "Good",
        tags: ["feature_a"],
      },
      comment: "Good membrane contrast",
      schemaVersion: 1,
      revision: 4,
    },
  },
};

describe("tomogram review API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the PostgreSQL review context for the selected tomogram output", async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify(reviewContext), { status: 200 }),
    );

    const result = await fetchTomogramReviewContext(7, 42, "outputTomograms");

    expect(result).toEqual(reviewContext);
    expect(fetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining(
        "/projects/7/protocols/42/outputs/outputTomograms/reviews",
      ),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      }),
    );
  });

  it("saves one tomogram review with its expected revision", async () => {
    const savedReview = {
      ...reviewContext.reviews["31"],
      values: {
        quality: "Excellent",
        tags: ["feature_a"],
      },
      comment: "Ready for downstream analysis",
      revision: 5,
    };
    const payload = {
      reviewed: true,
      values: savedReview.values,
      comment: savedReview.comment,
      revision: 4,
    };

    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify(savedReview), { status: 200 }),
    );

    const result = await saveTomogramReview(7, 42, "outputTomograms", 31, payload);

    expect(result).toEqual(savedReview);
    expect(fetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining(
        "/projects/7/protocols/42/outputs/outputTomograms/tomograms/31/review",
      ),
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  });

  it("preserves the winning review returned by a revision conflict", async () => {
    const conflictResponse = {
      detail: {
        message: "Tomogram review was modified by another user",
        current: reviewContext.reviews["31"],
      },
    };

    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify(conflictResponse), { status: 409 }),
    );

    await expect(
      saveTomogramReview(7, 42, "outputTomograms", 31, {
        reviewed: true,
        values: { quality: "Bad" },
        comment: "Stale update",
        revision: 3,
      }),
    ).rejects.toMatchObject({
      status: 409,
      data: conflictResponse,
    });
  });

  it("exposes both operations through the production project service", async () => {
    vi.mocked(fetchWithAuth)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(reviewContext), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(reviewContext.reviews["31"]), { status: 200 }),
      );

    const { default: service } = await import("@/adapters/projectsAdapter");

    await service.fetchTomogramReviewContext(7, 42, "outputTomograms");
    await service.saveTomogramReview(7, 42, "outputTomograms", 31, {
      reviewed: true,
      values: { quality: "Good", tags: ["feature_a"] },
      comment: "Good membrane contrast",
      revision: 0,
    });

    expect(fetchWithAuth).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetchWithAuth).mock.calls[0][0])).toContain(
      "/projects/7/protocols/42/outputs/outputTomograms/reviews",
    );
    expect(String(vi.mocked(fetchWithAuth).mock.calls[1][0])).toContain(
      "/projects/7/protocols/42/outputs/outputTomograms/tomograms/31/review",
    );
  });

  it("saves the complete revisioned review schema", async () => {
    const definition = {
      tags: [
        { key: "feature_a", label: "Feature A" },
        { key: "needs_follow_up", label: "Needs follow-up" },
      ],
    };
    const savedSchema = {
      id: 8,
      setId: 47,
      version: 2,
      definition,
      revision: 2,
      createdByUserId: 13,
    };
    const api = await import("@/api/projects") as Record<string, any>;

    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify(savedSchema), { status: 200 }),
    );

    const result = await api.saveTomogramReviewSchema(7, 42, "outputTomograms", {
      definition,
      revision: 1,
    });

    expect(result).toEqual(savedSchema);
    expect(fetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining(
        "/projects/7/protocols/42/outputs/outputTomograms/reviews/schema",
      ),
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition, revision: 1 }),
      }),
    );
  });

  it("preserves the winning schema returned by a revision conflict", async () => {
    const current = {
      id: 8,
      setId: 47,
      version: 2,
      definition: {
        tags: [{ key: "winner", label: "Winning tag" }],
      },
      revision: 2,
    };
    const conflictResponse = {
      detail: {
        message: "Tomogram review schema was modified by another user",
        current,
      },
    };
    const api = await import("@/api/projects") as Record<string, any>;

    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify(conflictResponse), { status: 409 }),
    );

    await expect(
      api.saveTomogramReviewSchema(7, 42, "outputTomograms", {
        definition: {
          tags: [{ key: "stale", label: "Stale tag" }],
        },
        revision: 1,
      }),
    ).rejects.toMatchObject({
      status: 409,
      data: conflictResponse,
    });
  });

  it("exposes schema writes through the production project service", async () => {
    const definition = {
      tags: [{ key: "feature_a", label: "Feature A" }],
    };
    const savedSchema = {
      id: 8,
      setId: 47,
      version: 1,
      definition,
      revision: 1,
    };

    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify(savedSchema), { status: 200 }),
    );

    const { default: service } = await import("@/adapters/projectsAdapter");
    const schemaService = service as unknown as Record<string, any>;
    await schemaService.saveTomogramReviewSchema(7, 42, "outputTomograms", {
      definition,
      revision: 0,
    });

    expect(fetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining(
        "/projects/7/protocols/42/outputs/outputTomograms/reviews/schema",
      ),
      expect.objectContaining({ method: "PUT" }),
    );
  });

});
