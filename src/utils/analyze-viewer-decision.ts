import type {
  AnalyzeViewerResolveDecision,
  TableViewContext,
  TableViewData,
} from "@/services/ProjectService";

export type TableViewerDialogState = {
  title: string;
  context: TableViewContext;
  tableData: TableViewData;
  emptyPaneMessage?: string;
  pointerClass?: string;
  protocolLabel?: string;
};

export function isTableViewerAnalyzeDecision(
  decision: AnalyzeViewerResolveDecision | null | undefined,
): decision is Extract<AnalyzeViewerResolveDecision, { handled: true; viewer: "table-viewer-pane" }> {
  return (
    !!decision &&
    decision.handled === true &&
    decision.viewer === "table-viewer-pane" &&
    !!decision.tableViewContext &&
    !!decision.tableViewData
  );
}

export function openExternalAnalyzeDecision(
  decision: AnalyzeViewerResolveDecision | null | undefined,
): boolean {
  if (!decision || decision.handled !== true || isTableViewerAnalyzeDecision(decision)) {
    return false;
  }

  const url = decision.url;
  if (!url) return false;

  const target = decision.target ?? "_blank";

  if (target === "_self") {
    if (url.startsWith("#")) {
      window.location.hash = url.slice(1);
    } else {
      window.location.assign(url);
    }
    return true;
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export function tableViewerStateFromDecision(
  decision: AnalyzeViewerResolveDecision,
  fallback: { protocolLabel?: string; pointerClass?: string },
): TableViewerDialogState | null {
  if (!isTableViewerAnalyzeDecision(decision)) return null;

  return {
    title:
      decision.title ??
      decision.tableViewData.title ??
      String(decision.tableViewContext.outputName ?? "Table viewer"),
    context: decision.tableViewContext,
    tableData: decision.tableViewData,
    emptyPaneMessage: decision.emptyPaneMessage,
    pointerClass: fallback.pointerClass,
    protocolLabel: fallback.protocolLabel,
  };
}
