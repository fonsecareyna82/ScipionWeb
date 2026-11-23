import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
    Box, Button, MenuItem, Select, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BellRing, Info, Lock, MailCheck, RefreshCw, Save, Send, Server, SlidersHorizontal, TriangleAlert } from "lucide-react";
import toast from "react-hot-toast";

import {
    getMailSettings, getMyNotificationPreferences, getNotificationDefaults, listOutbox, saveMailSettings,
    saveMyNotificationPreferences, saveNotificationDefaults, sendTestMail,
    type MailSecurity, type MailSettings, type NotificationChannel, type NotificationKindPreference,
    type NotificationPreferences, type OutboxMail,
} from "@/api/notifications";
import { SETTINGS_TEXT, SettingRow, SettingsSection, choiceButtonsSx, sectionTint } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";

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

type Look = ReturnType<typeof useSettingsStyles> & { isDarkMode: boolean };

/** The Settings look, with notes under the fields big enough to read. */
function useLook(): Look {
    const isDarkMode = useTheme().palette.mode === "dark";
    const styles = useSettingsStyles(isDarkMode);
    return {
        ...styles, isDarkMode,
        fieldSx: { ...styles.fieldSx, "& .MuiFormHelperText-root": { fontSize: SETTINGS_TEXT.text, color: styles.colors.muted, mx: 0.25 } },
    } as Look;
}

function errorText(error: unknown, fallback: string): string {
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === "string" && message ? message : fallback;
}

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

function Pill({ children, color, look }: { children: ReactNode; color?: string; look: Look }) {
    return (
        <Box component="span" sx={{
            display: "inline-flex", alignItems: "center", gap: 0.5, px: 1, py: 0.15, borderRadius: 10, whiteSpace: "nowrap",
            fontSize: SETTINGS_TEXT.text - 0.5, fontWeight: 700, lineHeight: 1.6,
            color: color ?? look.colors.primary,
            bgcolor: color ? `${color}1f` : sectionTint(look.isDarkMode),
        }}>
            {children}
        </Box>
    );
}

/** A soft note at the top of a section. */
function Note({ children, warning, look }: { children: ReactNode; warning?: boolean; look: Look }) {
    const color = warning ? "#b45309" : look.colors.primary;
    return (
        <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{
            mt: 1, mb: 0.5, px: 1.75, py: 1.25, borderRadius: 2,
            bgcolor: warning ? (look.isDarkMode ? "rgba(245,158,11,0.14)" : "rgba(245,158,11,0.10)") : sectionTint(look.isDarkMode),
        }}>
            <Box sx={{ color, display: "flex", pt: 0.2 }}>{warning ? <TriangleAlert size={17} /> : <Info size={17} />}</Box>
            <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: look.colors.text, lineHeight: 1.5 }}>{children}</Typography>
        </Stack>
    );
}

/** A kind of notice with a menu of how it arrives; "Default" (empty) leaves it to the default. */
function KindRow({ kind, value, withDefault, look, disabled, onChange }: {
    kind: NotificationKindPreference;
    value: NotificationChannel | "";
    withDefault: boolean;
    look: Look;
    disabled: boolean;
    onChange: (value: NotificationChannel | "") => void;
}) {
    const { colors, selectSx, menuPaperSx } = look;
    return (
        <Box data-testid={`notification-kind-${kind.kind}`}>
            <SettingRow
                colors={colors}
                title={kind.label}
                description={
                    <Stack spacing={0.5} alignItems="flex-start">
                        <span>{kind.description}</span>
                        {kind.mandatory && <Pill look={look}><Lock size={12} />Always mailed</Pill>}
                    </Stack>
                }
                control={
                    <Select size="small" sx={{ ...selectSx, width: { xs: "100%", md: 260 } }} value={value} displayEmpty
                            disabled={disabled} inputProps={{ "aria-label": `How: ${kind.label}` }}
                            MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                            onChange={(e) => onChange(e.target.value as NotificationChannel | "")}>
                        {withDefault && <MenuItem value="">Default: {CHANNEL_LABELS[kind.default].toLowerCase()}</MenuItem>}
                        {kind.channels.map((channel) => <MenuItem key={channel} value={channel}>{CHANNEL_LABELS[channel]}</MenuItem>)}
                    </Select>
                }
            />
        </Box>
    );
}

