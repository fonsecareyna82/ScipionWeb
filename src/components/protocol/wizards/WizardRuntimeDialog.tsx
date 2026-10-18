// The dialog a protocol form wizard opened, shown on the web. The wizard runs
// its own code on the server; each dialog kind here stands for a desktop one
// (YesNo, list, preview with sliders, file browser, form, 3D point).
import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, LinearProgress, List, ListItemButton, ListItemText, MenuItem, Radio, Slider, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { Wand2, X } from "lucide-react";

import type { ViewerActionMessage } from "@/utils/protocol_viewer_action_result";
import {
  formatWizardControlValue,
  type WizardDialog,
  type WizardImage,
  type WizardRing,
} from "@/utils/protocol_wizard_runtime";
import PointInVolumeWizardDialog from "./PointInVolumeWizardDialog";

export type WizardAnswer = Record<string, unknown>;

type Props = {
  dialog: WizardDialog;
  /** Name of the param whose wizard opened the dialog. */
  paramLabel: string;
  messages: ViewerActionMessage[];
  busy: boolean;
  previewImages: WizardImage[] | null;
  previewBusy: boolean;
  onAnswer: (answer: WizardAnswer) => void;
  onCancel: () => void;
  onPreview: (item: number, values: Record<string, number>) => void;
};

const headerSx = {
  display: "flex", alignItems: "center", gap: 1.25, px: 2.5, py: 1.75,
  background: "linear-gradient(135deg, #333d49 0%, #3d4957 55%, #465567 100%)", color: "#fff",
};

function Shell({ title, subtitle, children, actions, onClose, busy, maxWidth = "sm" }: {
  title: string; subtitle: string; children: React.ReactNode; actions: React.ReactNode;
  onClose: () => void; busy: boolean; maxWidth?: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <Dialog open onClose={onClose} maxWidth={maxWidth} fullWidth aria-labelledby="wizard-runtime-title"
      className="sfw-launcher-dialog" PaperProps={{ sx: { borderRadius: "18px", overflow: "hidden" } }}>
      {/* Its own id: MUI would give it the dialog's aria-labelledby, naming the dialog after the whole header. */}
      <DialogTitle component="div" id="wizard-runtime-header" sx={headerSx}>
        <Wand2 size={20} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="wizard-runtime-title" variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {title}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.8 }}>{subtitle}</Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: "#fff" }}>
          <X size={18} />
        </IconButton>
      </DialogTitle>
      {busy && <LinearProgress />}
      <DialogContent dividers sx={{ bgcolor: "#f7f9fb" }}>{children}</DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.5 }}>{actions}</DialogActions>
    </Dialog>
  );
}

function Messages({ messages }: { messages: ViewerActionMessage[] }) {
  if (!messages.length) return null;
  return (
    <Box sx={{ display: "grid", gap: 1, mb: 1.5 }}>
      {messages.map((message, index) => (
        <Alert key={index} severity={message.level}>{message.title ? <b>{message.title}: </b> : null}{message.text}</Alert>
      ))}
    </Box>
  );
}

function Message({ text }: { text: string }) {
  return text ? <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 1.5 }}>{text}</Typography> : null;
}

// --- Preview: items, images with their mask/frequency rings, controls --------

function RingsOverlay({ rings, values }: { rings: WizardRing[]; values: Record<string, number> }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      {rings.map((ring, index) => {
        const outer = Math.max(0, (values[ring.outer] ?? 0) * ring.scale * 100);
        const inner = ring.inner ? Math.max(0, (values[ring.inner] ?? 0) * ring.scale * 100) : 0;
        return (
          <g key={index} fill="none" stroke="#3bd16f" strokeWidth={0.8}>
            <circle cx={50} cy={50} r={outer} fill="rgba(59, 209, 111, 0.15)" />
            {inner > 0 && <circle cx={50} cy={50} r={inner} />}
          </g>
        );
      })}
    </svg>
  );
}

