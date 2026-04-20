import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DownsamplePreviewDialog from "@/components/protocol/wizards/DownsamplePreviewDialog";

vi.mock("@/icons", () => ({
  CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
}));

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof DownsamplePreviewDialog>> = {},
) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const onSelectedIndexChange = vi.fn();
  const onDownsampleChange = vi.fn();
  const onDownsampleCommit = vi.fn();

  render(
    <DownsamplePreviewDialog
      open={true}
      title="Downsample preview"
      message="Adjust downsampling and inspect the previews"
      items={[
        { id: "0", index: 0, label: "Object 0" },
        { id: "1", index: 1, label: "Object 1" },
      ]}
      selectedIndex={0}
      onSelectedIndexChange={onSelectedIndexChange}
      micrographPreviewUrl={null}
      psdPreviewUrl={null}
      previewLoading={false}
      downsample={2}
      downsampleMin={1}
      downsampleMax={8}
      downsampleStep={0.5}
      downsampleParamName="Downsample factor"
      onClose={onClose}
      onConfirm={onConfirm}
      onDownsampleChange={onDownsampleChange}
      onDownsampleCommit={onDownsampleCommit}
      {...overrides}
    />,
  );

  return {
    onClose,
    onConfirm,
    onSelectedIndexChange,
    onDownsampleChange,
    onDownsampleCommit,
  };
}

describe("DownsamplePreviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render content when closed", () => {
    renderComponent({
      open: false,
    });

    expect(screen.queryByText("Downsample preview")).not.toBeInTheDocument();
  });

  it("renders title, message, object list and fallback preview messages", () => {
    renderComponent();

    expect(screen.getByText("Downsample preview")).toBeInTheDocument();
    expect(
      screen.getByText("Adjust downsampling and inspect the previews"),
    ).toBeInTheDocument();

    expect(screen.getByText("Object")).toBeInTheDocument();
    expect(screen.getByText("Object 0")).toBeInTheDocument();
    expect(screen.getByText("Object 1")).toBeInTheDocument();

    expect(screen.getByText("Micrograph preview not available.")).toBeInTheDocument();
    expect(screen.getByText("PSD preview not available.")).toBeInTheDocument();

    expect(screen.getByText("Micrograph")).toBeInTheDocument();
    expect(screen.getByText("PSD")).toBeInTheDocument();
    expect(screen.getByText("Downsampling")).toBeInTheDocument();
  });

  it("renders preview images when urls are provided", () => {
    renderComponent({
      micrographPreviewUrl: "/micrograph-preview.png",
      psdPreviewUrl: "/psd-preview.png",
    });

    const micrograph = screen.getByAltText("Micrograph preview");
    const psd = screen.getByAltText("PSD preview");

    expect(micrograph).toBeInTheDocument();
    expect(micrograph).toHaveAttribute("src", "/micrograph-preview.png");

    expect(psd).toBeInTheDocument();
    expect(psd).toHaveAttribute("src", "/psd-preview.png");
  });

  it("shows the loading overlay when previewLoading is true", () => {
    renderComponent({
      previewLoading: true,
    });

    expect(screen.getByText("Loading preview...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("calls onSelectedIndexChange when selecting another object", () => {
    const { onSelectedIndexChange } = renderComponent({
      selectedIndex: 0,
    });

    fireEvent.click(screen.getByText("Object 1"));

    expect(onSelectedIndexChange).toHaveBeenCalledWith(1);
  });

  it("commits the downsample value on blur when the input is valid", () => {
    const { onDownsampleChange, onDownsampleCommit } = renderComponent({
      downsample: 2,
    });

    const input = screen.getByLabelText("Downsample factor");
    fireEvent.change(input, { target: { value: "3.5" } });
    fireEvent.blur(input);

    expect(onDownsampleChange).toHaveBeenCalledWith(3.5);
    expect(onDownsampleCommit).toHaveBeenCalledWith(3.5);
  });

  it("restores the current downsample value on blur when the input is invalid", () => {
    renderComponent({
      downsample: 2,
    });

    const input = screen.getByLabelText("Downsample factor") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.blur(input);

    expect(input.value).toBe("2");
  });

  it("calls onClose and onConfirm from footer buttons", () => {
    const { onClose, onConfirm } = renderComponent();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});