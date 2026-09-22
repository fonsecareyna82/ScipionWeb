import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  fetchTomogramReviewContext: vi.fn(),
  saveTomogramReview: vi.fn(),
  saveTomogramReviewSchema: vi.fn(),
}));

vi.mock("@/ProjectServiceContext", () => ({
  useProjectService: () => serviceMocks,
}));

import TomogramReviewPanel from "../../analyze/tomogram-review-panel";

const storedReview = {
  id: 9,
  setId: 47,
  scipionItemId: 31,
  reviewed: true,
  values: {
    quality: "Good",
    customScore: 7,
  },
  comment: "Good membrane contrast",
  schemaVersion: 1,
  revision: 4,
};

const reviewContext = {
  setId: 47,
  schema: null,
  progress: {
    total: 120,
    reviewed: 37,
  },
  reviews: {
    "31": storedReview,
  },
};

function renderPanel(selectedTomogram: { id: number; label: string } | null = null) {
  return render(
    <TomogramReviewPanel
      projectId={7}
      protocolId={42}
      outputName="outputTomograms"
      selectedTomogram={selectedTomogram}
    />,
  );
}

describe("TomogramReviewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.fetchTomogramReviewContext.mockResolvedValue(reviewContext);
    serviceMocks.saveTomogramReview.mockResolvedValue(storedReview);
  });

  it("loads progress even before a tomogram is selected", async () => {
    renderPanel();

    expect(await screen.findByText("37 of 120 reviewed")).toBeInTheDocument();
    expect(screen.getByText("Select a tomogram to review it.")).toBeInTheDocument();
    expect(serviceMocks.fetchTomogramReviewContext).toHaveBeenCalledWith(
      7,
      42,
      "outputTomograms",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("loads the selected review and saves edits with its revision", async () => {
    const savedReview = {
      ...storedReview,
      values: {
        ...storedReview.values,
        quality: "Bad",
      },
      comment: "Reject after closer inspection",
      revision: 5,
    };
    serviceMocks.saveTomogramReview.mockResolvedValue(savedReview);

    renderPanel({ id: 31, label: "Tomo 31" });

    expect(await screen.findByDisplayValue("Good membrane contrast")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bad" }));
    expect(screen.queryByRole("checkbox", { name: "Mitochondria" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Reject after closer inspection" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));

    await waitFor(() => {
      expect(serviceMocks.saveTomogramReview).toHaveBeenCalledWith(
        7,
        42,
        "outputTomograms",
        31,
        {
          reviewed: true,
          values: {
            quality: "Bad",
            customScore: 7,
          },
          comment: "Reject after closer inspection",
          revision: 4,
        },
      );
    });

    expect(await screen.findByText("Review saved")).toBeInTheDocument();
  });

  it("adopts the winning state when another user saved first", async () => {
    const winningReview = {
      ...storedReview,
      values: {
        quality: "Excellent",
      },
      comment: "Already updated on another node",
      revision: 5,
    };
    serviceMocks.saveTomogramReview.mockRejectedValue({
      status: 409,
      data: {
        detail: {
          message: "Tomogram review was modified by another user",
          current: winningReview,
        },
      },
    });

    renderPanel({ id: 31, label: "Tomo 31" });

    expect(await screen.findByDisplayValue("Good membrane contrast")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));

    expect(
      await screen.findByText("Another user updated this review. Their latest version is now loaded."),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Already updated on another node")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excellent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("exposes review filters", async () => {
    const onReviewFilterChange = vi.fn();

    render(
      <TomogramReviewPanel
        projectId={7}
        protocolId={42}
        outputName="outputTomograms"
        selectedTomogram={{ id: 31, label: "Tomo 31" }}
        reviewFilter="all"
        onReviewFilterChange={onReviewFilterChange}
      />,
    );

    expect(await screen.findByText("37 of 120 reviewed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pending" }));

    expect(onReviewFilterChange).toHaveBeenCalledWith("pending");
  });


  it("requests the next unreviewed tomogram when one is available", async () => {
    const onNextUnreviewed = vi.fn();
    const { rerender } = render(
      <TomogramReviewPanel
        projectId={7}
        protocolId={42}
        outputName="outputTomograms"
        selectedTomogram={{ id: 31, label: "Tomo 31" }}
        onNextUnreviewed={onNextUnreviewed}
        hasNextUnreviewed
      />,
    );

    const nextButton = await screen.findByRole("button", { name: "Next unreviewed" });
    fireEvent.click(nextButton);
    expect(onNextUnreviewed).toHaveBeenCalledTimes(1);

    rerender(
      <TomogramReviewPanel
        projectId={7}
        protocolId={42}
        outputName="outputTomograms"
        selectedTomogram={{ id: 31, label: "Tomo 31" }}
        onNextUnreviewed={onNextUnreviewed}
        hasNextUnreviewed={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Next unreviewed" })).toBeDisabled();
  });


  it("renders schema tags with global counters and saves their keys", async () => {
    const taggedContext = {
      ...reviewContext,
      schema: {
        id: 8,
        setId: 47,
        version: 2,
        definition: {
          tags: [
            { key: "feature_a", label: "Feature A" },
            { key: "needs_follow_up", label: "Needs follow-up" },
          ],
        },
        revision: 2,
      },
      reviews: {
        "31": {
          ...storedReview,
          values: {
            ...storedReview.values,
            tags: ["feature_a"],
          },
        },
        "32": {
          ...storedReview,
          id: 10,
          scipionItemId: 32,
          values: {
            quality: "Excellent",
            tags: ["feature_a", "needs_follow_up"],
          },
        },
      },
    };
    const savedReview = {
      ...taggedContext.reviews["31"],
      values: {
        ...taggedContext.reviews["31"].values,
        tags: ["feature_a", "needs_follow_up"],
      },
      revision: 5,
    };
    serviceMocks.fetchTomogramReviewContext.mockResolvedValue(taggedContext);
    serviceMocks.saveTomogramReview.mockResolvedValue(savedReview);

    renderPanel({ id: 31, label: "Tomo 31" });

    const featureTag = await screen.findByRole("button", { name: "Feature A 2" });
    expect(featureTag).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Needs follow-up 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));

    await waitFor(() => {
      expect(serviceMocks.saveTomogramReview).toHaveBeenCalledWith(
        7,
        42,
        "outputTomograms",
        31,
        expect.objectContaining({
          values: {
            quality: "Good",
            customScore: 7,
            tags: ["feature_a", "needs_follow_up"],
          },
          revision: 4,
        }),
      );
    });
  });

  it("creates a generic tag schema from the viewer", async () => {
    const savedSchema = {
      id: 8,
      setId: 47,
      version: 1,
      definition: {
        tags: [
          { key: "feature_a", label: "Feature A" },
          { key: "needs_follow_up", label: "Needs follow-up" },
        ],
      },
      revision: 1,
    };
    serviceMocks.saveTomogramReviewSchema.mockResolvedValue(savedSchema);

    renderPanel({ id: 31, label: "Tomo 31" });

    expect(await screen.findByText("37 of 120 reviewed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configure tags" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tag labels" }), {
      target: { value: "Feature A\nNeeds follow-up" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save tag configuration" }));

    await waitFor(() => {
      expect(serviceMocks.saveTomogramReviewSchema).toHaveBeenCalledWith(
        7,
        42,
        "outputTomograms",
        {
          definition: savedSchema.definition,
          revision: 0,
        },
      );
    });
    expect(await screen.findByRole("button", { name: "Feature A 0" })).toBeInTheDocument();
  });

  it("adopts the winning tag schema after a revision conflict", async () => {
    const winningSchema = {
      id: 8,
      setId: 47,
      version: 2,
      definition: {
        tags: [{ key: "winner", label: "Winning tag" }],
      },
      revision: 2,
    };
    serviceMocks.saveTomogramReviewSchema.mockRejectedValue({
      status: 409,
      data: {
        detail: {
          message: "Tomogram review schema was modified by another user",
          current: winningSchema,
        },
      },
    });

    renderPanel({ id: 31, label: "Tomo 31" });

    expect(await screen.findByText("37 of 120 reviewed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configure tags" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tag labels" }), {
      target: { value: "Stale tag" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save tag configuration" }));

    expect(
      await screen.findByText(
        "Another user updated the tag configuration. Their latest version is now loaded.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Winning tag 0" })).toBeInTheDocument();
  });

});
