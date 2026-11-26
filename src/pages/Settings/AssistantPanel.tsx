import { useEffect, useState, type ReactNode } from "react";
import { Autocomplete, Box, Button, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Bot, Info, ListRestart, Save, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import toast from "react-hot-toast";

import {
    getAssistantSettings, listAssistantModels, saveAssistantSettings, testAssistant,
    type AssistantProviderKey, type AssistantSettings, type AssistantSettingsPayload, type AssistantUsageTotals,
} from "@/api/helpChat";
import { SETTINGS_TEXT, SettingRow, SettingsSection, sectionTint } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";

type Look = ReturnType<typeof useSettingsStyles> & { isDarkMode: boolean };

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

function Note({ children, warning, look }: { children: ReactNode; warning?: boolean; look: Look }) {
    const color = warning ? "#b45309" : look.colors.primary;
    return (
        <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{
            mt: 1, mb: 0.5, px: 1.75, py: 1.25, borderRadius: 2,
            bgcolor: warning ? (look.isDarkMode ? "rgba(245,158,11,0.14)" : "rgba(245,158,11,0.10)") : sectionTint(look.isDarkMode),
        }}>
            <Box sx={{ color, display: "flex", pt: 0.2 }}>{warning ? <TriangleAlert size={17} /> : <Info size={17} />}</Box>
            <Typography component="div" sx={{ fontSize: SETTINGS_TEXT.text, color: look.colors.text, lineHeight: 1.5 }}>
                {children}
            </Typography>
        </Stack>
    );
}

const number = (value: number) => value.toLocaleString("en-GB");

function UsageLine({ label, totals }: { label: string; totals: AssistantUsageTotals }) {
    return (
        <Box component="span" sx={{ display: "block" }}>
            <strong>{label}:</strong> {number(totals.questions)} question{totals.questions === 1 ? "" : "s"} from{" "}
            {number(totals.users)} user{totals.users === 1 ? "" : "s"}, {number(totals.inputTokens)} tokens read and{" "}
            {number(totals.outputTokens)} written.
        </Box>
    );
}

type Draft = { enabled: boolean; provider: AssistantProviderKey; baseUrl: string; model: string; mode: string;
                allowDelete: boolean; dailyLimit: string };

const MODE_LABELS: Record<string, string> = {
    answer: "Only read and answer",
    propose: "Also propose actions, which the person confirms",
};

