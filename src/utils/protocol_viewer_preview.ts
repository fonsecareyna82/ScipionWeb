/**
 * Advisory, read-only presentation of ProtocolViewer's *static* AST schema.
 * Do not infer execution rights from this shape or from server webReady flags.
 */
import type { ProtocolViewerCandidate } from "@/services/ProjectService";

export type ViewerPreviewField = {
  name: string;
  label: string;
  control: string;
  help?: string;
  choices?: string[];
  defaultValue?: string;
  hasCondition: boolean;
  unresolvedDefault: boolean;
};

export type ViewerPreviewGroup = {
  label: string;
  fields: ViewerPreviewField[];
};

export type ViewerPreviewSection = {
  label: string;
  fields: ViewerPreviewField[];
  groups: ViewerPreviewGroup[];
};

export type ViewerPreviewAction = {
  id: string;
  label: string;
};

export type ViewerPreview = {
  status: string;
  sections: ViewerPreviewSection[];
  actions: ViewerPreviewAction[];
  dynamicSkipped: number;
  hiddenCount: number;
  issues: string[];
  blockers: string[];
  hasStaticForm: boolean;
  hasStaticActions: boolean;
};

const CONTROLS = new Set([
  "text", "multiline", "integer", "number", "boolean", "select",
  "numeric-range", "label",
]);
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function boundedText(value: unknown, limit = 160): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= limit
    ? value : null;
}

function boundedCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 10000) : 0;
}

function scalar(value: unknown): string | null {
  if (value === null) return "null";
  if (typeof value === "string") return value.length <= 160 ? value : null;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function fieldsFrom(value: unknown, names: Set<string>, budget: { left: number }): ViewerPreviewField[] {
  if (!Array.isArray(value) || value.length > 96) return [];
  const result: ViewerPreviewField[] = [];
  for (const raw of value) {
    if (budget.left <= 0) break;
    const field = record(raw);
    if (!field) continue;
    const name = boundedText(field.name, 128);
    const label = boundedText(field.label);
    const control = boundedText(field.control, 40);
    if (!name || !IDENTIFIER.test(name) || !label || !control || !CONTROLS.has(control) || names.has(name)) continue;
    const options = control === "select" ? field.choices : null;
    const choices = Array.isArray(options) && options.length >= 1 && options.length <= 100
      ? options.map(scalar) : null;
    if (control === "select" && (!choices || choices.some(v => v === null))) continue;
    names.add(name);
    budget.left--;
    const defaultValue = Object.prototype.hasOwnProperty.call(field, "default")
      ? scalar(field.default) : null;
    result.push({
      name, label, control,
      ...(boundedText(field.help, 2048) ? { help: field.help as string } : {}),
      ...(choices ? { choices: choices as string[] } : {}),
      ...(defaultValue !== null ? { defaultValue } : {}),
      hasCondition: field.hasCondition === true,
      unresolvedDefault: field.unresolvedDefault === true,
    });
  }
  return result;
}

function diagnostics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).filter((x): x is string =>
    typeof x === "string" && /^[a-z][a-z0-9_]{0,127}$/.test(x));
}

/** This function never returns executable handlers or editable input definitions. */
export function describeProtocolViewerPreview(candidate: ProtocolViewerCandidate): ViewerPreview {
  const validation = record(candidate.contractValidation);
  const form = record(candidate.formSchema);
  const actions = record(candidate.actionSchema);
  const hasStaticForm = form?.status === "static-preview";
  const hasStaticActions = actions?.status === "static-preview";
  const sections: ViewerPreviewSection[] = [];
  const seen = new Set<string>();
  const budget = { left: 96 };

  if (hasStaticForm && Array.isArray(form?.sections) && form.sections.length <= 48) {
    for (const sectionValue of form.sections) {
      const section = record(sectionValue);
      if (!section) continue;
      const label = boundedText(section.label);
      if (!label) continue;
      const fields = fieldsFrom(section.fields, seen, budget);
      const groups: ViewerPreviewGroup[] = [];
      if (Array.isArray(section.groups) && section.groups.length <= 48) {
        for (const groupValue of section.groups) {
          const group = record(groupValue);
          if (!group) continue;
          const groupLabel = boundedText(group.label);
          if (groupLabel) groups.push({label: groupLabel, fields: fieldsFrom(group.fields, seen, budget)});
        }
      }
      sections.push({label, fields, groups});
    }
  }

  const resultActions: ViewerPreviewAction[] = [];
  const actionSeen = new Set<string>();
  if (hasStaticActions && Array.isArray(actions?.actions) && actions.actions.length <= 96) {
    const fieldsByName = new Map<string, ViewerPreviewField>();
    for (const section of sections) {
      for (const field of section.fields) fieldsByName.set(field.name, field);
      for (const group of section.groups) for (const field of group.fields) fieldsByName.set(field.name, field);
    }
    for (const raw of actions.actions) {
      const action = record(raw);
      if (!action || action.kind !== "visualize" || action.previewOnly !== true || action.executionAllowed !== false) continue;
      const id = boundedText(action.id, 128);
      const label = boundedText(action.label);
      if (!id || !IDENTIFIER.test(id) || id !== action.fieldName || !label || actionSeen.has(id)) continue;
      const field = fieldsByName.get(id);
      if (!field || field.label !== label || field.control !== action.control) continue;
      actionSeen.add(id);
      resultActions.push({id, label});
    }
  }

  return {
    status: boundedText(validation?.status, 40) || "discovered",
    sections,
    actions: resultActions,
    dynamicSkipped: boundedCount(form?.dynamicDefinitionsSkipped),
    hiddenCount: boundedCount(form?.hiddenFields),
    issues: diagnostics(validation?.issues),
    blockers: diagnostics(validation?.blockers),
    hasStaticForm,
    hasStaticActions,
  };
}
