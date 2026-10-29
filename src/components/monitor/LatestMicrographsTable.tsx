// The newest micrographs of the stream, as the facilities report lists them: their image, their power
// spectrum and their values, the ones past a threshold in red. Each image is read once per micrograph.
import { useEffect, useState } from "react";

import { useProjectService } from "@/ProjectServiceContext";
import type { Id, StreamingMonitorPoint, StreamingMonitorThresholdName } from "@/services/ProjectService";
import { formatAngstrom } from "./streaming-monitor-data";

export const LATEST_MICROGRAPHS = 20;
const THUMBNAIL_SIZE = 160;

type Props = {
  projectId: Id;
  protocolId: string;
  outputName: string;
  points: StreamingMonitorPoint[];
  /** Opens the micrograph, or its power spectrum when its thumbnail is clicked. */
  onOpen: (pointId: number, kind?: "micrograph" | "psd") => void;
  /** The stream is picked: a column with the particles of each micrograph. */
  showParticles?: boolean;
};

type Kind = "micrograph" | "psd";

function Thumbnail({ projectId, protocolId, outputName, pointId, kind, onOpen }: {
  projectId: Id; protocolId: string; outputName: string; pointId: number; kind: Kind;
  /** Opens this image bigger. */
  onOpen?: () => void;
}) {
  const svc = useProjectService();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let revoke: (() => void) | null = null;
    const load = kind === "psd" ? svc.fetchCTFPsdImageObjectUrl : svc.fetchCTFMicrographImageObjectUrl;
    if (!load) return undefined;
    load.call(svc, projectId, protocolId, outputName, pointId,
      { size: THUMBNAIL_SIZE, format: "webp", quality: 70, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) {
          result.revoke();
          return;
        }
        revoke = result.revoke;
        setUrl(result.url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      revoke?.();
    };
  }, [svc, projectId, protocolId, outputName, pointId, kind]);

  const label = kind === "psd" ? "Power spectrum" : "Micrograph";
  if (url && onOpen) {
    return (
      <button type="button" title={`Open the ${label.toLowerCase()}`} aria-label={`Open the ${label.toLowerCase()}`}
              className="block rounded hover:ring-2 hover:ring-app-accent"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}>
        <img src={url} alt={label} className="h-14 w-14 rounded object-cover" />
      </button>
    );
  }
  if (url) return <img src={url} alt={label} className="h-14 w-14 rounded object-cover" />;
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded bg-app-surface-3 text-[12px] text-app-subtle"
         aria-label={failed ? `${label} not available` : `${label} loading`}>
      {failed ? "—" : "…"}
    </div>
  );
}

function Cell({ value, alerted }: { value: string; alerted: boolean }) {
  return (
    <td className={`px-2 py-1 text-right tabular-nums ${alerted ? "font-semibold text-app-danger" : "text-app-text"}`}>
      {value}
    </td>
  );
}

export default function LatestMicrographsTable({ projectId, protocolId, outputName, points, onOpen,
                                                 showParticles = false }: Props) {
  const latest = points.filter((point) => !point.failed).slice(-LATEST_MICROGRAPHS).reverse();
  if (!latest.length) return null;
  const past = (point: StreamingMonitorPoint, ...names: StreamingMonitorThresholdName[]) =>
    names.some((name) => point.alerts.includes(name));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]" aria-label="Latest micrographs">
        <thead>
          <tr className="text-left text-[13px] uppercase tracking-wide text-app-subtle">
            <th className="px-2 py-1">Micrograph</th>
            <th className="px-2 py-1">PSD</th>
            <th className="px-2 py-1">Name</th>
            <th className="px-2 py-1 text-right">Defocus U</th>
            <th className="px-2 py-1 text-right">Astigmatism</th>
            <th className="px-2 py-1 text-right">CTF resolution</th>
            <th className="px-2 py-1 text-right">Fit</th>
            <th className="px-2 py-1 text-right">Total drift</th>
            {showParticles ? <th className="px-2 py-1 text-right">Particles</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {latest.map((point) => (
            <tr key={point.id} className="hover:bg-app-hover" data-testid="latest-micrograph">
              <td className="px-2 py-1">
                <Thumbnail projectId={projectId} protocolId={protocolId} outputName={outputName} pointId={point.id}
                           kind="micrograph" onOpen={() => onOpen(point.id, "micrograph")} />
              </td>
              <td className="px-2 py-1">
                <Thumbnail projectId={projectId} protocolId={protocolId} outputName={outputName} pointId={point.id}
                           kind="psd" onOpen={() => onOpen(point.id, "psd")} />
              </td>
              <td className="max-w-[220px] truncate px-2 py-1 text-app-text" title={point.micrographName}>
                {point.micrographName ?? `Micrograph ${point.id}`}
              </td>
              <Cell value={point.defocusU === undefined ? "—" : `${(point.defocusU / 10000).toFixed(2)} µm`}
                    alerted={past(point, "minDefocus", "maxDefocus")} />
              <Cell value={point.astigmatism === undefined ? "—" : formatAngstrom(Math.abs(point.astigmatism), 0)}
                    alerted={past(point, "maxAstigmatism")} />
              <Cell value={formatAngstrom(point.resolution)} alerted={past(point, "maxResolution")} />
              <Cell value={point.fitQuality === undefined ? "—" : point.fitQuality.toFixed(2)} alerted={false} />
              <Cell value={formatAngstrom(point.totalDrift)} alerted={past(point, "maxTotalDrift", "maxFrameShift")} />
              {showParticles ? (
                <Cell value={point.particles === undefined ? "Not picked" : String(point.particles)}
                      alerted={past(point, "minParticles")} />
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
