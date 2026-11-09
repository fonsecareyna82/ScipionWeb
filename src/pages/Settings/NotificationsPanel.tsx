import { useCallback, useEffect, useState } from "react";
import {
    Alert, Box, Button, Card, CardContent, CardHeader, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography,
} from "@mui/material";
import { Mail, RefreshCw, Send } from "lucide-react";
import toast from "react-hot-toast";

import {
    getMailSettings, getMyNotificationPreferences, getNotificationDefaults, listOutbox, saveMailSettings,
    saveMyNotificationPreferences, saveNotificationDefaults, sendTestMail,
    type MailSecurity, type MailSettings, type NotificationChannel, type NotificationKindPreference,
    type NotificationPreferences, type OutboxMail,
} from "@/api/notifications";
import { FACILITY_TEXT, useFacilityStyles } from "@/pages/Facility/facilityStyles";

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
    instant: "By mail at once",
    digest: "In one mail a day",
    web: "Only in the web",
    off: "Not at all",
};

const SECURITY_LABELS: Record<MailSecurity, string> = {
    starttls: "STARTTLS (usually port 587)",
    ssl: "SSL/TLS (usually port 465)",
    none: "None (usually port 25)",
};

const STATE_LABELS: Record<OutboxMail["emailState"], { label: string; color: string }> = {
    sent: { label: "Sent", color: "#16a34a" },
    pending: { label: "Waiting", color: "#2563eb" },
    digest: { label: "In the next digest", color: "#64748b" },
    failed: { label: "Failed", color: "#dc2626" },
    skipped: { label: "Not sent", color: "#b45309" },
};

type Styles = ReturnType<typeof useFacilityStyles>;

function formatWhen(value: string | null | undefined): string {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function groupKinds(kinds: NotificationKindPreference[]): [string, NotificationKindPreference[]][] {
    const groups = new Map<string, NotificationKindPreference[]>();
    kinds.forEach((kind) => groups.set(kind.group, [...(groups.get(kind.group) ?? []), kind]));
    return [...groups.entries()];
}

/** A kind of notice with a menu of how it arrives; "Default" (empty) leaves it to the default. */
function KindRow({ kind, value, withDefault, styles, disabled, onChange }: {
    kind: NotificationKindPreference;
    value: NotificationChannel | "";
    withDefault: boolean;
    styles: Styles;
    disabled: boolean;
    onChange: (value: NotificationChannel | "") => void;
}) {
    const { colors, fieldSx } = styles;
    return (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}
               data-testid={`notification-kind-${kind.kind}`}
               sx={{ py: 1, borderBottom: `1px solid ${colors.border}` }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle - 0.5, fontWeight: 700, color: colors.text }}>
                    {kind.label}{kind.mandatory ? " · always mailed" : ""}
                </Typography>
                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>{kind.description}</Typography>
            </Box>
            <TextField select size="small" sx={{ ...fieldSx, width: { xs: "100%", sm: 260 } }} value={value}
                       label={`How: ${kind.label}`} disabled={disabled}
                       SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
                       onChange={(e) => onChange(e.target.value as NotificationChannel | "")}>
                {withDefault && <MenuItem value="">Default: {CHANNEL_LABELS[kind.default].toLowerCase()}</MenuItem>}
                {kind.channels.map((channel) => <MenuItem key={channel} value={channel}>{CHANNEL_LABELS[channel]}</MenuItem>)}
            </TextField>
        </Stack>
    );
}

/** How the signed-in user gets each kind of notice. */
function MyNoticesCard({ styles }: { styles: Styles }) {
    const { cardSx, cardHeaderSx, colors } = styles;
    const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getMyNotificationPreferences().then(setPreferences)
            .catch((e: any) => setError(String(e?.message || "Failed to load your notification choices")));
    }, []);

    const change = async (kind: string, value: NotificationChannel | "") => {
        setBusy(true);
        try {
            setPreferences(await saveMyNotificationPreferences({ [kind]: value || null }));
            toast.success("Saved.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save your choice"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card variant="outlined" sx={cardSx}>
            <CardHeader title="My notices"
                        subheader="What ScipionWeb tells you, in the bell of the web and by mail: choose how each one reaches you."
                        sx={cardHeaderSx} />
            <CardContent sx={{ pt: 1 }}>
                {error && <Alert severity="error">{error}</Alert>}
                {preferences && !preferences.mailEnabled && (
                    <Alert severity="info" sx={{ mb: 1 }}>ScipionWeb does not send mail here: your notices only show in the web's bell.</Alert>
                )}
                {preferences && preferences.kinds.length === 0 && (
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                        There are no notices for you yet.
                    </Typography>
                )}
                {preferences && groupKinds(preferences.kinds).map(([group, kinds]) => (
                    <Box key={group} sx={{ mt: 1 }}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 800, color: colors.text }}>{group}</Typography>
                        {kinds.map((kind) => (
                            <KindRow key={kind.kind} kind={kind} value={kind.chosen ? kind.channel : ""} withDefault styles={styles}
                                     disabled={busy} onChange={(value) => void change(kind.kind, value)} />
                        ))}
                    </Box>
                ))}
            </CardContent>
        </Card>
    );
}

