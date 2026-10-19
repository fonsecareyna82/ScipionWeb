// Previews of the remote file browser: text, metadata tables (STAR/XMD/CSV), databases and metadata.
import React, { useMemo, useState } from "react";

import styles from "./RemoteFileDialog.module.css";
import { humanBytes, type RemoteEntry } from "./remote-file-paths";
import { buildTextPreviewModel, isProbablyJsonString } from "./remote-text-preview";

export type PreviewMeta = {
  name?: string;
  mime?: string;
  width?: number;
  height?: number;
  depth?: number;
  sizeBytes?: number;
  voxelSize?: [number, number, number];
  note?: string;
  [key: string]: unknown;
};

/** One block of a metadata file (a STAR/XMD data_ block, or a CSV). */
export type PreviewTableBlock = {
  name: string;
  kind?: "loop" | "pairs";
  columns: string[];
  rows: Array<Array<string | number | null>>;
  totalRows?: number | null;
  truncated?: boolean;
};

type DatabaseSummaryItem = { key: string; value: unknown };

export type RemoteDatabasePreview = {
  engine?: string;
  readable?: boolean;
  isScipion?: boolean;
  objectClass?: string | null;
  objectCount?: number | null;
  summary?: DatabaseSummaryItem[];
  tables?: Array<{ name: string; type?: string; rows?: number | null; columns?: number }>;
  sample?: { table?: string; columns: string[]; rows: Array<Array<string | number | null>>; truncated?: boolean } | null;
  warnings?: string[];
  scipion?: { objectClass?: string | null; objectCount?: number | null };
};

// -- metadata footer ---------------------------------------------------------

function extractPixelSize(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const first = value.length > 0 ? Number(value[0]) : NaN;
    return Number.isFinite(first) ? first : undefined;
  }
  if (typeof value === "string") {
    const num = Number(value.trim().split(",")[0]?.trim() ?? "");
    return value.trim() && Number.isFinite(num) ? num : undefined;
  }
  return undefined;
}

/** The metadata shown under a preview: no MIME types, a readable size, one pixel size. */
export function buildMetaPairs(meta: PreviewMeta | undefined): Array<{ key: string; rawValue: unknown }> {
  const view: Record<string, unknown> = { ...(meta && typeof meta === "object" ? meta : {}) };
  for (const key of Object.keys(view)) {
    const lowered = key.toLowerCase();
    if (lowered === "mime" || lowered.endsWith("mime") || lowered === "kind" || lowered === "truncated") {
      delete view[key];
    }
  }
  const sizeBytes = typeof view.sizeBytes === "number" ? view.sizeBytes
    : typeof view.sizeBytes === "string" ? Number(view.sizeBytes) : undefined;
  if (typeof sizeBytes === "number" && Number.isFinite(sizeBytes)) {
    const human = humanBytes(sizeBytes);
    if (human) view.size = human;
    delete view.sizeBytes;
  }
  const pixelSize = extractPixelSize(view.voxelSize);
  if (typeof pixelSize === "number") {
    view.pixelSize = Math.round(pixelSize * 1e6) / 1e6;
    delete view.voxelSize;
  }
  return Object.keys(view).sort((a, b) => a.localeCompare(b))
    .filter((key) => view[key] !== undefined)
    .map((key) => ({ key, rawValue: view[key] }));
}

function toInlineString(v: unknown): string {
  if (v === undefined) return "";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(toInlineString).join(", ");
  if (typeof v === "object") return "[object]";
  return String(v);
}

function shouldCollapse(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "object") return true;
  return typeof v === "string" && v.trim().length >= 120 && isProbablyJsonString(v);
}

function collapsedLabel(v: unknown): string {
  if (v == null) return "null";
  if (typeof v === "string") {
    const t = v.trim();
    return !t ? '""' : t.length > 80 ? `${t.slice(0, 80)}…` : t;
  }
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (typeof v === "object") return `Object(${Object.keys(v as object).length})`;
  return String(v);
}

