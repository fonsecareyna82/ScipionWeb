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
            <PoliciesCard answer={answer} onSaved={setAnswer} fieldSx={fieldSx} cardSx={cardSx}
                          cardHeaderSx={cardHeaderSx} colors={colors} saveButtonSx={saveSx} />
            <UsersSettingsCard answer={answer} onSaved={setAnswer} fieldSx={fieldSx} cardSx={cardSx}
                               cardHeaderSx={cardHeaderSx} colors={colors} saveButtonSx={saveSx} />
            <MailSettingsCard fieldSx={fieldSx} cardSx={cardSx} cardHeaderSx={cardHeaderSx} colors={colors}
                              actionButtonSx={actionSx} saveButtonSx={saveSx} />
        </Stack>
    );
}

/** How the facility works, where facilities differ: the CNB's way by default. */
function PoliciesCard({ answer, onSaved, fieldSx, cardSx, cardHeaderSx, colors, saveButtonSx }: PanelStyles & {
    answer: FacilitySettingsAnswer;
    onSaved: (answer: FacilitySettingsAnswer) => void;
}) {
    const current = answer.settings;
    const [owner, setOwner] = useState(current.projectOwner ?? "staff");
    const [share, setShare] = useState(current.projectShareLevel ?? "view");
    const [tolerance, setTolerance] = useState(String(current.calibrationTolerancePercent ?? 10));
    const [stall, setStall] = useState(String(current.stallMinutes ?? 20));
    const [watch, setWatch] = useState(String(current.watchSeconds ?? 30));
    const [minDefocus, setMinDefocus] = useState(String(current.ctfMinDefocus ?? 5000));
    const [maxDefocus, setMaxDefocus] = useState(String(current.ctfMaxDefocus ?? 40000));
    const [resolution, setResolution] = useState(String(current.ctfMaxResolution ?? 8));
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            onSaved(await saveFacilitySettings({
                projectOwner: owner, projectShareLevel: share, calibrationTolerancePercent: Number(tolerance),
                stallMinutes: Number(stall), watchSeconds: Number(watch), ctfMinDefocus: Number(minDefocus),
                ctfMaxDefocus: Number(maxDefocus), ctfMaxResolution: Number(resolution),
            }));
            toast.success("Policies saved: they apply from the watcher's next look.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the policies"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card variant="outlined" sx={cardSx}>
            <CardHeader
                title="Policies"
                subheader="How the facility works where facilities differ. The defaults are the CNB's: the staff own the processing, and its users only look."
                sx={cardHeaderSx}
            />
            <CardContent sx={{ pt: 2 }}>
                <Stack spacing={1.5}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth select label="Owner of a DATA's project" value={owner}
                                   helperText={owner === "staff" ? "The staff who made the session; its user and group see it"
                                       : "The session's user; the staff who made it manage it"}
                                   onChange={(e) => setOwner(e.target.value as typeof owner)}>
                            <MenuItem value="staff">The facility's staff</MenuItem>
                            <MenuItem value="user">The session's user</MenuItem>
                        </TextField>
                        <TextField sx={fieldSx} size="small" fullWidth select label="The user and group may" value={share}
                                   helperText="On the project, when they do not own it"
                                   onChange={(e) => setShare(e.target.value as typeof share)}>
                            <MenuItem value="view">Look at it (read only)</MenuItem>
                            <MenuItem value="work">Work in it</MenuItem>
                        </TextField>
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth label="Calibration tolerance (%)" value={tolerance}
                                   inputProps={{ inputMode: "decimal" }}
                                   helperText="A detector's calibrated pixel further than this from EPU's is not used"
                                   onChange={(e) => setTolerance(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Stalled after (minutes)" value={stall}
                                   inputProps={{ inputMode: "numeric" }}
                                   helperText="A DATA acquiring without a new movie for this long raises an alert"
                                   onChange={(e) => setStall(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Look at the folders every (s)" value={watch}
                                   inputProps={{ inputMode: "numeric" }} helperText="Slower network mounts may want more"
                                   onChange={(e) => setWatch(e.target.value)} />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth label="CTF: minimum defocus (Å)" value={minDefocus}
                                   inputProps={{ inputMode: "decimal" }} onChange={(e) => setMinDefocus(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="CTF: maximum defocus (Å)" value={maxDefocus}
                                   inputProps={{ inputMode: "decimal" }} onChange={(e) => setMaxDefocus(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="CTF: resolution better than (Å)" value={resolution}
                                   inputProps={{ inputMode: "decimal" }} helperText="The limits a new session starts with"
                                   onChange={(e) => setResolution(e.target.value)} />
                    </Stack>
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button size="small" variant="contained" sx={saveButtonSx} startIcon={<Save size={14} />}
                                disabled={saving} onClick={() => void save()}>
                            {saving ? "Saving…" : "Save the policies"}
                        </Button>
                    </Box>
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                        The owner and the sharing apply to the projects made from now on; the others at once.
                    </Typography>
                </Stack>
            </CardContent>
        </Card>
    );
}

/** What the facility tells its users in My sessions: how long it keeps their data, and how to take them home. */
function UsersSettingsCard({ answer, onSaved, fieldSx, cardSx, cardHeaderSx, colors, saveButtonSx }: PanelStyles & {
    answer: FacilitySettingsAnswer;
    onSaved: (answer: FacilitySettingsAnswer) => void;
}) {
    const [raw, setRaw] = useState(String(answer.settings.rawRetentionDays ?? 0));
    const [processed, setProcessed] = useState(String(answer.settings.processedRetentionDays ?? 0));
    const [instructions, setInstructions] = useState(answer.settings.downloadInstructions ?? "");
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            const saved = await saveFacilitySettings({
                rawRetentionDays: Number(raw) || 0, processedRetentionDays: Number(processed) || 0,
                downloadInstructions: instructions.trim(),
            });
            onSaved(saved);
            toast.success("Saved: the users see it in My sessions.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the settings"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card variant="outlined" sx={cardSx}>
            <CardHeader
                title="For the users"
                subheader="What every user sees in My sessions: how long the facility keeps their data once a session finished, and how to take it home."
                sx={cardHeaderSx}
            />
            <CardContent sx={{ pt: 2 }}>
                <Stack spacing={1.5}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth label="Raw data kept (days)" value={raw}
                                   inputProps={{ inputMode: "numeric" }} helperText="0: not said"
                                   onChange={(e) => setRaw(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth label="Processed data kept (days)" value={processed}
                                   inputProps={{ inputMode: "numeric" }} helperText="0: not said"
                                   onChange={(e) => setProcessed(e.target.value)} />
                    </Stack>
                    <TextField sx={fieldSx} size="small" label="Taking the data home" value={instructions} multiline minRows={4}
                               placeholder="How to download the data: the iRODS ticket, rsync, a disk…"
                               onChange={(e) => setInstructions(e.target.value)} />
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button size="small" variant="contained" sx={saveButtonSx} startIcon={<Save size={14} />}
                                disabled={saving} onClick={() => void save()}>
                            {saving ? "Saving…" : "Save for the users"}
                        </Button>
                    </Box>
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                        Instruct sessions and other access routes may keep data longer; one length for all, for now.
                    </Typography>
                </Stack>
            </CardContent>
        </Card>
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