/** The mail server every notice goes through, the web's address for the links, and the digest's hour. */
function MailServerCard({ styles }: { styles: Styles }) {
    const { cardSx, cardHeaderSx, colors, fieldSx, actionButtonSx, saveButtonSx } = styles;
    const [settings, setSettings] = useState<MailSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState({ host: "", port: "587", security: "starttls" as MailSecurity, user: "", sender: "",
                                         publicUrl: "", hour: "8", timezone: "Europe/Madrid", mailOn: false });
    // Empty: the password there is stays; removePassword takes it away
    const [password, setPassword] = useState("");
    const [removePassword, setRemovePassword] = useState(false);
    const [testTo, setTestTo] = useState("");
    const [busy, setBusy] = useState(false);

    const adopt = (loaded: MailSettings) => {
        setSettings(loaded);
        setDraft({ host: loaded.host, port: String(loaded.port || 587), security: loaded.security, user: loaded.user,
                   sender: loaded.sender, publicUrl: loaded.publicUrl, hour: String(loaded.digest.hour),
                   timezone: loaded.digest.timezone, mailOn: loaded.mailOn });
        setPassword("");
        setRemovePassword(false);
    };

    useEffect(() => {
        getMailSettings().then(adopt).catch((e: any) => setError(String(e?.message || "Failed to load the mail settings")));
    }, []);

    const set = (change: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...change }));

    const save = async () => {
        setBusy(true);
        try {
            adopt(await saveMailSettings({
                host: draft.host.trim(), port: Number(draft.port) || 0, security: draft.security, user: draft.user.trim(),
                sender: draft.sender.trim(), publicUrl: draft.publicUrl.trim(),
                digest: { hour: Number(draft.hour), timezone: draft.timezone.trim() }, mailOn: draft.mailOn,
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
            const { sentTo } = await sendTestMail(testTo.trim());
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
            <CardHeader title="Mail server"
                        subheader="Every notice by mail goes through it (also the facility's alerts). Mails are sent in the background: nobody waits for them, and one that does not go is tried again."
                        sx={cardHeaderSx} />
            <CardContent sx={{ pt: 2 }}>
                <Stack spacing={1.5}>
                    <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, px: 1.5, py: 1 }}>
                        <FormControlLabel
                            control={<Switch checked={draft.mailOn} onChange={(e) => set({ mailOn: e.target.checked })} />}
                            label={<Typography sx={{ fontSize: FACILITY_TEXT.itemTitle - 0.5, fontWeight: 700 }}>Send notices by mail</Typography>}
                        />
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                            Off by default: ScipionWeb sends no mail and every notice only shows in the web's bell, also
                            the password reset ("Forgot password?" is not offered). On, with a server, notices are mailed
                            as the defaults below and each user choose. What happens while it is off is not mailed later.
                        </Typography>
                        {draft.mailOn && !draft.host.trim() && (
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: "#b45309", mt: 0.5 }}>
                                It needs the mail server below.
                            </Typography>
                        )}
                    </Box>
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
                                   placeholder="scipion@example.org" onChange={(e) => set({ sender: e.target.value })} />
                        <TextField sx={fieldSx} size="small" fullWidth label="The web's address" value={draft.publicUrl}
                                   placeholder="https://scipion.example.org"
                                   helperText="As its users open it: the mails link to the pages they are about"
                                   onChange={(e) => set({ publicUrl: e.target.value })} />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField sx={fieldSx} size="small" fullWidth select label="Daily mail at" value={draft.hour}
                                   helperText="When those who chose one mail a day get it"
                                   onChange={(e) => set({ hour: e.target.value })}>
                            {Array.from({ length: 24 }, (_, hour) => (
                                <MenuItem key={hour} value={String(hour)}>{String(hour).padStart(2, "0")}:00</MenuItem>
                            ))}
                        </TextField>
                        <TextField sx={fieldSx} size="small" fullWidth label="Time zone" value={draft.timezone}
                                   placeholder="Europe/Madrid" onChange={(e) => set({ timezone: e.target.value })} />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                        <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Send a test to" value={testTo}
                                   placeholder="you@example.org" onChange={(e) => setTestTo(e.target.value)} />
                        <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Send size={14} />}
                                disabled={busy || !settings.enabled || !testTo.trim()} onClick={() => void test()}>
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

