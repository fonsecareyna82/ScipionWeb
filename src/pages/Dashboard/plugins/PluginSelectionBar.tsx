import { Loader2, PackageCheck, X } from "lucide-react";

import { classNames } from "./plugin_helpers";

type PluginSelectionBarProps = {
  selectedCount: number;
  actionableCount: number;
  busy: boolean;
  optionChecked: boolean;
  optionLabel: string;
  primaryLabel: string;
  busyLabel: string;
  className?: string;
  onOptionChange: (value: boolean) => void;
  onPrimaryAction: () => void;
  onClearSelection: () => void;
};

export default function PluginSelectionBar({
  selectedCount,
  actionableCount,
  busy,
  optionChecked,
  optionLabel,
  primaryLabel,
  busyLabel,
  className,
  onOptionChange,
  onPrimaryAction,
  onClearSelection,
}: PluginSelectionBarProps) {
  if (selectedCount === 0) return null;

  const canRun = actionableCount > 0 && !busy;

  return (
    <div
      className={classNames(
        "flex flex-col gap-3 rounded-2xl border border-[#333d49]/20 bg-[#333d49]/5 p-4 dark:border-slate-700 dark:bg-white/[0.03] lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          {selectedCount} selected
        </div>
        <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          {actionableCount} can be processed in this batch.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 rounded-xl border border-gray-300/80 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200">
          <input
            type="checkbox"
            checked={optionChecked}
            onChange={(event) => onOptionChange(event.target.checked)}
            disabled={busy}
          />
          {optionLabel}
        </label>

        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={!canRun}
          className={classNames(
            "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition",
            "border-[#333d49] bg-[#333d49] text-white hover:border-[#2b3440] hover:bg-[#2b3440] hover:shadow-md",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          {busy ? busyLabel : primaryLabel}
        </button>

        <button
          type="button"
          onClick={onClearSelection}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:border-gray-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-slate-900 dark:text-white"
        >
          <X className="h-4 w-4" />
          Clear
        </button>
      </div>
    </div>
  );
}
