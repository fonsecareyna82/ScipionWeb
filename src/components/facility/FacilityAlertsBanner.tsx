import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, ChevronDown, ChevronUp, Hand } from "lucide-react";
import toast from "react-hot-toast";

import { acknowledgeFacilityAlert, listFacilityAlerts, type FacilityAlert } from "@/api/facility";
import { useFacilityStatus } from "@/hooks/useFacilityStatus";

const STAFF = ["facility.monitor", "facility.thresholds", "facility.sessions", "facility.manage"];
// The watcher opens alerts every 30 s: the banner follows it
const REFRESH_MS = 30000;
const SHOWN = 3;

function ago(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function takenBy(alert: FacilityAlert): string {
  return alert.acknowledgedByName || alert.acknowledgedByEmail || "someone";
}

/**
 * The facility's open alerts, over every page, for its staff: red and hard to miss while nobody has said they
 * are on them, amber once someone has. They go away when their cause is over (the watcher resolves them).
 */
export default function FacilityAlertsBanner() {
  const { loaded, facilityCan } = useFacilityStatus();
  const isStaff = loaded && STAFF.some((permission) => facilityCan(permission));
  const canTake = facilityCan("facility.sessions") || facilityCan("facility.manage");
  const [alerts, setAlerts] = useState<FacilityAlert[]>([]);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(() => {
    listFacilityAlerts().then(setAlerts).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isStaff) return;
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [isStaff, load]);

  if (!isStaff || alerts.length === 0) return null;
  const untaken = alerts.filter((alert) => !alert.acknowledgedAt);
  const taken = alerts.filter((alert) => alert.acknowledgedAt);
  const urgent = untaken.length > 0;
  const shown = expanded ? alerts : (urgent ? untaken : taken).slice(0, SHOWN);

  const take = async (alert: FacilityAlert) => {
    try {
      const updated = await acknowledgeFacilityAlert(alert.id);
      setAlerts((list) => list.map((other) => (other.id === alert.id ? updated : other)));
      toast.success("You are on it: the others see it.");
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to take the alert"));
    }
  };

  return (
    <div role="alert" data-testid="facility-alerts"
         className={`mx-2 mt-2 rounded-xl border-2 px-4 py-3 shadow-sm ${urgent
           ? "border-red-700 bg-red-600 text-white"
           : "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <AlertTriangle className={urgent ? "h-6 w-6" : "h-5 w-5"} />
        <span className={urgent ? "text-[17px] font-bold" : "text-[15px] font-semibold"}>
          {urgent
            ? `${untaken.length} facility alert${untaken.length === 1 ? "" : "s"} nobody is on yet`
            : `${taken.length} facility alert${taken.length === 1 ? "" : "s"} being handled`}
          {urgent && taken.length ? ` · ${taken.length} being handled` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/facility/sessions"
                className={`rounded-lg px-3 py-1 text-[14px] font-semibold ${urgent ? "bg-white text-red-700 hover:bg-red-50" : "bg-amber-600 text-white hover:bg-amber-700"}`}>
            Open the sessions
          </Link>
          {alerts.length > SHOWN || (urgent && taken.length > 0) ? (
            <button type="button" onClick={() => setExpanded((value) => !value)}
                    aria-label={expanded ? "Show fewer alerts" : "Show every alert"}
                    className="rounded-lg p-1 hover:bg-black/10">
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          ) : null}
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {shown.map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
            <span className="min-w-0 flex-1">{alert.message}</span>
            <span className={`text-[13.5px] ${urgent ? "text-red-100" : "opacity-75"}`}>
              {ago(alert.openedAt)}
              {alert.acknowledgedAt ? ` · ${takenBy(alert)} is on it` : ""}
            </span>
            {!alert.acknowledgedAt && canTake ? (
              <button type="button" onClick={() => void take(alert)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/70 px-2.5 py-0.5 text-[14px] font-semibold hover:bg-white/15">
                <Hand className="h-4 w-4" /> I'm on it
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
