// Replies of a protocol form wizard run with the plugin's own code
// (POST /projects/{id}/wizards/run): what it set, or the dialog it opened.
import {
  describeViewerActionItems,
  type ViewerActionItem,
  type ViewerActionMessage,
} from "@/utils/protocol_viewer_action_result";

export type WizardImage = { src: string; width: number; height: number };

export type WizardControl = {
  name: string;
  label: string;
  /** Sliders have a range; numbers are typed and previewed on demand. */
  kind: "slider" | "number";
  min: number;
  max: number;
  step: number;
  value: number;
  /** The preview images change with this value (else only the overlay does). */
  refresh: boolean;
  display: "pixels" | "frequency" | "angstrom" | "plain";
};

export type WizardRing = { image: number; outer: string; inner: string | null; scale: number };

export type WizardFormField = {
  name: string;
  label: string;
  kind: "number" | "text" | "select";
  value: string;
  options: string[];
  suggestions: string[];
};

export type WizardDialog =
  | { type: "confirm"; title: string; message: string; cancel: boolean }
  | { type: "choice"; title: string; message: string; buttons: { label: string; value: number }[] }
  | { type: "form"; title: string; message: string; fields: WizardFormField[] }
  | { type: "list"; title: string; message: string; columns: string[];
      rows: { index: number; text: string; values: string[] }[]; multiple: boolean;
      allowEmpty: boolean; truncated: boolean }
  | { type: "preview"; title: string; previewKind: string; columns: string[];
      items: { index: number; text: string }[]; imageLabels: string[]; images: WizardImage[];
      controls: WizardControl[]; rings: WizardRing[]; samplingRate: number; previewError: string }
  | { type: "file"; title: string; root: string; entries: string[]; truncated: boolean }
  | { type: "point_in_volume"; title: string; dims: [number, number, number];
      previewDims: [number, number, number]; previewValues: number[];
      point: { x: number; y: number; z: number }; pointVoxel: { x: number; y: number; z: number } };

export type WizardReply =
  | { status: "done"; paramUpdates: Record<string, unknown>; messages: ViewerActionMessage[];
      items: ViewerActionItem[] }
  | { status: "dialog"; step: number; dialog: WizardDialog; messages: ViewerActionMessage[] }
  | { status: "preview"; step: number; images: WizardImage[] }
  | { status: "cancelled"; messages: ViewerActionMessage[] }
  | { status: "failed" | "invalid" | "unsupported"; errors: string[]; messages: ViewerActionMessage[] };

const MAX_TEXT = 2048;
const IMAGE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, limit = MAX_TEXT): string {
  return value === null || value === undefined ? "" : String(value).slice(0, limit);
}

function number(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function strings(value: unknown, limit: number, size = 256): string[] {
  return Array.isArray(value) ? value.slice(0, limit).map(entry => text(entry, size)) : [];
}

function triple(value: unknown): [number, number, number] {
  const values = Array.isArray(value) ? value : [];
  return [number(values[0], 1), number(values[1], 1), number(values[2], 1)];
}

function point(value: unknown) {
  const data = record(value) ?? {};
  return { x: number(data.x, 0), y: number(data.y, 0), z: number(data.z, 0) };
}

function images(value: unknown): WizardImage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap(raw => {
    const data = record(raw);
    const src = typeof data?.src === "string" ? data.src : "";
    return IMAGE.test(src) ? [{ src, width: number(data?.width, 256), height: number(data?.height, 256) }] : [];
  });
}

function control(raw: unknown): WizardControl | null {
  const data = record(raw);
  if (!data || typeof data.name !== "string") return null;
  const min = number(data.min, 0);
  const max = number(data.max, min);
  const kind = data.kind === "number" || max <= min ? "number" : "slider";
  const display = ["pixels", "frequency", "angstrom"].includes(String(data.display))
    ? data.display as WizardControl["display"] : "plain";
  return { name: data.name, label: text(data.label, 160) || data.name, kind, min, max,
    step: number(data.step, kind === "slider" ? (max - min) / 100 : 1) || 1,
    value: number(data.value, min), refresh: Boolean(data.refresh), display };
}

function field(raw: unknown): WizardFormField | null {
  const data = record(raw);
  if (!data || typeof data.name !== "string") return null;
  const kind = data.kind === "number" || data.kind === "select" ? data.kind : "text";
  return { name: data.name, label: text(data.label, 160) || data.name, kind,
    value: text(data.value), options: strings(data.options, 500, 128),
    suggestions: strings(data.suggestions, 200, 128) };
}

function rows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2000).flatMap(raw => {
    const data = record(raw);
    return data && Number.isSafeInteger(data.index)
      ? [{ index: data.index as number, text: text(data.text, 256), values: strings(data.values, 32) }] : [];
  });
}

