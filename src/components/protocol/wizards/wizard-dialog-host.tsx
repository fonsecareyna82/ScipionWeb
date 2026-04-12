import {
  MaskRadiusDialog,
  WizardInputDialog,
  WizardOptionsDialog,
} from "../WizardDialogs";
import type { ActiveWizardState } from "./protocol_wizard_types";

type WizardDialogHostProps = {
  wizardState: ActiveWizardState;
  onClose: () => void;
  onConfirm: () => void;
  onOptionsSelectedValueChange: (value: string) => void;
  onInputValueChange: (fieldName: string, value: string) => void;
  onMaskRadiusChange: (value: number) => void;
  onMaskRadiusCommit: (value: number) => void;
  onMaskRadiusSelectedIndexChange: (value: number) => void;
};

export default function WizardDialogHost({
  wizardState,
  onClose,
  onConfirm,
  onOptionsSelectedValueChange,
  onInputValueChange,
  onMaskRadiusChange,
  onMaskRadiusCommit,
  onMaskRadiusSelectedIndexChange,
}: WizardDialogHostProps) {
  if (!wizardState.open) return null;

  if (wizardState.kind === "options") {
    return (
      <WizardOptionsDialog
        open={wizardState.open}
        title={wizardState.title}
        paramName={wizardState.paramName}
        options={wizardState.options}
        selectedValue={wizardState.selectedValue}
        message={wizardState.message}
        onClose={onClose}
        onConfirm={onConfirm}
        onSelectedValueChange={onOptionsSelectedValueChange}
      />
    );
  }

  if (wizardState.kind === "input") {
    return (
      <WizardInputDialog
        open={wizardState.open}
        title={wizardState.title}
        fields={wizardState.fields}
        values={wizardState.values}
        message={wizardState.message}
        previewImageUrl={wizardState.previewImageUrl}
        onClose={onClose}
        onConfirm={onConfirm}
        onValueChange={onInputValueChange}
      />
    );
  }

  if (wizardState.kind === "mask_radius") {
    return (
      <MaskRadiusDialog
        open={wizardState.open}
        title={wizardState.title}
        radius={wizardState.radius}
        min={wizardState.min}
        max={wizardState.max}
        step={wizardState.step}
        radiusAngstrom={wizardState.radiusAngstrom}
        samplingRate={wizardState.samplingRate}
        selectedIndex={wizardState.selectedIndex}
        items={wizardState.items}
        message={wizardState.message}
        previewUrl={wizardState.previewUrl}
        previewCaption={wizardState.previewCaption}
        previewSourceWidth={wizardState.previewSourceWidth}
        previewSourceHeight={wizardState.previewSourceHeight}
        onClose={onClose}
        onConfirm={onConfirm}
        onRadiusChange={onMaskRadiusChange}
        onRadiusCommit={onMaskRadiusCommit}
        onSelectedIndexChange={onMaskRadiusSelectedIndexChange}
      />
    );
  }

  return null;
}