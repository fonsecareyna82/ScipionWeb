// The protocol viewer's own form, built at runtime from the plugin code.
// Each field with a visualize handler gets an "eye" that runs it on the server.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, LinearProgress, MenuItem,
  TextField, Tooltip, Typography,
} from "@mui/material";
import { ExternalLink, Eye, Info, Monitor, SlidersHorizontal, Wand2 } from "lucide-react";
import type { ProjectService, ProtocolViewerActionValues } from "@/services/ProjectService";
import { describeProtocolViewerRuntimePreview, validRuntimeViewerId, type RuntimeViewerPreview } from "@/utils/protocol_viewer_runtime_preview";
import { evaluateViewerCondition, initialViewerLocalValues, localViewerFieldValue } from "@/utils/protocol_viewer_reactive_form";
import {
  describeViewerActionResult, type ViewerActionDesktop, type ViewerActionLink, type ViewerActionMessage,
  type ViewerActionResult, type ViewerActionVolumes,
} from "@/utils/protocol_viewer_action_result";
import ProtocolViewerActionResults, {
  hasWindowContent, isInlineItem, openVolumesTarget, ViewerLinkButton,
} from "./ProtocolViewerActionResults";
import AnalyzeOutputDialog from "@/components/analyze/analyze-output-dialog";
import WizardLoadingDialog from "./wizards/WizardLoadingDialog";
import WizardRuntimeDialog from "./wizards/WizardRuntimeDialog";
import { useWizardRuntime, type WizardRunRequest } from "./wizards/use_wizard_runtime";

type Props = {
  service: ProjectService;
  projectId: string;
  protocolId: string;
  viewerId: string;
  viewerName?: string;
  protocolLabel?: string;
};

type State =
  | { status: "loading" | "error" | "invalid"; scope: string }
  | { status: "ready"; scope: string; preview: RuntimeViewerPreview };

type ActionState =
  | { status: "idle" }
  | { status: "running"; action: string }
  | { status: "done"; result: ViewerActionResult; run: number }
  | { status: "failed"; action: string; messages: string[] };

const ACTION_ERRORS: Record<string, string> = {
  validation_failed: "The viewer reported validation errors.",
  action_failed: "The viewer failed while preparing this result.",
  invalid_values: "Some values are not valid for this viewer.",
  unknown_action: "This viewer does not provide that result.",
  worker_timeout: "The viewer took too long to answer.",
};

