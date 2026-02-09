// src/components/tags/TagPicker.tsx
import React, { useMemo } from "react";
import { Autocomplete, Box, Chip, TextField, Typography } from "@mui/material";
import type { ProtocolTag } from "./tagTypes";

type TagPickerProps = {
  allTags: ProtocolTag[];
  selectedTagIds: string[];
  onChange: (nextSelectedTagIds: string[]) => void;
  disabled?: boolean;

  label?: string;
  helperText?: string;
  placeholder?: string;
};

function normalizeColor(color?: string): string {
  // normalizeColor
  const c = String(color ?? "").trim();
  return c.length ? c : "#9ca3af";
}

function normalizeIds(ids: string[] | undefined | null): string[] {
  // normalizeIds
  const raw = (ids ?? []).map((x) => String(x));
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const id of raw) {
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  return unique;
}

function createPlaceholderTag(id: string): ProtocolTag {
  // createPlaceholderTag
  return {
    id,
    title: id,
    color: "#9ca3af",
  } as ProtocolTag;
}

export default function TagPicker({
  allTags,
  selectedTagIds,
  onChange,
  disabled,
  label,
  helperText,
  placeholder,
}: TagPickerProps) {
  const normalizedAllTags = useMemo(() => {
    // normalizedAllTags
    return allTags ?? [];
  }, [allTags]);

  const normalizedSelectedIds = useMemo(() => {
    // normalizedSelectedIds
    return normalizeIds(selectedTagIds);
  }, [selectedTagIds]);

  const tagById = useMemo(() => {
    // tagById
    const map = new Map<string, ProtocolTag>();
    for (const t of normalizedAllTags) {
      map.set(String(t.id), t);
    }
    return map;
  }, [normalizedAllTags]);

  const selectedTags = useMemo(() => {
    // selectedTags
    return normalizedSelectedIds.map((id) => tagById.get(id) ?? createPlaceholderTag(id));
  }, [normalizedSelectedIds, tagById]);

  const mergedOptions = useMemo(() => {
    // mergedOptions
    const existing = new Set(normalizedAllTags.map((t) => String(t.id)));
    const merged = [...normalizedAllTags];

    for (const t of selectedTags) {
      const id = String(t.id);
      if (!existing.has(id)) {
        merged.unshift(t);
        existing.add(id);
      }
    }

    return merged;
  }, [normalizedAllTags, selectedTags]);

  return (
    <Autocomplete<ProtocolTag, true, false, false>
      multiple
      disableCloseOnSelect

      // disablePortal
      // keepingThePopperInTheDialogTree avoids focusTrap infinite loops (contain/focus recursion)
      disablePortal
      options={mergedOptions}
      value={selectedTags}
      disabled={disabled}
      isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
      getOptionLabel={(t) => String(t.title ?? t.id)}
      onChange={(_, value) => {
        const nextIds = normalizeIds((value ?? []).map((t) => String(t.id)));
        onChange(nextIds);
      }}
      renderTags={(value, getTagProps) =>
        (value ?? []).map((tag, index) => {
          const color = normalizeColor(tag.color);
          const props = getTagProps({ index });

          return (
            <Chip
              {...props}
              key={String(tag.id)}
              size="small"
              label={String(tag.title ?? tag.id)}
              sx={{
                backgroundColor: color,
                color: "#0b1220",
                fontWeight: 700,
                border: "1px solid rgba(42, 23, 15, 0.18)",
                height: 22,
                "& .MuiChip-label": { px: 1, fontSize: 12 },
              }}
            />
          );
        })
      }
      renderOption={(props, option) => {
        const color = normalizeColor(option.color);

        return (
          <li {...props} key={String(option.id)}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                width: "100%",
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  width: 12,
                  height: 10,
                  borderRadius: "999px",
                  backgroundColor: color,
                  border: "1px solid rgba(15,23,42,0.22)",
                  flex: "0 0 auto",
                }}
              />
              <Typography
                variant="body2"
                sx={{
                  flex: "1 1 auto",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 13,
                }}
              >
                {String(option.title ?? option.id)}
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  flex: "0 0 auto",
                  opacity: 0.75,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {String(option.color ?? "").trim() || "—"}
              </Typography>
            </Box>
          </li>
        );
      }}
      ListboxProps={{
        style: {
          maxHeight: "var(--ppTagDropdownMaxHeight, 100px)",
        },
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          helperText={helperText}
          placeholder={placeholder ?? "Filter tags..."}
          size="small"
        />
      )}
      sx={{
        width: "100%",

        // inputHeightDensity
        "& .MuiInputBase-root": {
          minHeight: 1,
          maxHeight: 3,
          paddingTop: "0px",
          paddingBottom: "0px",
          marginTop: "-1px", // to visually center the input vertically within the smaller height
          marginBottom: "-2px", // to visually center the input vertically within the smaller height
        },
        "& .MuiInputBase-input": {
          fontSize: 10,
          paddingTop: "6px",
          paddingBottom: "6px",
        },
        "& .MuiInputBase-input::placeholder": {
          fontSize: 12,
          opacity: 0.7,
        },

        // optionsRowCompact
        "& .MuiAutocomplete-option": {
          minHeight: 5,
        },
      }}
    />
  );
}
