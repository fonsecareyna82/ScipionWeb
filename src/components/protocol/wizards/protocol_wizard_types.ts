import type { ExecuteProtocolWizardViewerState } from "@/services/ProjectService";

export type WizardDialogOption = {
  value: string;
  label: string;
};

export type WizardInputDialogField = {
  name: string;
  label?: string;
  kind: "number" | "text" | "select";
  value?: string | number | null;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
};

export type WizardOptionsDialogState = {
  kind: "options";
  open: true;
  stateKey: string;
  paramName: string;
  title: string;
  options: WizardDialogOption[];
  selectedValue: string;
  message: string;
};

export type WizardInputDialogState = {
  kind: "input";
  open: true;
  stateKey: string;
  paramName: string;
  wizardId: string;
  title: string;
  fields: WizardInputDialogField[];
  values: Record<string, string>;
  message: string;
  previewImageUrl: string;
};

export type MaskRadiusDialogItem = {
  id: string;
  label: string;
  index: number;
};

export type MaskRadiusDialogState = {
  kind: "mask_radius";
  open: true;
  stateKey: string;
  paramName: string;
  wizardId: string;
  title: string;
  radius: number;
  min: number;
  max: number;
  step: number;
  radiusAngstrom: number | null;
  samplingRate: number | null;
  selectedIndex: number;
  items: MaskRadiusDialogItem[];
  message: string;
  previewUrl: string | null;
  previewWidth: number | null;
  previewHeight: number | null;
  previewSourceWidth: number | null;
  previewSourceHeight: number | null;
  previewCaption: string;
};

export type ClosedWizardState = {
  kind: "closed";
  open: false;
};

export type ActiveWizardState =
  | ClosedWizardState
  | WizardOptionsDialogState
  | WizardInputDialogState
  | MaskRadiusDialogState;

export const closedWizardState: ClosedWizardState = {
  kind: "closed",
  open: false,
};

export function normalizeWizardViewerItems(
  raw: unknown,
): MaskRadiusDialogItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any) => ({
      id: String(item?.id ?? "").trim(),
      label: String(item?.label ?? "").trim(),
      index: Number(item?.index ?? 0) || 0,
    }))
    .filter((item) => item.id && item.label && item.index > 0);
}

export function viewerStateToMaskRadiusDialogState(args: {
  stateKey: string;
  paramName: string;
  wizardId: string;
  title: string;
  message: string;
  fallbackRadius?: number;
  viewerState: ExecuteProtocolWizardViewerState | null;
  previewUrl: string | null;
}): MaskRadiusDialogState {
  const {
    stateKey,
    paramName,
    wizardId,
    title,
    message,
    fallbackRadius = 1,
    viewerState,
    previewUrl,
  } = args;

  return {
    kind: "mask_radius",
    open: true,
    stateKey,
    paramName,
    wizardId,
    title,
    radius: Number(viewerState?.radius ?? fallbackRadius) || fallbackRadius,
    min: Number(viewerState?.radiusMin ?? 1) || 1,
    max: Number(viewerState?.radiusMax ?? 256) || 256,
    step: Number(viewerState?.radiusStep ?? 1) || 1,
    radiusAngstrom:
      typeof viewerState?.radiusAngstrom === "number"
        ? viewerState.radiusAngstrom
        : null,
    samplingRate:
      typeof viewerState?.samplingRate === "number"
        ? viewerState.samplingRate
        : null,
    selectedIndex: Number(viewerState?.selectedIndex ?? 1) || 1,
    items: normalizeWizardViewerItems(viewerState?.items),
    message,
    previewUrl,
    previewWidth:
      typeof viewerState?.preview?.width === "number"
        ? viewerState.preview.width
        : null,
    previewHeight:
      typeof viewerState?.preview?.height === "number"
        ? viewerState.preview.height
        : null,
    previewSourceWidth:
      typeof viewerState?.preview?.sourceWidth === "number"
        ? viewerState.preview.sourceWidth
        : null,
    previewSourceHeight:
      typeof viewerState?.preview?.sourceHeight === "number"
        ? viewerState.preview.sourceHeight
        : null,
    previewCaption: String(viewerState?.preview?.caption ?? "").trim(),
  };
}