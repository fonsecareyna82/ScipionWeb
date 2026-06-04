import { Code2, ExternalLink, Package, X } from "lucide-react";
import type { Plugin } from "@/api/plugins";

import {
  classNames,
  getPluginCategoryMetadata,
  getPluginStatusLabel,
  getPluginVersionLabel,
  isDevelPlugin,
  type PluginProcessingState,
} from "./plugin_helpers";

type PluginQuickDetailsPanelProps = {
  plugin: Plugin | null;
  processingState: PluginProcessingState;
  onClose: () => void;
  onOpenDetails: (plugin: Plugin) => void;
};

export default function PluginQuickDetailsPanel({
  plugin,
  processingState,
  onClose,
  onOpenDetails,
}: PluginQuickDetailsPanelProps) {
  if (!plugin) return null;

  const categories = getPluginCategoryMetadata(plugin as any);
  const isDevel = isDevelPlugin(plugin);

  return (
    <aside className="rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-4 border-b border-gray-200/80 bg-gray-50/80 px-4 py-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.04]">
            {plugin.fullLogo ? (
              <img src={plugin.fullLogo} alt={`${plugin.name} icon`} className="h-9 w-9 object-contain" />
            ) : (
              <Package className="h-5 w-5 text-gray-500 dark:text-gray-300" />
            )}
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white" title={plugin.name}>
              {plugin.name}
            </h3>
            <div className="mt-1 truncate text-xs font-medium text-gray-500 dark:text-gray-400" title={plugin.pipName}>
              {plugin.pipName}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          aria-label="Close plugin details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200">
            {getPluginStatusLabel(plugin, processingState)}
          </span>

          <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200">
            {getPluginVersionLabel(plugin)}
          </span>

          {plugin.toUpdate ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-200">
              v{plugin.latestRelease} available
            </span>
          ) : null}

          {isDevel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-500/10 dark:text-indigo-200">
              <Code2 className="h-3.5 w-3.5" />
              Devel
            </span>
          ) : null}
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Summary</div>
          <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
            {plugin.summary || "No summary available."}
          </p>
        </div>

        {isDevel ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Local source</div>
            <div className="mt-2 break-all rounded-xl border border-indigo-200/70 bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-500/10 dark:text-indigo-200">
              {plugin.localPath || "N/A"}
            </div>
          </div>
        ) : null}

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Categories</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((category) => (
              <span
                key={category.id}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
                title={category.description}
              >
                {category.title}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenDetails(plugin)}
          className={classNames(
            "inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition",
            "border-[#333d49] bg-[#333d49] text-white shadow-sm hover:border-[#2b3440] hover:bg-[#2b3440] hover:shadow-md",
          )}
        >
          <ExternalLink className="h-4 w-4" />
          Open full details
        </button>
      </div>
    </aside>
  );
}
