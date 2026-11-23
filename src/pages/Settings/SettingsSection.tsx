// The building blocks of the Settings tabs: a section card with its icon, title and one line, and the rows of
// settings inside it (name and a plain sentence on the left, the control on the right).
import React from "react";
import { Box, Card, Divider, Stack, Typography } from "@mui/material";

export const SETTINGS_TEXT = { title: 15, text: 13.5, control: 14, sectionTitle: 16.5 } as const;

export type SectionColors = { border: string; text: string; muted: string; card: string; primary: string };

export function sectionTint(isDarkMode: boolean): string {
  return isDarkMode ? "rgba(96,165,250,0.14)" : "rgba(37,99,235,0.08)";
}

/** Toggle buttons used as a choice between a few options (an icon and a word each). */
export function choiceButtonsSx(colors: SectionColors & { hover: string }, isDarkMode: boolean) {
  const tint = sectionTint(isDarkMode);
  return {
    flexWrap: "wrap",
    gap: 1,
    "& .MuiToggleButtonGroup-grouped": {
      m: 0,
      border: "1px solid",
      borderColor: colors.border,
      borderRadius: "10px !important",
      px: 1.75,
      py: 0.9,
      gap: 1,
      textTransform: "none",
      fontSize: SETTINGS_TEXT.control,
      fontWeight: 600,
      color: colors.muted,
      bgcolor: "transparent",
      "&:hover": { bgcolor: colors.hover },
      "&.Mui-selected": {
        color: colors.text,
        bgcolor: tint,
        borderColor: colors.primary,
        "&:hover": { bgcolor: tint },
      },
    },
  } as const;
}

export function SectionHeader({
  icon, title, subtitle, actions, colors, isDarkMode,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  colors: Pick<SectionColors, "text" | "muted" | "primary">;
  isDarkMode: boolean;
}) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2.5, pt: 2.25, pb: 1.25 }}>
      <Box
        sx={{
          width: 36, height: 36, borderRadius: 2, flexShrink: 0, display: "grid", placeItems: "center",
          bgcolor: sectionTint(isDarkMode), color: colors.primary,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography component="h3" sx={{ fontSize: SETTINGS_TEXT.sectionTitle, fontWeight: 800, color: colors.text,
                                          lineHeight: 1.3 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography component="div" sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, lineHeight: 1.4 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
    </Stack>
  );
}

/** A section card. Its children are rows (separated by lines) unless `plain`, then they are shown as they come. */
export function SettingsSection({
  icon, title, subtitle, actions, colors, isDarkMode, plain, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  colors: SectionColors;
  isDarkMode: boolean;
  plain?: boolean;
  children: React.ReactNode;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, bgcolor: colors.card, borderColor: colors.border }}>
      <SectionHeader icon={icon} title={title} subtitle={subtitle} actions={actions} colors={colors}
                     isDarkMode={isDarkMode} />
      <Box sx={{ px: 2.5, pb: plain ? 2.5 : 0, pt: plain ? 1 : 0 }}>
        {plain
          ? children
          : rows.map((row, index) => (
            <React.Fragment key={index}>
              {index > 0 && <Divider sx={{ borderColor: colors.border }} />}
              {row}
            </React.Fragment>
          ))}
      </Box>
    </Card>
  );
}

export const settingLabelId = (controlId: string) => `${controlId}-label`;

/** One setting: its name and what it does on the left, its control on the right (below it on narrow screens). */
export function SettingRow({
  title, description, control, labelFor, colors,
}: {
  title: string;
  description?: React.ReactNode;
  control: React.ReactNode;
  labelFor?: string;
  colors: SectionColors;
}) {
  return (
    <Box
      sx={{
        display: "flex", alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between",
        flexDirection: { xs: "column", md: "row" }, gap: { xs: 1.25, md: 3 }, py: 2,
      }}
    >
      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Typography
          component={labelFor ? "label" : "div"}
          htmlFor={labelFor}
          // A select names itself with aria-labelledby: give it this id (settingLabelId)
          id={labelFor ? settingLabelId(labelFor) : undefined}
          sx={{ display: "block", fontSize: SETTINGS_TEXT.title, fontWeight: 700, color: colors.text }}
        >
          {title}
        </Typography>
        {description && (
          <Typography component="div" sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, mt: 0.25,
                                             lineHeight: 1.45 }}>
            {description}
          </Typography>
        )}
      </Box>
      <Box sx={{ flexShrink: 0, maxWidth: "100%" }}>{control}</Box>
    </Box>
  );
}
