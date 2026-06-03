import { CheckCircle2, Code2, Eye, Loader2, Package, RefreshCw } from "lucide-react";
import type { Plugin } from "@/api/plugins";

import {
  canBatchInstallPlugin,
  classNames,
  getPluginCategoryMetadata,
  getPluginStatusLabel,
  getPluginVersionLabel,
  isDevelPlugin,
  type PluginProcessingState,
} from "./plugin_helpers";

type PluginListTableProps = {
  plugins: Plugin[];
  selectedPipNames: Set<string>;
  processingByPipName: Map<string, PluginProcessingState>;
  activePluginPipName?: string | null;
  onTogglePlugin: (plugin: Plugin) => void;
  onToggleAllVisible: () => void;
  onSelectPlugin: (plugin: Plugin) => void;
  onOpenDetails: (plugin: Plugin) => void;
};

function PluginLogo({ plugin }: { plugin: Plugin }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.04]">
      {plugin.fullLogo ? (
        <img src={plugin.fullLogo} alt={`${plugin.name} icon`} className="h-8 w-8 object-contain" />
      ) : (
        <Package className="h-4 w-4 text-gray-500 dark:text-gray-300" />
      )}
    </div>
  );
}

export default function PluginListTable({
  plugins,
  selectedPipNames,
  processingByPipName,
  activePluginPipName,
  onTogglePlugin,
  onToggleAllVisible,
  onSelectPlugin,
  onOpenDetails,
}: PluginListTableProps) {
  const selectablePlugins = plugins.filter((plugin) =>
    canBatchInstallPlugin(plugin, processingByPipName.get(plugin.pipName) ?? null),
  );
  const allSelectableSelected = selectablePlugins.length > 0 && selectablePlugins.every((plugin) => selectedPipNames.has(plugin.pipName));

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white/70 shadow-sm dark:border-gray-800/80 dark:bg-white/[0.01]">
      <div className="grid grid-cols-[44px_minmax(280px,1.6fr)_minmax(140px,0.8fr)_minmax(150px,0.8fr)_minmax(120px,0.7fr)_minmax(160px,1fr)_96px] gap-3 border-b border-gray-200/70 bg-gray-50/80 px-4 py-3 text-xs font-semibold text-gray-600 dark:border-gray-800/70 dark:bg-white/[0.02] dark:text-gray-300">
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={allSelectableSelected}
            onChange={onToggleAllVisible}
            disabled={selectablePlugins.length === 0}
            aria-label="Select all visible installable plugins"
          />
        </div>
        <div>Plugin</div>
        <div>Status</div>
        <div>Version</div>
        <div>Source</div>
        <div>Categories</div>
        <div className="text-right">Action</div>
      </div>

      <div className="divide-y divide-gray-200/70 dark:divide-gray-800/70">
        {plugins.map((plugin) => {
          const processingState = processingByPipName.get(plugin.pipName) ?? null;
          const isSelected = selectedPipNames.has(plugin.pipName);
          const selectable = canBatchInstallPlugin(plugin, processingState);
          const isActive = activePluginPipName === plugin.pipName;
          const isDevel = isDevelPlugin(plugin);
          const categories = getPluginCategoryMetadata(plugin as any);

          return (
            <div
              key={plugin.pipName}
              className={classNames(
                "grid grid-cols-[44px_minmax(280px,1.6fr)_minmax(140px,0.8fr)_minmax(150px,0.8fr)_minmax(120px,0.7fr)_minmax(160px,1fr)_96px] gap-3 px-4 py-3 transition",
                isActive
                  ? "bg-[#333d49]/8 dark:bg-white/[0.05]"
                  : "hover:bg-gray-50/80 dark:hover:bg-white/[0.02]",
              )}
            >
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onTogglePlugin(plugin)}
                  disabled={!selectable}
                  aria-label={`Select ${plugin.name}`}
                />
              </div>

              <button
                type="button"
                onClick={() => onSelectPlugin(plugin)}
                className="flex min-w-0 items-center gap-3 text-left"
              >
                <PluginLogo plugin={plugin} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900 dark:text-white" title={plugin.name}>
                    {plugin.name}
                  </div>
                  <div className="mt-1 truncate text-xs font-medium text-gray-500 dark:text-gray-400" title={plugin.pipName}>
                    {plugin.pipName}
                  </div>
                </div>
              </button>

              <div className="flex items-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200">
                  {processingState === "installing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {processingState === "removing" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                  {!processingState && plugin.installed ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  {getPluginStatusLabel(plugin, processingState)}
                </span>
              </div>

              <div className="flex items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
                {getPluginVersionLabel(plugin)}
                {plugin.toUpdate ? (
                  <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-200">
                    Update
                  </span>
                ) : null}
              </div>

              <div className="flex items-center">
                {isDevel ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-500/10 dark:text-indigo-200" title={plugin.localPath || "Local source"}>
                    <Code2 className="h-3.5 w-3.5" />
                    Devel
                  </span>
                ) : (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200">
                    Standard
                  </span>
                )}
              </div>

              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                {categories.slice(0, 2).map((category) => (
                  <span
                    key={category.id}
                    className="truncate rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
                    title={category.description}
                  >
                    {category.title}
                  </span>
                ))}
                {categories.length > 2 ? (
                  <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">+{categories.length - 2}</span>
                ) : null}
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onOpenDetails(plugin)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm transition hover:border-gray-400 hover:shadow-md dark:border-gray-700 dark:bg-slate-900 dark:text-white"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Details
                </button>
              </div>
            </div>
          );
        })}

        {plugins.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No plugins found.
          </div>
        ) : null}
      </div>
    </div>
  );
}
