import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WizardRuntimeDialog from "@/components/protocol/wizards/WizardRuntimeDialog";
import { useWizardRuntime } from "@/components/protocol/wizards/use_wizard_runtime";
import { describeWizardReply, formatWizardControlValue, type WizardDialog } from "@/utils/protocol_wizard_runtime";

vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";

const previewDialog = {
  type: "preview", title: "Wizard", previewKind: "mask_radius", columns: ["Object"],
  items: [{ index: 0, text: "emd_1.map" }, { index: 1, text: "emd_2.map" }],
  imageLabels: ["Central slice"], images: [{ src: PNG, width: 256, height: 256 }],
  controls: [{ name: "radius", label: "Mask radius", min: 1, max: 32, step: 1, value: 32, display: "pixels" }],
  rings: [{ image: 0, outer: "radius", scale: 1 / 64 }], samplingRate: 2,
};

describe("wizard replies", () => {
  it("reads what the wizard set, or the dialog it opened", () => {
    expect(describeWizardReply({ status: "done", paramUpdates: { boxSize: 280 }, messages: [] }))
      .toEqual({ status: "done", paramUpdates: { boxSize: 280 }, messages: [], items: [] });
    const reply = describeWizardReply({ status: "dialog", step: 0, dialog: previewDialog, messages: [] });
    expect(reply?.status).toBe("dialog");
    if (reply?.status !== "dialog" || reply.dialog.type !== "preview") throw new Error("not a preview");
    expect(reply.dialog.controls[0]).toMatchObject({ name: "radius", kind: "slider", max: 32, value: 32 });
  });

  it("drops what it does not understand and explains unsupported wizards", () => {
    expect(describeWizardReply({ status: "nope" })).toBeNull();
    expect(describeWizardReply({ status: "dialog", step: 0, dialog: { type: "tk-window" } })).toBeNull();
    const reply = describeWizardReply({ status: "dialog", step: 0, dialog: { ...previewDialog,
      images: [{ src: "javascript:alert(1)" }] } });
    expect(reply?.status === "dialog" && reply.dialog.type === "preview" && reply.dialog.images).toEqual([]);
    expect(describeWizardReply({ status: "unsupported", reason: "dialog", detail: "PluginDialog" }))
      .toMatchObject({ errors: ["This wizard opens a window that the web cannot show yet (PluginDialog)."] });
  });

  it("shows control values as the desktop dialogs do", () => {
    const control = { name: "r", label: "r", kind: "slider" as const, min: 1, max: 9, step: 1, value: 4,
      refresh: false, display: "pixels" as const };
    expect(formatWizardControlValue(control, 10, 2)).toBe("10 px | 20.0 Å");
    expect(formatWizardControlValue({ ...control, display: "frequency" }, 0.25, 2)).toBe("0.25 | 8.0 Å");
  });
});

function dialogOf(raw: unknown): WizardDialog {
  const reply = describeWizardReply({ status: "dialog", step: 0, dialog: raw, messages: [] });
  if (reply?.status !== "dialog") throw new Error("not a dialog");
  return reply.dialog;
}

function renderDialog(raw: unknown, overrides = {}) {
  const props = { onAnswer: vi.fn(), onCancel: vi.fn(), onPreview: vi.fn() };
  render(<WizardRuntimeDialog dialog={dialogOf(raw)} paramLabel="Mask radius" messages={[]} busy={false}
    previewImages={null} previewBusy={false} {...props} {...overrides} />);
  return props;
}

