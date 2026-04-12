import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";

import type {
  ExecuteProtocolWizardResult,
  ExecuteProtocolWizardViewerState,
} from "@/services/ProjectService";
import { getParamNameFromStateKey } from "@/utils/protocolform.utils";
import {
  formatErrorsForDialog,
  getBackendPayloadFromError,
  getErrorsFromBackendPayload,
} from "@/utils/protocolform.errors";

import {
  buildWizardInputState,
  normalizeWizardAvailableValues,
  normalizeWizardDialogOptions,
  resolveWizardPreviewUrl,
} from "./protocol_wizard_utils";

import {
  closedWizardState,
  type ActiveWizardState,
  viewerStateToMaskRadiusDialogState,
} from "./protocol_wizard_types";

import { getWizardDescriptor } from "./protocol_wizard_meta";

type UseProtocolWizardsArgs = {
  projectId: string | number | null;
  protocolId: string | number | null;
  protocolClassName: string | null;
  protocolDetails: any;
  svc: any;
  getSerializedParams: () => Record<string, any>;
  applyWizardParamUpdates: (updates: Record<string, any>) => void;
  openExecErrorDialog: (title: string, message: string) => void;
};

export function useProtocolWizards({
  projectId,
  protocolId,
  protocolClassName,
  protocolDetails,
  svc,
  getSerializedParams,
  applyWizardParamUpdates,
  openExecErrorDialog,
}: UseProtocolWizardsArgs) {
  const [wizardState, setWizardState] = useState<ActiveWizardState>(closedWizardState);
  const maskRadiusPreviewRequestIdRef = useRef(0);

  const closeWizard = useCallback(() => {
    setWizardState(closedWizardState);
  }, []);

  const confirmWizard = useCallback(async () => {
    if (!wizardState.open) return;

    if (wizardState.kind === "options") {
      if (!wizardState.paramName || !wizardState.selectedValue) {
        closeWizard();
        return;
      }

      applyWizardParamUpdates({
        [wizardState.paramName]: wizardState.selectedValue,
      });

      toast.success(`Wizard value applied to '${wizardState.paramName}'.`);
      closeWizard();
      return;
    }

    if (!projectId) {
      toast.error("Missing project id.");
      return;
    }

    try {
      if (wizardState.kind === "input") {
        const result = await svc.executeProtocolWizard(projectId, {
          protocolId: protocolId ?? null,
          protocolClassName,
          paramName: wizardState.paramName,
          wizardId: wizardState.wizardId,
          formValues: getSerializedParams(),
          wizardInputs: wizardState.values,
        });

        const updates =
          result?.paramUpdates && typeof result.paramUpdates === "object"
            ? result.paramUpdates
            : {};

        if (Object.keys(updates).length > 0) {
          applyWizardParamUpdates(updates);
        }

        toast.success(result?.message?.trim() || "Wizard executed successfully.");
        closeWizard();
        return;
      }

      if (wizardState.kind === "mask_radius") {
        const result = await svc.executeProtocolWizard(projectId, {
          protocolId: protocolId ?? null,
          protocolClassName,
          paramName: wizardState.paramName,
          wizardId: wizardState.wizardId,
          formValues: getSerializedParams(),
          wizardInputs: {
            action: "apply",
            selectedIndex: wizardState.selectedIndex,
            radius: wizardState.radius,
          },
        });

        const updates =
          result?.paramUpdates && typeof result.paramUpdates === "object"
            ? { ...result.paramUpdates }
            : {};

        if (Object.keys(updates).length > 0) {
          applyWizardParamUpdates(updates);
        }

        toast.success(result?.message?.trim() || "Wizard executed successfully.");
        closeWizard();
      }
    } catch (err: any) {
      const payload = getBackendPayloadFromError(err);
      const errors = getErrorsFromBackendPayload(payload);

      if (errors.length > 0) {
        openExecErrorDialog("Wizard error", formatErrorsForDialog(errors));
        return;
      }

      const fallbackMsg =
        err?.message ||
        (typeof payload?.detail === "string" ? payload.detail : null) ||
        "Wizard execution failed";

      openExecErrorDialog("Wizard error", String(fallbackMsg));
    }
  }, [
    wizardState,
    projectId,
    protocolId,
    protocolClassName,
    svc,
    getSerializedParams,
    applyWizardParamUpdates,
    openExecErrorDialog,
    closeWizard,
  ]);

  const refreshMaskRadiusPreview = useCallback(
    async (selectedIndex: number, radius: number) => {
      if (!projectId) return;
      if (wizardState.kind !== "mask_radius") return;

      try {
        const requestId = ++maskRadiusPreviewRequestIdRef.current;

        const result = await svc.executeProtocolWizard(projectId, {
          protocolId: protocolId ?? null,
          protocolClassName,
          paramName: wizardState.paramName,
          wizardId: wizardState.wizardId,
          formValues: getSerializedParams(),
          wizardInputs: {
            action: "preview",
            selectedIndex,
            radius,
          },
        });

        if (requestId !== maskRadiusPreviewRequestIdRef.current) {
          return;
        }

        const viewerState: ExecuteProtocolWizardViewerState | null =
          result?.viewerState ?? null;

        const previewUrl = resolveWizardPreviewUrl(
          svc,
          viewerState?.preview?.imageUrl,
        );

        setWizardState((prev) => {
          if (prev.kind !== "mask_radius") return prev;

          return {
            ...prev,
            radius: Number(viewerState?.radius ?? radius) || radius,
            min: Number(viewerState?.radiusMin ?? prev.min) || prev.min,
            max: Number(viewerState?.radiusMax ?? prev.max) || prev.max,
            step: Number(viewerState?.radiusStep ?? prev.step) || prev.step,
            radiusAngstrom:
              typeof viewerState?.radiusAngstrom === "number"
                ? viewerState.radiusAngstrom
                : prev.radiusAngstrom,
            samplingRate:
              typeof viewerState?.samplingRate === "number"
                ? viewerState.samplingRate
                : prev.samplingRate,
            selectedIndex:
              Number(viewerState?.selectedIndex ?? selectedIndex) || selectedIndex,
            items: Array.isArray(viewerState?.items) ? viewerState.items : prev.items,
            previewUrl,
            previewWidth:
              typeof viewerState?.preview?.width === "number"
                ? viewerState.preview.width
                : prev.previewWidth,
            previewHeight:
              typeof viewerState?.preview?.height === "number"
                ? viewerState.preview.height
                : prev.previewHeight,
            previewSourceWidth:
              typeof viewerState?.preview?.sourceWidth === "number"
                ? viewerState.preview.sourceWidth
                : prev.previewSourceWidth,
            previewSourceHeight:
              typeof viewerState?.preview?.sourceHeight === "number"
                ? viewerState.preview.sourceHeight
                : prev.previewSourceHeight,
            previewCaption: String(
              viewerState?.preview?.caption ?? prev.previewCaption ?? "",
            ).trim(),
          };
        });
      } catch {
        // Keep current preview state if refresh fails
      }
    },
    [
      projectId,
      protocolId,
      protocolClassName,
      wizardState,
      svc,
      getSerializedParams,
    ],
  );

  const openWizardForParam = useCallback(
    async (stateKey: string, paramDef?: any) => {
      if (!projectId) {
        toast.error("Missing project id.");
        return;
      }

      const paramName = getParamNameFromStateKey(stateKey);
      if (!paramName) {
        toast.error("Could not resolve wizard parameter.");
        return;
      }

      const liveParam = protocolDetails.params?.[stateKey] ?? {};
      const mergedDef = { ...(paramDef ?? {}), ...liveParam };
      const wizard = getWizardDescriptor(mergedDef);

      if (!wizard) {
        toast.error(`No wizard metadata found for '${paramName}'.`);
        return;
      }

      if (wizard.webSupported === false) {
        toast.error("This wizard is not available in the web UI yet.");
        return;
      }

      try {
        const result: ExecuteProtocolWizardResult = await svc.executeProtocolWizard(projectId, {
          protocolId: protocolId ?? null,
          protocolClassName,
          paramName,
          wizardId: wizard.id,
          formValues: getSerializedParams(),
        });

        const updates =
          result?.paramUpdates && typeof result.paramUpdates === "object"
            ? { ...result.paramUpdates }
            : {};

        const inputSchema = result?.inputSchema ?? null;
        const availableValues = normalizeWizardDialogOptions(result);

        if (result?.requiresUserInput && inputSchema?.type === "mask_radius") {
          const deferredUpdates = { ...updates };
          delete deferredUpdates[paramName];

          if (Object.keys(deferredUpdates).length > 0) {
            applyWizardParamUpdates(deferredUpdates);
          }

          const viewerState: ExecuteProtocolWizardViewerState | null =
            result?.viewerState ?? null;

          const previewUrl = resolveWizardPreviewUrl(
            svc,
            viewerState?.preview?.imageUrl,
          );

          setWizardState(
            viewerStateToMaskRadiusDialogState({
              stateKey,
              paramName,
              wizardId: wizard.id,
              title: String(inputSchema.title ?? mergedDef?.label ?? paramName),
              message: String(result?.message ?? "").trim(),
              fallbackRadius:
                Number(
                  viewerState?.radius ??
                    liveParam?.editableValue ??
                    liveParam?.value ??
                    1,
                ) || 1,
              viewerState,
              previewUrl,
            }),
          );

          return;
        }

        if (result?.requiresUserInput) {
          const deferredUpdates = { ...updates };
          delete deferredUpdates[paramName];

          if (Object.keys(deferredUpdates).length > 0) {
            applyWizardParamUpdates(deferredUpdates);
          }

          setWizardState(
            buildWizardInputState({
              stateKey,
              paramName,
              wizardId: wizard.id,
              result,
              mergedDef,
              svc,
            }),
          );
          return;
        }

        if (availableValues.length > 1) {
          const deferredUpdates = { ...updates };
          delete deferredUpdates[paramName];

          if (Object.keys(deferredUpdates).length > 0) {
            applyWizardParamUpdates(deferredUpdates);
          }

          const currentValueRaw =
            updates[paramName] ??
            liveParam?.editableValue ??
            liveParam?.value ??
            "";

          const currentValue = String(currentValueRaw ?? "").trim();

          const selectedValue = availableValues.some(
            (option) => option.value === currentValue,
          )
            ? currentValue
            : availableValues[0].value;

          setWizardState({
            kind: "options",
            open: true,
            stateKey,
            paramName,
            title: String(mergedDef?.label ?? paramName),
            options: availableValues,
            selectedValue,
            message: String(result?.message ?? "").trim(),
          });

          return;
        }

        if (Object.keys(updates).length > 0) {
          applyWizardParamUpdates(updates);
          toast.success(result?.message?.trim() || "Wizard executed successfully.");
          return;
        }

        const normalizedAvailableValues = normalizeWizardAvailableValues(
          result?.availableValues,
        );

        if (normalizedAvailableValues.length === 1) {
          applyWizardParamUpdates({
            [paramName]: normalizedAvailableValues[0].value,
          });
          toast.success(result?.message?.trim() || "Wizard executed successfully.");
          return;
        }

        toast.success(result?.message?.trim() || "Wizard executed successfully.");
      } catch (err: any) {
        const payload = getBackendPayloadFromError(err);
        const errors = getErrorsFromBackendPayload(payload);

        if (errors.length > 0) {
          openExecErrorDialog("Wizard error", formatErrorsForDialog(errors));
          return;
        }

        const fallbackMsg =
          err?.message ||
          (typeof payload?.detail === "string" ? payload.detail : null) ||
          "Wizard execution failed";

        openExecErrorDialog("Wizard error", String(fallbackMsg));
      }
    },
    [
      projectId,
      protocolId,
      protocolClassName,
      protocolDetails.params,
      svc,
      getSerializedParams,
      applyWizardParamUpdates,
      openExecErrorDialog,
    ],
  );

  const setOptionsSelectedValue = useCallback((value: string) => {
    setWizardState((prev) =>
      prev.kind === "options"
        ? {
            ...prev,
            selectedValue: value,
          }
        : prev,
    );
  }, []);

  const setInputFieldValue = useCallback((fieldName: string, value: string) => {
    setWizardState((prev) =>
      prev.kind === "input"
        ? {
            ...prev,
            values: {
              ...prev.values,
              [fieldName]: value,
            },
          }
        : prev,
    );
  }, []);

  const setMaskRadiusValue = useCallback((value: number) => {
    setWizardState((prev) =>
      prev.kind === "mask_radius"
        ? {
            ...prev,
            radius: value,
          }
        : prev,
    );
  }, []);

  const commitMaskRadiusValue = useCallback(
    async (value: number) => {
      if (wizardState.kind !== "mask_radius") return;
      await refreshMaskRadiusPreview(wizardState.selectedIndex, value);
    },
    [wizardState, refreshMaskRadiusPreview],
  );

  const setMaskRadiusSelectedIndex = useCallback(
    async (value: number) => {
      setWizardState((prev) =>
        prev.kind === "mask_radius"
          ? {
              ...prev,
              selectedIndex: value,
            }
          : prev,
      );

      if (wizardState.kind !== "mask_radius") return;
      await refreshMaskRadiusPreview(value, wizardState.radius);
    },
    [wizardState, refreshMaskRadiusPreview],
  );

  return {
    wizardState,
    openWizardForParam,
    closeWizard,
    confirmWizard,
    setOptionsSelectedValue,
    setInputFieldValue,
    setMaskRadiusValue,
    commitMaskRadiusValue,
    setMaskRadiusSelectedIndex,
  };
}