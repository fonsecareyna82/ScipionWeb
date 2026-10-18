/**
 * Typed, bounded reading of what a ProtocolViewer action produced.
 * The server translates each desktop View into one of these items; anything
 * unexpected is dropped rather than rendered.
 */

export type ViewerActionMessage = {
  kind: "message";
  level: "info" | "warning" | "error";
  title: string;
  text: string;
};

export type ViewerActionPlot = {
  kind: "plot";
  title: string;
  /** data: URL of a server-rendered PNG. */
  src: string;
};

export type ViewerActionTable = {
  kind: "table";
  title: string;
  message: string;
  header: string[];
  rows: Array<Array<string | number | boolean | null>>;
  truncated: boolean;
};

export type ViewerActionTextFile = {
  name: string;
  path: string | null;
  content: string;
  truncated: boolean;
  missing: boolean;
};

export type ViewerActionText = {
  kind: "text";
  title: string;
  files: ViewerActionTextFile[];
};

export type ViewerActionImage = {
  kind: "image";
  title: string;
  path: string;
};

export type ViewerActionOutputRef = {
  protocolId: number;
  outputName: string;
  className: string;
};

export type ViewerActionData = {
  kind: "data";
  viewClass: string;
  title: string;
  format: "metadata" | "image" | "text" | "file";
  table: string | null;
  index: number | null;
  viewParams: Record<string, string>;
  /** A stored protocol output: open it with the output viewers. */
  output: ViewerActionOutputRef | null;
  /** A project file: path for display, signed token for the metadata routes. */
  path: string | null;
  fileToken: string | null;
};

/** Volumes the viewer hands to a desktop program such as ChimeraX. */
export type ViewerActionVolumes = {
  kind: "volumes";
  viewClass: string;
  title: string;
  paths: string[];
  fileToken: string;
  /** Set when the program was opened on the server's own screen. */
  desktopProgram: string | null;
};

/** A desktop program opened on the server's screen (nothing to show here). */
export type ViewerActionDesktop = {
  kind: "desktop";
  viewClass: string;
  program: string;
};

/** A web page the viewer opens, e.g. a cryoSPARC job. */
export type ViewerActionLink = {
  kind: "link";
  url: string;
  title: string;
};

export type ViewerActionUnsupported = {
  kind: "unsupported";
  viewClass: string;
  reason: string;
  detail: string;
};

export type ViewerActionItem =
  | ViewerActionMessage
  | ViewerActionPlot
  | ViewerActionTable
  | ViewerActionText
  | ViewerActionImage
  | ViewerActionData
  | ViewerActionLink
  | ViewerActionVolumes
  | ViewerActionDesktop
  | ViewerActionUnsupported;

export type ViewerActionResult = {
  action: string;
  items: ViewerActionItem[];
  messages: ViewerActionMessage[];
  omittedItems: number;
};

const LEVELS = new Set(["info", "warning", "error"]);
const FORMATS = new Set(["metadata", "image", "text", "file"]);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown, limit = 2048): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function relativePath(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 &&
    !value.startsWith("/") && !value.split("/").some(part => part === ".." || part === "")
    ? value : null;
}

function message(value: unknown): ViewerActionMessage | null {
  const data = record(value);
  if (!data) return null;
  const level = LEVELS.has(String(data.level)) ? data.level as ViewerActionMessage["level"] : "info";
  return {kind: "message", level, title: text(data.title, 160), text: text(data.text)};
}

function cell(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return text(value);
}

function outputRef(value: unknown): ViewerActionOutputRef | null {
  const data = record(value);
  if (!data || typeof data.protocolId !== "number" || !Number.isSafeInteger(data.protocolId) ||
      data.protocolId < 1 || typeof data.outputName !== "string" ||
      !IDENTIFIER.test(data.outputName)) return null;
  return {protocolId: data.protocolId, outputName: data.outputName,
    className: text(data.className, 128)};
}

