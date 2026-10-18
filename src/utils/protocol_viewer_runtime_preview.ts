/** Inert, bounded presentation of an opt-in trusted-plugin runtime form result.
 * This is not an action registry and it cannot confer execution privileges.
 */
import type { ViewerPreviewSection } from "@/utils/protocol_viewer_preview";
import type { ProtocolViewerCandidate, ProtocolViewerCandidatesResponse } from "@/services/ProjectService";
import { describeProtocolViewerPreview } from "@/utils/protocol_viewer_preview";
import { parseViewerReactiveEntries, type ViewerReactiveEntry } from "@/utils/protocol_viewer_reactive_form";

export type RuntimeFieldVisibility = "visible" | "pending" | "legacy";
export type RuntimeViewerField = ViewerPreviewSection["fields"][number] & {
  visibility: RuntimeFieldVisibility;
  conditionState: "none" | "met" | "unresolved" | "legacy";
  hiddenAttributeAvailable: boolean | null;
  readOnly: true;
};
export type RuntimeViewerSection = Omit<ViewerPreviewSection, "fields" | "groups"> & {
  fields: RuntimeViewerField[];
  groups: Array<{label: string; fields: RuntimeViewerField[]}>;
};
export type RuntimeViewerPreview = {
  sections: RuntimeViewerSection[];
  fieldsDiscovered: number;
  omittedFields: number;
  visibilityContract: "explicit" | "legacy" | "mixed";
  hiddenAttributeUnverifiable: boolean;
  conditionalFields?: ViewerReactiveEntry[];
  /** Fields with a visualize handler: each gets an "eye" button. */
  actions: string[];
  /** Fields with a wizard (e.g. a color scale): field name -> wizard id. */
  wizards: Record<string, string>;
};

const VIEWER_ID = /^[A-Za-z_][A-Za-z0-9_.]{0,254}$/;

export function validRuntimeViewerId(id: unknown): id is string {
  return typeof id === "string" && VIEWER_ID.test(id);
}

function record(value: unknown): Record<string, unknown> | null {
  return !!value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 10000) : 0;
}

type VisibilityMetadata = Pick<RuntimeViewerField,
  "visibility" | "conditionState" | "hiddenAttributeAvailable" | "readOnly">;

const LEGACY: VisibilityMetadata = {
  visibility: "legacy", conditionState: "legacy",
  hiddenAttributeAvailable: null, readOnly: true,
};

/** Server-side visibility is only an initial snapshot. Do not infer editability. */
function verifiedVisibility(field: Record<string, unknown>): VisibilityMetadata | null {
  if (field.hidden === true || field.visibility === "hidden" || field.visible === false ||
      field.executionAllowed === true || field.readOnly === false) return null;
  if (!Object.prototype.hasOwnProperty.call(field, "visibility")) {
    // Incomplete 142-style claims are not legacy schema; reject them instead.
    if (["visible", "pending", "conditionState", "hiddenAttributeAvailable", "readOnly", "executionAllowed"]
      .some(key => Object.prototype.hasOwnProperty.call(field, key))) return null;
    return LEGACY;
  }
  if (field.readOnly !== true || field.executionAllowed !== false ||
      typeof field.hiddenAttributeAvailable !== "boolean" ||
      (field.hidden !== null && field.hidden !== false) ||
      (field.hiddenAttributeAvailable === true && field.hidden !== false) ||
      (field.hiddenAttributeAvailable === false && field.hidden !== null)) return null;
  if (field.visibility === "visible" && field.visible === true && field.pending === false &&
      (field.conditionState === "none" || field.conditionState === "met")) {
    return {visibility: "visible", conditionState: field.conditionState,
      hiddenAttributeAvailable: field.hiddenAttributeAvailable, readOnly: true};
  }
  if (field.visibility === "pending" && field.visible === null && field.pending === true &&
      field.conditionState === "unresolved") {
    return {visibility: "pending", conditionState: "unresolved",
      hiddenAttributeAvailable: field.hiddenAttributeAvailable, readOnly: true};
  }
  return null;
}

function publicFields(value: unknown, metadata: Map<string, VisibilityMetadata>): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > 96) return [];
  const result: Array<Record<string, unknown>> = [];
  for (const item of value) {
    const field = record(item);
    if (!field) continue;
    const visibility = verifiedVisibility(field);
    if (!visibility) continue;
    // Associate only by the exact identifier subsequently whitelisted by the
    // static text serializer. Never forward arbitrary backend properties.
    if (typeof field.name === "string" && !metadata.has(field.name)) {
      metadata.set(field.name, visibility);
    }
    result.push(field);
  }
  return result;
}