export default function ProtocolViewerRuntimePreviewPanel({ service, projectId, protocolId, viewerId, viewerName, protocolLabel = "" }: Props) {
  const scope = `${projectId}/${protocolId}/${viewerId}`;
  const [state, setState] = useState<State>({ status: "loading", scope });
  const [action, setAction] = useState<ActionState>({ status: "idle" });
  const actionController = useRef<AbortController | null>(null);
  const runCounter = useRef(0);
  const [webVolumes, setWebVolumes] = useState<ViewerActionVolumes | null>(null);
  const shown = state.scope === scope ? state : { status: "loading" as const, scope };

  useEffect(() => {
    if (!validRuntimeViewerId(viewerId) || !/^\d+$/.test(projectId) || !/^\d+$/.test(protocolId) ||
        typeof service.fetchProtocolViewerRuntimePreview !== "function") {
      setState({ status: "error", scope });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading", scope });
    setAction({ status: "idle" });
    service.fetchProtocolViewerRuntimePreview(projectId, protocolId, viewerId, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return;
        const preview = describeProtocolViewerRuntimePreview(response, { projectId, protocolId, viewerId });
        setState(preview ? { status: "ready", scope, preview } : { status: "invalid", scope });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error", scope }); });
    return () => {
      controller.abort();
      actionController.current?.abort();
    };
  }, [scope, service, projectId, protocolId, viewerId]);

  const runAction = async (name: string, values: ProtocolViewerActionValues) => {
    if (typeof service.runProtocolViewerAction !== "function") return;
    actionController.current?.abort();
    const controller = new AbortController();
    actionController.current = controller;
    setAction({ status: "running", action: name });
    try {
      const response = await service.runProtocolViewerAction(
        projectId, protocolId, viewerId, name, values, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const result = describeViewerActionResult(response, { projectId, protocolId, viewerId, action: name });
      runCounter.current += 1;
      setAction(result ? { status: "done", result, run: runCounter.current }
        : { status: "failed", action: name, messages: ["The viewer answer could not be read."] });
    } catch (error: any) {
      if (controller.signal.aborted) return;
      const messages: string[] = Array.isArray(error?.messages) && error.messages.length
        ? error.messages : [ACTION_ERRORS[error?.code] ?? "The result could not be produced."];
      setAction({ status: "failed", action: name, messages });
    } finally {
      if (actionController.current === controller) actionController.current = null;
    }
  };

  // Wizards of the viewer form (e.g. a color scale) run with the viewer.
  const runWizard = useCallback((request: WizardRunRequest) => service.runProtocolViewerWizard!(
    projectId, protocolId, {
      viewerId, values: request.formValues as ProtocolViewerActionValues, paramName: request.paramName,
      wizardId: request.wizardId, answers: request.answers, preview: request.preview,
    }), [service, projectId, protocolId, viewerId]);

  const ready = shown.status === "ready" ? shown.preview : null;
  const actionLabel = (name: string) => {
    if (!ready) return name;
    const fields = [
      ...ready.sections.flatMap(section => [...section.fields, ...section.groups.flatMap(group => group.fields)]),
      ...(ready.conditionalFields ?? []).map(entry => entry.field),
    ];
    return fields.find(field => field.name === name)?.label ?? name;
  };
  const doneResult = action.status === "done" ? action.result : null;
  // Notices go in the form; viewer messages too unless a results window shows them.
  const inlineItems = doneResult ? doneResult.items.filter(isInlineItem) : [];
  const inlineMessages = [
    ...(doneResult && !hasWindowContent(doneResult) ? doneResult.messages : []),
    ...inlineItems.filter((item): item is ViewerActionMessage => item.kind === "message"),
  ];
  const inlineLinks = inlineItems.filter((item): item is ViewerActionLink => item.kind === "link");
  const desktopItems = inlineItems.filter(
    (item): item is ViewerActionDesktop | ViewerActionVolumes => item.kind === "desktop" || item.kind === "volumes");

  return (
    <Box component="section" aria-label="Viewer options" sx={{
      flex: 1, minHeight: 0, display: "flex", flexDirection: "column", bgcolor: "var(--app-n-0)",
    }}>
      <ColumnHeader icon={<SlidersHorizontal size={15} />} title="Options" subtitle={viewerName} />
      <Box sx={{ height: 3 }}>{action.status === "running" && <LinearProgress aria-label="Preparing the result" />}</Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, pb: 2.5 }}>
        {action.status === "failed" && (
          <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setAction({ status: "idle" })}>
            <strong>{actionLabel(action.action)}: </strong>
            {action.messages.map((message, index) => <div key={index}>{message}</div>)}
          </Alert>
        )}
        {doneResult && doneResult.items.length === 0 && doneResult.messages.length === 0 && (
          <Alert severity="info" sx={{ mt: 1.5 }} onClose={() => setAction({ status: "idle" })}>
            {actionLabel(doneResult.action)}: the viewer returned nothing to show.
          </Alert>
        )}
        {inlineLinks.map((link, index) => (
          <Alert key={`link-${index}`} severity="info" icon={<ExternalLink size={18} />} sx={{ mt: 1.5,
            "& .MuiAlert-message": { flex: 1, minWidth: 0 } }} onClose={() => setAction({ status: "idle" })}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <strong>{actionLabel(doneResult!.action)}</strong>
                <Box sx={{ fontSize: "0.78rem", wordBreak: "break-all", color: "var(--app-n-600)" }}>{link.url}</Box>
              </Box>
              <ViewerLinkButton url={link.url} />
            </Box>
          </Alert>
        ))}
        {desktopItems.map((item, index) => {
          const program = item.kind === "desktop" ? item.program : item.desktopProgram;
          return (
            <Alert key={`desktop-${index}`} severity="success" icon={<Monitor size={18} />} sx={{ mt: 1.5,
              "& .MuiAlert-message": { flex: 1, minWidth: 0 } }} onClose={() => setAction({ status: "idle" })}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <strong>{actionLabel(doneResult!.action)}</strong>
                  <Box sx={{ fontSize: "0.8rem", color: "var(--app-n-600)" }}>Opened in {program} on this computer.</Box>
                </Box>
                {item.kind === "volumes" && (
                  <Button size="small" variant="outlined" onClick={() => setWebVolumes(item)}
                    sx={{ textTransform: "none", flex: "0 0 auto", color: "#333d49", borderColor: "var(--app-n-400)" }}>
                    Show in the web volume viewer
                  </Button>
                )}
              </Box>
            </Alert>
          );
        })}
        {inlineMessages.map((message, index) => (
          <Alert key={index} severity={message.level} sx={{ mt: 1.5 }} onClose={() => setAction({ status: "idle" })}>
            {message.title && <strong>{message.title}: </strong>}{message.text}
          </Alert>
        ))}
        {shown.status === "loading" && (
          <Box role="status" sx={{ display: "flex", gap: 1, alignItems: "center", py: 2 }}>
            <CircularProgress size={16} /><Typography variant="body2">Loading viewer form...</Typography>
          </Box>
        )}
        {shown.status === "error" && <Alert severity="error" sx={{ mt: 1 }}>The viewer form could not be loaded.</Alert>}
        {shown.status === "invalid" && <Alert severity="error" sx={{ mt: 1 }}>The viewer form could not be read.</Alert>}
        {ready && (
          <Box data-testid="protocol-viewer-runtime-preview">
            {ready.sections.length === 0 && !ready.conditionalFields?.length && (
              <Typography variant="body2" sx={{ py: 2, color: "var(--app-n-500)" }}>This viewer has no options to show.</Typography>
            )}
            <RuntimeLocalViewerForm
              preview={ready}
              runningAction={action.status === "running" ? action.action : null}
              onAction={typeof service.runProtocolViewerAction === "function" ? runAction : undefined}
              onWizardRun={typeof service.runProtocolViewerWizard === "function" ? runWizard : undefined}
              service={service}
              projectId={projectId}
              protocolId={protocolId}
              protocolLabel={protocolLabel ?? ""}
            />
            {ready.omittedFields > 0 && (
              <Typography variant="caption" sx={{ display: "block", mt: 1.5, color: "var(--app-n-500)" }}>
                {ready.omittedFields} options of this viewer cannot be shown on the web.
              </Typography>
            )}
          </Box>
        )}
      </Box>
      {webVolumes && (
        <AnalyzeOutputDialog
          open
          onClose={() => setWebVolumes(null)}
          projectId={Number(projectId)}
          protocolLabel={protocolLabel}
          protocolId={openVolumesTarget(webVolumes, protocolId).protocolId}
          outputName={webVolumes.fileToken}
          displayName={webVolumes.title}
          outputRaw={{ pointerClass: "SetOfVolumes" }}
        />
      )}
      {action.status === "done" && hasWindowContent(action.result) && (
        <ProtocolViewerActionResults
          key={action.run}
          service={service} projectId={projectId} protocolId={protocolId}
          protocolLabel={protocolLabel} title={actionLabel(action.result.action)}
          result={action.result} onClose={() => setAction({ status: "idle" })} />
      )}
    </Box>
  );
}

