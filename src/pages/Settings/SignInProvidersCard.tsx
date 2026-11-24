import { useCallback, useEffect, useState } from "react";
import {
    Alert, Box, Button, Card, CardContent, Chip, Stack, TextField, ToggleButton, ToggleButtonGroup,
    Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Building2, Copy, KeyRound, LogIn, Pencil, Plus, Trash2, UserCheck, Zap } from "lucide-react";

import { useIsDark } from "@/context/ThemeContext";
import { DialogPart, OptionRow } from "@/pages/Facility/DialogParts";
import { choiceButtonsSx, sectionTint } from "./SettingsSection";
import toast from "react-hot-toast";

import {
    listSignInProviderSetups, removeSignInProvider, saveSignInProvider, testSignInProvider,
    type SignInProviderPayload, type SignInProviderSetup,
} from "@/api/settings";
import SettingsDialog from "./SettingsDialog";
import { SectionHeader } from "./SettingsSection";

type Styles = { cardSx: any; cardHeaderSx: any; fieldSx: any; actionButtonSx?: any;
    colors: { border: string; text: string; muted: string } };

const EMPTY: SignInProviderPayload = { key: "", label: "", issuer: "", clientId: "", clientSecret: "",
    newAccounts: "active", enabled: true, signOutAtProvider: true };

/** The dialog to add or change a provider; a client secret left empty when changing keeps the one there is. */
function ProviderDialog({ provider, onClose, onSaved }: {
    provider: SignInProviderSetup | null; onClose: () => void; onSaved: () => void;
}) {
    const [form, setForm] = useState<SignInProviderPayload>(provider ? {
        key: provider.key, label: provider.label, issuer: provider.issuer, clientId: provider.clientId,
        clientSecret: "", newAccounts: provider.newAccounts, enabled: provider.enabled,
        signOutAtProvider: provider.signOutAtProvider,
    } : EMPTY);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const set = (name: keyof SignInProviderPayload, value: unknown) => setForm((prev) => ({ ...prev, [name]: value }));

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const payload = { ...form };
            // Changing: an empty secret keeps the one there is
            if (provider && !payload.clientSecret) delete payload.clientSecret;
            await saveSignInProvider(payload, provider?.id);
            toast.success("Sign-in provider saved.");
            onSaved();
        } catch (e: any) {
            setError(String(e?.message || "Failed to save"));
        } finally {
            setBusy(false);
        }
    };

    const isDark = useIsDark();
    const tint = sectionTint(isDark);
    const colors = isDark
        ? { border: "rgba(255,255,255,0.14)", text: "#f1f5f9", muted: "#94a3b8", hover: "rgba(255,255,255,0.04)", card: "", primary: "#60a5fa" }
        : { border: "#e2e8f0", text: "#0f172a", muted: "#64748b", hover: "#f8fafc", card: "", primary: "#2563eb" };
    const helper = { sx: { fontSize: 13.5 } };

    return (
        <SettingsDialog
            title={provider ? `Sign in with ${provider.label}` : "Add a way to sign in"}
            description="An institution's sign-in service (Keycloak or any OpenID Connect one). The institution gives the issuer address, a client id and a client secret for ScipionWeb."
            icon={<KeyRound size={20} color="#93c5fd" />}
            confirmLabel="Save" busyLabel="Checking and saving…" busy={busy} maxWidth="md" closeButton
            onConfirm={() => void save()} onClose={onClose}
        >
            <Stack spacing={2}>
                {error && <Alert severity="error">{error}</Alert>}
                <DialogPart icon={<LogIn size={18} />} title="The button" tint={tint} colors={colors}
                            subtitle="What people press on the sign-in page.">
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField size="small" fullWidth label="Button name" value={form.label}
                                   helperText='Shown as "Sign in with …", e.g. ESRF' FormHelperTextProps={helper}
                                   onChange={(e) => set("label", e.target.value)} />
                        <TextField size="small" fullWidth label="Key" value={form.key} placeholder="esrf"
                                   inputProps={{ style: { fontFamily: "monospace" } }}
                                   helperText="Short, lower case: it goes in the address the institution registers"
                                   FormHelperTextProps={helper} onChange={(e) => set("key", e.target.value)} />
                    </Stack>
                    <Box sx={{ borderRadius: 2, bgcolor: tint, px: 1.5, py: 1.25, display: "flex", alignItems: "center", gap: 1.5,
                               flexWrap: "wrap" }}>
                        <Typography sx={{ fontSize: 13.5, color: colors.muted }}>It will look like</Typography>
                        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1, px: 2, py: 0.75, borderRadius: 2,
                                                    border: `1px solid ${colors.border}`, bgcolor: isDark ? "#0f172a" : "#fff",
                                                    fontSize: 14.5, fontWeight: 600, color: colors.text }}>
                            <KeyRound size={16} /> Sign in with {form.label?.trim() || "…"}
                        </Box>
                        {!form.enabled && <Typography sx={{ fontSize: 13.5, color: "#b45309" }}>Hidden for now</Typography>}
                    </Box>
                </DialogPart>

                <DialogPart icon={<Building2 size={18} />} title="The institution" tint={tint} colors={colors}
                            subtitle="What the institution gave for ScipionWeb. Saving checks the issuer answers.">
                    <TextField size="small" fullWidth label="Issuer" value={form.issuer}
                               placeholder="https://login.example.org/realms/users"
                               inputProps={{ style: { fontFamily: "monospace" } }}
                               helperText="With Keycloak, the realm's address" FormHelperTextProps={helper}
                               onChange={(e) => set("issuer", e.target.value)} />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TextField size="small" fullWidth label="Client id" value={form.clientId}
                                   inputProps={{ style: { fontFamily: "monospace" } }}
                                   onChange={(e) => set("clientId", e.target.value)} />
                        <TextField size="small" fullWidth label="Client secret" type="password" value={form.clientSecret ?? ""}
                                   helperText={provider?.hasSecret ? "Kept: leave empty not to change it" : "Kept encrypted"}
                                   FormHelperTextProps={helper} onChange={(e) => set("clientSecret", e.target.value)} />
                    </Stack>
                </DialogPart>

                <DialogPart icon={<UserCheck size={18} />} title="Accounts and signing out" tint={tint} colors={colors}>
                    <Box>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: colors.text }}>A person who signs in for the first time</Typography>
                        <Typography sx={{ fontSize: 13.5, color: colors.muted, mb: 1 }}>
                            An account with the same mail joins the person only when the institution says the mail is verified.
                        </Typography>
                        <ToggleButtonGroup exclusive size="small" value={form.newAccounts}
                                           aria-label="A person who signs in for the first time"
                                           onChange={(_, value) => value && set("newAccounts", value)}
                                           sx={choiceButtonsSx(colors, isDark)}>
                            <ToggleButton value="active">Gets an active account at once</ToggleButton>
                            <ToggleButton value="pending">Waits for an administrator</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                    <Box>
                        <OptionRow title="Signing out of ScipionWeb signs out of the institution too" colors={colors}
                                   checked={form.signOutAtProvider !== false} onChange={(on) => set("signOutAtProvider", on)}
                                   description="Keep it on where people share computers: otherwise the next person to press the button at the same browser comes in as the one before." />
                        <OptionRow title="Show its button on the sign-in page" colors={colors}
                                   checked={Boolean(form.enabled)} onChange={(on) => set("enabled", on)}
                                   description="Off: nobody can sign in with it until it is on again." />
                    </Box>
                </DialogPart>
            </Stack>
        </SettingsDialog>
    );
}

