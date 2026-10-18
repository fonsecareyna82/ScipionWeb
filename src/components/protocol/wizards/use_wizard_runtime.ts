// Runs a protocol form wizard with the plugin's own code on the server, as the
// desktop does: its dialogs open here one at a time; each answer runs the
// wizard again with the answers so far, until it ends with the values it set.
import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";

import type { ProjectService } from "@/services/ProjectService";
import type { ViewerActionItem, ViewerActionMessage } from "@/utils/protocol_viewer_action_result";
import {
  describeWizardReply,
  type WizardDialog,
  type WizardImage,
  type WizardReply,
} from "@/utils/protocol_wizard_runtime";
import {
  formatErrorsForDialog,
  getBackendPayloadFromError,
  getErrorsFromBackendPayload,
} from "@/utils/protocolform.errors";
import type { WizardAnswer } from "./WizardRuntimeDialog";

export type WizardRun = {
  paramName: string;
  paramLabel: string;
  wizardId: string;
  answers: WizardAnswer[];
  dialog: WizardDialog | null;
  step: number;
  messages: ViewerActionMessage[];
  busy: boolean;
  previewImages: WizardImage[] | null;
  previewBusy: boolean;
};

/** Plots and other views a wizard showed, kept to open in a results window. */
export type WizardViews = { title: string; items: ViewerActionItem[]; messages: ViewerActionMessage[] };

type Args = {
  projectId: string | number | null;
  protocolId: string | number | null;
  protocolClassName: string | null;
  svc: Pick<ProjectService, "runProtocolWizard">;
  getSerializedParams: () => Record<string, unknown>;
  applyWizardParamUpdates: (updates: Record<string, unknown>) => void;
  openExecErrorDialog: (title: string, message: string) => void;
};

function notify(messages: ViewerActionMessage[]) {
  for (const message of messages) {
    const text = message.title ? `${message.title}: ${message.text}` : message.text;
    if (message.level === "error") toast.error(text);
    else if (message.level === "warning") toast(text, { icon: "⚠️" });
    else toast.success(text);
  }
}

export function useWizardRuntime({
  projectId, protocolId, protocolClassName, svc, getSerializedParams, applyWizardParamUpdates,
  openExecErrorDialog,
}: Args) {
  const [run, setRun] = useState<WizardRun | null>(null);
  const [views, setViews] = useState<WizardViews | null>(null);
  // The form values when the wizard opened: every pass of one run sees the same form.
  const formRef = useRef<Record<string, unknown>>({});
  const previewRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const call = useCallback(async (current: WizardRun, answers: WizardAnswer[],
    preview: { step: number; item: number; values: Record<string, number> } | null = null): Promise<WizardReply> => {
    if (!svc.runProtocolWizard || projectId === null) throw new Error("Wizards are not available.");
    // A protocol not saved yet has no id: the server builds a new one from the form.
    const savedId = /^\d+$/.test(String(protocolId ?? "").trim()) ? Number(protocolId) : null;
    const raw = await svc.runProtocolWizard(projectId, {
      protocolId: savedId, protocolClassName, paramName: current.paramName,
      wizardId: current.wizardId, formValues: formRef.current, answers, preview,
    });
    const reply = describeWizardReply(raw);
    if (!reply) throw new Error("The wizard gave an answer the web does not understand.");
    return reply;
  }, [svc, projectId, protocolId, protocolClassName]);

  const finish = useCallback((current: WizardRun, reply: WizardReply) => {
    switch (reply.status) {
      case "dialog":
        setRun({ ...current, dialog: reply.dialog, step: reply.step, messages: reply.messages,
          busy: false, previewImages: null, previewBusy: false });
        return;
      case "done": {
        setRun(null);
        const updates = reply.paramUpdates;
        if (Object.keys(updates).length) applyWizardParamUpdates(updates);
        notify(reply.messages);
        if (reply.items.length) {
          setViews({ title: current.paramLabel, items: reply.items, messages: [] });
        } else if (!Object.keys(updates).length && !reply.messages.length) {
          toast("The wizard did not change any value.");
        }
        return;
      }
      case "cancelled":
        setRun(null);
        notify(reply.messages);
        return;
      case "preview":
        return;
      default:
        setRun(null);
        notify(reply.messages);
        openExecErrorDialog("Wizard error", formatErrorsForDialog(reply.errors));
    }
  }, [applyWizardParamUpdates, openExecErrorDialog]);

  const fail = useCallback((err: unknown) => {
    setRun(null);
    const errors = getErrorsFromBackendPayload(getBackendPayloadFromError(err));
    openExecErrorDialog("Wizard error", errors.length
      ? formatErrorsForDialog(errors) : String((err as Error)?.message ?? err));
  }, [openExecErrorDialog]);

  const openWizard = useCallback(async (paramName: string, paramLabel: string, wizardId: string) => {
    formRef.current = getSerializedParams();
    const runId = ++runIdRef.current;
    const current: WizardRun = { paramName, paramLabel, wizardId, answers: [], dialog: null, step: 0,
      messages: [], busy: true, previewImages: null, previewBusy: false };
    setRun(current);
    try {
      const reply = await call(current, []);
      if (runId === runIdRef.current) finish(current, reply);
    } catch (err) {
      if (runId === runIdRef.current) fail(err);
    }
  }, [call, fail, finish, getSerializedParams]);

  const answer = useCallback(async (value: WizardAnswer) => {
    if (!run) return;
    previewRef.current?.abort();
    const runId = runIdRef.current;
    const answers = [...run.answers, value];
    const current = { ...run, answers, busy: true };
    setRun(current);
    try {
      const reply = await call(current, answers);
      if (runId === runIdRef.current) finish(current, reply);
    } catch (err) {
      if (runId === runIdRef.current) fail(err);
    }
  }, [call, fail, finish, run]);

  /** As closing the desktop dialog: the wizard goes on with a cancelled dialog. */
  const cancel = useCallback(() => answer({ accept: false }), [answer]);

  const requestPreview = useCallback(async (item: number, values: Record<string, number>) => {
    if (!run) return;
    previewRef.current?.abort();
    const controller = new AbortController();
    previewRef.current = controller;
    setRun(current => current && { ...current, previewBusy: true });
    try {
      const reply = await call(run, run.answers, { step: run.step, item, values });
      if (controller.signal.aborted) return;
      setRun(current => current && reply.status === "preview" && reply.step === current.step
        ? { ...current, previewImages: reply.images, previewBusy: false }
        : current && { ...current, previewBusy: false });
    } catch {
      if (!controller.signal.aborted) setRun(current => current && { ...current, previewBusy: false });
    }
  }, [call, run]);

  return { run, views, closeViews: () => setViews(null), openWizard, answer, cancel, requestPreview };
}