export function describeWizardDialog(raw: unknown): WizardDialog | null {
  const data = record(raw);
  if (!data) return null;
  const title = text(data.title, 160) || "Wizard";
  const message = text(data.message);
  switch (data.type) {
    case "confirm":
      return { type: "confirm", title, message, cancel: Boolean(data.cancel) };
    case "choice":
      return { type: "choice", title, message, buttons: (Array.isArray(data.buttons) ? data.buttons : [])
        .slice(0, 8).flatMap(button => {
          const value = record(button);
          return value && Number.isSafeInteger(value.value)
            ? [{ label: text(value.label, 64), value: value.value as number }] : [];
        }) };
    case "form":
      return { type: "form", title, message, fields: (Array.isArray(data.fields) ? data.fields : [])
        .slice(0, 20).map(field).filter((v): v is WizardFormField => v !== null) };
    case "list":
      return { type: "list", title, message, columns: strings(data.columns, 32, 160), rows: rows(data.rows),
        multiple: Boolean(data.multiple), allowEmpty: Boolean(data.allowEmpty), truncated: Boolean(data.truncated) };
    case "preview":
      return { type: "preview", title, previewKind: text(data.previewKind, 32), columns: strings(data.columns, 8, 160),
        items: rows(data.items).map(({ index, text: label }) => ({ index, text: label })),
        imageLabels: strings(data.imageLabels, 4, 64), images: images(data.images),
        controls: (Array.isArray(data.controls) ? data.controls : []).slice(0, 8).map(control)
          .filter((v): v is WizardControl => v !== null),
        rings: (Array.isArray(data.rings) ? data.rings : []).slice(0, 4).flatMap(raw => {
          const ring = record(raw);
          return ring && typeof ring.outer === "string"
            ? [{ image: number(ring.image, 0), outer: ring.outer,
                inner: typeof ring.inner === "string" ? ring.inner : null, scale: number(ring.scale, 1) }] : [];
        }),
        samplingRate: number(data.samplingRate, 1), previewError: text(data.previewError, 300) };
    case "file":
      return { type: "file", title, root: text(data.root, 255), entries: strings(data.entries, 1000, 1024),
        truncated: Boolean(data.truncated) };
    case "point_in_volume": {
      const values = Array.isArray(data.previewValues) ? data.previewValues : [];
      return { type: "point_in_volume", title, dims: triple(data.dims), previewDims: triple(data.previewDims),
        previewValues: values.slice(0, 64 * 64 * 64).map(value => number(value, 0)),
        point: point(data.point), pointVoxel: point(data.pointVoxel) };
    }
    default:
      return null;
  }
}

const UNSUPPORTED_REASONS: Record<string, string> = {
  dialog: "This wizard opens a window that the web cannot show yet",
  empty_input: "Select the input first",
};

export function describeWizardReply(raw: unknown): WizardReply | null {
  const data = record(raw);
  if (!data) return null;
  const { items, messages } = describeViewerActionItems(data.items, data.messages);
  switch (data.status) {
    case "done": {
      const updates = record(data.paramUpdates) ?? {};
      return { status: "done", paramUpdates: { ...updates }, messages, items };
    }
    case "dialog": {
      const dialog = describeWizardDialog(data.dialog);
      return dialog && Number.isSafeInteger(data.step)
        ? { status: "dialog", step: data.step as number, dialog, messages } : null;
    }
    case "preview":
      return Number.isSafeInteger(data.step)
        ? { status: "preview", step: data.step as number, images: images(data.images) } : null;
    case "cancelled":
      return { status: "cancelled", messages };
    case "failed":
      return { status: "failed", errors: [text(data.error) || "The wizard failed"], messages };
    case "invalid":
      return { status: "invalid", errors: strings(data.errors, 20, 500), messages };
    case "unsupported": {
      const reason = UNSUPPORTED_REASONS[text(data.reason, 64)] ?? "This wizard is not available on the web";
      const detail = text(data.detail, 128);
      return { status: "unsupported", errors: [detail ? `${reason} (${detail}).` : `${reason}.`], messages };
    }
    default:
      return null;
  }
}

/** The value of a preview control as the desktop dialogs show it. */
export function formatWizardControlValue(control: WizardControl, value: number, samplingRate: number): string {
  if (control.display === "pixels") {
    return samplingRate && samplingRate !== 1
      ? `${Math.round(value)} px | ${(value * samplingRate).toFixed(1)} Å` : `${value.toFixed(1)} px`;
  }
  if (control.display === "frequency") {
    return samplingRate && samplingRate !== 1 && value > 0
      ? `${value.toFixed(2)} | ${(samplingRate / value).toFixed(1)} Å` : value.toFixed(2);
  }
  if (control.display === "angstrom") return `${value.toFixed(1)} Å`;
  return String(Number(value.toFixed(4)));
}
