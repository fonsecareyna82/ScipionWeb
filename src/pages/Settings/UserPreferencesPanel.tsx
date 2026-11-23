import React, { useEffect, useState } from "react";
import { Box, Button, MenuItem, Select, Stack, Switch, ToggleButton, ToggleButtonGroup } from "@mui/material";
import {
  Clock, Focus, Image, LayoutGrid, Map as MapIcon, Monitor, Moon, Palette, RefreshCw, Rows3, Rows4, Sun, Table,
  Workflow,
} from "lucide-react";

import { TreeIcon } from "@/icons";
import type { UserSettings } from "@/services/ProjectService";
import { choiceButtonsSx, SETTINGS_TEXT, settingLabelId, SettingRow, SettingsSection } from "./SettingsSection";

type Colors = {
  border: string; text: string; muted: string; card: string; hover: string; menu: string; primary: string;
};

type Props = {
  value: UserSettings;
  onChange: (update: (prev: UserSettings) => UserSettings) => void;
  timeZoneOptions: string[];
  colors: Colors;
  isDarkMode: boolean;
  fieldSx: object;
  menuPaperSx: object;
};

const TEXT = SETTINGS_TEXT.text;
const CONTROL = SETTINGS_TEXT.control;

const TEXT_SIZES: { value: number; label: string; glyph: number }[] = [
  { value: 0.9, label: "Small", glyph: 12 },
  { value: 1, label: "Default", glyph: 14 },
  { value: 1.1, label: "Large", glyph: 16 },
  { value: 1.25, label: "Larger", glyph: 18 },
];

const REFRESH_INTERVALS = [5, 10, 15, 30, 60, 120, 300];

function intervalLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} seconds` : seconds === 60 ? "1 minute" : `${seconds / 60} minutes`;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function nowIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    }).format(new Date());
  } catch {
    return "";
  }
}

/** The preferences of the signed-in user: how the app looks, its dates, and how workflows are shown. */
export default function UserPreferencesPanel({
  value, onChange, timeZoneOptions, colors, isDarkMode, fieldSx, menuPaperSx,
}: Props) {
  const set = <K extends keyof UserSettings>(key: K, next: UserSettings[K]) =>
    onChange((prev) => ({ ...prev, [key]: next }));

  // The clock of the chosen zone, kept current while the page is open
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const choiceSx = choiceButtonsSx(colors, isDarkMode);

  const section = (icon: React.ReactNode, title: string, subtitle: string, rows: React.ReactNode[]) => (
    <SettingsSection icon={icon} title={title} subtitle={subtitle} colors={colors} isDarkMode={isDarkMode}>
      {rows}
    </SettingsSection>
  );

  const row = (title: string, description: React.ReactNode, control: React.ReactNode, labelFor?: string) => (
    <SettingRow title={title} description={description} control={control} labelFor={labelFor} colors={colors} />
  );

  const toggle = (id: string, checked: boolean, onToggle: (next: boolean) => void) => (
    <Switch id={id} checked={checked} onChange={(e) => onToggle(e.target.checked)} />
  );

  const browserZone = browserTimeZone();
  const refreshOn = value.workflowsAutoRefreshSec > 0;
  const intervals = refreshOn && !REFRESH_INTERVALS.includes(value.workflowsAutoRefreshSec)
    ? [...REFRESH_INTERVALS, value.workflowsAutoRefreshSec].sort((a, b) => a - b)
    : REFRESH_INTERVALS;

  return (
    <Stack spacing={2}>
      {section(<Palette size={19} />, "Appearance", "How ScipionWeb looks on this account.", [
        row("Theme", "Light, dark, or the same as your operating system.",
          <ToggleButtonGroup exclusive value={value.theme} aria-label="Theme" sx={choiceSx}
                             onChange={(_, next) => next && set("theme", next)}>
            <ToggleButton value="light"><Sun size={17} />Light</ToggleButton>
            <ToggleButton value="dark"><Moon size={17} />Dark</ToggleButton>
            <ToggleButton value="system"><Monitor size={17} />System</ToggleButton>
          </ToggleButtonGroup>),
        row("Text size", "Makes the text of the whole app smaller or bigger.",
          <ToggleButtonGroup exclusive value={value.fontScale} aria-label="Text size" sx={choiceSx}
                             onChange={(_, next) => next && set("fontScale", next)}>
            {TEXT_SIZES.map((size) => (
              <ToggleButton key={size.value} value={size.value} aria-label={size.label}>
                <Box component="span" sx={{ fontSize: size.glyph, fontWeight: 800, lineHeight: 1 }}>A</Box>
                {size.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>),
        row("Density", "Compact fits more on screen with less space between rows.",
          <ToggleButtonGroup exclusive value={value.uiDensity} aria-label="Density" sx={choiceSx}
                             onChange={(_, next) => next && set("uiDensity", next)}>
            <ToggleButton value="comfortable"><Rows3 size={17} />Comfortable</ToggleButton>
            <ToggleButton value="compact"><Rows4 size={17} />Compact</ToggleButton>
          </ToggleButtonGroup>),
      ])}

      {section(<Clock size={19} />, "Date and time", "The time zone dates and times are shown in. By default, the one of the computer you are using.", [
        row("Time zone",
          <>
            Now: <b style={{ color: colors.text, fontWeight: 600 }}>{nowIn(value.timeZone || browserZone)}</b>
            {value.timeZone && (
              <Button size="small" onClick={() => set("timeZone", "")}
                      sx={{ ml: 1, textTransform: "none", fontSize: TEXT, py: 0, minWidth: 0 }}>
                Use this computer's ({browserZone})
              </Button>
            )}
          </>,
          <Select
            id="settings-time-zone"
            labelId={settingLabelId("settings-time-zone")}
            size="small"
            value={value.timeZone}
            displayEmpty
            renderValue={(zone) => (zone ? String(zone) : `This computer's (${browserZone})`)}
            onChange={(e) => set("timeZone", String(e.target.value))}
            MenuProps={{ PaperProps: { sx: { ...menuPaperSx, maxHeight: 360 } } }}
            sx={{ ...fieldSx, width: { xs: "100%", md: 320 }, "& .MuiSelect-select": { fontSize: CONTROL, color: colors.text } }}
          >
            {timeZoneOptions.map((zone) => (
              <MenuItem key={zone || "computer"} value={zone} sx={{ fontSize: CONTROL }}>
                {zone || `This computer's (${browserZone})`}
              </MenuItem>
            ))}
          </Select>,
          "settings-time-zone"),
      ])}

      {section(<Workflow size={19} />, "Workflow viewer", "How a project's workflow opens and stays up to date.", [
        row("Default view", "The layout a project opens with. You can switch it at any time inside the project.",
          <ToggleButtonGroup exclusive value={value.workflowViewMode} aria-label="Default view" sx={choiceSx}
                             onChange={(_, next) => next && set("workflowViewMode", next)}>
            <ToggleButton value="treeTb"><TreeIcon className="w-4 h-4" />Tree TB</ToggleButton>
            <ToggleButton value="treeLr">
              <span className="inline-flex -rotate-90"><TreeIcon className="w-4 h-4" /></span>Tree LR
            </ToggleButton>
            <ToggleButton value="grid"><LayoutGrid size={16} />Grid</ToggleButton>
            <ToggleButton value="table"><Table size={16} />Table</ToggleButton>
          </ToggleButtonGroup>),
        row("Mini map",
          <Stack direction="row" spacing={0.75} alignItems="center" component="span">
            <MapIcon size={14} /><span>Shows a small overview of the whole workflow in a corner.</span>
          </Stack>,
          toggle("settings-minimap", Boolean(value.graphMiniMapEnabled), (next) => set("graphMiniMapEnabled", next)),
          "settings-minimap"),
        row("Focus mode",
          <Stack direction="row" spacing={0.75} alignItems="center" component="span">
            <Focus size={14} /><span>Fades the protocols that are not connected to the selected one.</span>
          </Stack>,
          toggle("settings-focus", Boolean(value.graphFocusModeEnabled), (next) => set("graphFocusModeEnabled", next)),
          "settings-focus"),
        row("Protocol thumbnails",
          <Stack direction="row" spacing={0.75} alignItems="center" component="span">
            <Image size={14} /><span>Shows a small image of each protocol's output on its card.</span>
          </Stack>,
          toggle("settings-thumbnails", Boolean(value.protocolOutputThumbnailsEnabled),
            (next) => set("protocolOutputThumbnailsEnabled", next)),
          "settings-thumbnails"),
        row("Auto-refresh",
          <Stack direction="row" spacing={0.75} alignItems="center" component="span">
            <RefreshCw size={14} />
            <span>Reloads the state of the protocols on its own. Short intervals put more load on the server.</span>
          </Stack>,
          <Stack direction="row" spacing={1.5} alignItems="center">
            {refreshOn && (
              <Select
                size="small"
                value={value.workflowsAutoRefreshSec}
                aria-label="Refresh every"
                onChange={(e) => set("workflowsAutoRefreshSec", Number(e.target.value))}
                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                renderValue={(seconds) => `Every ${intervalLabel(Number(seconds))}`}
                sx={{ ...fieldSx, minWidth: 190, "& .MuiSelect-select": { fontSize: CONTROL, color: colors.text } }}
              >
                {intervals.map((seconds) => (
                  <MenuItem key={seconds} value={seconds} sx={{ fontSize: CONTROL }}>
                    {intervalLabel(seconds)}
                  </MenuItem>
                ))}
              </Select>
            )}
            {toggle("settings-refresh", refreshOn,
              (next) => set("workflowsAutoRefreshSec", next ? (value.workflowsAutoRefreshSec || 5) : 0))}
          </Stack>,
          "settings-refresh"),
      ])}
    </Stack>
  );
}
