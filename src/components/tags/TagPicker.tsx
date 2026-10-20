// src/components/tags/TagPicker.tsx
import React, { useMemo } from "react";
import { Autocomplete, Box, Chip, Paper, TextField, Typography } from "@mui/material";
import Popper, { type PopperProps } from "@mui/material/Popper";
import { getReadableTextColor, normalizeTagColor, normalizeTagIds } from "@/utils/protocol_tags";
import type { ProtocolTag } from "./tagTypes";
import { tagPalette } from "./tagStyles";

type TagPickerProps = {
  allTags?: ProtocolTag[];
  selectedTagIds: string[];
  onChange: (nextSelectedTagIds: string[]) => void;
  disabled?: boolean;

  label?: string;
  helperText?: string;
  placeholder?: string;

  disablePortal?: boolean;
  popperContainer?: HTMLElement | null;
  popperZIndex?: number;
};

function createPlaceholderTag(id: string): ProtocolTag {
  // createPlaceholderTag
  return {
    id,
    title: id,
    color: "var(--app-n-400)",
  } as ProtocolTag;
}

type SpreadKeyFix<T> = T & { key?: React.Key };

export default function TagPicker({
  allTags,
  selectedTagIds,
  onChange,
  disabled,
  label,
  helperText,
  placeholder,

  disablePortal = false,
  popperContainer = null,
  popperZIndex = 2000,
}: TagPickerProps) {
  const fieldBg = tagPalette.inputBg;
  const fieldText = tagPalette.text;
  const mutedText = tagPalette.textMuted;
  const borderColor = tagPalette.border;
  const paperBg = tagPalette.panel;
  const optionHoverBg = "var(--app-hover)";
  const optionSelectedBg = "var(--app-selected)";

  const normalizedAllTags = useMemo(() => {
    // normalizedAllTags
    return allTags ?? [];
  }, [allTags]);

  const normalizedSelectedIds = useMemo(() => {
    // normalizedSelectedIds
    return normalizeTagIds(selectedTagIds);
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

  const popperComponent = useMemo(() => {
    // popperComponent
    const Comp = (props: PopperProps) => {
      const mergedStyle = { ...(props.style ?? {}), zIndex: popperZIndex };
      return <Popper {...props} style={mergedStyle} container={popperContainer ?? undefined} />;
    };
    return Comp;
  }, [popperContainer, popperZIndex]);

  const paperComponent = useMemo(() => {
    // paperComponent
    const Comp = (props: React.HTMLAttributes<HTMLElement>) => (
      <Paper
        {...props}
        className={[props.className, "tag-picker-paper"].filter(Boolean).join(" ")}
        elevation={0}
        sx={{
          backgroundImage: "none",
          backgroundColor: paperBg,
          color: fieldText,
          border: "1px solid",
          borderColor,
          borderRadius: 2,
          overflow: "hidden",
          boxShadow: tagPalette.shadow,
          "& .MuiAutocomplete-listbox": {
            backgroundColor: paperBg,
            color: fieldText,
            py: 0.5,
          },
          "& .MuiAutocomplete-option": {
            minHeight: 30,
            fontSize: 13,
            color: fieldText,
            "&[aria-selected='true']": {
              backgroundColor: optionSelectedBg,
            },
            "&.Mui-focused": {
              backgroundColor: optionHoverBg,
            },
            "&[aria-selected='true'].Mui-focused": {
              backgroundColor: optionSelectedBg,
            },
          },
          "& .MuiAutocomplete-noOptions": {
            color: mutedText,
            backgroundColor: paperBg,
          },
        }}
      />
    );
    return Comp;
  }, [borderColor, fieldText, mutedText, optionHoverBg, optionSelectedBg, paperBg]);

  return (
    <Autocomplete<ProtocolTag, true, false, false>
      className="tag-picker-root"
      multiple
      disableCloseOnSelect
      disablePortal={disablePortal}
      noOptionsText="No tags"
      PopperComponent={popperComponent}
      PaperComponent={paperComponent}
      options={mergedOptions}
      value={selectedTags}
      disabled={disabled}
      isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
      getOptionLabel={(t) => String(t.title ?? t.id)}
      onChange={(_, value) => {
        const nextIds = normalizeTagIds((value ?? []).map((t) => String(t.id)));
        onChange(nextIds);
      }}
      renderTags={(value, getTagProps) =>
        (value ?? []).map((tag, index) => {
          const color = normalizeTagColor(tag.color);
          const textColor = getReadableTextColor(color);

          const rawProps = getTagProps({ index }) as SpreadKeyFix<ReturnType<typeof getTagProps>>;
          const { key: _key, ...chipProps } = rawProps;

          return (
            <Chip
              {...chipProps}
              key={String(tag.id)}
              size="small"
              label={String(tag.title ?? tag.id)}
              title={String(tag.title ?? tag.id)}
              sx={{
                backgroundColor: color,
                color: textColor,
                border: "1px solid var(--app-n-400)",
                height: 22,
                maxWidth: 160,
                "& .MuiChip-label": { px: 1, fontSize: 12, fontWeight: 600 },
                "& .MuiChip-deleteIcon": {
                  color: textColor,
                  opacity: 0.75,
                  "&:hover": { color: textColor, opacity: 1 },
                },
              }}
            />
          );
        })
      }
      renderOption={(props, option) => {
        const color = normalizeTagColor(option.color);

        const rawProps = props as SpreadKeyFix<React.HTMLAttributes<HTMLLIElement>>;
        const { key: _key, ...liProps } = rawProps;

        return (
          <li {...liProps} key={String(option.id)}>
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
                  border: "1px solid",
                  borderColor: "var(--app-n-400)",
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
                  color: fieldText,
                }}
              >
                {String(option.title ?? option.id)}
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  flex: "0 0 auto",
                  color: mutedText,
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
          maxHeight: "var(--ppTagDropdownMaxHeight, 180px)",
          backgroundColor: paperBg,
          color: fieldText,
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
        "& .MuiAutocomplete-inputRoot": {
          minHeight: 32,
          paddingTop: "2px",
          paddingBottom: "2px",
          borderRadius: 2,
          backgroundColor: fieldBg,
          color: fieldText,
        },
        "& .MuiOutlinedInput-root": {
          backgroundColor: fieldBg,
          color: fieldText,
        },
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor,
        },
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: tagPalette.accent,
        },
        "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: tagPalette.accent,
        },
        "& .MuiInputLabel-root": {
          color: mutedText,
        },
        "& .MuiFormHelperText-root": {
          color: mutedText,
        },
        "& .MuiAutocomplete-input": {
          fontSize: 12,
          paddingTop: "4px",
          paddingBottom: "4px",
          color: fieldText,
        },
        "& .MuiInputBase-input::placeholder": {
          fontSize: 12,
          opacity: 0.72,
          color: mutedText,
        },
        "& .MuiSvgIcon-root": {
          color: mutedText,
        },
        "& .MuiChip-root": {
          height: 22,
        },
        "& .MuiChip-label": {
          paddingLeft: "8px",
          paddingRight: "8px",
          fontSize: 12,
        },
      }}
    />
  );
}
