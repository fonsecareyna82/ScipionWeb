// The parts of the facility's long dialogs (a session, a booking, a resource): a titled box per part, and on/off
// options with what they do beside their switch.
import type { ReactNode } from "react";
import { Box, Stack, Switch, Typography } from "@mui/material";

import { FACILITY_TEXT } from "./facilityStyles";

type PartColors = { border: string; text: string; muted: string };

/** A part of a facility dialog: an icon, its title and one line, and its fields under them. */
export function DialogPart({ icon, title, subtitle, action, tint, colors, children }: {
    icon: ReactNode;
    title: string;
    subtitle?: string;
    action?: ReactNode;
    tint: string;
    colors: PartColors;
    children?: ReactNode;
}) {
    return (
        <Box component="section" aria-label={title} sx={{ border: `1px solid ${colors.border}`, borderRadius: 2.5, p: 2 }}>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: children ? 2 : 0 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 1.75, flexShrink: 0, display: "grid", placeItems: "center",
                           bgcolor: tint, color: "primary.main" }}>
                    {icon}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle + 0.5, fontWeight: 800, color: colors.text, lineHeight: 1.3 }}>
                        {title}
                    </Typography>
                    {subtitle && (
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, lineHeight: 1.4 }}>{subtitle}</Typography>
                    )}
                </Box>
                {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
            </Stack>
            {children && <Stack spacing={2}>{children}</Stack>}
        </Box>
    );
}

/** An on/off option: what it does on the left, its switch on the right. */
export function OptionRow({ title, description, checked, onChange, colors }: {
    title: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    colors: PartColors;
}) {
    return (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ py: 1.25, "& + &": { borderTop: `1px solid ${colors.border}` } }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text }}>{title}</Typography>
                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>{description}</Typography>
            </Box>
            <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} slotProps={{ input: { "aria-label": title } }} />
        </Stack>
    );
}