/** The kinds of notice under the name of their group, one row each. */
function KindGroups({ kinds, look, render }: {
    kinds: NotificationKindPreference[];
    look: Look;
    render: (kind: NotificationKindPreference) => ReactNode;
}) {
    const { colors } = look;
    return (
        <>
            {groupKinds(kinds).map(([group, items]) => (
                <Box key={group} sx={{ mt: 1.5 }}>
                    <Typography sx={{ fontSize: SETTINGS_TEXT.text, fontWeight: 800, color: colors.muted,
                                      textTransform: "uppercase", letterSpacing: 0.6, pb: 0.5,
                                      borderBottom: `1px solid ${colors.border}` }}>
                        {group}
                    </Typography>
                    {items.map((kind, index) => (
                        <Box key={kind.kind} sx={{ borderTop: index > 0 ? `1px solid ${colors.border}` : "none" }}>
                            {render(kind)}
                        </Box>
                    ))}
                </Box>
            ))}
        </>
    );
}

/** How the signed-in user gets each kind of notice. */
function MyNoticesCard({ look }: { look: Look }) {
    const { colors, isDarkMode } = look;
    const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getMyNotificationPreferences().then(setPreferences)
            .catch((e: unknown) => setError(errorText(e, "Failed to load your notification choices")));
    }, []);

    const change = async (kind: string, value: NotificationChannel | "") => {
        setBusy(true);
        try {
            setPreferences(await saveMyNotificationPreferences({ [kind]: value || null }));
            toast.success("Saved.");
        } catch (e) {
            toast.error(errorText(e, "Failed to save your choice"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsSection plain icon={<BellRing size={19} />} title="My notices" colors={colors} isDarkMode={isDarkMode}
                         subtitle="What ScipionWeb tells you, in the web's bell and by mail: choose how each one reaches you.">
            {error && <Note warning look={look}>{error}</Note>}
            {preferences && !preferences.mailEnabled && (
                <Note look={look}>ScipionWeb does not send mail here: your notices only show in the web's bell.</Note>
            )}
            {preferences && preferences.kinds.length === 0 && (
                <Typography sx={{ fontSize: SETTINGS_TEXT.title, color: colors.muted, py: 1 }}>
                    There are no notices for you yet.
                </Typography>
            )}
            {preferences && (
                <KindGroups kinds={preferences.kinds} look={look} render={(kind) => (
                    <KindRow kind={kind} value={kind.chosen ? kind.channel : ""} withDefault look={look}
                             disabled={busy} onChange={(value) => void change(kind.kind, value)} />
                )} />
            )}
        </SettingsSection>
    );
}

/** The mail server every notice goes through, the web's address for the links, and the digest's hour. */
function MailServerCard({ look }: { look: Look }) {
    const { colors, fieldSx, selectSx, menuPaperSx, actionButtonSx, saveButtonSx, isDarkMode } = look;
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
        getMailSettings().then(adopt).catch((e: unknown) => setError(errorText(e, "Failed to load the mail settings")));
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
        } catch (e) {
            toast.error(errorText(e, "Failed to save the mail settings"));
        } finally {
            setBusy(false);
        }
    };

    const test = async () => {
        setBusy(true);
        try {
            const { sentTo } = await sendTestMail(testTo.trim());
            toast.success(`Test mail sent to ${sentTo.join(", ")}.`);
        } catch (e) {
            toast.error(errorText(e, "The test mail did not go"));
        } finally {
            setBusy(false);
        }
    };

    if (error) return <Note warning look={look}>{error}</Note>;
    if (!settings) return null;

    const fields = { direction: { xs: "column", sm: "row" } as const, spacing: 1.25, alignItems: { sm: "flex-start" },
                     sx: { width: { xs: "100%", md: 560 } } };

    return (
        <SettingsSection icon={<Server size={19} />} title="Mail server" colors={colors} isDarkMode={isDarkMode}
                         subtitle="Every notice by mail goes through it, also the facility's alerts. Mails go in the background and one that fails is tried again."
                         actions={
                             <Button size="small" variant="contained" sx={saveButtonSx} startIcon={<Save size={15} />}
                                     disabled={busy} onClick={() => void save()}>
                                 {busy ? "Saving…" : "Save mail settings"}
                             </Button>
                         }>
            <SettingRow colors={colors} title="Send notices by mail"
                        description={
                            <>
                                Off by default: no mail is sent and every notice only shows in the web's bell, also the
                                password reset ("Forgot password?" is not offered). On, notices are mailed as the Defaults
                                tab and each person's choice say. What happens while it is off is not mailed later.
                                {draft.mailOn && !draft.host.trim() && (
                                    <Box sx={{ color: "#b45309", fontWeight: 600, mt: 0.5 }}>It needs the mail server below.</Box>
                                )}
                            </>
                        }
                        control={
                            <Switch checked={draft.mailOn} slotProps={{ input: { "aria-label": "Send notices by mail" } }}
                                    onChange={(e) => set({ mailOn: e.target.checked })} />
                        } />
            <SettingRow colors={colors} title="Server" description="Where the mails go out, and how to connect to it."
                        control={
                            <Stack {...fields}>
                                <TextField sx={{ ...fieldSx, flex: 2 }} size="small" label="Mail server" value={draft.host}
                                           placeholder="smtp.example.org" onChange={(e) => set({ host: e.target.value })} />
                                <TextField sx={{ ...fieldSx, flex: 0.8 }} size="small" label="Port" value={draft.port}
                                           inputProps={{ inputMode: "numeric" }} onChange={(e) => set({ port: e.target.value })} />
                                <TextField sx={{ ...selectSx, flex: 2.2 }} size="small" select label="Connection" value={draft.security}
                                           SelectProps={{ MenuProps: { PaperProps: { sx: menuPaperSx } } }}
                                           onChange={(e) => set({ security: e.target.value as MailSecurity })}>
                                    {(Object.keys(SECURITY_LABELS) as MailSecurity[]).map((value) => (
                                        <MenuItem key={value} value={value}>{SECURITY_LABELS[value]}</MenuItem>
                                    ))}
                                </TextField>
                            </Stack>
                        } />
            <SettingRow colors={colors} title="Signing in"
                        description="Leave the user empty if the server takes mail without signing in. The password is kept encrypted and never shown."
                        control={
                            <Stack spacing={0.5} alignItems="flex-start" sx={{ width: { xs: "100%", md: 560 } }}>
                                <Stack {...fields} sx={{ width: "100%" }}>
                                    <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="User" value={draft.user}
                                               onChange={(e) => set({ user: e.target.value })} />
                                    <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Password" type="password"
                                               value={password} autoComplete="new-password" disabled={removePassword}
                                               helperText={settings.passwordSet ? "Set: leave it empty to keep it" : "None set"}
                                               onChange={(e) => setPassword(e.target.value)} />
                                </Stack>
                                {settings.passwordSet && (
                                    <Button size="small" variant="text"
                                            sx={{ textTransform: "none", fontSize: SETTINGS_TEXT.text, fontWeight: 600,
                                                  color: removePassword ? colors.primary : "#dc2626" }}
                                            onClick={() => setRemovePassword((value) => !value)}>
                                        {removePassword ? "Keep the password" : "Remove the password"}
                                    </Button>
                                )}
                            </Stack>
                        } />
            <SettingRow colors={colors} title="Sender and links"
                        description="Who the mails come from, and the web's address as people open it: the mails link to the pages they are about."
                        control={
                            <Stack {...fields}>
                                <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Sender" value={draft.sender}
                                           placeholder="scipion@example.org" onChange={(e) => set({ sender: e.target.value })} />
                                <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="The web's address" value={draft.publicUrl}
                                           placeholder="https://scipion.example.org"
                                           onChange={(e) => set({ publicUrl: e.target.value })} />
                            </Stack>
                        } />
            <SettingRow colors={colors} title="Daily mail"
                        description="When the people who chose one mail a day get it."
                        control={
                            <Stack {...fields}>
                                <TextField sx={{ ...selectSx, flex: 1 }} size="small" select label="Daily mail at" value={draft.hour}
                                           SelectProps={{ MenuProps: { PaperProps: { sx: menuPaperSx } } }}
                                           onChange={(e) => set({ hour: e.target.value })}>
                                    {Array.from({ length: 24 }, (_, hour) => (
                                        <MenuItem key={hour} value={String(hour)}>{String(hour).padStart(2, "0")}:00</MenuItem>
                                    ))}
                                </TextField>
                                <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Time zone" value={draft.timezone}
                                           placeholder="Europe/Madrid" onChange={(e) => set({ timezone: e.target.value })} />
                            </Stack>
                        } />
            <SettingRow colors={colors} title="Send a test"
                        description="It uses the saved settings: save them first."
                        control={
                            <Stack {...fields} alignItems={{ sm: "center" }}>
                                <TextField sx={{ ...fieldSx, flex: 1 }} size="small" label="Send a test to" value={testTo}
                                           placeholder="you@example.org" onChange={(e) => setTestTo(e.target.value)} />
                                <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Send size={15} />}
                                        disabled={busy || !settings.enabled || !testTo.trim()} onClick={() => void test()}>
                                    Send test mail
                                </Button>
                            </Stack>
                        } />
        </SettingsSection>
    );
}