/** How each kind of notice reaches whoever did not choose. */
function DefaultsCard({ styles }: { styles: Styles }) {
    const { cardSx, cardHeaderSx, colors } = styles;
    const [kinds, setKinds] = useState<NotificationKindPreference[] | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getNotificationDefaults().then((answer) => setKinds(answer.kinds))
            .catch((e: any) => toast.error(String(e?.message || "Failed to load the defaults")));
    }, []);

    const change = async (kind: string, value: NotificationChannel | "") => {
        if (!value) return;
        setBusy(true);
        try {
            setKinds((await saveNotificationDefaults({ [kind]: value })).kinds);
            toast.success("Saved: it applies to whoever did not choose.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the default"));
        } finally {
            setBusy(false);
        }
    };

    if (!kinds) return null;
    return (
        <Card variant="outlined" sx={cardSx}>
            <CardHeader title="Defaults for everyone"
                        subheader="How each notice reaches the users who did not choose. A user's own choice wins."
                        sx={cardHeaderSx} />
            <CardContent sx={{ pt: 1 }}>
                {groupKinds(kinds).map(([group, items]) => (
                    <Box key={group} sx={{ mt: 1 }}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 800, color: colors.text }}>{group}</Typography>
                        {items.map((kind) => (
                            <KindRow key={kind.kind} kind={kind} value={kind.channel} withDefault={false} styles={styles}
                                     disabled={busy} onChange={(value) => void change(kind.kind, value)} />
                        ))}
                    </Box>
                ))}
            </CardContent>
        </Card>
    );
}

/** The latest mails: to whom, whether they went, and why one did not. */
function OutboxCard({ styles }: { styles: Styles }) {
    const { cardSx, cardHeaderSx, colors, actionButtonSx } = styles;
    const [mails, setMails] = useState<OutboxMail[] | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setMails(await listOutbox());
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to load the mails sent"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <Card variant="outlined" sx={cardSx}>
            <CardHeader title="Mails sent"
                        subheader="The latest notices by mail, newest first."
                        sx={cardHeaderSx}
                        action={
                            <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<RefreshCw size={15} />}
                                    disabled={loading} onClick={() => void load()}>
                                Reload
                            </Button>
                        } />
            <CardContent sx={{ pt: 1 }}>
                {mails && mails.length === 0 && (
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>No mail yet.</Typography>
                )}
                <Stack spacing={0.5}>
                    {(mails ?? []).map((mail) => {
                        const state = STATE_LABELS[mail.emailState];
                        return (
                            <Stack key={mail.id} direction="row" spacing={1} alignItems="center" data-testid={`outbox-${mail.id}`}
                                   sx={{ minWidth: 0, flexWrap: "wrap", rowGap: 0.25, py: 0.5, borderBottom: `1px solid ${colors.border}` }}>
                                <Box sx={{ px: 0.8, borderRadius: 10, border: `1px solid ${state.color}`, color: state.color, flexShrink: 0 }}>
                                    <Typography sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 700 }}>{state.label}</Typography>
                                </Box>
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, minWidth: 0, flex: 1 }}>
                                    {mail.title}
                                </Typography>
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                    {[mail.address, formatWhen(mail.emailedAt || mail.createdAt),
                                      mail.emailAttempts > 1 ? `${mail.emailAttempts} tries` : ""].filter(Boolean).join(" · ")}
                                </Typography>
                                {mail.emailError && (
                                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: state.color, width: "100%" }}>
                                        {mail.emailError}
                                    </Typography>
                                )}
                            </Stack>
                        );
                    })}
                </Stack>
            </CardContent>
        </Card>
    );
}

/**
 * Settings → Notifications: how the user gets each kind of notice and, for whoever manages the settings, the mail
 * server, the defaults and the mails sent.
 */
export default function NotificationsPanel({ canManage }: { canManage: boolean }) {
    const styles = useFacilityStyles();
    return (
        <Stack spacing={1.75}>
            <MyNoticesCard styles={styles} />
            {canManage && (
                <>
                    <MailServerCard styles={styles} />
                    <DefaultsCard styles={styles} />
                    <OutboxCard styles={styles} />
                </>
            )}
        </Stack>
    );
}
