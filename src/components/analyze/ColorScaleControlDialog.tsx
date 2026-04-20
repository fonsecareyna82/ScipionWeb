import * as React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { CloseIcon } from "@/icons";

export type ColorScaleState = {
  auto: boolean;
  min: number;
  max: number;
  palette: string;
  reverse: boolean;
};

export type ColorScalePaletteOption = {
  id: string;
  label: string;
};

type ColorScaleControlDialogProps = {
  open: boolean;
  title?: string;

  dataMin: number;
  dataMax: number;

  value: ColorScaleState;
  onChange: (next: ColorScaleState) => void;

  onClose: () => void;
  onApply?: () => void;

  paletteOptions?: ColorScalePaletteOption[];
};

const wizardDialogPaperSx = {
  borderRadius: "22px",
  overflow: "hidden",
  border: "1px solid rgba(51, 61, 73, 0.14)",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.24)",
  backgroundImage: "none",
};

const wizardDialogTitleSx = {
  m: 0,
  px: 2.5,
  py: 2,
  background: "linear-gradient(135deg, #333d49 0%, #3d4957 55%, #465567 100%)",
  color: "#ffffff",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const wizardDialogContentSx = {
  px: 2.5,
  py: 2.5,
  background: "linear-gradient(180deg, #f8fafc 0%, #f4f7fb 100%)",
  borderColor: "rgba(15,23,42,0.08)",
};

const wizardDialogActionsSx = {
  px: 2.5,
  py: 2,
  backgroundColor: "#ffffff",
  borderTop: "1px solid rgba(15,23,42,0.08)",
  justifyContent: "flex-end",
  gap: 1.25,
};

const defaultPaletteOptions: ColorScalePaletteOption[] = [
  { id: "jet", label: "Jet" },
  { id: "viridis", label: "Viridis" },
  { id: "plasma", label: "Plasma" },
  { id: "inferno", label: "Inferno" },
  { id: "magma", label: "Magma" },
  { id: "turbo", label: "Turbo" },
  { id: "gray", label: "Gray" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, digits = 4): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getPaletteStops(id: string): string[] {
  switch (id) {
    case "viridis":
      return ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];
    case "plasma":
      return ["#0d0887", "#7e03a8", "#cc4778", "#f89441", "#f0f921"];
    case "inferno":
      return ["#000004", "#420a68", "#932667", "#dd513a", "#fba40a", "#fcffa4"];
    case "magma":
      return ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"];
    case "turbo":
      return ["#30123b", "#4145ab", "#2a9df4", "#29d67d", "#f9f871", "#f57d15", "#900c3f"];
    case "gray":
      return ["#000000", "#ffffff"];
    case "jet":
    default:
      return ["#00007f", "#0000ff", "#00ffff", "#ffff00", "#ff0000", "#7f0000"];
  }
}

function getPaletteGradient(id: string, reverse: boolean): string {
  const colors = getPaletteStops(id);
  const ordered = reverse ? [...colors].reverse() : colors;
  return `linear-gradient(90deg, ${ordered.join(", ")})`;
}

function normalizeRange(min: number, max: number, dataMin: number, dataMax: number) {
  const nextMin = clamp(min, dataMin, dataMax);
  const nextMax = clamp(max, dataMin, dataMax);
  return nextMin <= nextMax
    ? { min: nextMin, max: nextMax }
    : { min: nextMax, max: nextMin };
}

export default function ColorScaleControlDialog({
  open,
  title = "Color scale",
  dataMin,
  dataMax,
  value,
  onChange,
  onClose,
  onApply,
  paletteOptions = defaultPaletteOptions,
}: ColorScaleControlDialogProps) {
  const safeDataMin = Number.isFinite(dataMin) ? dataMin : 0;
  const safeDataMax = Number.isFinite(dataMax) && dataMax > safeDataMin ? dataMax : safeDataMin + 1;
  const rangeStep = Math.max((safeDataMax - safeDataMin) / 200, 0.0001);

  const handleAutoChange = React.useCallback(
    (checked: boolean) => {
      if (checked) {
        onChange({
          ...value,
          auto: true,
          min: safeDataMin,
          max: safeDataMax,
        });
        return;
      }

      const normalized = normalizeRange(value.min, value.max, safeDataMin, safeDataMax);
      onChange({
        ...value,
        auto: false,
        min: normalized.min,
        max: normalized.max,
      });
    },
    [onChange, value, safeDataMin, safeDataMax],
  );

  const handleRangeSliderChange = React.useCallback(
    (_event: Event, nextValue: number | number[]) => {
      if (!Array.isArray(nextValue) || nextValue.length < 2) return;

      const normalized = normalizeRange(
        toNumber(nextValue[0], safeDataMin),
        toNumber(nextValue[1], safeDataMax),
        safeDataMin,
        safeDataMax,
      );

      onChange({
        ...value,
        min: normalized.min,
        max: normalized.max,
      });
    },
    [onChange, value, safeDataMin, safeDataMax],
  );

  const handleMinChange = React.useCallback(
    (nextValue: string) => {
      const normalized = normalizeRange(
        toNumber(nextValue, value.min),
        value.max,
        safeDataMin,
        safeDataMax,
      );

      onChange({
        ...value,
        min: normalized.min,
        max: normalized.max,
      });
    },
    [onChange, value, safeDataMin, safeDataMax],
  );

  const handleMaxChange = React.useCallback(
    (nextValue: string) => {
      const normalized = normalizeRange(
        value.min,
        toNumber(nextValue, value.max),
        safeDataMin,
        safeDataMax,
      );

      onChange({
        ...value,
        min: normalized.min,
        max: normalized.max,
      });
    },
    [onChange, value, safeDataMin, safeDataMax],
  );

  const handlePaletteChange = React.useCallback(
    (paletteId: string) => {
      onChange({
        ...value,
        palette: paletteId,
      });
    },
    [onChange, value],
  );

  const handleReverseChange = React.useCallback(
    (checked: boolean) => {
      onChange({
        ...value,
        reverse: checked,
      });
    },
    [onChange, value],
  );

  const handleReset = React.useCallback(() => {
    onChange({
      auto: true,
      min: safeDataMin,
      max: safeDataMax,
      palette: value.palette || "jet",
      reverse: false,
    });
  }, [onChange, safeDataMin, safeDataMax, value.palette]);

  const handleApply = React.useCallback(() => {
    if (onApply) {
      onApply();
      return;
    }
    onClose();
  }, [onApply, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          ...wizardDialogPaperSx,
          maxHeight: "92vh",
        },
      }}
    >
      <DialogTitle sx={wizardDialogTitleSx}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: "1rem",
              fontWeight: 700,
              color: "inherit",
            }}
          >
            {title}
          </Typography>

          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              color: "#e5e7eb",
              border: "1px solid rgba(255,255,255,0.14)",
              backgroundColor: "rgba(255,255,255,0.06)",
              "&:hover": {
                backgroundColor: "rgba(255,255,255,0.12)",
                borderColor: "rgba(255,255,255,0.22)",
              },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          ...wizardDialogContentSx,
          display: "flex",
          flexDirection: "column",
          gap: 2.25,
        }}
      >
        <Box
          sx={{
            borderRadius: "18px",
            border: "1px solid rgba(15,23,42,0.10)",
            backgroundColor: "#ffffff",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: "1px solid rgba(15,23,42,0.08)",
              backgroundColor: "rgba(248,250,252,0.9)",
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              Preview
            </Typography>

            <Box
              sx={{
                height: 22,
                borderRadius: "999px",
                border: "1px solid rgba(15,23,42,0.12)",
                backgroundImage: getPaletteGradient(value.palette, value.reverse),
              }}
            />

            <Box
              sx={{
                mt: 1,
                display: "flex",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Data min: {roundTo(safeDataMin)}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Data max: {roundTo(safeDataMax)}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 2.25,
            }}
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={value.auto}
                    onChange={(_, checked) => handleAutoChange(checked)}
                  />
                }
                label="Auto range"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={value.reverse}
                    onChange={(_, checked) => handleReverseChange(checked)}
                  />
                }
                label="Reverse palette"
              />
            </Stack>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>
                Range
              </Typography>

              <Slider
                value={[value.min, value.max]}
                min={safeDataMin}
                max={safeDataMax}
                step={rangeStep}
                onChange={handleRangeSliderChange}
                disabled={value.auto}
                sx={{
                  color: "#0b0b8f",
                  "& .MuiSlider-thumb": {
                    width: 16,
                    height: 16,
                    backgroundColor: "#ffffff",
                    border: "1px solid rgba(15,23,42,0.18)",
                  },
                  "& .MuiSlider-track": {
                    border: "none",
                  },
                  "& .MuiSlider-rail": {
                    opacity: 1,
                    backgroundColor: "#d1d5db",
                  },
                }}
              />

              <Box
                sx={{
                  mt: 1.5,
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                  },
                  gap: 1.5,
                }}
              >
                <TextField
                  label="Min"
                  size="small"
                  type="number"
                  value={roundTo(value.min)}
                  disabled={value.auto}
                  onChange={(event) => handleMinChange(event.target.value)}
                  inputProps={{ step: rangeStep }}
                />

                <TextField
                  label="Max"
                  size="small"
                  type="number"
                  value={roundTo(value.max)}
                  disabled={value.auto}
                  onChange={(event) => handleMaxChange(event.target.value)}
                  inputProps={{ step: rangeStep }}
                />
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>
                Palette
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                  },
                  gap: 1,
                }}
              >
                {paletteOptions.map((palette) => {
                  const selected = value.palette === palette.id;

                  return (
                    <Button
                      key={palette.id}
                      variant={selected ? "contained" : "outlined"}
                      onClick={() => handlePaletteChange(palette.id)}
                      sx={{
                        textTransform: "none",
                        justifyContent: "flex-start",
                        borderRadius: "12px",
                        px: 1.25,
                        py: 1,
                        gap: 1.25,
                      }}
                    >
                      <Box
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <Box
                          sx={{
                            width: 84,
                            height: 12,
                            borderRadius: "999px",
                            border: "1px solid rgba(15,23,42,0.12)",
                            backgroundImage: getPaletteGradient(palette.id, value.reverse),
                          }}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            color: selected ? "#ffffff" : "#111827",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {palette.label}
                        </Typography>
                      </Box>
                    </Button>
                  );
                })}
              </Box>
            </Box>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={wizardDialogActionsSx}>
        <Button
          onClick={handleReset}
          variant="outlined"
          sx={{
            textTransform: "none",
            borderRadius: "12px",
            px: 2,
            fontWeight: 600,
          }}
        >
          Reset
        </Button>

        <Button
          onClick={onClose}
          variant="outlined"
          sx={{
            textTransform: "none",
            borderRadius: "12px",
            px: 2,
            fontWeight: 600,
          }}
        >
          Cancel
        </Button>

        <Button
          variant="contained"
          onClick={handleApply}
          sx={{
            textTransform: "none",
            borderRadius: "12px",
            px: 2.25,
            fontWeight: 700,
          }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}