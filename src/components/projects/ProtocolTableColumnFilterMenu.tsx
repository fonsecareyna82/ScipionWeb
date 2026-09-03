import { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ExtraTableColumnType } from "@/types/extraTableColumns";

import {
  getDefaultProtocolTableFilterOperator,
  getProtocolTableFilterOperators,
  isProtocolTableFilterValid,
  protocolTableFilterNeedsSecondValue,
  protocolTableFilterNeedsValue,
  type ProtocolTableColumnFilter,
  type ProtocolTableFilterOperator,
} from "@/components/projects/protocol-table-filters";

type Props = {
  columnId: string;
  label: string;
  type: ExtraTableColumnType;
  filter?: ProtocolTableColumnFilter;
  onApply: (filter: ProtocolTableColumnFilter) => void;
  onClear: () => void;
};

function createDraft(type: ExtraTableColumnType, filter?: ProtocolTableColumnFilter): ProtocolTableColumnFilter {
  const operators = getProtocolTableFilterOperators(type);

  if (filter && operators.some((option) => option.value === filter.operator)) return { ...filter };

  return {
    operator: getDefaultProtocolTableFilterOperator(type),
    value: "",
    valueTo: "",
  };
}

function getInputPlaceholder(type: ExtraTableColumnType): string {
  if (type === "bytes") return "e.g. 1 GB";
  if (type === "duration") return "e.g. 30m, 2h or 3600";
  if (type === "number") return "e.g. 10";

  return "Value";
}

export default function ProtocolTableColumnFilterMenu({
  columnId,
  label,
  type,
  filter,
  onApply,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProtocolTableColumnFilter>(() => createDraft(type, filter));

  const operators = useMemo(() => getProtocolTableFilterOperators(type), [type]);
  const needsValue = protocolTableFilterNeedsValue(draft.operator);
  const needsSecondValue = protocolTableFilterNeedsSecondValue(draft.operator);
  const valid = isProtocolTableFilterValid(type, draft);

  useEffect(() => {
    setDraft(createDraft(type, filter));
  }, [type, filter]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraft(createDraft(type, filter));
    setOpen(nextOpen);
  };

  const handleOperatorChange = (operator: ProtocolTableFilterOperator) => {
    setDraft((current) => ({ ...current, operator }));
  };

  const applyFilter = () => {
    if (!valid) return;

    onApply({
      operator: draft.operator,
      ...(needsValue ? { value: String(draft.value ?? "").trim() } : {}),
      ...(needsSecondValue ? { valueTo: String(draft.valueTo ?? "").trim() } : {}),
    });

    setOpen(false);
  };

  const clearFilter = () => {
    onClear();
    setDraft(createDraft(type));
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ppt-columnFilterButton"
          data-active={Boolean(filter)}
          aria-label={`Filter ${label}`}
          title={`Filter ${label}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Filter />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={6} className="ppt-columnFilterMenu" onKeyDown={(event) => event.stopPropagation()}>
        <DropdownMenuLabel>{label} filter</DropdownMenuLabel>

        <div className="ppt-columnFilterForm" onPointerDown={(event) => event.stopPropagation()}>
          <label className="ppt-columnFilterField">
            <span>Condition</span>

            <select
              aria-label={`Filter operator ${label}`}
              value={draft.operator}
              onChange={(event) => handleOperatorChange(event.target.value as ProtocolTableFilterOperator)}
            >
              {operators.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {needsValue && (
            <label className="ppt-columnFilterField">
              <span>{needsSecondValue ? "From" : "Value"}</span>

              <input
                type={type === "datetime" ? "datetime-local" : "text"}
                inputMode={type === "number" || type === "bytes" || type === "duration" ? "decimal" : undefined}
                aria-label={`Filter value ${label}`}
                placeholder={getInputPlaceholder(type)}
                value={draft.value ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
              />
            </label>
          )}

          {needsSecondValue && (
            <label className="ppt-columnFilterField">
              <span>To</span>

              <input
                type={type === "datetime" ? "datetime-local" : "text"}
                inputMode={type === "number" || type === "bytes" || type === "duration" ? "decimal" : undefined}
                aria-label={`Filter value to ${label}`}
                placeholder={getInputPlaceholder(type)}
                value={draft.valueTo ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, valueTo: event.target.value }))}
              />
            </label>
          )}

          <div className="ppt-columnFilterActions">
            {filter && (
              <button type="button" className="ppt-columnFilterClearButton" onClick={clearFilter}>
                Clear
              </button>
            )}

            <button type="button" className="ppt-columnFilterApplyButton" disabled={!valid} aria-label={`Apply ${label} filter`} onClick={applyFilter}>
              Apply
            </button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}