/** How each kind of notice reaches whoever did not choose. */
function DefaultsCard({ look }: { look: Look }) {
    const { colors, isDarkMode } = look;
    const [kinds, setKinds] = useState<NotificationKindPreference[] | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getNotificationDefaults().then((answer) => setKinds(answer.kinds))
            .catch((e: unknown) => toast.error(errorText(e, "Failed to load the defaults")));
    }, []);

    const change = async (kind: string, value: NotificationChannel | "") => {
        if (!value) return;
        setBusy(true);
        try {
            setKinds((await saveNotificationDefaults({ [kind]: value })).kinds);
            toast.success("Saved: it applies to whoever did not choose.");
        } catch (e) {
            toast.error(errorText(e, "Failed to save the default"));
        } finally {
            setBusy(false);
        }
    };

    if (!kinds) return null;
    return (
        <SettingsSection plain icon={<SlidersHorizontal size={19} />} title="Defaults for everyone" colors={colors}
                         isDarkMode={isDarkMode}
                         subtitle="How each notice reaches the people who did not choose. A person's own choice wins.">
            <KindGroups kinds={kinds} look={look} render={(kind) => (
                <KindRow kind={kind} value={kind.channel} withDefault={false} look={look}
                         disabled={busy} onChange={(value) => void change(kind.kind, value)} />
            )} />
        </SettingsSection>
    );
}

