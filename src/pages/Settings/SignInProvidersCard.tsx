import { useCallback, useEffect, useState } from "react";
import {
    Alert, Box, Button, Card, CardContent, CardHeader, Chip, FormControlLabel, MenuItem, Stack, Switch, TextField,
    Typography,
} from "@mui/material";
import { Copy, KeyRound, Pencil, Plus, Trash2, Zap } from "lucide-react";
import toast from "react-hot-toast";

import {
    listSignInProviderSetups, removeSignInProvider, saveSignInProvider, testSignInProvider,
    type SignInProviderPayload, type SignInProviderSetup,
} from "@/api/settings";
import SettingsDialog from "./SettingsDialog";

type Styles = { cardSx: any; cardHeaderSx: any; fieldSx: any; actionButtonSx?: any;
    colors: { border: string; text: string; muted: string } };

const EMPTY: SignInProviderPayload = { key: "", label: "", issuer: "", clientId: "", clientSecret: "",
    newAccounts: "active", enabled: true };

/** The dialog to add or change a provider; a client secret left empty when changing keeps the one there is. */
function ProviderDialog({ provider, onClose, onSaved }: {
    provider: SignInProviderSetup | null; onClose: () => void; onSaved: () => void;
}) {
    const [form, setForm] = useState<SignInProviderPayload>(provider ? {
        key: provider.key, label: provider.label, issuer: provider.issuer, clientId: provider.clientId,
        clientSecret: "", newAccounts: provider.newAccounts, enabled: provider.enabled,
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

    return (
        <SettingsDialog
            title={provider ? `Sign in with ${provider.label}` : "Add a way to sign in"}
            description="An institution's sign-in service (Keycloak or any OpenID Connect one). The institution gives the issuer address, a client id and a client secret for ScipionWeb."
            icon={<KeyRound size={20} color="#93c5fd" />}
            confirmLabel="Save" busyLabel="Checking and saving…" busy={busy} maxWidth="sm"
            onConfirm={() => void save()} onClose={onClose}
        >
            <Stack spacing={1.5}>
                {error && <Alert severity="error">{error}</Alert>}
                <TextField size="small" fullWidth label="Button name" value={form.label}
                           helperText='Shown as "Sign in with …", e.g. ESRF'
                           onChange={(e) => set("label", e.target.value)} />
                <TextField size="small" fullWidth label="Key" value={form.key} placeholder="esrf"
                           helperText="Short, lower case: it goes in the address the institution registers"
                           onChange={(e) => set("key", e.target.value)} />
                <TextField size="small" fullWidth label="Issuer" value={form.issuer}
                           placeholder="https://login.example.org/realms/users"
                           helperText="With Keycloak, the realm's address"
                           onChange={(e) => set("issuer", e.target.value)} />
                <TextField size="small" fullWidth label="Client id" value={form.clientId}
                           onChange={(e) => set("clientId", e.target.value)} />
                <TextField size="small" fullWidth label="Client secret" type="password" value={form.clientSecret ?? ""}
                           helperText={provider?.hasSecret ? "Kept: leave empty not to change it" : "Kept encrypted"}
                           onChange={(e) => set("clientSecret", e.target.value)} />
                <TextField select size="small" fullWidth label="A person who signs in for the first time"
                           value={form.newAccounts} onChange={(e) => set("newAccounts", e.target.value)}>
                    <MenuItem value="active">Gets an active account at once</MenuItem>
                    <MenuItem value="pending">Waits for an administrator to activate the account</MenuItem>
                </TextField>
                <FormControlLabel control={<Switch checked={Boolean(form.enabled)}
                                                   onChange={(e) => set("enabled", e.target.checked)} />}
                                  label={<Typography sx={{ fontSize: 15 }}>Show its button on the sign-in page</Typography>} />
                <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>
                    An account with the same mail joins the person only when the institution says the mail is
                    verified.
                </Typography>
            </Stack>
        </SettingsDialog>
    );
}

/** Settings → Instance: the institutions people may sign in with (none by default). */
export default function SignInProvidersCard({ cardSx, cardHeaderSx, actionButtonSx, colors }: Styles) {
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

    const copy = (text: string) => {
        void navigator.clipboard?.writeText(text).then(() => toast.success("Copied."), () => undefined);
    };

    return (
        <Card variant="outlined" sx={cardSx}>
            <CardHeader
                title="Sign in with an institution"
                subheader="People may sign in with their institution's account (Keycloak or any OpenID Connect service) instead of a ScipionWeb password. None by default."
                sx={cardHeaderSx}
                action={
                    <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Plus size={15} />}
                            onClick={() => setEditing("new")}>
                        Add
                    </Button>
                }
            />
            <CardContent sx={{ pt: 1 }}>
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
                    </Box>
                ))}
            </CardContent>
            {removing && (
                <SettingsDialog
                    title={`Remove "Sign in with ${removing.label}"?`}
                    description="Its button leaves the sign-in page. The accounts made with it stay, but they can no longer sign in with it (an administrator can give them a password)."
                    icon={<Trash2 size={20} color="#fca5a5" />}
                    confirmLabel="Remove" busyLabel="Removing…" busy={busy} destructive maxWidth="sm"
                    onConfirm={() => void remove(removing)} onClose={() => setRemoving(null)}
                >
                    <Typography sx={{ fontSize: 15 }}>{removing.issuer}</Typography>
                </SettingsDialog>
            )}
            {editing && (
                <ProviderDialog provider={editing === "new" ? null : editing} onClose={() => setEditing(null)}
                                onSaved={() => { setEditing(null); void load(); }} />
            )}
        </Card>
    );
}