describe("wizard dialogs", () => {
  it("asks yes or no", () => {
    const { onAnswer } = renderDialog({ type: "confirm", title: "Acquisition", message: "Use it?" });
    expect(screen.getByText("Use it?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onAnswer).toHaveBeenCalledWith({ accept: true, value: false });
  });

  it("selects rows of a list", () => {
    const { onAnswer } = renderDialog({ type: "list", title: "Lanes display", columns: ["Lane name"],
      rows: [{ index: 0, text: "default" }, { index: 1, text: "gpu" }], multiple: false });
    const select = screen.getByRole("button", { name: "Select" });
    expect(select).toBeDisabled();
    fireEvent.click(screen.getByText("gpu"));
    fireEvent.click(select);
    expect(onAnswer).toHaveBeenCalledWith({ accept: true, selected: [1] });
  });

  it("previews items and values, and answers with the chosen ones", () => {
    const { onAnswer, onPreview, onCancel } = renderDialog({
      ...previewDialog, controls: [...previewDialog.controls,
        { name: "downsample", label: "Downsample", kind: "number", value: 2, refresh: true }] });
    expect(screen.getByText("32 px | 64.0 Å")).toBeInTheDocument();
    fireEvent.click(screen.getByText("emd_2.map"));
    expect(onPreview).toHaveBeenCalledWith(1, { radius: 32, downsample: 2 });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Mask radius" }), { key: "ArrowLeft" });
    expect(screen.getByText("31 px | 62.0 Å")).toBeInTheDocument();
    const downsample = screen.getByRole("spinbutton", { name: "Downsample" });
    fireEvent.change(downsample, { target: { value: "3" } });
    fireEvent.blur(downsample);
    expect(onPreview).toHaveBeenLastCalledWith(1, { radius: 31, downsample: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(onAnswer).toHaveBeenCalledWith({ accept: true, item: 1, values: { radius: 31, downsample: 3 } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("picks a file of the folder the wizard offers", () => {
    const { onAnswer } = renderDialog({ type: "file", title: "Select an MTF", root: "mtfs",
      entries: ["k2.star", "k3.star"] });
    fireEvent.click(screen.getByText("k3.star"));
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(onAnswer).toHaveBeenCalledWith({ accept: true, path: "k3.star" });
  });

  it("fills small forms (e.g. the color scale)", () => {
    const { onAnswer } = renderDialog({ type: "form", title: "Color scale wizard", fields: [
      { name: "lowest", label: "Lowest", kind: "number", value: 0 },
      { name: "colorPalette", label: "Color set", kind: "text", value: "jet" }] });
    fireEvent.change(screen.getByLabelText("Lowest"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onAnswer).toHaveBeenCalledWith({ accept: true, values: { lowest: "2", colorPalette: "jet" } });
  });
});

describe("running a wizard", () => {
  const runProtocolWizard = vi.fn();
  const applyWizardParamUpdates = vi.fn();
  const openExecErrorDialog = vi.fn();

  function useRuntime() {
    return useWizardRuntime({ projectId: 7, protocolId: 22, protocolClassName: "XmippProtPreprocessVolumes",
      svc: { runProtocolWizard }, getSerializedParams: () => ({ backRadius: 32 }),
      applyWizardParamUpdates, openExecErrorDialog });
  }

  beforeEach(() => vi.clearAllMocks());

  it("opens the wizard's dialog and applies what it sets with the answer", async () => {
    runProtocolWizard
      .mockResolvedValueOnce({ status: "dialog", step: 0, dialog: previewDialog, messages: [] })
      .mockResolvedValueOnce({ status: "preview", step: 0, images: [{ src: PNG, width: 64, height: 64 }] })
      .mockResolvedValueOnce({ status: "done", paramUpdates: { backRadius: 20 }, messages: [] });
    const { result } = renderHook(useRuntime);
    await act(() => result.current.openWizard("backRadius", "Mask radius", "xmipp3.wizards.W"));
    expect(result.current.run?.dialog?.type).toBe("preview");
    await act(() => result.current.requestPreview(1, { radius: 10 }));
    expect(runProtocolWizard).toHaveBeenLastCalledWith(7, expect.objectContaining({
      answers: [], preview: { step: 0, item: 1, values: { radius: 10 } }, formValues: { backRadius: 32 } }));
    expect(result.current.run?.previewImages).toHaveLength(1);
    await act(() => result.current.answer({ accept: true, item: 1, values: { radius: 20 } }));
    expect(runProtocolWizard).toHaveBeenLastCalledWith(7, expect.objectContaining({
      answers: [{ accept: true, item: 1, values: { radius: 20 } }], preview: null }));
    expect(applyWizardParamUpdates).toHaveBeenCalledWith({ backRadius: 20 });
    expect(result.current.run).toBeNull();
  });

  it("runs the wizard of a protocol not saved yet", async () => {
    runProtocolWizard.mockResolvedValueOnce({ status: "done", paramUpdates: { radius: 5 }, messages: [] });
    const { result } = renderHook(() => useWizardRuntime({ projectId: 7, protocolId: "",
      protocolClassName: "XmippProtMask", svc: { runProtocolWizard }, getSerializedParams: () => ({}),
      applyWizardParamUpdates, openExecErrorDialog }));
    await act(() => result.current.openWizard("radius", "Radius", "w"));
    expect(runProtocolWizard).toHaveBeenCalledWith(7, expect.objectContaining({ protocolId: null }));
    expect(applyWizardParamUpdates).toHaveBeenCalledWith({ radius: 5 });
  });

  it("shows the error when the wizard fails", async () => {
    runProtocolWizard.mockResolvedValueOnce({ status: "failed", error: "no input" });
    const { result } = renderHook(useRuntime);
    await act(() => result.current.openWizard("backRadius", "Mask radius", "w"));
    expect(openExecErrorDialog).toHaveBeenCalledWith("Wizard error", expect.stringContaining("no input"));
    expect(applyWizardParamUpdates).not.toHaveBeenCalled();
  });

  it("keeps the plots a wizard shows to open them", async () => {
    runProtocolWizard.mockResolvedValueOnce({ status: "done", paramUpdates: {}, messages: [],
      items: [{ kind: "message", level: "info", title: "", text: "42 groups" }] });
    const { result } = renderHook(useRuntime);
    await act(() => result.current.openWizard("defocusRange", "Defocus range", "w"));
    await waitFor(() => expect(result.current.views?.items).toHaveLength(1));
  });
});
