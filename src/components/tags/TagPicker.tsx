import { useMemo } from "react";
import { Autocomplete, Box, Chip, TextField, Typography } from "@mui/material";
import type { ProtocolTag } from "./tagTypes";

type TagPickerProps = {
  label?: string;
  allTags: ProtocolTag[];
  selectedTagIds: string[];
  onChange: (nextTagIds: string[]) => void;

  disabled?: boolean;
};

export default function TagPicker({
  label,
  allTags,
  selectedTagIds,
  onChange,
  disabled,
}: TagPickerProps) {
  const selectedTags = useMemo(() => {
    // selectedTags
    const byId = new Map(allTags.map((t) => [t.id, t]));
    return selectedTagIds.map((id) => byId.get(id)).filter(Boolean) as ProtocolTag[];
  }, [allTags, selectedTagIds]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, minWidth: 0 }}>
      {label ? (
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>
          {label}
        </Typography>
      ) : null}

      <Autocomplete
        multiple
        disableCloseOnSelect
        options={allTags}
        value={selectedTags}
        disabled={!!disabled}
        getOptionLabel={(t) => t.title}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onChange={(_, newValue) => onChange(newValue.map((t) => t.id))}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder="Select tags..."
          />
        )}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => {
            const props = getTagProps({ index });
            return (
              <Chip
                {...props}
                key={option.id}
                label={option.title}
                size="small"
                sx={{
                  backgroundColor: option.color,
                  color: "#111827",
                  border: "1px solid rgba(0,0,0,0.15)",
                }}
              />
            );
          })
        }
      />
    </Box>
  );
}
