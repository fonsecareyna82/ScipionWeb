export type PrintableReportMetric = {
  label: string;
  value: string | number;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function markdownTableToHtml(lines: string[]): string {
  const rows = lines
    .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));

  if (!rows.length) return "";

  const [header, ...body] = rows;
  return `
    <table>
      <thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
      <tbody>
        ${body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function markdownToReportHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let tableLines: string[] = [];

  const flushTable = () => {
    if (!tableLines.length) return;
    html.push(markdownTableToHtml(tableLines));
    tableLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("|")) {
      tableLines.push(line);
      continue;
    }

    flushTable();

    if (line.startsWith("# ")) {
      html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith("- ")) {
      html.push(`<p class="bullet">${escapeHtml(line.slice(2))}</p>`);
    } else if (line.trim()) {
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  flushTable();
  return html.join("\n");
}

export function openPrintableComparisonReport(options: {
  title: string;
  subtitle: string;
  markdown: string;
  fileName: string;
}): void {
  if (typeof window === "undefined") return;

  const reportWindow = window.open("", "_blank", "width=1100,height=900,scrollbars=yes,resizable=yes");
  if (!reportWindow) {
    throw new Error("The browser blocked the printable report window");
  }

  const bodyHtml = markdownToReportHtml(options.markdown);
  const now = new Date().toLocaleString();

  reportWindow.document.open();
  reportWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 14mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #f8fafc;
      color: #0f172a;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }

    .report {
      max-width: 980px;
      margin: 0 auto;
      background: #ffffff;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.14);
      min-height: 100vh;
    }

    .cover {
      background: linear-gradient(135deg, #0f172a, #1d4ed8 52%, #0891b2);
      color: #ffffff;
      padding: 36px 42px;
      position: relative;
      overflow: hidden;
    }

    .cover::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 8% 12%, rgba(255,255,255,0.20), transparent 24%),
        radial-gradient(circle at 90% 18%, rgba(125,211,252,0.28), transparent 26%);
      pointer-events: none;
    }

    .cover-content {
      position: relative;
      z-index: 1;
    }

    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 10px;
      font-weight: 800;
      color: #bae6fd;
      margin-bottom: 10px;
    }

    .cover h1 {
      margin: 0;
      color: #ffffff;
      font-size: 30px;
      letter-spacing: -0.04em;
      line-height: 1.08;
    }

    .cover p {
      margin: 10px 0 0;
      color: #e0f2fe;
      max-width: 760px;
      font-size: 13px;
    }

    .meta {
      margin-top: 18px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .meta span {
      border: 1px solid rgba(255,255,255,0.24);
      background: rgba(255,255,255,0.12);
      border-radius: 999px;
      padding: 5px 9px;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
    }

    .content {
      padding: 28px 42px 42px;
    }

    h1 {
      color: #0f172a;
      font-size: 26px;
      margin: 0 0 12px;
    }

    h2 {
      color: #0f172a;
      border-bottom: 1px solid #dbeafe;
      margin: 26px 0 12px;
      padding-bottom: 7px;
      font-size: 17px;
      letter-spacing: -0.02em;
    }

    h3 {
      color: #1e40af;
      margin: 18px 0 8px;
      font-size: 13px;
    }

    p {
      margin: 6px 0;
    }

    .bullet {
      border: 1px solid #dbeafe;
      background: #eff6ff;
      border-radius: 10px;
      padding: 8px 10px;
      color: #1e293b;
      font-weight: 600;
      break-inside: avoid;
    }

    .print-actions {
      display: flex;
      justify-content: flex-end;
      padding: 14px 18px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .print-actions button {
      border: 1px solid #bfdbfe;
      background: #2563eb;
      color: #ffffff;
      border-radius: 12px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 18px;
      border: 1px solid #dbe3ef;
      border-radius: 12px;
      overflow: hidden;
      break-inside: auto;
    }

    thead {
      display: table-header-group;
      background: linear-gradient(90deg, #0f172a, #1d4ed8, #0891b2);
      color: #ffffff;
    }

    th, td {
      border-bottom: 1px solid #e2e8f0;
      padding: 7px 8px;
      vertical-align: top;
      word-break: break-word;
    }

    th {
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 800;
    }

    td {
      font-size: 10.5px;
      color: #334155;
    }

    tr:nth-child(even) td {
      background: #f8fafc;
    }

    @media print {
      body {
        background: #ffffff;
      }

      .report {
        max-width: none;
        box-shadow: none;
      }

      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <main class="report">
    <div class="print-actions no-print">
      <button type="button" onclick="window.print()">Print or save as PDF</button>
    </div>
    <section class="cover">
      <div class="cover-content">
        <div class="eyebrow">ScipionWeb comparison report</div>
        <h1>${escapeHtml(options.title)}</h1>
        <p>${escapeHtml(options.subtitle)}</p>
        <div class="meta">
          <span>Generated ${escapeHtml(now)}</span>
          <span>${escapeHtml(options.fileName)}</span>
        </div>
      </div>
    </section>
    <section class="content">
      ${bodyHtml}
    </section>
  </main>
</body>
</html>`);
  reportWindow.document.close();
  reportWindow.focus();

  window.setTimeout(() => {
    reportWindow.focus();
    reportWindow.print();
  }, 350);
}
