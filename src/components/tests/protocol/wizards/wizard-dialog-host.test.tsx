import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WizardDialogHost from "@/components/protocol/wizards/wizard-dialog-host";

const mockWizardOptionsDialog = vi.fn((props: any) => (
  <div data-testid="wizard-options-dialog">{props.title}</div>
));
const mockWizardInputDialog = vi.fn((props: any) => (
  <div data-testid="wizard-input-dialog">{props.title}</div>
));
const mockMaskRadiusDialog = vi.fn((props: any) => (
  <div data-testid="mask-radius-dialog">{props.title}</div>
));
const mockMaskRadiiDialog = vi.fn((props: any) => (
  <div data-testid="mask-radii-dialog">{props.title}</div>
));
const mockCtfPreviewDialog = vi.fn((props: any) => (
  <div data-testid="ctf-preview-dialog">{props.title}</div>
));
const mockFilterPreviewDialog = vi.fn((props: any) => (
  <div data-testid="filter-preview-dialog">{props.title}</div>
));
const mockDownsamplePreviewDialog = vi.fn((props: any) => (
  <div data-testid="downsample-preview-dialog">{props.title}</div>
));
const mockPointInVolumeWizardDialog = vi.fn((props: any) => (
  <div data-testid="point-in-volume-dialog">{props.title}</div>
));

vi.mock("@/components/protocol/WizardDialogs", () => ({
  WizardOptionsDialog: (props: any) => mockWizardOptionsDialog(props),
  WizardInputDialog: (props: any) => mockWizardInputDialog(props),
}));

vi.mock("@/components/protocol/wizards/MaskRadiusDialog", () => ({
  default: (props: any) => mockMaskRadiusDialog(props),
}));

vi.mock("@/components/protocol/wizards/MaskRadiiDialog", () => ({
  default: (props: any) => mockMaskRadiiDialog(props),
}));

vi.mock("@/components/protocol/wizards/CtfPreviewDialog", () => ({
  default: (props: any) => mockCtfPreviewDialog(props),
}));

vi.mock("@/components/protocol/wizards/FilterPreviewDialog", () => ({
  default: (props: any) => mockFilterPreviewDialog(props),
}));

vi.mock("@/components/protocol/wizards/DownsamplePreviewDialog", () => ({
  default: (props: any) => mockDownsamplePreviewDialog(props),
}));

vi.mock("@/components/protocol/wizards/PointInVolumeWizardDialog", () => ({
  default: (props: any) => mockPointInVolumeWizardDialog(props),
}));

function createDefaultProps(
  overrides: Partial<React.ComponentProps<typeof WizardDialogHost>> = {},
) {
  return {
    wizardState: {
      open: false,
      kind: "options",
      title: "Wizard title",
    } as any,
    previewLoading: false,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    onOptionsSelectedValueChange: vi.fn(),
    onInputValueChange: vi.fn(),
    onMaskRadiusChange: vi.fn(),
    onMaskRadiusCommit: vi.fn(),
    onMaskRadiusSelectedIndexChange: vi.fn(),
    onMaskRadiiInnerChange: vi.fn(),
    onMaskRadiiInnerCommit: vi.fn(),
    onMaskRadiiOuterChange: vi.fn(),
    onMaskRadiiOuterCommit: vi.fn(),
    onMaskRadiiSelectedIndexChange: vi.fn(),
    onCtfDownsampleChange: vi.fn(),
    onCtfDownsampleCommit: vi.fn(),
    onCtfLowFreqChange: vi.fn(),
    onCtfLowFreqCommit: vi.fn(),
    onCtfHighFreqChange: vi.fn(),
    onCtfHighFreqCommit: vi.fn(),
    onCtfSelectedIndexChange: vi.fn(),
    onFilterLowFreqChange: vi.fn(),
    onFilterLowFreqCommit: vi.fn(),
    onFilterHighFreqChange: vi.fn(),
    onFilterHighFreqCommit: vi.fn(),
    onFilterDecayChange: vi.fn(),
    onFilterDecayCommit: vi.fn(),
    onFilterSelectedIndexChange: vi.fn(),
    onDownsamplePreviewChange: vi.fn(),
    onDownsamplePreviewCommit: vi.fn(),
    onDownsamplePreviewSelectedIndexChange: vi.fn(),
    onPointInVolumeChange: vi.fn(),
    onPointInVolumeVoxelChange: vi.fn(),
    ...overrides,
  };
}

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof WizardDialogHost>> = {},
) {
  const props = createDefaultProps(overrides);
  render(<WizardDialogHost {...props} />);
  return props;
}