/** Settings → Instance: the institutions people may sign in with (none by default). */
export default function SignInProvidersCard({ cardSx, actionButtonSx, colors }: Styles) {
    const muiTheme = useTheme();
    const [providers, setProviders] = useState<SignInProviderSetup[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<SignInProviderSetup | "new" | null>(null);
    const [removing, setRemoving] = useState<SignInProviderSetup | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setProviders(await listSignInProviderSetups());
            setError(null);
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the sign-in providers"));
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const test = async (provider: SignInProviderSetup) => {
        try {
            const result = await testSignInProvider(provider.id);
            if (result.ok) toast.success(`${provider.label} answers (${result.keys} signing keys).`);
            else toast.error(result.error || "It does not answer");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to test"));
        }
    };

    const remove = async (provider: SignInProviderSetup) => {
        setBusy(true);
        try {
            await removeSignInProvider(provider.id);
            toast.success("Sign-in provider removed.");
            setRemoving(null);
            void load();
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to remove"));
        } finally {
            setBusy(false);
        }
    };

    // Where the institution sends the browser after signing out: this web's sign-in page
    const signOutReturn = `${window.location.origin}/signin`;

    const copy = (text: string) => {
        void navigator.clipboard?.writeText(text).then(() => toast.success("Copied."), () => undefined);
    };

    return (
        <Card variant="outlined" sx={{ ...cardSx, borderRadius: 3 }}>
            <SectionHeader
                icon={<KeyRound size={19} />}
                title="Sign in with an institution"
                subtitle={"People may sign in with their institution's account (Keycloak or any OpenID Connect "
                    + "service) instead of a ScipionWeb password. None by default."}
                colors={{ text: colors.text, muted: colors.muted, primary: muiTheme.palette.primary.main }}
                isDarkMode={muiTheme.palette.mode === "dark"}
                actions={
                    <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Plus size={15} />}
                            onClick={() => setEditing("new")}>
                        Add
                    </Button>
                }
            />
            <CardContent sx={{ pt: 1, px: 2.5 }}>
                {error && <Alert severity="error">{error}</Alert>}
                {providers && providers.length === 0 && (
                    <Typography sx={{ fontSize: 14, color: colors.muted }}>
                        Only ScipionWeb passwords: no institution is set up.
                    </Typography>
                )}
                {(providers ?? []).map((provider) => (
                    <Box key={provider.id} data-testid={`sign-in-provider-${provider.key}`}
                         sx={{ py: 1.25, borderBottom: `1px solid ${colors.border}` }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography sx={{ fontSize: 15, fontWeight: 700, color: colors.text }}>
                                Sign in with {provider.label}
                            </Typography>
                            <Chip size="small" variant="outlined" label={provider.enabled ? "shown" : "hidden"}
                                  color={provider.enabled ? "success" : "default"} sx={{ fontSize: 13 }} />
                            <Typography sx={{ fontSize: 13.5, color: colors.muted }}>
                                {provider.accounts ?? 0} {provider.accounts === 1 ? "account" : "accounts"} ·
                                new people {provider.newAccounts === "active" ? "active at once" : "wait for activation"}
                            </Typography>
                            <Box sx={{ flex: 1 }} />
                            <Button size="small" sx={{ textTransform: "none" }} startIcon={<Zap size={14} />}
                                    onClick={() => void test(provider)}>Test</Button>
                            <Button size="small" sx={{ textTransform: "none" }} startIcon={<Pencil size={14} />}
                                    onClick={() => setEditing(provider)}>Change</Button>
                            <Button size="small" color="error" sx={{ textTransform: "none" }} startIcon={<Trash2 size={14} />}
                                    onClick={() => setRemoving(provider)}>Remove</Button>
                        </Stack>
                        <Typography sx={{ fontSize: 13.5, color: colors.muted, mt: 0.5, wordBreak: "break-all" }}>
                            {provider.issuer} · client {provider.clientId}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                            <Typography sx={{ fontSize: 13.5, color: colors.muted, wordBreak: "break-all" }}>
                                Redirect address to register at the institution: <code>{provider.callbackUrl}</code>
                            </Typography>
                            <Button size="small" sx={{ textTransform: "none", minWidth: 0 }} startIcon={<Copy size={14} />}
                                    onClick={() => copy(provider.callbackUrl)}>Copy</Button>
                        </Stack>
                        {provider.signOutAtProvider && (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Typography sx={{ fontSize: 13.5, color: colors.muted, wordBreak: "break-all" }}>
                                    Address to register for after signing out: <code>{signOutReturn}</code>
                                </Typography>
                                <Button size="small" sx={{ textTransform: "none", minWidth: 0 }} startIcon={<Copy size={14} />}
                                        onClick={() => copy(signOutReturn)}>Copy</Button>
                            </Stack>
                        )}
                    </Box>
                ))}
            </CardContent>
            {removing && (
                <SettingsDialog
                    title={`Remove "Sign in with ${removing.label}"?`}
                    description="Its button leaves the sign-in page. The accounts made with it stay, but they can no longer sign in with it (an administrator can give them a password)."
                    icon={<Trash2 size={20} color="#fca5a5" />}
                    confirmLabel="Remove" busyLabel="Removing…" busy={busy} destructive maxWidth="sm" closeButton
                    onConfirm={() => void remove(removing)} onClose={() => setRemoving(null)}
                >
                    <Box sx={{ border: `1px solid ${colors.border}`, borderLeft: "4px solid #dc2626", borderRadius: 2, px: 1.5, py: 1.25 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <KeyRound size={16} style={{ color: colors.muted }} />
                            <Typography sx={{ fontSize: 15, fontWeight: 800, color: colors.text }}>Sign in with {removing.label}</Typography>
                        </Stack>
                        <Typography sx={{ fontSize: 13.5, fontFamily: "monospace", color: colors.muted, wordBreak: "break-all", mt: 0.5 }}>
                            {removing.issuer}
                        </Typography>
                        {removing.accounts != null && (
                            <Typography sx={{ fontSize: 13.5, color: removing.accounts ? "#b45309" : colors.muted, fontWeight: removing.accounts ? 700 : 400, mt: 0.5 }}>
                                {removing.accounts === 1 ? "1 account signs in with it" : `${removing.accounts} accounts sign in with it`}
                            </Typography>
                        )}
                    </Box>
                </SettingsDialog>
            )}
            {editing && (
                <ProviderDialog provider={editing === "new" ? null : editing} onClose={() => setEditing(null)}
                                onSaved={() => { setEditing(null); void load(); }} />
            )}
        </Card>
    );
}