type ColumnHeaderProps = { icon: ReactNode; title: string; subtitle?: string; action?: ReactNode };

function ColumnHeader({ icon, title, subtitle, action }: ColumnHeaderProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, pt: 1.5, pb: 1, minHeight: 48 }}>
      <Box sx={{ color: "var(--app-n-600)", display: "flex" }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--app-n-500)" }}>
          {title}
        </Typography>
        {subtitle && <Typography noWrap sx={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--app-n-900)" }}>{subtitle}</Typography>}
      </Box>
      {action}
    </Box>
  );
}

type Field = RuntimeViewerPreview["sections"][number]["fields"][number];
const EDITABLE = new Set(["text", "multiline", "integer", "number", "boolean", "select", "numeric-range"]);

function actionValues(values: Readonly<Record<string, unknown>>): ProtocolViewerActionValues {
  const result: ProtocolViewerActionValues = {};
  for (const [name, value] of Object.entries(values)) {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      result[name] = value as string | number | boolean | null;
    }
  }
  return result;
}

type FormProps = {
  preview: RuntimeViewerPreview;
  runningAction: string | null;
  onAction?: (name: string, values: ProtocolViewerActionValues) => void;
  onWizardRun?: (request: WizardRunRequest) => Promise<unknown>;
  service: ProjectService;
  projectId: string;
  protocolId: string;
  protocolLabel: string;
};