function item(value: unknown): ViewerActionItem | null {
  const data = record(value);
  if (!data) return null;
  switch (data.kind) {
    case "message":
      return message(data);
    case "plot": {
      const encoded = typeof data.data === "string" ? data.data : "";
      if (data.mediaType !== "image/png" || !encoded || !BASE64.test(encoded)) return null;
      return {kind: "plot", title: text(data.title, 160), src: `data:image/png;base64,${encoded}`};
    }
    case "table": {
      if (!Array.isArray(data.header) || !Array.isArray(data.rows)) return null;
      return {
        kind: "table", title: text(data.title, 160), message: text(data.message),
        header: data.header.slice(0, 64).map(h => text(h, 160)),
        rows: data.rows.slice(0, 5000).map(row => Array.isArray(row) ? row.slice(0, 64).map(cell) : []),
        truncated: data.truncated === true,
      };
    }
    case "text": {
      if (!Array.isArray(data.files)) return null;
      const files = data.files.slice(0, 10).flatMap(entry => {
        const file = record(entry);
        return file ? [{
          name: text(file.name, 255), path: relativePath(file.path),
          content: text(file.content, 512 * 1024),
          truncated: file.truncated === true, missing: file.missing === true,
        }] : [];
      });
      return {kind: "text", title: text(data.title, 160), files};
    }
    case "image": {
      const path = relativePath(data.path);
      return path ? {kind: "image", title: text(data.title, 160), path} : null;
    }
    case "data": {
      const output = outputRef(data.output);
      const path = relativePath(data.path);
      const fileToken = typeof data.fileToken === "string" && /^vf\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.fileToken)
        ? data.fileToken : null;
      if (!output && !(path && fileToken)) return null;
      const params = record(data.viewParams) ?? {};
      return {
        kind: "data",
        viewClass: text(data.viewClass, 128),
        title: text(data.title, 255),
        format: FORMATS.has(String(data.format)) ? data.format as ViewerActionData["format"] : "file",
        table: typeof data.table === "string" && data.table.length > 0 ? text(data.table, 128) : null,
        index: typeof data.index === "number" && Number.isSafeInteger(data.index) && data.index > 0
          ? data.index : null,
        viewParams: Object.fromEntries(Object.entries(params)
          .filter(([key, v]) => key.length <= 32 && typeof v === "string")
          .map(([key, v]) => [key, text(v, 512)])),
        output,
        path: fileToken ? path : null,
        fileToken,
      };
    }
    case "volumes": {
      const paths = Array.isArray(data.paths)
        ? data.paths.map(relativePath).filter((path): path is string => path !== null) : [];
      const fileToken = typeof data.fileToken === "string" && /^vf\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.fileToken)
        ? data.fileToken : null;
      if (!paths.length || !fileToken) return null;
      return {kind: "volumes", viewClass: text(data.viewClass, 128), title: text(data.title, 255),
        paths: paths.slice(0, 64), fileToken,
        desktopProgram: typeof data.desktopProgram === "string" && data.desktopProgram
          ? text(data.desktopProgram, 64) : null};
    }
    case "desktop":
      return {kind: "desktop", viewClass: text(data.viewClass, 128), program: text(data.program, 64) || "program"};
    case "link": {
      const url = typeof data.url === "string" && data.url.length <= 2048 &&
        /^https?:\/\/\S+$/i.test(data.url) ? data.url : null;
      return url ? {kind: "link", url, title: text(data.title, 255) || url} : null;
    }
    case "unsupported":
      return {kind: "unsupported", viewClass: text(data.viewClass, 128),
        reason: text(data.reason, 64), detail: text(data.detail, 500)};
    default:
      return null;
  }
}

/** Null when the reply does not belong to the requested viewer action. */
export function describeViewerActionResult(
  payload: unknown,
  identity: {projectId: string; protocolId: string; viewerId: string; action: string},
): ViewerActionResult | null {
  const data = record(payload);
  if (!data || data.status !== "viewer-action" ||
      data.projectId !== Number(identity.projectId) ||
      data.protocolId !== identity.protocolId ||
      data.viewerId !== identity.viewerId || data.action !== identity.action ||
      !Array.isArray(data.items)) return null;
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const omitted = data.omittedItems;
  return {
    action: identity.action,
    items: data.items.slice(0, 32).map(item).filter((v): v is ViewerActionItem => v !== null),
    messages: messages.slice(0, 32).map(message).filter((v): v is ViewerActionMessage => v !== null),
    omittedItems: typeof omitted === "number" && Number.isSafeInteger(omitted) && omitted > 0 ? omitted : 0,
  };
}

/** Items and messages described the same way by other runtimes (e.g. form wizards). */
export function describeViewerActionItems(items: unknown, messages: unknown) {
  return {
    items: (Array.isArray(items) ? items : []).slice(0, 32).map(item)
      .filter((v): v is ViewerActionItem => v !== null),
    messages: (Array.isArray(messages) ? messages : []).slice(0, 32).map(message)
      .filter((v): v is ViewerActionMessage => v !== null),
  };
}

/** Human explanation for Views that have no web counterpart yet. */
export function unsupportedViewReason(reason: string): string {
  switch (reason) {
    case "desktop_command": return "Opens an external desktop program (e.g. ChimeraX), which needs ScipionAPI to run on a computer with a screen.";
    case "desktop_picker": return "Opens the interactive desktop particle picker.";
    case "file_outside_project": return "The file is outside the project folder.";
    case "invalid_link": return "The viewer tried to open a page that is not a web address.";
    case "set_not_stored": return "The data set is not stored in the project.";
    case "plot_too_large": return "The plot is too large to display.";
    case "plot_render_failed": return "The plot could not be rendered.";
    case "translation_failed": return "The result could not be read.";
    default: return "This kind of result has no web viewer yet.";
  }
}

/** Metadata class used by the output viewers to pick their presentation. */
export function viewerDataClassName(item: ViewerActionData): string | undefined {
  if (item.output?.className) return item.output.className;
  if (item.viewClass === "Classes3DView") return "SetOfClasses3D";
  if (item.viewClass === "ClassesView") return "SetOfClasses2D";
  if (item.viewClass === "CtfView") return "SetOfCTF";
  if (item.viewClass === "MicrographsView") return "SetOfMicrographs";
  return undefined;
}