/** The latest mails: to whom, whether they went, and why one did not. */
function OutboxCard({ look }: { look: Look }) {
    const { colors, actionButtonSx, isDarkMode } = look;
    const [mails, setMails] = useState<OutboxMail[] | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setMails(await listOutbox());
        } catch (e) {
            toast.error(errorText(e, "Failed to load the mails sent"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const headSx = { fontSize: SETTINGS_TEXT.text, fontWeight: 700, color: colors.muted, bgcolor: colors.card,
                     whiteSpace: "nowrap", borderColor: colors.border };
    const cellSx = { fontSize: SETTINGS_TEXT.control, color: colors.text, borderColor: colors.border, verticalAlign: "top" };

    return (
        <SettingsSection plain icon={<MailCheck size={19} />} title="Mails sent" colors={colors} isDarkMode={isDarkMode}
                         subtitle="The latest notices by mail, newest first, and why one did not go."
                         actions={
                             <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<RefreshCw size={15} />}
                                     disabled={loading} onClick={() => void load()}>
                                 Reload
                             </Button>
                         }>
            {mails && mails.length === 0 && (
                <Typography sx={{ fontSize: SETTINGS_TEXT.title, color: colors.muted, py: 1 }}>No mail yet.</Typography>
            )}
            {mails && mails.length > 0 && (
                <TableContainer sx={{ maxHeight: 460, border: `1px solid ${colors.border}`, borderRadius: 2 }}>
                    <Table size="small" stickyHeader aria-label="Mails sent">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={headSx}>State</TableCell>
                                <TableCell sx={headSx}>Notice</TableCell>
                                <TableCell sx={headSx}>To</TableCell>
                                <TableCell sx={headSx}>When</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {mails.map((mail) => {
                                const state = STATE_LABELS[mail.emailState];
                                return (
                                    <TableRow key={mail.id} data-testid={`outbox-${mail.id}`}>
                                        <TableCell sx={cellSx}><Pill color={state.color} look={look}>{state.label}</Pill></TableCell>
                                        <TableCell sx={{ ...cellSx, minWidth: 220 }}>
                                            <Box>{mail.title}</Box>
                                            {mail.emailError && (
                                                <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: state.color, mt: 0.25 }}>
                                                    {mail.emailError}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell sx={{ ...cellSx, wordBreak: "break-all" }}>{mail.address}</TableCell>
                                        <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                                            {formatWhen(mail.emailedAt || mail.createdAt)}
                                            {mail.emailAttempts > 1 && (
                                                <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted }}>
                                                    {mail.emailAttempts} tries
                                                </Typography>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </SettingsSection>
    );
}

/**
 * Settings → Notifications: how the user gets each kind of notice and, for whoever manages the settings, the mail
 * server, the defaults and the mails sent.
 */
export default function NotificationsPanel({ canManage }: { canManage: boolean }) {
    const look = useLook();
    const [part, setPart] = useState<"mine" | "server" | "defaults" | "sent">("mine");
    // Only the user's own notices: nothing to choose between
    if (!canManage) return <MyNoticesCard look={look} />;
    return (
        <Stack spacing={2}>
            <ToggleButtonGroup exclusive size="small" value={part} aria-label="Notifications"
                               onChange={(_, value) => value && setPart(value)}
                               sx={choiceButtonsSx(look.colors, look.isDarkMode)}>
                <ToggleButton value="mine"><BellRing size={16} />My notices</ToggleButton>
                <ToggleButton value="server"><Server size={16} />Mail server</ToggleButton>
                <ToggleButton value="defaults"><SlidersHorizontal size={16} />Defaults</ToggleButton>
                <ToggleButton value="sent"><MailCheck size={16} />Mails sent</ToggleButton>
            </ToggleButtonGroup>
            {part === "mine" && <MyNoticesCard look={look} />}
            {part === "server" && <MailServerCard look={look} />}
            {part === "defaults" && <DefaultsCard look={look} />}
            {part === "sent" && <OutboxCard look={look} />}
        </Stack>
    );
}
