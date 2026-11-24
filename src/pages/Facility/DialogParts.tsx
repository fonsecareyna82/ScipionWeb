// The parts of the facility's long dialogs (a session, a booking, a resource): a titled box per part, and on/off
// options with what they do beside their switch.
import { useId, type ReactNode } from "react";
import { Box, Button, Dialog, IconButton, Stack, Switch, Tooltip, Typography } from "@mui/material";
import { X } from "lucide-react";

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

/** A dialog to look at something, not to change it: the dark header with its X, what it shows, and Close. */
export function ViewDialog({ icon, title, subtitle, onClose, maxWidth = "md", container, footer, children }: {
    // Something to do besides closing (copy what it shows…), at the left of its foot
    footer?: ReactNode;
    // Where it opens: a page's own layer (the project page, also in full screen); the document body otherwise
    container?: HTMLElement | null;
    icon: ReactNode;
    title: string;
    subtitle?: string;
    onClose: () => void;
    maxWidth?: "sm" | "md" | "lg";
    children: ReactNode;
}) {
    const titleId = `view-dialog-title-${useId()}`;
    return (
        <Dialog open onClose={onClose} maxWidth={maxWidth} fullWidth aria-labelledby={titleId} container={container ?? undefined}
                PaperProps={{ sx: { borderRadius: 3, overflow: "hidden", boxShadow: 12, display: "flex", flexDirection: "column",
                                    maxHeight: "calc(100% - 48px)" } }}>
            <Box sx={{ bgcolor: "#333d49", color: "white", px: 2, py: 1.75, flexShrink: 0 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                               borderRadius: 2, bgcolor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
                        {icon}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography id={titleId} sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, wordBreak: "break-all" }}>
                            {title}
                        </Typography>
                        {subtitle && <Typography sx={{ fontSize: 14, color: "rgb(229,231,235)" }}>{subtitle}</Typography>}
                    </Box>
                    <Tooltip arrow title="Close">
                        <IconButton aria-label="Close" onClick={onClose}
                                    sx={{ color: "rgb(229,231,235)", "&:hover": { bgcolor: "rgba(255,255,255,0.1)" } }}>
                            <X size={20} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>
            <Box sx={{ px: 2.5, py: 2.5, flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
                <Stack spacing={2}>{children}</Stack>
            </Box>
            <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1}
                   sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
                {footer && <Box sx={{ mr: "auto" }}>{footer}</Box>}
                <Button variant="outlined" sx={{ textTransform: "none", borderRadius: 3 }} onClick={onClose}>Close</Button>
            </Stack>
        </Dialog>
    );
}

/** Facts in a grid: each with its icon, its name small and its value under it. */
export function FactGrid({ facts, colors, columns = 2 }: {
    facts: [ReactNode, string, ReactNode][];
    colors: { muted: string; text: string };
    columns?: 2 | 3;
}) {
    const shown = facts.filter(([, , value]) => value !== null && value !== undefined && value !== "");
    if (!shown.length) return null;
    return (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: `repeat(${columns}, 1fr)` },
                   columnGap: 2.5, rowGap: 1.5 }}>
            {shown.map(([icon, label, value]) => (
                <Stack key={label} direction="row" spacing={1} alignItems="flex-start" sx={{ minWidth: 0 }}>
                    <Box sx={{ color: colors.muted, mt: 0.25, flexShrink: 0, display: "flex" }}>{icon}</Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, lineHeight: 1.3 }}>{label}</Typography>
                        <Typography component="div" sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, wordBreak: "break-word" }}>
                            {value}
                        </Typography>
                    </Box>
                </Stack>
            ))}
        </Box>
    );
}
