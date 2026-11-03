import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertTriangle, Microscope as MicroscopeIcon } from "lucide-react";

import PageMeta from "@/components/common/PageMeta";
import { getRoomView, roomMicroscopePhotoUrl, type RoomSession, type RoomState, type RoomView } from "@/api/facility";

// The screen follows the watcher, which looks at the folders every 30 s
const REFRESH_MS = 30000;

const STATE_LABELS: Record<RoomState, string> = {
  acquiring: "Acquiring",
  preparing: "Preparing",
  idle: "Idle",
  maintenance: "In maintenance",
  outOfService: "Out of service",
};

const STATE_CLASSES: Record<RoomState, string> = {
  acquiring: "bg-emerald-500 text-emerald-950",
  preparing: "bg-sky-400 text-sky-950",
  idle: "bg-slate-600 text-slate-100",
  maintenance: "bg-amber-400 text-amber-950",
  outOfService: "bg-red-500 text-white",
};

const TECHNIQUES = { spa: "SPA", tomo: "Tomography" } as const;

const WATCH_TEXT: Record<string, string> = {
  receiving: "receiving",
  stalled: "no new movies",
  noFolder: "folder not made yet",
  waiting: "waiting for movies",
  noOffload: "no offload folder",
  pending: "looking…",
};

const ALERT_TEXT = { stalled: "no new movies", processingFailed: "processing failed", protocolFailed: "a protocol failed" };

function since(value: string | null | undefined, now: number): string {
  if (!value) return "";
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ${minutes % 60} min` : `${Math.round(hours / 24)} days`;
}

function dayLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

function SessionBlock({ session, now }: { session: RoomSession; now: number }) {
  const people = [session.user && `User ${session.user}`, session.pi && `PI ${session.pi}`,
                  session.technician && `technician ${session.technician}`].filter(Boolean).join(" · ");
  return (
    <div className="space-y-2">
      <div className="font-mono text-[22px] font-semibold text-white break-all">{session.name}</div>
      <div className="text-[20px] text-slate-300">
        {TECHNIQUES[session.technique]}
        {session.status === "acquiring" && session.startedAt ? ` · acquiring for ${since(session.startedAt, now)}` : ""}
      </div>
      {people && <div className="text-[20px] text-slate-200">{people}</div>}
      {session.alerts.length > 0 && (
        <div className="rounded-xl bg-red-600 px-4 py-2 text-[20px] font-semibold text-white">
          <AlertTriangle className="mr-2 inline h-6 w-6 align-[-4px]" />
          {session.alerts.map((alert) => `${alert.folder.split("_").slice(-2).join("_")}: ${ALERT_TEXT[alert.kind]}`
            + (alert.taken ? " (being handled)" : "")).join(" · ")}
        </div>
      )}
      {session.datasets.length > 0 && (
        <ul className="space-y-1 text-[19px]">
          {session.datasets.map((dataset) => (
            <li key={dataset.number} className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-semibold text-slate-100">Grid {dataset.number}</span>
              {dataset.sample && <span className="text-slate-300">{dataset.sample}</span>}
              <span className={dataset.watch === "stalled" ? "text-red-300" : "text-slate-300"}>
                {dataset.movieCount ? `${dataset.movieCount} movies` : ""}
                {dataset.movieCount && dataset.minutesSinceLastMovie != null
                  ? `, last ${Math.round(dataset.minutesSinceLastMovie)} min ago` : ""}
                {!dataset.movieCount && dataset.watch ? WATCH_TEXT[dataset.watch] ?? "" : ""}
              </span>
              {dataset.processing && (
                <span className={dataset.processing === "error" ? "text-red-300" : "text-emerald-300"}>
                  {dataset.processing === "launched" ? "processing" : dataset.processing === "error" ? "processing failed"
                    : "making its project"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The screen of the microscopes' room: each microscope's state and session, readable from across the room. It needs
 * no signed-in user: its link carries the token the facility's managers made (Configuration → Room screen).
 */
export default function RoomScreen() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [view, setView] = useState<RoomView | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    getRoomView(token)
      .then((loaded) => {
        setView(loaded);
        setInvalid(false);
        setOffline(false);
      })
      .catch((error: any) => {
        if (error?.status === 404) setInvalid(true);
        else setOffline(true);
      });
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const clock = new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-slate-950 px-8 py-6 text-slate-100" data-testid="room-screen">
      <PageMeta title="Microscopes" description="The state of the facility's microscopes" />
      <header className="mb-6 flex items-end justify-between gap-6">
        <h1 className="text-[40px] font-bold tracking-tight">Microscopes</h1>
        <div className="text-right">
          <div className="text-[48px] font-semibold leading-none tabular-nums">{clock}</div>
          <div className="text-[20px] text-slate-400">{date}{offline ? " · reconnecting…" : ""}</div>
        </div>
      </header>

      {invalid ? (
        <div className="mt-24 text-center text-[28px] text-slate-300">
          This screen's link is not valid any more. Ask the facility for the new one.
        </div>
      ) : !view ? (
        <div className="mt-24 text-center text-[28px] text-slate-400">Loading…</div>
      ) : (
        <>
          <div className={`grid gap-6 ${view.microscopes.length > 2 ? "xl:grid-cols-3" : ""} ${view.microscopes.length > 1 ? "lg:grid-cols-2" : ""}`}>
            {view.microscopes.map((microscope) => (
              <section key={microscope.id} aria-label={microscope.name}
                       className="flex gap-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="h-36 w-36 flex-shrink-0 overflow-hidden rounded-xl bg-slate-800">
                  {microscope.photoVersion ? (
                    <img src={roomMicroscopePhotoUrl(microscope.id, token, microscope.photoVersion)} alt=""
                         className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><MicroscopeIcon className="h-14 w-14 text-slate-600" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-[30px] font-bold leading-tight">{microscope.name}</h2>
                    <span className={`rounded-full px-4 py-1 text-[20px] font-bold ${STATE_CLASSES[microscope.state]}`}>
                      {STATE_LABELS[microscope.state]}
                    </span>
                  </div>
                  {microscope.session ? <SessionBlock session={microscope.session} now={now} /> : (
                    <div className="text-[20px] text-slate-500">No session</div>
                  )}
                </div>
              </section>
            ))}
          </div>

          <section className="mt-8" aria-label="Next sessions">
            <h2 className="mb-3 text-[26px] font-semibold text-slate-300">Next sessions</h2>
            {view.upcoming.length === 0 ? (
              <div className="text-[20px] text-slate-500">None planned for the next days.</div>
            ) : (
              <ul className="space-y-1.5 text-[21px]">
                {view.upcoming.map((item) => (
                  <li key={item.name} className="flex flex-wrap gap-x-4">
                    <span className="w-64 font-semibold text-slate-200">{dayLabel(item.day)}</span>
                    <span className="w-56 text-slate-300">{item.microscope}</span>
                    <span className="text-slate-300">
                      {[item.user, item.pi && `PI ${item.pi}`, TECHNIQUES[item.technique]].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
