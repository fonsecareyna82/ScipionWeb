// Two runs of a project side by side: what parameters differ between them.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  ProtocolParamsComparisonDialog,
  type ProtocolComparisonRow,
  type ProtocolSummary,
} from "@/components/projects/ProjectWorkspaceCompareDialog";

export type CompareRunCandidate = {
  id: string;
  label: string;
  /** The protocol's class as the graph shows it: runs of the same one are offered first. */
  title: string;
  status: string;
  outputCount: number;
};

type Props = {
  open: boolean;
  projectName: string;
  baseId: string | null;
  /** The other run, e.g. the second selected node; otherwise the latest run of the same class. */
  otherId?: string | null;
  candidates: CompareRunCandidate[];
  fetchProtocolDetails: (projectName: string, protocolId: string) => Promise<any>;
  onClose: () => void;
};

function summary(candidate: CompareRunCandidate): ProtocolSummary {
  return {
    id: candidate.id,
    label: candidate.label,
    className: candidate.title,
    status: candidate.status,
    outputCount: candidate.outputCount,
    params: {},
    paramLabels: {},
  };
}

/** The runs to offer against ``base``: same class first, newest (highest id) first. */
export function orderCompareCandidates(base: CompareRunCandidate, candidates: CompareRunCandidate[]): CompareRunCandidate[] {
  const byId = (a: CompareRunCandidate, b: CompareRunCandidate) => Number(b.id) - Number(a.id) || b.id.localeCompare(a.id);
  const others = candidates.filter((candidate) => candidate.id !== base.id);
  return [
    ...others.filter((candidate) => candidate.title === base.title).sort(byId),
    ...others.filter((candidate) => candidate.title !== base.title).sort(byId),
  ];
}

export default function CompareRunsDialog({
  open, projectName, baseId, otherId, candidates, fetchProtocolDetails, onClose,
}: Props) {
  const base = useMemo(() => candidates.find((candidate) => candidate.id === baseId) ?? null, [candidates, baseId]);
  const ordered = useMemo(() => (base ? orderCompareCandidates(base, candidates) : []), [base, candidates]);
  const [rightId, setRightId] = useState<string>("");

  useEffect(() => {
    if (!open || !base) return;
    const preferred = otherId && ordered.some((candidate) => candidate.id === otherId) ? otherId : ordered[0]?.id;
    setRightId(preferred ?? "");
  }, [open, base?.id, otherId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const right = ordered.find((candidate) => candidate.id === rightId) ?? null;
  const row = useMemo<ProtocolComparisonRow | null>(() => {
    if (!base || !right) return null;
    return {
      key: `${base.id}:${right.id}`,
      className: base.title === right.title ? base.title : `${base.title} ↔ ${right.title}`,
      leftProtocol: summary(base),
      rightProtocol: summary(right),
      matchType: "changed",
      matchScore: 1,
      matchQuality: "strong",
      paramDiffRows: [],
      matchReasons: [],
    };
  }, [base, right]);

  if (!open || !base) return null;

  const sameClass = ordered.filter((candidate) => candidate.title === base.title);
  const otherClasses = ordered.filter((candidate) => candidate.title !== base.title);
  const option = (candidate: CompareRunCandidate) => (
    <option key={candidate.id} value={candidate.id}>
      #{candidate.id} · {candidate.label} ({candidate.status})
    </option>
  );

  const picker = (
    <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
      <span className="shrink-0">Compare #{base.id} with</span>
      <select
        aria-label="Run to compare with"
        value={rightId}
        onChange={(event) => setRightId(event.target.value)}
        className="min-w-0 max-w-md rounded-lg border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white"
      >
        {ordered.length === 0 && <option value="">No other runs in this project</option>}
        {sameClass.length > 0 && <optgroup label={`Same protocol (${base.title})`}>{sameClass.map(option)}</optgroup>}
        {otherClasses.length > 0 && <optgroup label="Other protocols">{otherClasses.map(option)}</optgroup>}
      </select>
    </label>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] bg-black/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {row ? (
        <ProtocolParamsComparisonDialog
          open
          row={row}
          leftTitle={`#${base.id} ${base.label}`}
          rightTitle={`#${right!.id} ${right!.label}`}
          leftProjectName={projectName}
          rightProjectName={projectName}
          fetchProtocolDetails={fetchProtocolDetails}
          onClose={onClose}
          headerExtra={picker}
        />
      ) : (
        <div className="fixed left-1/2 top-1/3 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-800 p-5 text-white shadow-2xl">
          <div className="text-lg font-bold">Compare runs</div>
          <p className="mt-1 text-sm text-slate-300">There is no other run in this project to compare #{base.id} with.</p>
          <button type="button" onClick={onClose} className="mt-4 rounded-lg bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600">Close</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
