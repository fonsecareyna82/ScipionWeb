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
  const hasSelection = selectedCount > 0;
  const canRun = actionableCount > 0 && !busy;

  return (
    <div
      className={classNames(
        "flex flex-col gap-3 rounded-[10px] border border-gray-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold text-gray-900 dark:text-white">
          {selectedCount} selected
        </div>
        <div className="mt-0.5 text-[13.5px] text-gray-500 dark:text-gray-400">
          {hasSelection
            ? `${actionableCount} can be processed in this batch.`
            : "Select available plugins or updates from the list below."}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-gray-300 bg-white px-3 text-[14px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
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
            "inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-[14px] font-semibold shadow-sm transition",
            "bg-brand-500 text-white hover:bg-brand-600",
            "disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 dark:disabled:bg-gray-700 dark:disabled:text-gray-400",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          {busy ? busyLabel : primaryLabel}
        </button>

        <button
          type="button"
          onClick={onClearSelection}
          disabled={busy || !hasSelection}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-gray-300 bg-white px-4 text-[14px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          <X className="h-4 w-4" />
          Clear
        </button>
      </div>
    </div>
  );
}