describe("WizardDialogHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when wizardState.open is false", () => {
    renderComponent({
      wizardState: {
        open: false,
        kind: "options",
        title: "Hidden wizard",
      } as any,
    });

    expect(screen.queryByTestId("wizard-options-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-input-dialog")).not.toBeInTheDocument();
  });

  it("renders WizardOptionsDialog for kind='options'", () => {
    const props = renderComponent({
      wizardState: {
        open: true,
        kind: "options",
        title: "Options wizard",
        paramName: "mode",
        options: ["a", "b"],
        selectedValue: "a",
        message: "Choose one option",
      } as any,
    });

    expect(screen.getByTestId("wizard-options-dialog")).toBeInTheDocument();
    expect(screen.getByText("Options wizard")).toBeInTheDocument();

    expect(mockWizardOptionsDialog.mock.calls[0][0]).toMatchObject({
      open: true,
      title: "Options wizard",
      paramName: "mode",
      options: ["a", "b"],
      selectedValue: "a",
      message: "Choose one option",
      onClose: props.onClose,
      onConfirm: props.onConfirm,
      onSelectedValueChange: props.onOptionsSelectedValueChange,
    });
  });

  it("renders WizardInputDialog for kind='input'", () => {
    const props = renderComponent({
      wizardState: {
        open: true,
        kind: "input",
        title: "Input wizard",
        fields: [{ name: "radius", label: "Radius" }],
        values: { radius: "12" },
        message: "Fill the input",
        previewImageUrl: "/preview.png",
      } as any,
    });

    expect(screen.getByTestId("wizard-input-dialog")).toBeInTheDocument();
    expect(screen.getByText("Input wizard")).toBeInTheDocument();

    expect(mockWizardInputDialog.mock.calls[0][0]).toMatchObject({
      open: true,
      title: "Input wizard",
      values: { radius: "12" },
      previewImageUrl: "/preview.png",
      onClose: props.onClose,
      onConfirm: props.onConfirm,
      onValueChange: props.onInputValueChange,
    });
  });

  it("renders MaskRadiusDialog for kind='mask_radius'", () => {
    const props = renderComponent({
      wizardState: {
        open: true,
        kind: "mask_radius",
        title: "Mask radius",
        radius: 24,
        min: 0,
        max: 100,
        step: 1,
        selectedIndex: 0,
        items: [],
      } as any,
    });

    expect(screen.getByTestId("mask-radius-dialog")).toBeInTheDocument();

    expect(mockMaskRadiusDialog.mock.calls[0][0]).toMatchObject({
      title: "Mask radius",
      radius: 24,
      onRadiusChange: props.onMaskRadiusChange,
      onRadiusCommit: props.onMaskRadiusCommit,
      onSelectedIndexChange: props.onMaskRadiusSelectedIndexChange,
    });
  });

  it("renders MaskRadiiDialog for kind='mask_radii'", () => {
    const props = renderComponent({
      wizardState: {
        open: true,
        kind: "mask_radii",
        title: "Mask radii",
        innerRadius: 10,
        outerRadius: 20,
        selectedIndex: 1,
        items: [],
      } as any,
    });

    expect(screen.getByTestId("mask-radii-dialog")).toBeInTheDocument();

    expect(mockMaskRadiiDialog.mock.calls[0][0]).toMatchObject({
      title: "Mask radii",
      innerRadius: 10,
      outerRadius: 20,
      onInnerRadiusChange: props.onMaskRadiiInnerChange,
      onOuterRadiusChange: props.onMaskRadiiOuterChange,
      onSelectedIndexChange: props.onMaskRadiiSelectedIndexChange,
    });
  });

  it("renders CtfPreviewDialog for kind='ctf_preview' and forwards previewLoading", () => {
    const props = renderComponent({
      previewLoading: true,
      wizardState: {
        open: true,
        kind: "ctf_preview",
        title: "CTF preview",
        selectedIndex: 0,
        items: [],
        downsample: 2,
        lowFreq: 0.1,
        highFreq: 0.4,
      } as any,
    });

    expect(screen.getByTestId("ctf-preview-dialog")).toBeInTheDocument();

    expect(mockCtfPreviewDialog.mock.calls[0][0]).toMatchObject({
      title: "CTF preview",
      previewLoading: true,
      onClose: props.onClose,
      onConfirm: props.onConfirm,
      onDownsampleChange: props.onCtfDownsampleChange,
      onLowFreqChange: props.onCtfLowFreqChange,
      onHighFreqChange: props.onCtfHighFreqChange,
    });
  });

  it("renders FilterPreviewDialog for kind='filter_preview'", () => {
    const props = renderComponent({
      wizardState: {
        open: true,
        kind: "filter_preview",
        title: "Filter preview",
        selectedIndex: 0,
        items: [],
        lowFreq: 0.1,
        highFreq: 0.3,
        decay: 0.05,
      } as any,
    });

    expect(screen.getByTestId("filter-preview-dialog")).toBeInTheDocument();

    expect(mockFilterPreviewDialog.mock.calls[0][0]).toMatchObject({
      title: "Filter preview",
      onLowFreqChange: props.onFilterLowFreqChange,
      onHighFreqChange: props.onFilterHighFreqChange,
      onDecayChange: props.onFilterDecayChange,
      onSelectedIndexChange: props.onFilterSelectedIndexChange,
    });
  });

  it("renders DownsamplePreviewDialog for kind='downsample_preview'", () => {
    const props = renderComponent({
      wizardState: {
        open: true,
        kind: "downsample_preview",
        title: "Downsample preview",
        selectedIndex: 0,
        items: [],
        downsample: 2,
      } as any,
    });

    expect(screen.getByTestId("downsample-preview-dialog")).toBeInTheDocument();

    expect(mockDownsamplePreviewDialog.mock.calls[0][0]).toMatchObject({
      title: "Downsample preview",
      onDownsampleChange: props.onDownsamplePreviewChange,
      onDownsampleCommit: props.onDownsamplePreviewCommit,
      onSelectedIndexChange: props.onDownsamplePreviewSelectedIndexChange,
    });
  });

  it("renders PointInVolumeWizardDialog for kind='point_in_volume'", () => {
    const props = renderComponent({
      wizardState: {
        open: true,
        kind: "point_in_volume",
        title: "Point in volume",
        point: { x: 1, y: 2, z: 3 },
        pointVoxel: { x: 10, y: 20, z: 30 },
        dims: { x: 100, y: 100, z: 100 },
        previewDims: { x: 50, y: 50, z: 50 },
        previewValues: [],
      } as any,
    });

    expect(screen.getByTestId("point-in-volume-dialog")).toBeInTheDocument();

    expect(mockPointInVolumeWizardDialog.mock.calls[0][0]).toMatchObject({
      title: "Point in volume",
      point: { x: 1, y: 2, z: 3 },
      pointVoxel: { x: 10, y: 20, z: 30 },
      onPointChange: props.onPointInVolumeChange,
      onPointVoxelChange: props.onPointInVolumeVoxelChange,
    });
  });

  it("returns null for unknown wizard kinds", () => {
    renderComponent({
      wizardState: {
        open: true,
        kind: "unknown_kind",
        title: "Unknown wizard",
      } as any,
    });

    expect(screen.queryByTestId("wizard-options-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-input-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mask-radius-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ctf-preview-dialog")).not.toBeInTheDocument();
  });
});