function PreviewBody({ dialog, images, previewBusy, values, item, onItem, onValue, onCommit }: {
  dialog: Extract<WizardDialog, { type: "preview" }>; images: WizardImage[]; previewBusy: boolean;
  values: Record<string, number>; item: number; onItem: (item: number) => void;
  onValue: (name: string, value: number) => void; onCommit: (name: string) => void;
}) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px 1fr" }, gap: 2 }}>
      <Box sx={{ border: "1px solid #dde3ea", borderRadius: 2, bgcolor: "#fff", maxHeight: 420, overflow: "auto" }}>
        <List dense disablePadding aria-label="Items">
          {dialog.items.map(entry => (
            <ListItemButton key={entry.index} selected={entry.index === item} onClick={() => onItem(entry.index)}>
              <ListItemText primary={entry.text} primaryTypographyProps={{ noWrap: true, fontSize: 13 }} />
            </ListItemButton>
          ))}
        </List>
      </Box>
      <Box>
        {dialog.previewError && <Alert severity="warning" sx={{ mb: 1 }}>{dialog.previewError}</Alert>}
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center", position: "relative" }}>
          {images.map((image, index) => (
            <Box key={index} sx={{ textAlign: "center" }}>
              <Box sx={{ position: "relative", width: 256, height: 256 * image.height / Math.max(1, image.width),
                bgcolor: "#111", borderRadius: 1, overflow: "hidden" }}>
                <img src={image.src} alt={dialog.imageLabels[index] ?? "Preview"}
                  style={{ width: "100%", height: "100%", display: "block" }} />
                <RingsOverlay rings={dialog.rings.filter(ring => ring.image === index)} values={values} />
              </Box>
              <Typography variant="caption" color="text.secondary">{dialog.imageLabels[index] ?? ""}</Typography>
            </Box>
          ))}
          {previewBusy && (
            <Box sx={{ position: "absolute", top: 8, right: 8 }}><CircularProgress size={20} /></Box>
          )}
        </Box>
        <Box sx={{ display: "grid", gap: 1.5, mt: 2 }}>
          {dialog.controls.map(control => (
            <Box key={control.name} sx={{ display: "grid", gridTemplateColumns: "120px 1fr 150px",
              alignItems: "center", gap: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{control.label}</Typography>
              {control.kind === "slider" ? (
                <Slider size="small" min={control.min} max={control.max} step={control.step}
                  value={values[control.name] ?? control.value}
                  onChange={(_, value) => onValue(control.name, Array.isArray(value) ? value[0] : value)}
                  onChangeCommitted={() => onCommit(control.name)}
                  aria-label={control.label} />
              ) : (
                <TextField size="small" type="number" value={values[control.name] ?? control.value}
                  inputProps={{ "aria-label": control.label, step: "any" }}
                  onChange={event => onValue(control.name, Number(event.target.value))}
                  onBlur={() => onCommit(control.name)}
                  onKeyDown={event => { if (event.key === "Enter") onCommit(control.name); }} />
              )}
              <Typography variant="caption" color="text.secondary">
                {formatWizardControlValue(control, values[control.name] ?? control.value, dialog.samplingRate)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// --- The dialog --------------------------------------------------------------

export default function WizardRuntimeDialog({
  dialog, paramLabel, messages, busy, previewImages, previewBusy, onAnswer, onCancel, onPreview,
}: Props) {
  const initialValues = useMemo(() => {
    if (dialog.type === "preview") {
      return Object.fromEntries(dialog.controls.map(control => [control.name, control.value]));
    }
    return {};
  }, [dialog]);
  const [values, setValues] = useState<Record<string, number>>(initialValues);
  const [item, setItem] = useState(dialog.type === "preview" ? dialog.items[0]?.index ?? 0 : 0);
  const [selected, setSelected] = useState<number[]>([]);
  const [fields, setFields] = useState<Record<string, string>>(() =>
    dialog.type === "form" ? Object.fromEntries(dialog.fields.map(entry => [entry.name, entry.value])) : {});
  const [path, setPath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pointValue, setPointValue] = useState(dialog.type === "point_in_volume" ? dialog.point : null);

  useEffect(() => { setValues(initialValues); }, [initialValues]);

  const subtitle = `Wizard of ${paramLabel}`;
  const cancel = () => onCancel();

  if (dialog.type === "point_in_volume") {
    return (
      <PointInVolumeWizardDialog open title={dialog.title} message="" dims={dialog.dims}
        previewDims={dialog.previewDims} previewValues={dialog.previewValues}
        point={pointValue ?? dialog.point} pointVoxel={dialog.pointVoxel}
        onClose={cancel} onPointChange={setPointValue}
        onConfirm={() => onAnswer({ accept: true, point: pointValue ?? dialog.point })} />
    );
  }

  const selectButton = (label: string, answer: WizardAnswer, disabled = false) => (
    <Button variant="contained" disabled={busy || disabled} onClick={() => onAnswer(answer)}
      sx={{ textTransform: "none", bgcolor: "#333d49", "&:hover": { bgcolor: "#25303b" } }}>{label}</Button>
  );
  const cancelButton = (
    <Button onClick={cancel} disabled={busy} sx={{ textTransform: "none" }}>Cancel</Button>
  );

  if (dialog.type === "confirm") {
    return (
      <Shell title={dialog.title} subtitle={subtitle} onClose={cancel} busy={busy} maxWidth="xs" actions={<>
        {dialog.cancel && cancelButton}
        <Button onClick={() => onAnswer({ accept: true, value: false })} disabled={busy}
          sx={{ textTransform: "none" }}>No</Button>
        {selectButton("Yes", { accept: true, value: true })}
      </>}>
        <Messages messages={messages} />
        <Message text={dialog.message} />
      </Shell>
    );
  }

  if (dialog.type === "choice") {
    return (
      <Shell title={dialog.title} subtitle={subtitle} onClose={cancel} busy={busy} maxWidth="xs" actions={
        dialog.buttons.map(button => (
          <Button key={button.value} variant="outlined" disabled={busy} sx={{ textTransform: "none" }}
            onClick={() => onAnswer({ accept: true, value: button.value })}>{button.label}</Button>
        ))}>
        <Messages messages={messages} />
        <Message text={dialog.message} />
      </Shell>
    );
  }

  if (dialog.type === "form") {
    return (
      <Shell title={dialog.title} subtitle={subtitle} onClose={cancel} busy={busy} actions={<>
        {cancelButton}{selectButton("Apply", { accept: true, values: fields })}
      </>}>
        <Messages messages={messages} />
        <Message text={dialog.message} />
        <Box sx={{ display: "grid", gap: 2 }}>
          {dialog.fields.map(entry => (
            <Box key={entry.name}>
              <TextField fullWidth size="small" label={entry.label} value={fields[entry.name] ?? ""}
                select={entry.kind === "select" && entry.options.length > 0}
                type={entry.kind === "number" ? "number" : "text"}
                onChange={event => setFields(current => ({ ...current, [entry.name]: event.target.value }))}>
                {entry.kind === "select" && entry.options.map(option => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
              {entry.suggestions.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                  {entry.suggestions.map(suggestion => (
                    <Button key={suggestion} size="small" variant="outlined"
                      sx={{ textTransform: "none", py: 0, minWidth: 0 }}
                      onClick={() => setFields(current => ({
                        ...current, [entry.name]: `${current[entry.name] ?? ""}${suggestion}` }))}>
                      {suggestion}
                    </Button>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </Shell>
    );
  }

  if (dialog.type === "list") {
    const toggle = (index: number) => setSelected(current =>
      dialog.multiple
        ? (current.includes(index) ? current.filter(value => value !== index) : [...current, index])
        : [index]);
    return (
      <Shell title={dialog.title} subtitle={subtitle} onClose={cancel} busy={busy} actions={<>
        {cancelButton}
        {selectButton("Select", { accept: true, selected }, !dialog.allowEmpty && selected.length === 0)}
      </>}>
        <Messages messages={messages} />
        <Message text={dialog.message} />
        <TableContainer sx={{ maxHeight: 420, bgcolor: "#fff", border: "1px solid #dde3ea", borderRadius: 2 }}>
          <Table size="small" stickyHeader aria-label={dialog.title}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                {(dialog.columns.length ? dialog.columns : ["Name"]).map(column => (
                  <TableCell key={column} sx={{ fontWeight: 700 }}>{column}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {dialog.rows.map(row => (
                <TableRow key={row.index} hover selected={selected.includes(row.index)}
                  onClick={() => toggle(row.index)} sx={{ cursor: "pointer" }}>
                  <TableCell padding="checkbox">
                    {dialog.multiple
                      ? <Checkbox size="small" checked={selected.includes(row.index)} inputProps={{ "aria-label": row.text }} />
                      : <Radio size="small" checked={selected.includes(row.index)} inputProps={{ "aria-label": row.text }} />}
                  </TableCell>
                  <TableCell>{row.text}</TableCell>
                  {row.values.map((value, index) => <TableCell key={index}>{value}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {dialog.truncated && <Typography variant="caption" color="text.secondary">Only the first rows are shown.</Typography>}
      </Shell>
    );
  }

  if (dialog.type === "file") {
    const shown = dialog.entries.filter(entry => entry.toLowerCase().includes(filter.toLowerCase()));
    return (
      <Shell title={dialog.title} subtitle={subtitle} onClose={cancel} busy={busy} actions={<>
        {cancelButton}{selectButton("Select", { accept: true, path }, path === null)}
      </>}>
        <Messages messages={messages} />
        <TextField fullWidth size="small" placeholder="Filter" value={filter} sx={{ mb: 1 }}
          onChange={event => setFilter(event.target.value)} inputProps={{ "aria-label": "Filter files" }} />
        <Box sx={{ maxHeight: 360, overflow: "auto", bgcolor: "#fff", border: "1px solid #dde3ea", borderRadius: 2 }}>
          <List dense disablePadding aria-label={`Files in ${dialog.root}`}>
            {shown.map(entry => (
              <ListItemButton key={entry} selected={entry === path} onClick={() => setPath(entry)}
                onDoubleClick={() => onAnswer({ accept: true, path: entry })}>
                <ListItemText primary={entry} primaryTypographyProps={{ fontSize: 13 }} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Shell>
    );
  }

  // Preview dialogs (mask radius, CTF, filters, downsampling...).
  const images = previewImages ?? dialog.images;
  const setValue = (name: string, value: number) =>
    setValues(current => ({ ...current, [name]: Number.isFinite(value) ? value : current[name] }));
  const commit = (name: string) => {
    if (dialog.controls.find(control => control.name === name)?.refresh) onPreview(item, values);
  };
  const chooseItem = (index: number) => {
    setItem(index);
    onPreview(index, values);
  };
  return (
    <Shell title={dialog.title} subtitle={subtitle} onClose={cancel} busy={busy} maxWidth="lg" actions={<>
      {cancelButton}{selectButton("Select", { accept: true, item, values })}
    </>}>
      <Messages messages={messages} />
      <PreviewBody dialog={dialog} images={images} previewBusy={previewBusy} values={values} item={item}
        onItem={chooseItem} onValue={setValue} onCommit={commit} />
    </Shell>
  );
}
