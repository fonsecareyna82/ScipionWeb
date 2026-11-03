import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CardHeader, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { RotateCcw, Save, Wand2 } from "lucide-react";
import toast from "react-hot-toast";

import { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { getFacilitySettings, saveFacilitySettings, type FacilitySettingsAnswer } from "@/api/facility";
import { FACILITY_TEXT } from "./facilityStyles";
import { useConventionsPreview } from "./useConventionsPreview";

type PanelStyles = {
    fieldSx: any;
    cardSx: any;
    cardHeaderSx: any;
    actionButtonSx?: any;
    saveButtonSx?: any;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

// The pieces of a session's name, as the API takes them (facility_conventions)
const NAME_PIECES: [string, string][] = [
    ["{date:%Y_%m_%d}", "the session's day, in any strftime form ({date:%Y%m%d}, {date:%y%m%d}…)"],
    ["{user}", "its user, as Name-Surname"],
    ["{pi}", "the PI of its group"],
    ["{group}", "its group"],
    ["{microscope}", "the microscope's code"],
    ["{booking}", "its booking reference"],
    ["{technique}", "spa or tomo"],
    ["{id:06d}", "its number, with as many digits as wanted"],
];

/** The facility's own conventions: how it names its sessions (each microscope names its folders). */
export default function ConfigurationPanel({ fieldSx, cardSx, cardHeaderSx, colors, actionButtonSx, saveButtonSx }: PanelStyles) {
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
    const [answer, setAnswer] = useState<FacilitySettingsAnswer | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pattern, setPattern] = useState("");
    const [saving, setSaving] = useState(false);
    const preview = useConventionsPreview({ sessionNamePattern: pattern });

    const load = useCallback(async () => {
        setError(null);
        try {
            const loaded = await getFacilitySettings();
            setAnswer(loaded);
            setPattern(loaded.settings.sessionNamePattern);
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the facility's settings"));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const save = async () => {
        setSaving(true);
        try {
            const saved = await saveFacilitySettings({ sessionNamePattern: pattern.trim() });
            setAnswer(saved);
            setPattern(saved.settings.sessionNamePattern);
            toast.success("Settings saved: new sessions are named this way.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the settings"));
        } finally {
            setSaving(false);
        }
    };

    if (error) return <Alert severity="error">{error}</Alert>;
    if (!answer) return <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>;
    const changed = pattern.trim() !== answer.settings.sessionNamePattern;

    return (
        <Stack spacing={1.75}>
            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="Facility conventions"
                    subheader="How this facility names its sessions. Each microscope names its DATA and ATLAS folders (Microscopes tab). A session keeps the name and folders it was given."
                    sx={cardHeaderSx}
                />
                <CardContent sx={{ pt: 2 }}>
                    <Stack spacing={1.5}>
                        <TextField sx={fieldSx} size="small" label="Session name" value={pattern}
                                   inputProps={{ style: { fontFamily: "monospace" } }}
                                   onChange={(e) => setPattern(e.target.value)} />
                        {preview.error
                            ? <Alert severity="warning">{preview.error}</Alert>
                            : preview.examples && (
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                                    A session of Gaoxin Lu (group Shannon lab, PI Ashleigh Shannon) on the KRIOS, number 123:{" "}
                                    <Box component="span" sx={{ fontFamily: "monospace", color: colors.text, fontWeight: 700 }}>
                                        {preview.examples.session}
                                    </Box>
                                </Typography>
                            )}
                        <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.25 }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, fontWeight: 700, mb: 0.5 }}>Pieces</Typography>
                            <Stack spacing={0.25}>
                                {NAME_PIECES.map(([piece, meaning]) => (
                                    <Typography key={piece} sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                        <Box component="span" sx={{ fontFamily: "monospace", color: colors.text }}>{piece}</Box> {meaning}
                                    </Typography>
                                ))}
                            </Stack>
                        </Box>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                            {answer.presets.map((preset) => (
                                <Button key={preset.id} size="small" variant="outlined" sx={actionSx} startIcon={<Wand2 size={14} />}
                                        disabled={!preset.settings.sessionNamePattern}
                                        onClick={() => setPattern(preset.settings.sessionNamePattern ?? pattern)}>
                                    {preset.label}
                                </Button>
                            ))}
                            <Button size="small" variant="outlined" sx={actionSx} startIcon={<RotateCcw size={14} />}
                                    onClick={() => setPattern(answer.defaults.sessionNamePattern)}>
                                Neutral default
                            </Button>
                            <Box sx={{ flex: 1 }} />
                            <Button size="small" variant="contained" sx={saveSx} startIcon={<Save size={14} />}
                                    disabled={saving || !changed || !!preview.error || !pattern.trim()} onClick={() => void save()}>
                                {saving ? "Saving…" : "Save"}
                            </Button>
                        </Stack>
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, opacity: 0.75 }}>
                            A preset fills the pattern; nothing changes until Save. Its microscopes' folders ({answer.presets
                                .map((preset) => `${preset.microscope.dataFolderPattern}, ${preset.microscope.atlasFolderPattern}, ${preset.microscope.gridSlots} grids`)
                                .join("; ")}) are set on each microscope.
                        </Typography>
                    </Stack>
                </CardContent>
            </Card>
        </Stack>
    );
}