export default function AssistantPanel() {
    const look = useLook();
    const { colors, fieldSx, selectSx, menuPaperSx, actionButtonSx, saveButtonSx, isDarkMode } = look;
    const [settings, setSettings] = useState<AssistantSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft>({ enabled: false, provider: "openai", baseUrl: "", model: "", mode: "answer",
                                                    allowDelete: false, dailyLimit: "50" });
    // Empty: the key there is stays; removeKey takes it away
    const [key, setKey] = useState("");
    const [removeKey, setRemoveKey] = useState(false);
    const [models, setModels] = useState<string[]>([]);
    const [busy, setBusy] = useState<"" | "save" | "models" | "test">("");

    const adopt = (loaded: AssistantSettings) => {
        setSettings(loaded);
        setDraft({ enabled: loaded.enabled, provider: loaded.provider, baseUrl: loaded.baseUrl, model: loaded.model,
                   mode: loaded.mode || "answer", allowDelete: Boolean(loaded.allowDelete),
                   dailyLimit: String(loaded.dailyLimit) });
        setKey("");
        setRemoveKey(false);
    };

    useEffect(() => {
        getAssistantSettings().then(adopt).catch((e: unknown) => setError(errorText(e, "Failed to load the assistant settings")));
    }, []);

    const set = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));

    // The form as it is now, for listing the models and the test before saving
    const payload = (): AssistantSettingsPayload => ({
        enabled: draft.enabled, provider: draft.provider, baseUrl: draft.baseUrl.trim(), model: draft.model.trim(),
        mode: draft.mode, allowDelete: draft.allowDelete, dailyLimit: Number(draft.dailyLimit) || 0,
        ...(removeKey ? { key: "" } : key.trim() ? { key: key.trim() } : {}),
    });

    const run = async (what: "save" | "models" | "test") => {
        setBusy(what);
        try {
            if (what === "save") {
                adopt(await saveAssistantSettings(payload()));
                toast.success("Assistant settings saved.");
            } else if (what === "models") {
                const { models: found } = await listAssistantModels(payload());
                setModels(found);
                toast.success(found.length ? `${found.length} models found.` : "The provider listed no models.");
            } else {
                const { reply } = await testAssistant(payload());
                toast.success(`The model answered: ${reply || "(nothing)"}`);
            }
        } catch (e) {
            toast.error(errorText(e, what === "save" ? "Failed to save the assistant settings"
                : what === "models" ? "Could not list the models" : "The test did not work"));
        } finally {
            setBusy("");
        }
    };

    if (error) return <Note warning look={look}>{error}</Note>;
    if (!settings) return null;

    const provider = settings.providers.find((item) => item.key === draft.provider) ?? settings.providers[0];
    const providerChanged = draft.provider !== settings.provider;
    const keyThere = settings.keySet && !providerChanged && !removeKey;
    const local = draft.provider === "local";
    const width = { xs: "100%", md: 520 };

    return (
        <Stack spacing={2}>
            <SettingsSection icon={<Bot size={19} />} title="AI assistant" colors={colors} isDarkMode={isDarkMode}
                             subtitle="The help chat can answer with an AI model that reads the user's projects: why a protocol failed, what it produced, which protocol or parameter to use."
                             actions={
                                 <Button size="small" variant="contained" sx={saveButtonSx} startIcon={<Save size={15} />}
                                         disabled={busy !== ""} onClick={() => void run("save")}>
                                     {busy === "save" ? "Saving…" : "Save assistant settings"}
                                 </Button>
                             }>
                <SettingRow colors={colors} title="Answer with AI"
                            description={
                                <>
                                    Off by default: nothing is sent to any model and the chat answers from the web's own
                                    help, as always. On, the chat of the people allowed below answers with the model.
                                </>
                            }
                            control={
                                <Switch checked={draft.enabled} slotProps={{ input: { "aria-label": "Answer with AI" } }}
                                        onChange={(e) => set({ enabled: e.target.checked })} />
                            } />
                <SettingRow colors={colors} title="Provider" labelFor="assistant-provider"
                            description="Who runs the model. A local model is one your centre runs on its own server; nothing leaves the centre then."
                            control={
                                <TextField id="assistant-provider" sx={{ ...selectSx, width }} size="small" select
                                           value={draft.provider}
                                           SelectProps={{ MenuProps: { PaperProps: { sx: menuPaperSx } } }}
                                           onChange={(e) => {
                                               set({ provider: e.target.value as AssistantProviderKey, model: "" });
                                               setModels([]);
                                           }}>
                                    {settings.providers.map((item) => (
                                        <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>
                                    ))}
                                </TextField>
                            } />
                {local && (
                    <SettingRow colors={colors} title="Address" labelFor="assistant-address"
                                description="Where the local model answers, as its server gives it."
                                control={
                                    <TextField id="assistant-address" sx={{ ...fieldSx, width }} size="small"
                                               value={draft.baseUrl} placeholder="http://gpu-server:11434/v1"
                                               onChange={(e) => set({ baseUrl: e.target.value })} />
                                } />
                )}
                <SettingRow colors={colors} title="Key" labelFor="assistant-key"
                            description={local ? "Only if your local server asks for one." : "The provider's API key. It is kept encrypted on the server and never shown again, not even to administrators."}
                            control={
                                <Stack spacing={0.5} alignItems="flex-start" sx={{ width }}>
                                    <TextField id="assistant-key" sx={{ ...fieldSx, width: "100%" }} size="small" type="password"
                                               value={key} autoComplete="new-password" disabled={removeKey}
                                               helperText={keyThere ? "Set: leave it empty to keep it"
                                                   : providerChanged && settings.keySet ? "The key of the other provider is forgotten when you save"
                                                       : "None set"}
                                               onChange={(e) => setKey(e.target.value)} />
                                    {settings.keySet && !providerChanged && (
                                        <Button size="small" variant="text"
                                                sx={{ textTransform: "none", fontSize: SETTINGS_TEXT.text, fontWeight: 600,
                                                      color: removeKey ? colors.primary : "#dc2626" }}
                                                onClick={() => setRemoveKey((value) => !value)}>
                                            {removeKey ? "Keep the key" : "Remove the key"}
                                        </Button>
                                    )}
                                </Stack>
                            } />
                <SettingRow colors={colors} title="Model" labelFor="assistant-model"
                            description="Load the models the key can use and pick one, or write its name."
                            control={
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems={{ sm: "center" }} sx={{ width }}>
                                    <Autocomplete freeSolo options={models} value={draft.model} sx={{ flex: 1 }}
                                                  onInputChange={(_, value) => set({ model: value })}
                                                  slotProps={{ paper: { sx: menuPaperSx } }}
                                                  renderInput={(params) => (
                                                      <TextField {...params} id="assistant-model" sx={fieldSx} size="small"
                                                                 placeholder="Model name" />
                                                  )} />
                                    <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<ListRestart size={15} />}
                                            disabled={busy !== "" || (provider.needsKey && !keyThere && !key.trim()) || (local && !draft.baseUrl.trim())}
                                            onClick={() => void run("models")}>
                                        {busy === "models" ? "Loading…" : "Load models"}
                                    </Button>
                                </Stack>
                            } />
                <SettingRow colors={colors} title="Try it"
                            description="Asks the model one short question with the settings above, before saving them."
                            control={
                                <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Sparkles size={15} />}
                                        disabled={busy !== "" || !draft.model.trim()} onClick={() => void run("test")}>
                                    {busy === "test" ? "Asking…" : "Test the model"}
                                </Button>
                            } />
                <SettingRow colors={colors} title="What it may do" labelFor="assistant-mode"
                            description="Proposing: it can offer to relaunch, continue or stop a protocol, or open the form of the next one. Each proposal is a card; nothing happens until the person presses Apply."
                            control={
                                <TextField id="assistant-mode" sx={{ ...selectSx, width }} size="small" select value={draft.mode}
                                           SelectProps={{ MenuProps: { PaperProps: { sx: menuPaperSx } } }}
                                           onChange={(e) => set({ mode: e.target.value })}>
                                    {(settings.modes ?? ["answer"]).map((value) => (
                                        <MenuItem key={value} value={value}>{MODE_LABELS[value] ?? value}</MenuItem>
                                    ))}
                                </TextField>
                            } />
                {draft.mode === "propose" && (
                    <SettingRow colors={colors} title="Propose deleting protocols"
                                description="Off by default. Deleting cannot be undone, so the card lists everything that is lost and the person must write the protocol's number to confirm. Never projects, never a running protocol, never one whose depending protocols have results."
                                control={
                                    <Switch checked={draft.allowDelete}
                                            slotProps={{ input: { "aria-label": "Propose deleting protocols" } }}
                                            onChange={(e) => set({ allowDelete: e.target.checked })} />
                                } />
                )}
                <SettingRow colors={colors} title="Questions per person and day" labelFor="assistant-limit"
                            description="Each question costs money with a paid provider. When someone reaches the limit, the assistant answers them again the next day."
                            control={
                                <TextField id="assistant-limit" sx={{ ...fieldSx, width: 140 }} size="small" value={draft.dailyLimit}
                                           inputProps={{ inputMode: "numeric" }} onChange={(e) => set({ dailyLimit: e.target.value })} />
                            } />
            </SettingsSection>

            <SettingsSection icon={<ShieldCheck size={19} />} title="What it may do" colors={colors} isDarkMode={isDarkMode} plain
                             subtitle="It acts with the permissions of the person who asks, never more.">
                <Stack spacing={1} sx={{ fontSize: SETTINGS_TEXT.text, color: colors.text, lineHeight: 1.55 }}>
                    <Box>
                        <strong>Who uses it:</strong> the people whose role has the permission <em>Ask the AI assistant</em>
                        {" "}(Roles tab). Administrators always have it. Everyone else keeps the plain help chat.
                    </Box>
                    <Box>
                        <strong>It reads</strong> the projects the person can see (protocols, parameters, outputs,
                        logs, failure causes) and the help.
                    </Box>
                    <Box>
                        <strong>It proposes</strong>, only if chosen above and only in projects the person can work in:
                        relaunch a protocol (with other parameters, or continue a failed one), copy one with other
                        parameters, stop one, open the form of the next step and, if turned on, delete one. The card
                        shows what changes and what is lost, and asks about the protocols that depend on it. Nothing
                        runs until the person presses Apply.
                    </Box>
                    <Box>
                        <strong>Never:</strong> delete projects, change a protocol's inputs, touch users, roles
                        or settings, or run commands on the server. Those tools do not exist for it, so nothing it
                        reads can make it do them.
                    </Box>
                    {!local && (
                        <Note warning look={look}>
                            With a provider outside the centre, the questions and what the assistant reads to answer them
                            (log lines, parameters, project and protocol names) are sent to that provider.
                        </Note>
                    )}
                    {settings.usage && (
                        <Note look={look}>
                            <UsageLine label="Today" totals={settings.usage.today} />
                            <UsageLine label="Last 30 days" totals={settings.usage.last30Days} />
                        </Note>
                    )}
                </Stack>
            </SettingsSection>
        </Stack>
    );
}
