import {
    WizardInputDialog,
    WizardOptionsDialog,
} from "../WizardDialogs";
import MaskRadiusDialog from "./MaskRadiusDialog";
import MaskRadiiDialog from "./MaskRadiiDialog";
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
    onMaskRadiiInnerChange: (value: number) => void;
    onMaskRadiiInnerCommit: (value: number) => void;
    onMaskRadiiOuterChange: (value: number) => void;
    onMaskRadiiOuterCommit: (value: number) => void;
    onMaskRadiiSelectedIndexChange: (value: number) => void;
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
    onMaskRadiiInnerChange,
    onMaskRadiiInnerCommit,
    onMaskRadiiOuterChange,
    onMaskRadiiOuterCommit,
    onMaskRadiiSelectedIndexChange,
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

    if (wizardState.kind === "mask_radii") {
        return (
            <MaskRadiiDialog
                open={wizardState.open}
                title={wizardState.title}
                innerRadius={wizardState.innerRadius}
                outerRadius={wizardState.outerRadius}
                innerMin={wizardState.innerMin}
                outerMin={wizardState.outerMin}
                max={wizardState.max}
                step={wizardState.step}
                innerRadiusAngstrom={wizardState.innerRadiusAngstrom}
                outerRadiusAngstrom={wizardState.outerRadiusAngstrom}
                samplingRate={wizardState.samplingRate}
                selectedIndex={wizardState.selectedIndex}
                items={wizardState.items}
                message={wizardState.message}
                previewUrl={wizardState.previewUrl}
                previewCaption={wizardState.previewCaption}
                previewSourceWidth={wizardState.previewSourceWidth}
                previewSourceHeight={wizardState.previewSourceHeight}
                primaryParamName={wizardState.paramName}
                secondaryParamName={wizardState.secondaryParamName}
                onClose={onClose}
                onConfirm={onConfirm}
                onInnerRadiusChange={onMaskRadiiInnerChange}
                onInnerRadiusCommit={onMaskRadiiInnerCommit}
                onOuterRadiusChange={onMaskRadiiOuterChange}
                onOuterRadiusCommit={onMaskRadiiOuterCommit}
                onSelectedIndexChange={onMaskRadiiSelectedIndexChange}
            />
        );
    }

    return null;
}