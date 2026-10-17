// The protocol viewer's own form, built at runtime from the plugin code.
// Each field with a visualize handler gets an "eye" that runs it on the server.
import { useEffect, useRef, useState } from "react";
import {
  Alert, Box, Checkbox, CircularProgress, FormControlLabel, IconButton, MenuItem,
  TextField, Tooltip, Typography,
} from "@mui/material";
import { Eye } from "lucide-react";
import type { ProjectService, ProtocolViewerActionValues } from "@/services/ProjectService";
import { describeProtocolViewerRuntimePreview, validRuntimeViewerId, type RuntimeViewerPreview } from "@/utils/protocol_viewer_runtime_preview";
import { evaluateViewerCondition, initialViewerLocalValues, localViewerFieldValue } from "@/utils/protocol_viewer_reactive_form";
import { describeViewerActionResult, type ViewerActionResult } from "@/utils/protocol_viewer_action_result";
import ProtocolViewerActionResults from "./ProtocolViewerActionResults";

type Props = {
  service: ProjectService;
  projectId: string;
  protocolId: string;
  viewerId: string;
  protocolLabel?: string;
};

type State =
  | { status: "loading" | "error" | "invalid"; scope: string }
  | { status: "ready"; scope: string; preview: RuntimeViewerPreview };

type ActionState =
  | { status: "idle" }
  | { status: "running"; action: string }
  | { status: "done"; result: ViewerActionResult }
  | { status: "failed"; action: string; messages: string[] };

const ACTION_ERRORS: Record<string, string> = {
  validation_failed: "The viewer reported validation errors.",
  action_failed: "The viewer failed while preparing this result.",
  invalid_values: "Some values are not valid for this viewer.",
  unknown_action: "This viewer does not provide that result.",
  worker_timeout: "The viewer took too long to answer.",
};

export default function ProtocolViewerRuntimePreviewPanel({ service, projectId, protocolId, viewerId, protocolLabel = "" }: Props) {
  const scope = `${projectId}/${protocolId}/${viewerId}`;
  const [state, setState] = useState<State>({ status: "loading", scope });
  const [action, setAction] = useState<ActionState>({ status: "idle" });
  const actionController = useRef<AbortController | null>(null);
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
      setAction(result ? { status: "done", result }
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

  return (
    <Box sx={{ mt: 1 }}>
      {shown.status === "loading" && (
        <Box role="status" sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <CircularProgress size={16} /><Typography variant="body2">Loading viewer form...</Typography>
        </Box>
      )}
      {shown.status === "error" && <Alert severity="error">The viewer form could not be loaded.</Alert>}
      {shown.status === "invalid" && <Alert severity="error">The viewer form could not be read.</Alert>}
      {shown.status === "ready" && (
        <Box data-testid="protocol-viewer-runtime-preview">
          {shown.preview.sections.length === 0 && !shown.preview.conditionalFields?.length && (
            <Typography variant="body2">This viewer has no options to show.</Typography>
          )}
          <RuntimeLocalViewerForm
            preview={shown.preview}
            runningAction={action.status === "running" ? action.action : null}
            onAction={typeof service.runProtocolViewerAction === "function" ? runAction : undefined}
          />
          {shown.preview.omittedFields > 0 && (
            <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
              {shown.preview.omittedFields} options of this viewer cannot be shown on the web.
            </Typography>
          )}
        </Box>
      )}
      {action.status === "running" && (
        <Box role="status" sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1 }}>
          <CircularProgress size={16} /><Typography variant="body2">Preparing the result...</Typography>
        </Box>
      )}
      {action.status === "failed" && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {action.messages.map((message, index) => <div key={index}>{message}</div>)}
        </Alert>
      )}
      {action.status === "done" && (
        <ProtocolViewerActionResults service={service} projectId={projectId} protocolId={protocolId}
          protocolLabel={protocolLabel} result={action.result} />
      )}
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
};

/** Values live in this browser until an action sends them; nothing is saved. */
function RuntimeLocalViewerForm({ preview, runningAction, onAction }: FormProps) {
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

  const eye = (field: Field) => actions.has(field.name) && onAction ? (
    <Tooltip title={`Show: ${field.label}`}>
      <span>
        <IconButton size="small" aria-label={`Show ${field.label}`}
          disabled={runningAction !== null}
          onClick={() => onAction(field.name, actionValues(values))}>
          {runningAction === field.name ? <CircularProgress size={16} /> : <Eye size={18} />}
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
      control = <Typography variant="body2" sx={{ flex: 1 }}>{field.label}</Typography>;
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
      <Box key={field.name} sx={{ mt: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {control}
          {eye(field)}
        </Box>
        {field.help && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{field.help}</Typography>}
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
      {sectionNames.map((name, index) => {
        const section = preview.sections.find(item => item.label === name);
        const direct = deferred.filter(item => item.section === name && item.group === null);
        const groups = [...new Set([...(section?.groups.map(group => group.label) ?? []),
          ...deferred.filter(item => item.section === name && item.group !== null)
            .map(item => item.group as string)])];
        return (
          <Box key={`${index}-${name}`} sx={{ mt: 1 }}>
            <Typography variant="subtitle2">{name}</Typography>
            {section?.fields.map(field => renderField(field))}
            {direct.map(entry => renderField(entry.field))}
            {groups.map((groupName, groupIndex) => {
              const group = section?.groups.find(item => item.label === groupName);
              const additional = deferred.filter(item => item.section === name && item.group === groupName);
              return (
                <Box key={`${groupIndex}-${groupName}`} sx={{ pl: 2, mt: 1, borderLeft: "2px solid", borderColor: "divider" }}>
                  <Typography variant="subtitle2">{groupName}</Typography>
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
