import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CardHeader, CircularProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { Mail, RotateCcw, Save, Send, Wand2 } from "lucide-react";
import toast from "react-hot-toast";

import { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import {
    getFacilityMailSettings,
    getFacilitySettings,
    saveFacilityMailSettings,
    saveFacilitySettings,
    sendFacilityTestMail,
    type FacilityMailSettings,
    type FacilitySettingsAnswer,
    type MailSecurity,
} from "@/api/facility";
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
            <MailSettingsCard fieldSx={fieldSx} cardSx={cardSx} cardHeaderSx={cardHeaderSx} colors={colors}
                              actionButtonSx={actionSx} saveButtonSx={saveSx} />
        </Stack>
    );
}

const SECURITY_LABELS: Record<MailSecurity, string> = {
    starttls: "STARTTLS (usually port 587)",
    ssl: "SSL/TLS (usually port 465)",
    none: "None (usually port 25)",
};

/** The mail server that tells the operators of the alerts: off until a server is set. */
function MailSettingsCard({ fieldSx, cardSx, cardHeaderSx, colors, actionButtonSx, saveButtonSx }: PanelStyles) {
    const [settings, setSettings] = useState<FacilityMailSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState({ host: "", port: "587", security: "starttls" as MailSecurity, user: "",
                                         sender: "", recipients: "" });
    // Empty: the password there is stays; removePassword takes it away
    const [password, setPassword] = useState("");
    const [removePassword, setRemovePassword] = useState(false);
    const [testTo, setTestTo] = useState("");
    const [busy, setBusy] = useState(false);

    const adopt = (loaded: FacilityMailSettings) => {
        setSettings(loaded);
        setDraft({ host: loaded.host, port: String(loaded.port || 587), security: loaded.security, user: loaded.user,
                   sender: loaded.sender, recipients: loaded.recipients });
        setPassword("");
        setRemovePassword(false);
    };

    useEffect(() => {
        getFacilityMailSettings().then(adopt).catch((e: any) => setError(String(e?.message || "Failed to load the mail settings")));
    }, []);

    const set = (change: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...change }));

    const save = async () => {
        setBusy(true);
        try {
            adopt(await saveFacilityMailSettings({
                host: draft.host.trim(), port: Number(draft.port) || 0, security: draft.security, user: draft.user.trim(),
                sender: draft.sender.trim(), recipients: draft.recipients.trim(),
                ...(removePassword ? { password: "" } : password ? { password } : {}),
            }));
            toast.success("Mail settings saved.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the mail settings"));
        } finally {
            setBusy(false);
        }
    };

    const test = async () => {
        setBusy(true);
        try {
            const { sentTo } = await sendFacilityTestMail(testTo.trim());
            toast.success(`Test mail sent to ${sentTo.join(", ")}.`);
        } catch (e: any) {
            toast.error(String(e?.message || "The test mail did not go"));
        } finally {
            setBusy(false);
        }
    };

    if (error) return <Alert severity="error">{error}</Alert>;
    if (!settings) return null;

    return (
        <Card variant="outlined" sx={cardSx}>
            <CardHeader
                title="Alert mail"
                subheader="When a DATA stops receiving movies, or its processing or a protocol of its project fails, the operators get a mail at once (one for the alerts of each moment), besides the red banner of the web."
                sx={cardHeaderSx}
            />
            <CardContent sx={{ pt: 2 }}>
                <Stack spacing={1.5}>
                    {!settings.enabled && (
                        <Alert severity="info">No mail server yet: the alerts are only shown in the web.</Alert>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={{ ...fieldSx, flex: 2 }} size="small" label="Mail server" value={draft.host}
                                   placeholder="smtp.example.org" onChange={(e) => set({ host: e.target.value })} />
                        <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Port" value={draft.port}
                                   inputProps={{ inputMode: "numeric" }} onChange={(e) => set({ port: e.target.value })} />
                        <TextField sx={{ ...fieldSx, flex: 2 }} size="small" select label="Connection" value={draft.security}
                                   onChange={(e) => set({ security: e.target.value as MailSecurity })}>
                            {(Object.keys(SECURITY_LABELS) as MailSecurity[]).map((value) => (
                                <MenuItem key={value} value={value}>{SECURITY_LABELS[value]}</MenuItem>
                            ))}
                        </TextField>
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth label="User" value={draft.user}
                                   helperText="Empty: the server takes mail without signing in"
                                   onChange={(e) => set({ user: e.target.value })} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Password" type="password" value={password}
                                   autoComplete="new-password" disabled={removePassword}
                                   helperText={settings.passwordSet ? "Set: leave it empty to keep it" : "None set"}
                                   onChange={(e) => setPassword(e.target.value)} />
                    </Stack>
                    {settings.passwordSet && (
                        <Box>
                            <Button size="small" variant="text" sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note }}
                                    onClick={() => setRemovePassword((value) => !value)}>
                                {removePassword ? "Keep the password" : "Remove the password"}
                            </Button>
                        </Box>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth label="Sender" value={draft.sender}
                                   placeholder="facility@example.org" onChange={(e) => set({ sender: e.target.value })} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Recipients" value={draft.recipients}
                                   placeholder="ops1@example.org, ops2@example.org"
                                   helperText="Empty: every user who runs sessions (facility.sessions)"
                                   onChange={(e) => set({ recipients: e.target.value })} />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                        <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Send a test to" value={testTo}
                                   placeholder="Empty: the recipients" onChange={(e) => setTestTo(e.target.value)} />
                        <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Send size={14} />}
                                disabled={busy || !settings.enabled} onClick={() => void test()}>
                            Send test mail
                        </Button>
                        <Button size="small" variant="contained" sx={saveButtonSx} startIcon={<Mail size={14} />}
                                disabled={busy} onClick={() => void save()}>
                            {busy ? "Saving…" : "Save mail settings"}
                        </Button>
                    </Stack>
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                        The test uses the saved settings: save them first. The password is kept encrypted and never shown.
                    </Typography>
                </Stack>
            </CardContent>
        </Card>
    );
}