/** Values live in this browser until an action sends them; nothing is saved. */
function RuntimeLocalViewerForm({
  preview, runningAction, onAction, onWizardRun, service, projectId, protocolId, protocolLabel,
}: FormProps) {
  const entries = preview.conditionalFields ?? [];
  const [values, setValues] = useState<Readonly<Record<string, unknown>>>(() =>
    initialViewerLocalValues(preview.sections, entries));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const byName = new Map(entries.map(entry => [entry.field.name, entry]));
  const actions = new Set(preview.actions);

  const update = (field: Field, raw: string | boolean) => {
    const normalized = field.control === "numeric-range"
      ? (typeof raw === "string" && raw.length <= 2048 ? raw : undefined)
      : localViewerFieldValue(field, raw);
    setValues(previous => {
      const next = { ...previous };
      // An invalid numeric input is unknown to conditions, never a guessed 0.
      if (normalized === undefined) delete next[field.name];
      else next[field.name] = normalized;
      return next;
    });
    if (typeof raw === "string") setDrafts(previous => ({ ...previous, [field.name]: raw }));
  };

  // Wizards (the desktop's magic wand) set values of this form, as there.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const fieldsByName = new Map<string, Field>([
    ...preview.sections.flatMap(section => [...section.fields, ...section.groups.flatMap(group => group.fields)]),
    ...entries.map(entry => entry.field),
  ].map(field => [field.name, field]));
  const [wizardError, setWizardError] = useState<string | null>(null);
  const wizard = useWizardRuntime({
    projectId, protocolId, protocolClassName: null, svc: {},
    getSerializedParams: () => actionValues(valuesRef.current),
    applyWizardParamUpdates: (updates) => {
      for (const [name, value] of Object.entries(updates)) {
        const field = fieldsByName.get(name);
        if (!field || value === null || value === undefined) continue;
        update(field, field.control === "boolean" ? Boolean(value) : String(value));
      }
    },
    openExecErrorDialog: (_title, message) => setWizardError(message),
    runner: onWizardRun,
  });

  const wand = (field: Field) => preview.wizards?.[field.name] && onWizardRun ? (
    <Tooltip title={`Wizard: ${field.label}`}>
      <span>
        <IconButton size="small" aria-label={`Wizard for ${field.label}`}
          disabled={wizard.run !== null}
          onClick={() => { setWizardError(null); void wizard.openWizard(field.name, field.label, preview.wizards[field.name]); }}
          sx={{
            width: 34, height: 34, flex: "0 0 auto", border: "1px solid rgba(148, 163, 184, 0.6)",
            color: "#333d49", bgcolor: "var(--app-n-0)",
            "&:hover": { bgcolor: "#333d49", color: "#ffffff", borderColor: "#333d49" },
          }}>
          <Wand2 size={16} />
        </IconButton>
      </span>
    </Tooltip>
  ) : null;

  const eye = (field: Field) => actions.has(field.name) && onAction ? (
    <Tooltip title={`Show: ${field.label}`}>
      <span>
        <IconButton size="small" aria-label={`Show ${field.label}`}
          disabled={runningAction !== null}
          onClick={() => onAction(field.name, actionValues(values))}
          sx={{
            width: 34, height: 34, flex: "0 0 auto", border: "1px solid",
            borderColor: runningAction === field.name ? "#333d49" : "rgba(148, 163, 184, 0.6)",
            color: "#333d49", bgcolor: runningAction === field.name ? "var(--app-n-150)" : "var(--app-n-0)",
            "&:hover": { bgcolor: "#333d49", color: "#ffffff", borderColor: "#333d49" },
          }}>
          {runningAction === field.name ? <CircularProgress size={16} /> : <Eye size={17} />}
        </IconButton>
      </span>
    </Tooltip>
  ) : null;

  const renderField = (field: Field) => {
    const entry = byName.get(field.name);
    const evaluated = entry ? evaluateViewerCondition(entry.rule, values) : true;
    if (evaluated === false || (entry?.initiallyDeferred && evaluated !== true)) return null;
    const rawValue = drafts[field.name] ??
      (values[field.name] === undefined || values[field.name] === null ? "" : String(values[field.name]));
    let control;
    if (!EDITABLE.has(field.control)) {
      control = <Typography sx={{ flex: 1, fontSize: "0.88rem", fontWeight: 500, color: "var(--app-n-800)" }}>{field.label}</Typography>;
    } else if (field.control === "boolean") {
      control = (
        <FormControlLabel sx={{ flex: 1 }} control={<Checkbox checked={values[field.name] === true}
          onChange={(event: { target: { checked: boolean } }) => update(field, event.target.checked)} />}
          label={field.label} />
      );
    } else {
      control = (
        <TextField size="small" fullWidth label={field.label} sx={{ flex: 1 }}
          value={rawValue} select={field.control === "select"}
          multiline={field.control === "multiline"}
          type={field.control === "integer" || field.control === "number" ? "number" : undefined}
          onChange={(event: { target: { value: string } }) => update(field, event.target.value)}
          inputProps={{ "data-testid": `viewer-local-${field.name}` }}>
          {field.control === "select" && field.choices?.map((choice, index) => (
            <MenuItem key={index} value={String(index)}>{choice}</MenuItem>
          ))}
        </TextField>
      );
    }
    return (
      <Box key={field.name} sx={{ mt: 1.5, display: "flex", alignItems: "center", gap: 0.75 }}>
        {control}
        {field.help && (
          <Tooltip title={<Box sx={{ whiteSpace: "pre-line" }}>{field.help}</Box>} placement="right">
            <Box component="span" aria-label={`Help for ${field.label}`} tabIndex={0}
              sx={{ display: "flex", color: "var(--app-n-400)", cursor: "help", "&:hover": { color: "var(--app-n-600)" } }}>
              <Info size={15} />
            </Box>
          </Tooltip>
        )}
        {wand(field)}
        {eye(field)}
      </Box>
    );
  };

  const listed = new Set(preview.sections.flatMap(section => [
    ...section.fields.map(field => field.name),
    ...section.groups.flatMap(group => group.fields.map(field => field.name)),
  ]));
  const deferred = entries.filter(entry => entry.initiallyDeferred && !listed.has(entry.field.name));
  const sectionNames = [...new Set([...preview.sections.map(section => section.label),
    ...deferred.map(entry => entry.section)])];

  return (
    <Box data-testid="protocol-viewer-local-form">
      {wizardError && (
        <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setWizardError(null)}>
          <Box sx={{ whiteSpace: "pre-line" }}>{wizardError}</Box>
        </Alert>
      )}
      <WizardLoadingDialog open={Boolean(wizard.run && !wizard.run.dialog)}
        title={wizard.run?.paramLabel ?? "Wizard"} message="Running the wizard..." />
      {wizard.run?.dialog && (
        <WizardRuntimeDialog key={`${wizard.run.paramName}:${wizard.run.step}`} dialog={wizard.run.dialog}
          paramLabel={wizard.run.paramLabel} messages={wizard.run.messages} busy={wizard.run.busy}
          previewImages={wizard.run.previewImages} previewBusy={wizard.run.previewBusy}
          onAnswer={wizard.answer} onCancel={wizard.cancel} onPreview={wizard.requestPreview} />
      )}
      {wizard.views && (
        <ProtocolViewerActionResults service={service} projectId={projectId} protocolId={protocolId}
          protocolLabel={protocolLabel} title={wizard.views.title}
          result={{ action: "wizard", items: wizard.views.items, messages: wizard.views.messages, omittedItems: 0 }}
          onClose={wizard.closeViews} />
      )}
      {sectionNames.map((name, index) => {
        const section = preview.sections.find(item => item.label === name);
        const direct = deferred.filter(item => item.section === name && item.group === null);
        const groups = [...new Set([...(section?.groups.map(group => group.label) ?? []),
          ...deferred.filter(item => item.section === name && item.group !== null)
            .map(item => item.group as string)])];
        return (
          <Box key={`${index}-${name}`} sx={{ mt: index === 0 ? 0.5 : 2 }}>
            <Typography sx={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--app-n-700)", pb: 0.5,
              borderBottom: "1px solid rgba(148, 163, 184, 0.35)" }}>{name}</Typography>
            {section?.fields.map(field => renderField(field))}
            {direct.map(entry => renderField(entry.field))}
            {groups.map((groupName, groupIndex) => {
              const group = section?.groups.find(item => item.label === groupName);
              const additional = deferred.filter(item => item.section === name && item.group === groupName);
              return (
                <Box key={`${groupIndex}-${groupName}`} sx={{ pl: 1.5, mt: 1.5, borderLeft: "2px solid rgba(148, 163, 184, 0.45)" }}>
                  <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--app-n-600)" }}>{groupName}</Typography>
                  {group?.fields.map(field => renderField(field))}
                  {additional.map(entry => renderField(entry.field))}
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}
