// The text preview of the remote file browser: JSON pretty-printing and ANSI colors of logs.
import { getEntryExtension, humanBytes, normalizeMimeValue, type RemoteEntry } from "./remote-file-paths";

export type TextPreviewToken = { text: string; className: string };
export type TextPreviewLine = { tokens: TextPreviewToken[] };

export type TextPreviewModel = {
  label: string;
  lines: TextPreviewLine[];
  lineCount: number;
  isJson: boolean;
  isEmpty: boolean;
  hasAnsi: boolean;
  sizeLabel?: string;
};

type AnsiState = {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  fg?: number;
  bg?: number;
};

/** CSS class names of the ANSI styles (from the dialog's CSS module). */
export type AnsiClassNames = Record<string, string>;

const defaultAnsiState = (): AnsiState => ({ bold: false, dim: false, italic: false, underline: false });

export function hasAnsiSequences(s: string): boolean {
  return /\x1b\[[0-9;]*m/.test(s);
}

export function isProbablyJsonString(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return false;
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function ansiClassName(state: AnsiState, css: AnsiClassNames): string {
  const names: string[] = [];
  if (state.bold) names.push(css.ansiBold);
  if (state.dim) names.push(css.ansiDim);
  if (state.italic) names.push(css.ansiItalic);
  if (state.underline) names.push(css.ansiUnderline);
  if (state.fg != null) names.push(css[`ansiFg${state.fg}`]);
  if (state.bg != null) names.push(css[`ansiBg${state.bg}`]);
  return names.filter(Boolean).join(" ");
}

function applyAnsiCode(state: AnsiState, code: number): AnsiState {
  if (code === 0) return defaultAnsiState();
  const next: AnsiState = { ...state };
  if (code === 1) next.bold = true;
  else if (code === 2) next.dim = true;
  else if (code === 3) next.italic = true;
  else if (code === 4) next.underline = true;
  else if (code === 22) {
    next.bold = false;
    next.dim = false;
  } else if (code === 23) next.italic = false;
  else if (code === 24) next.underline = false;
  else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) next.fg = code;
  else if (code === 39) next.fg = undefined;
  else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) next.bg = code;
  else if (code === 49) next.bg = undefined;
  return next;
}

function tokenizeAnsiLine(line: string, initialState: AnsiState, css: AnsiClassNames) {
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  const tokens: TextPreviewToken[] = [];
  let state: AnsiState = { ...initialState };
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  const pushChunk = (chunk: string) => {
    if (chunk) tokens.push({ text: chunk, className: ansiClassName(state, css) });
  };
  while ((match = ansiRegex.exec(line)) !== null) {
    pushChunk(line.slice(lastIndex, match.index));
    const codes = (match[1] || "0").split(";").map(Number).filter(Number.isFinite);
    for (const code of codes.length ? codes : [0]) state = applyAnsiCode(state, code);
    lastIndex = ansiRegex.lastIndex;
  }
  pushChunk(line.slice(lastIndex));
  return { tokens, state };
}

export function buildTextPreviewLines(content: string, parseAnsi: boolean, css: AnsiClassNames): TextPreviewLine[] {
  const rawLines = content.length > 0 ? content.split(/\r\n|\r|\n/) : [""];
  if (!parseAnsi) return rawLines.map((line) => ({ tokens: [{ text: line || " ", className: "" }] }));
  let state = defaultAnsiState();
  return rawLines.map((line) => {
    const result = tokenizeAnsiLine(line, state, css);
    state = result.state;
    return {
      tokens: result.tokens.length ? result.tokens : [{ text: " ", className: ansiClassName(state, css) }],
    };
  });
}

const LOG_EXTENSIONS = ["log", "out", "err", "stdout", "stderr"];

export function buildTextPreviewModel(
  preview: { text: string; mime?: string; language?: string; meta?: { mime?: string; sizeBytes?: number } },
  entry: RemoteEntry | null,
  css: AnsiClassNames,
): TextPreviewModel {
  const rawText = String(preview.text ?? "");
  const declaredLanguage = String(preview.language || "").trim().toLowerCase();
  const extension = getEntryExtension(entry);
  const mime = normalizeMimeValue(String(preview.mime || preview.meta?.mime || entry?.mime || ""));
  const hasAnsi = hasAnsiSequences(rawText);
  const isLogLike = declaredLanguage === "log" || LOG_EXTENSIONS.includes(extension);
  const shouldTryJson = !hasAnsi && (declaredLanguage === "json" || extension === "json"
    || mime.includes("json") || isProbablyJsonString(rawText));

  let content = rawText;
  let isJson = false;
  if (shouldTryJson) {
    try {
      content = JSON.stringify(JSON.parse(rawText), null, 2);
      isJson = true;
    } catch {
      content = rawText;
    }
  }
  const lines = buildTextPreviewLines(content, hasAnsi, css);
  const label = isJson ? "JSON"
    : hasAnsi ? (isLogLike ? "ANSI LOG" : "ANSI")
      : isLogLike ? "LOG" : (declaredLanguage || extension || "text").toUpperCase();
  return {
    label,
    lines,
    lineCount: content.length > 0 ? lines.length : 0,
    isJson,
    isEmpty: content.length === 0,
    hasAnsi,
    sizeLabel: typeof preview.meta?.sizeBytes === "number" ? humanBytes(preview.meta.sizeBytes) : undefined,
  };
}
