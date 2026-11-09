import { useState } from "react";
import { Link } from "react-router";
import toast from "react-hot-toast";

import { installPluginsBatch } from "@/api/plugins";
import { usePermissions } from "@/hooks/usePermissions";

export type MissingPlugin = { name: string; pipName: string };

/**
 * What a workflow needs before it loads, and what to know about it: the plugins it misses (with a button that
 * installs them, for who manages plugins), why it cannot load otherwise, and the warning to migrate a workflow that
 * does not say which plugins it needs.
 */
export default function WorkflowRequirements({ missingPlugins, unknownProtocolClasses, designWarning, onInstalling }: {
  missingPlugins?: MissingPlugin[];
  unknownProtocolClasses?: string[];
  designWarning?: string;
  onInstalling?: () => void;
}) {
  const { can } = usePermissions();
  const [busy, setBusy] = useState(false);
  const missing = missingPlugins ?? [];
  const unknown = unknownProtocolClasses ?? [];

  const install = async () => {
    setBusy(true);
    try {
      await installPluginsBatch({ plugins: missing.map((plugin) => plugin.pipName) });
      toast.success(`Installing ${missing.map((plugin) => plugin.pipName).join(", ")}: follow it in Plugins. The workflow can be loaded once it is done.`,
        { duration: 8000 });
      onInstalling?.();
    } catch (e: any) {
      toast.error(String(e?.message || "The plugins could not be installed"));
    } finally {
      setBusy(false);
    }
  };

  if (!missing.length && !unknown.length && !designWarning) return null;
  return (
    <div className="space-y-2" data-testid="workflow-requirements">
      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-[14px] leading-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          It cannot be loaded until these plugins are installed:{" "}
          <span className="font-semibold">{missing.map((plugin) => plugin.name).join(", ")}</span>.
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {can("plugins.manage") ? (
              <button type="button" disabled={busy} onClick={() => void install()}
                      className="rounded-lg bg-amber-600 px-3 py-1 text-[13.5px] font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
                {busy ? "Starting…" : "Install missing plugins"}
              </button>
            ) : (
              <span className="text-[13.5px]">Ask an administrator to install them.</span>
            )}
            <Link to="/plugins" className="text-[13.5px] font-semibold underline">Open Plugins</Link>
          </div>
        </div>
      )}
      {!missing.length && unknown.length > 0 && (
        <div className="rounded-xl border border-red-300/80 bg-red-50 px-3 py-2 text-[14px] leading-6 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          It uses protocols this installation does not know (<span className="font-semibold">{unknown.join(", ")}</span>):
          a plugin is missing, and the workflow does not say which.
        </div>
      )}
      {designWarning && (
        <div className="rounded-xl border border-sky-300/80 bg-sky-50 px-3 py-2 text-[14px] leading-6 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
          {designWarning}
        </div>
      )}
    </div>
  );
}