/** Fail closed on mismatched identity, source or purported execution rights. */
export function describeProtocolViewerRuntimePreview(
  payload: unknown,
  identity: { projectId: string; protocolId: string; viewerId: string },
): RuntimeViewerPreview | null {
  const data = record(payload);
  if (!data || !validRuntimeViewerId(identity.viewerId) ||
      !/^\d+$/.test(identity.projectId) || !/^\d+$/.test(identity.protocolId) ||
      data.status !== "runtime-preview" || data.source !== "isolated-worker" ||
      data.projectId !== Number(identity.projectId) ||
      data.protocolId !== identity.protocolId || data.viewerId !== identity.viewerId ||
      data.webReady !== false || data.renderable !== false ||
      data.executionAllowed !== false ||
      !Array.isArray(data.sections) || data.sections.length > 16) return null;

  const metadata = new Map<string, VisibilityMetadata>();
  const sections: Array<{
    label: string;
    fields: Array<Record<string, unknown>>;
    groups: Array<{label: string; fields: Array<Record<string, unknown>>}>;
  }> = [];
  for (const item of data.sections) {
    const section = record(item);
    if (!section || typeof section.label !== "string") continue;
    const groups: Array<{label: string; fields: Array<Record<string, unknown>>}> = [];
    if (Array.isArray(section.groups) && section.groups.length <= 20) {
      for (const entry of section.groups) {
        const group = record(entry);
        if (group && typeof group.label === "string") {
          groups.push({label: group.label, fields: publicFields(group.fields, metadata)});
        }
      }
    }
    sections.push({label: section.label, fields: publicFields(section.fields, metadata), groups});
  }

  // Reuse the same strict static field whitelist, duplicate suppression and
  // human-readable escaping; do not read actionSchema or expose action buttons.
  const described = describeProtocolViewerPreview({
    id: identity.viewerId,
    name: identity.viewerId,
    formSchema: { status: "static-preview", sections },
  });
  const wrap = (field: ViewerPreviewSection["fields"][number]): RuntimeViewerField => ({
    ...field, ...(metadata.get(field.name) ?? LEGACY),
  });
  const safeSections: RuntimeViewerSection[] = described.sections.map(section => ({
    label: section.label,
    fields: section.fields.map(wrap),
    groups: section.groups.map(group => ({label: group.label, fields: group.fields.map(wrap)})),
  }));
  const allFields = safeSections.flatMap(section => [
    ...section.fields, ...section.groups.flatMap(group => group.fields),
  ]);
  const explicit = allFields.filter(field => field.visibility !== "legacy").length;
  // The conditional-field sidecar is optional.
  // An invalid sidecar is a mismatched worker schema, not an opt-in to editing.
  const hasRules = Object.prototype.hasOwnProperty.call(data, "conditionalFields");
  const conditionalFields = hasRules
    ? parseViewerReactiveEntries(data.conditionalFields, safeSections) : undefined;
  if (hasRules && !conditionalFields) return null;
  const fieldNames = new Set([
    ...allFields.map(field => field.name),
    ...(conditionalFields ?? []).map(entry => entry.field.name),
  ]);
  const actions = Array.isArray(data.actions)
    ? [...new Set(data.actions.filter((name): name is string =>
        typeof name === "string" && fieldNames.has(name)))]
    : [];
  const wizards: Record<string, string> = {};
  if (data.wizards && typeof data.wizards === "object" && !Array.isArray(data.wizards)) {
    for (const [name, wizardId] of Object.entries(data.wizards as Record<string, unknown>)) {
      if (fieldNames.has(name) && typeof wizardId === "string" && wizardId.length <= 512 &&
          /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(wizardId)) {
        wizards[name] = wizardId;
      }
    }
  }
  return {
    actions,
    wizards,
    sections: safeSections,
    fieldsDiscovered: count(data.fieldsDiscovered),
    omittedFields: count(data.omittedFields),
    visibilityContract: explicit === 0 ? "legacy" :
      explicit === allFields.length ? "explicit" : "mixed",
    hiddenAttributeUnverifiable: allFields.some(field =>
      field.visibility !== "legacy" && field.hiddenAttributeAvailable === false),
    ...(conditionalFields ? {conditionalFields} : {}),
  };
}

/**
 * Viewers the Analyze results dialog can open. With runtime viewers only the
 * protocol viewers (desktop "Analyze results" forms) count; viewers of single
 * objects belong to Analyze output.
 */
export function openableProtocolViewers(
  response: ProtocolViewerCandidatesResponse | null | undefined,
): ProtocolViewerCandidate[] {
  if (!response || !Array.isArray(response.viewers)) return [];
  const viewers = response.viewers.slice(0, 48).filter(
    (entry): entry is ProtocolViewerCandidate =>
      !!entry && typeof entry === "object" &&
      (typeof entry.id === "string" || typeof entry.name === "string"),
  );
  return response.runtimePreviewAvailable === true
    ? viewers.filter(viewer => viewer.viewerKind === "protocol-form")
    : viewers;
}
