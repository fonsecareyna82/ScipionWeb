import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CtfPreviewDialog from "@/components/protocol/wizards/CtfPreviewDialog";

vi.mock("@/icons", () => ({
  CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
}));

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof CtfPreviewDialog>> = {},
) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const onSelectedIndexChange = vi.fn();
  const onDownsampleChange = vi.fn();
  const onDownsampleCommit = vi.fn();
  const onLowFreqChange = vi.fn();
  const onLowFreqCommit = vi.fn();
  const onHighFreqChange = vi.fn();
  const onHighFreqCommit = vi.fn();

  render(
    <CtfPreviewDialog
      open={true}
      title="CTF preview"
      message="Adjust CTF parameters and inspect the PSD rings"
      items={[
        { id: "0", index: 0, label: "Micrograph 0" },
        { id: "1", index: 1, label: "Micrograph 1" },
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
      autoDownsampling={true}
      autoDownsampleValue={1.234}
      lowFreq={0.1}
      lowFreqMin={0}
      lowFreqMax={1}
      highFreq={0.4}
      highFreqMin={0}
      highFreqMax={1}
      freqStep={0.01}
      samplingRate={1.5}
      showInAngstroms={true}
      downsampleParamName="Downsample factor"
      lowFreqParamName="Low freq"
      highFreqParamName="High freq"
      onClose={onClose}
      onConfirm={onConfirm}
      onDownsampleChange={onDownsampleChange}
      onDownsampleCommit={onDownsampleCommit}
      onLowFreqChange={onLowFreqChange}
      onLowFreqCommit={onLowFreqCommit}
      onHighFreqChange={onHighFreqChange}
      onHighFreqCommit={onHighFreqCommit}
      {...overrides}
    />,
  );

  return {
    onClose,
    onConfirm,
    onSelectedIndexChange,
    onDownsampleChange,
    onDownsampleCommit,
    onLowFreqChange,
    onLowFreqCommit,
    onHighFreqChange,
    onHighFreqCommit,
  };
}

describe("CtfPreviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render content when closed", () => {
    renderComponent({
      open: false,
    });

    expect(screen.queryByText("CTF preview")).not.toBeInTheDocument();
  });

  it("renders title, message, object list and fallback preview messages", () => {
    renderComponent();

    expect(screen.getByText("CTF preview")).toBeInTheDocument();
    expect(
      screen.getByText("Adjust CTF parameters and inspect the PSD rings"),
    ).toBeInTheDocument();

    expect(screen.getByText("Object")).toBeInTheDocument();
    expect(screen.getByText("Micrograph 0")).toBeInTheDocument();
    expect(screen.getByText("Micrograph 1")).toBeInTheDocument();

    expect(screen.getByText("Micrograph preview not available.")).toBeInTheDocument();
    expect(screen.getByText("PSD preview not available.")).toBeInTheDocument();

    expect(screen.getByText("Micrograph")).toBeInTheDocument();
    expect(screen.getByText("PSD")).toBeInTheDocument();
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

    expect(screen.getByText("Updating preview...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("calls onSelectedIndexChange when selecting another object", () => {
    const { onSelectedIndexChange } = renderComponent({
      selectedIndex: 0,
    });

    fireEvent.click(screen.getByText("Micrograph 1"));

    expect(onSelectedIndexChange).toHaveBeenCalledWith(1);
  });

  it("renders frequency labels, auto-down value and sampling rate", () => {
    renderComponent({
      lowFreq: 0.1,
      highFreq: 0.4,
      autoDownsampling: true,
      autoDownsampleValue: 1.234,
      samplingRate: 1.5,
      showInAngstroms: true,
    });

    expect(screen.getByText("Frequencies")).toBeInTheDocument();

    expect(screen.getByText("Low freq")).toBeInTheDocument();
    expect(screen.getByText("High freq")).toBeInTheDocument();
    expect(screen.getByText("Auto down")).toBeInTheDocument();

    expect(screen.getByText(/0\.10 rad\/Å \| 0\.1 Å/)).toBeInTheDocument();
    expect(screen.getByText(/0\.40 rad\/Å \| 0\.4 Å/)).toBeInTheDocument();
    expect(screen.getByText("1.234")).toBeInTheDocument();

    expect(screen.getByText("Sampling rate: 1.5 Å/pix")).toBeInTheDocument();
  });

  it("commits the downsample value on blur when the input is valid", () => {
    const { onDownsampleChange, onDownsampleCommit } = renderComponent({
      downsample: 2,
    });

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "3.5" } });
    fireEvent.blur(input);

    expect(onDownsampleChange).toHaveBeenCalledWith(3.5);
    expect(onDownsampleCommit).toHaveBeenCalledWith(3.5);
  });

  it("restores the current downsample value on blur when the input is invalid", () => {
    renderComponent({
      downsample: 2,
    });

    const input = screen.getByRole("textbox") as HTMLInputElement;
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