/** Defined at module level: its open/closed state survives the dialog's renders. */
export function MetaValue({ value }: { value: unknown }) {
  if (!shouldCollapse(value)) return <span className={styles.metaValue}>{toInlineString(value)}</span>;
  let pretty: string;
  if (typeof value === "string") {
    try {
      pretty = JSON.stringify(JSON.parse(value.trim()), null, 2);
    } catch {
      pretty = value;
    }
  } else {
    try {
      pretty = JSON.stringify(value, null, 2);
    } catch {
      pretty = String(value);
    }
  }
  return (
    <details className={styles.metaDetails}>
      <summary className={styles.metaSummary}>
        <span className={styles.metaChevron}>▸</span>
        <span className={styles.metaSummaryText}>{collapsedLabel(value)}</span>
        <span className={styles.metaHint}>details</span>
      </summary>
      <pre className={styles.metaJsonBlock}>{pretty}</pre>
    </details>
  );
}

export function PreviewWithMeta({ children, meta }: { children: React.ReactNode; meta?: PreviewMeta }) {
  const pairs = buildMetaPairs(meta);
  return (
    <div className={styles.previewStack}>
      <div className={styles.previewMain}>{children}</div>
      {pairs.length > 0 && (
        <div className={styles.previewFooter}>
          <div className={styles.metaGrid}>
            {pairs.map((pair) => (
              <div key={pair.key} className={styles.metaItem}>
                <span className={styles.metaKey}>{pair.key}:</span>
                <MetaValue value={pair.rawValue} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// -- text ---------------------------------------------------------------------

export function TextPreview({ preview, entry, truncated, note }: {
  preview: { text: string; mime?: string; language?: string; meta?: PreviewMeta };
  entry: RemoteEntry | null;
  truncated?: boolean;
  note?: string;
}) {
  const model = useMemo(
    () => buildTextPreviewModel(preview, entry, styles as Record<string, string>),
    [preview, entry],
  );
  return (
    <div className={styles.textPreviewShell}>
      <div className={styles.textPreviewHeader}>
        <div className={styles.textPreviewHeaderLeft}>
          <span className={styles.textPreviewBadge}>{model.label}</span>
          <span className={styles.textPreviewMeta}>
            {model.lineCount === 1 ? "1 line" : `${model.lineCount} lines`}
          </span>
          {model.sizeLabel && <span className={styles.textPreviewMeta}>{model.sizeLabel}</span>}
        </div>
        {truncated && <span className={styles.textPreviewTruncated}>{note || "Truncated preview"}</span>}
      </div>
      {model.isEmpty ? (
        <div className={styles.textPreviewEmpty}>Empty text file.</div>
      ) : (
        <div className={styles.textPreviewCodeScroll}>
          <code className={styles.textPreviewCode}>
            {model.lines.map((line, idx) => (
              <span key={idx} className={styles.textPreviewLine}>
                <span className={styles.textPreviewLineNumber}>{idx + 1}</span>
                <span className={styles.textPreviewLineContent}>
                  {line.tokens.map((token, tokenIdx) => (
                    <span key={tokenIdx} className={token.className}>{token.text}</span>
                  ))}
                </span>
              </span>
            ))}
          </code>
        </div>
      )}
    </div>
  );
}

// -- metadata tables ------------------------------------------------------------

function blockLabel(block: PreviewTableBlock): string {
  const count = block.totalRows == null ? `${block.rows.length}+` : String(block.totalRows);
  return `${block.name || "data"} · ${count}`;
}

/** A STAR/XMD/CSV file: one tab per data block, its first rows and how many there are. */
export function TablePreview({ blocks, format }: { blocks: PreviewTableBlock[]; format?: string }) {
  const mainIndex = useMemo(() => {
    let best = 0;
    blocks.forEach((block, index) => {
      const size = block.totalRows ?? block.rows.length;
      const bestSize = blocks[best].totalRows ?? blocks[best].rows.length;
      if (block.kind !== "pairs" && (blocks[best].kind === "pairs" || size > bestSize)) best = index;
    });
    return best;
  }, [blocks]);
  const [chosen, setChosen] = useState<number | null>(null);
  const active = blocks[chosen ?? mainIndex] ?? blocks[0];
  if (!active) return <div className={styles.centerPlaceholder}>No tables in this file.</div>;
  const shown = active.rows.length;
  const total = active.totalRows;

  return (
    <div className={styles.tablePreviewShell}>
      <div className={styles.tablePreviewHeader}>
        {format && <span className={styles.textPreviewBadge}>{format.toUpperCase()}</span>}
        {blocks.length > 1 ? (
          <div className={styles.tablePreviewTabs} role="tablist" aria-label="Data blocks">
            {blocks.map((block, index) => (
              <button
                key={`${block.name}-${index}`}
                type="button"
                role="tab"
                aria-selected={block === active}
                className={[styles.tablePreviewTab, block === active ? styles.tablePreviewTabActive : ""].join(" ")}
                onClick={() => setChosen(index)}
              >
                {blockLabel(block)}
              </button>
            ))}
          </div>
        ) : (
          <span className={styles.textPreviewMeta}>{active.name}</span>
        )}
        <span className={styles.tablePreviewCount}>
          {total == null ? `first ${shown} rows` : shown < total ? `${shown} of ${total} rows` : `${total} rows`}
        </span>
      </div>
      <div className={styles.tablePreviewScroll}>
        <table className={styles.tablePreviewTable}>
          <thead>
            <tr>
              <th className={styles.tablePreviewIndex}>#</th>
              {active.columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {active.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className={styles.tablePreviewIndex}>{rowIndex + 1}</td>
                {active.columns.map((_, colIndex) => {
                  const cell = row[colIndex];
                  const text = cell === null || cell === undefined ? "" : String(cell);
                  return <td key={colIndex} title={text}>{text}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -- databases --------------------------------------------------------------------

function formatDatabaseValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "string") return value || "—";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function DatabasePreview({ database, meta }: { database: RemoteDatabasePreview; meta?: PreviewMeta }) {
  const summary = Array.isArray(database.summary) ? database.summary : [];
  const tables = Array.isArray(database.tables) ? database.tables : [];
  const warnings = Array.isArray(database.warnings) ? database.warnings : [];
  const sample = database.sample || null;
  const objectClass = database.objectClass || database.scipion?.objectClass || (meta?.objectClass as string | undefined);
  const objectCount = database.objectCount ?? database.scipion?.objectCount;

  return (
    <div className={styles.databasePreviewShell}>
      <div className={styles.databasePreviewHeader}>
        <div className={styles.databasePreviewTitleBlock}>
          <div className={styles.databasePreviewTitle}>
            {database.isScipion ? "Scipion SQLite database" : "SQLite database"}
          </div>
          <div className={styles.databasePreviewSubtitle}>
            {objectClass || database.engine || "sqlite"}
            {objectCount !== undefined && objectCount !== null ? ` · ${objectCount} items` : ""}
          </div>
        </div>
        <div className={styles.databasePreviewBadgeRow}>
          <span className={styles.databasePreviewBadge}>{database.readable === false ? "Unreadable" : "Readable"}</span>
          {database.isScipion && <span className={styles.databasePreviewBadgeAccent}>Scipion</span>}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className={styles.databaseWarnings}>
          {warnings.map((warning, index) => <div key={index} className={styles.databaseWarning}>{warning}</div>)}
        </div>
      )}

      <div className={styles.databaseSummaryGrid}>
        {summary.map((item, index) => (
          <div key={`${item.key}-${index}`} className={styles.databaseSummaryCard}>
            <div className={styles.databaseSummaryKey}>{item.key}</div>
            <div className={styles.databaseSummaryValue}>{formatDatabaseValue(item.value)}</div>
          </div>
        ))}
      </div>

      {tables.length > 0 && (
        <div className={styles.databaseSection}>
          <div className={styles.databaseSectionTitle}>Tables</div>
          <div className={styles.databaseTableScroll}>
            <table className={styles.databaseTable}>
              <thead>
                <tr><th>Name</th><th>Type</th><th>Rows</th><th>Columns</th></tr>
              </thead>
              <tbody>
                {tables.map((table) => (
                  <tr key={table.name}>
                    <td title={table.name}>{table.name}</td>
                    <td>{table.type || "table"}</td>
                    <td>{table.rows === null || table.rows === undefined ? "—" : table.rows}</td>
                    <td>{table.columns ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sample && Array.isArray(sample.columns) && sample.columns.length > 0 && (
        <div className={styles.databaseSection}>
          <div className={styles.databaseSectionTitle}>Sample rows{sample.table ? ` · ${sample.table}` : ""}</div>
          <div className={styles.databaseTableScroll}>
            <table className={styles.databaseTable}>
              <thead>
                <tr>{sample.columns.map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {(sample.rows || []).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {sample.columns.map((_, colIndex) => <td key={colIndex}>{formatDatabaseValue(row[colIndex])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sample.truncated && <div className={styles.databaseSampleHint}>Showing a limited sample.</div>}
        </div>
      )}
    </div>
  );
}
