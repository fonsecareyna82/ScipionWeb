import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
    Alert, Autocomplete, Box, Button, CircularProgress, InputAdornment, Stack, Tab, Tabs, TextField, ToggleButton,
    ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import {
    BellRing, CalendarClock, Clock, Copy, Download, Eye, ExternalLink, FolderKanban, Globe2, Hammer, Mail, MonitorPlay,
    Plus, Power, RefreshCw, RotateCcw, Save, Scale, ScanSearch, Tag, UserRound, UsersRound, Wand2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Link as RouterLink } from "react-router";

import { useIsDark } from "@/context/ThemeContext";
import { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { SettingRow, SettingsSection, choiceButtonsSx, sectionTint } from "@/pages/Settings/SettingsSection";
import {
    getFacilitySettings,
    getRoomScreenLink,
    makeRoomScreenLink,
    turnOffRoomScreen,
    saveFacilitySettings,
    type RoomScreenLink,
    type FacilitySettingsAnswer,
} from "@/api/facility";
import { FACILITY_TEXT, useFacilityStyles } from "./facilityStyles";
import { useConventionsPreview } from "./useConventionsPreview";

type PanelStyles = {
    fieldSx: any;
    cardSx: any;
    cardHeaderSx: any;
    tabsSx?: any;
    actionButtonSx?: any;
    saveButtonSx?: any;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

// What every section gets: the look of the Settings sections and the buttons
type SectionProps = {
    answer: FacilitySettingsAnswer;
    onSaved: (answer: FacilitySettingsAnswer) => void;
    fieldSx: any;
    colors: PanelStyles["colors"] & { card: string; primary: string };
    isDark: boolean;
    actionSx: any;
    saveSx: any;
};

// The sections of the configuration, a tab each
const SECTIONS = [
    { key: "naming", label: "Naming", icon: Tag },
    { key: "policies", label: "Policies", icon: Scale },
    { key: "users", label: "For the users", icon: UsersRound },
    { key: "mail", label: "Alerts", icon: Mail },
    { key: "room", label: "Room screen", icon: MonitorPlay },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];
const SECTION_STORAGE_KEY = "scipionweb.facility.configurationSection";

function storedSection(): SectionKey {
    try {
        const stored = localStorage.getItem(SECTION_STORAGE_KEY);
        if (SECTIONS.some((section) => section.key === stored)) return stored as SectionKey;
    } catch {
        // Unavailable storage starts on the first section
    }
    return "naming";
}

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

// Every time zone the browser knows, to pick one rather than type it
const TIME_ZONES: string[] = (() => {
    try {
        return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
        return [];
    }
})();

/** Reset and Save of a section, at its top, with a dot while something is not saved. */
function SaveActions({ changed, saving, canSave = true, onReset, onSave, actionSx, saveSx, colors }: {
    changed: boolean;
    saving: boolean;
    canSave?: boolean;
    onReset: () => void;
    onSave: () => void;
    actionSx: any;
    saveSx: any;
    colors: { muted: string };
}) {
    return (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
            {changed && (
                <Stack direction="row" spacing={0.75} alignItems="center" role="status" sx={{ pr: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#f59e0b" }} />
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: colors.muted }}>Unsaved changes</Typography>
                </Stack>
            )}
            <Button size="small" variant="outlined" sx={actionSx} startIcon={<RotateCcw size={15} />}
                    disabled={saving || !changed} onClick={onReset}>
                Reset
            </Button>
            <Button size="small" variant="contained" sx={saveSx} startIcon={<Save size={15} />}
                    disabled={saving || !changed || !canSave} onClick={onSave}>
                {saving ? "Saving…" : "Save"}
            </Button>
        </Stack>
    );
}

/** A number field with its unit inside, for the right side of a row. */
function NumberField({ id, value, onChange, unit, width = 170, fieldSx, decimal, label }: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    unit: string;
    width?: number;
    fieldSx: any;
    decimal?: boolean;
    label?: string;
}) {
    return (
        <TextField id={id} sx={{ ...fieldSx, width }} size="small" value={value}
                   inputProps={{ inputMode: decimal ? "decimal" : "numeric", ...(label ? { "aria-label": label } : {}) }}
                   InputProps={{ endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }}
                   onChange={(e) => onChange(e.target.value)} />
    );
}

/** The facility's own conventions and ways: how it names sessions, its policies, what its users see, its alerts. */
export default function ConfigurationPanel({ fieldSx, tabsSx, colors, actionButtonSx, saveButtonSx }: PanelStyles) {
    const isDark = useIsDark();
    const sectionColors = { ...useFacilityStyles().colors, ...colors };
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
    const [answer, setAnswer] = useState<FacilitySettingsAnswer | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [section, setSection] = useState<SectionKey>(storedSection);

    const openSection = (key: SectionKey) => {
        setSection(key);
        try {
            localStorage.setItem(SECTION_STORAGE_KEY, key);
        } catch {
            // The section is only remembered where the browser lets it
        }
    };

    const load = useCallback(async () => {
        setError(null);
        try {
            setAnswer(await getFacilitySettings());
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the facility's settings"));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    if (error) return <Alert severity="error">{error}</Alert>;
    if (!answer) return <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>;

    // Every section stays mounted (hidden when another is open), so what is typed in one is not lost by looking at another
    const shown = (key: SectionKey) => ({ display: section === key ? "block" : "none" });
    const common: SectionProps = { answer, onSaved: setAnswer, fieldSx, colors: sectionColors, isDark, actionSx, saveSx };

    return (
        <Stack spacing={2}>
            <Tabs value={section} onChange={(_, value) => openSection(value as SectionKey)} variant="scrollable"
                  scrollButtons="auto" sx={tabsSx} aria-label="Configuration sections">
                {SECTIONS.map(({ key, label, icon: Icon }) => (
                    <Tab key={key} value={key} label={label} icon={<Icon size={16} />} iconPosition="start" />
                ))}
            </Tabs>
            <Box sx={shown("naming")} role="tabpanel" aria-label="Naming"><NamingSection {...common} /></Box>
            <Box sx={shown("policies")} role="tabpanel" aria-label="Policies"><PoliciesSection {...common} /></Box>
            <Box sx={shown("users")} role="tabpanel" aria-label="For the users"><UsersSection {...common} /></Box>
            <Box sx={shown("mail")} role="tabpanel" aria-label="Alerts"><AlertsSection {...common} /></Box>
            <Box sx={shown("room")} role="tabpanel" aria-label="Room screen">
                <RoomScreenSection colors={sectionColors} isDark={isDark} actionSx={actionSx} saveSx={saveSx} />
            </Box>
        </Stack>
    );
}

/** How the facility names its sessions (each microscope names its folders). */
function NamingSection({ answer, onSaved, fieldSx, colors, isDark, actionSx, saveSx }: SectionProps) {
    const saved = answer.settings.sessionNamePattern;
    const [pattern, setPattern] = useState(saved);
    const [saving, setSaving] = useState(false);
    const preview = useConventionsPreview({ sessionNamePattern: pattern });
    const changed = pattern.trim() !== saved;

    useEffect(() => setPattern(saved), [saved]);

    const save = async () => {
        setSaving(true);
        try {
            const next = await saveFacilitySettings({ sessionNamePattern: pattern.trim() });
            onSaved(next);
            toast.success("Settings saved: new sessions are named this way.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the settings"));
        } finally {
            setSaving(false);
        }
    };

    const addPiece = (piece: string) =>
        setPattern((current) => (!current ? piece : /[_\-.]$/.test(current) ? current + piece : `${current}_${piece}`));

    return (
        <Stack spacing={2}>
            <SettingsSection
                plain
                icon={<Tag size={19} />}
                title="Session names"
                subtitle="How this facility names its sessions. A session keeps the name it was given; each microscope names its folders."
                colors={colors}
                isDarkMode={isDark}
                actions={<SaveActions changed={changed} saving={saving} canSave={!preview.error && !!pattern.trim()}
                                      onReset={() => setPattern(saved)} onSave={() => void save()}
                                      actionSx={actionSx} saveSx={saveSx} colors={colors} />}
            >
                <SettingRow
                    colors={colors}
                    title="Session name"
                    labelFor="facility-session-name"
                    description="Made of the pieces below; anything else is kept as written."
                    control={
                        <TextField id="facility-session-name" sx={{ ...fieldSx, width: { xs: "100%", md: 420 } }} size="small"
                                   value={pattern} inputProps={{ style: { fontFamily: "monospace" } }}
                                   onChange={(e) => setPattern(e.target.value)} />
                    }
                />
                <Box sx={{ py: 2 }}>
                    {preview.error
                        ? <Alert severity="warning">{preview.error}</Alert>
                        : (
                            <Box sx={{ borderRadius: 2, bgcolor: sectionTint(isDark), px: 2, py: 1.5 }}>
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                    A session of Gaoxin Lu (group Shannon lab, PI Ashleigh Shannon) on the KRIOS, number 123, is named
                                </Typography>
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle + 2, fontWeight: 800, fontFamily: "monospace",
                                                  color: colors.text, mt: 0.5, wordBreak: "break-all", minHeight: 28 }}>
                                    {preview.examples?.session ?? ""}
                                </Typography>
                            </Box>
                        )}
                </Box>
                <Box sx={{ py: 2 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 700, color: colors.text }}>Pieces</Typography>
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mb: 1.25 }}>
                        Click one to add it to the end of the name.
                    </Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, columnGap: 3, rowGap: 0.75 }}>
                        {NAME_PIECES.map(([piece, meaning]) => (
                            <Stack key={piece} direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                                <Button size="small" variant="outlined" startIcon={<Plus size={13} />} aria-label={`Add ${piece}`}
                                        onClick={() => addPiece(piece)}
                                        sx={{ textTransform: "none", fontFamily: "monospace", fontSize: FACILITY_TEXT.note,
                                              borderRadius: 2, py: 0.1, flexShrink: 0, color: colors.text, borderColor: colors.border }}>
                                    {piece}
                                </Button>
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, minWidth: 0 }}>{meaning}</Typography>
                            </Stack>
                        ))}
                    </Box>
                </Box>
                <Box sx={{ py: 2 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.sectionTitle, fontWeight: 700, color: colors.text }}>Start from</Typography>
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mb: 1.25 }}>
                        A ready-made way fills the name; nothing changes until Save. The folders of its microscopes are set
                        on each microscope ({answer.presets
                            .map((preset) => `${preset.label}: ${preset.microscope.dataFolderPattern}, ${preset.microscope.atlasFolderPattern}, ${preset.microscope.gridSlots} grids`)
                            .join("; ")}).
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
                    </Stack>
                </Box>
            </SettingsSection>
        </Stack>
    );
}

/** How the facility works, where facilities differ: the CNB's way by default. */
function PoliciesSection({ answer, onSaved, fieldSx, colors, isDark, actionSx, saveSx }: SectionProps) {
    const current = answer.settings;
    const savedDraft = {
        owner: current.projectOwner ?? "staff",
        share: current.projectShareLevel ?? "view",
        tolerance: String(current.calibrationTolerancePercent ?? 10),
        stall: String(current.stallMinutes ?? 20),
        watch: String(current.watchSeconds ?? 30),
        minDefocus: String(current.ctfMinDefocus ?? 5000),
        maxDefocus: String(current.ctfMaxDefocus ?? 40000),
        resolution: String(current.ctfMaxResolution ?? 8),
        timezone: current.timezone ?? "Europe/Madrid",
    };
    const savedKey = JSON.stringify(savedDraft);
    const [draft, setDraft] = useState(savedDraft);
    const [saving, setSaving] = useState(false);
    const set = (change: Partial<typeof draft>) => setDraft((old) => ({ ...old, ...change }));
    const changed = JSON.stringify(draft) !== savedKey;
    const choiceSx = choiceButtonsSx({ ...colors, hover: colors.hover }, isDark);

    useEffect(() => setDraft(JSON.parse(savedKey)), [savedKey]);

    const save = async () => {
        setSaving(true);
        try {
            onSaved(await saveFacilitySettings({
                projectOwner: draft.owner, projectShareLevel: draft.share, calibrationTolerancePercent: Number(draft.tolerance),
                stallMinutes: Number(draft.stall), watchSeconds: Number(draft.watch), ctfMinDefocus: Number(draft.minDefocus),
                ctfMaxDefocus: Number(draft.maxDefocus), ctfMaxResolution: Number(draft.resolution), timezone: draft.timezone.trim(),
            }));
            toast.success("Policies saved: they apply from the watcher's next look.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the policies"));
        } finally {
            setSaving(false);
        }
    };

    const zones = TIME_ZONES.includes(draft.timezone) || !draft.timezone ? TIME_ZONES : [draft.timezone, ...TIME_ZONES];

    return (
        <Stack spacing={2}>
            <SaveActions changed={changed} saving={saving} onReset={() => setDraft(JSON.parse(savedKey))}
                         onSave={() => void save()} actionSx={actionSx} saveSx={saveSx} colors={colors} />
            <SettingsSection
                plain
                icon={<FolderKanban size={19} />}
                title="The projects of the sessions"
                subtitle="Whose a DATA's project is. The defaults are the CNB's: the staff own the processing, and its users only look. They apply to the projects made from now on."
                colors={colors}
                isDarkMode={isDark}
            >
                <SettingRow
                    colors={colors}
                    title="Owner of a DATA's project"
                    description={draft.owner === "staff" ? "The staff who made the session; its user and group see it."
                        : "The session's user; the staff who made it manage it."}
                    control={
                        <ToggleButtonGroup exclusive size="small" value={draft.owner} aria-label="Owner of a DATA's project"
                                           onChange={(_, value) => value && set({ owner: value })} sx={choiceSx}>
                            <ToggleButton value="staff"><Hammer size={15} style={{ marginRight: 6 }} />The facility's staff</ToggleButton>
                            <ToggleButton value="user"><UserRound size={15} style={{ marginRight: 6 }} />The session's user</ToggleButton>
                        </ToggleButtonGroup>
                    }
                />
                <SettingRow
                    colors={colors}
                    title="The user and group may"
                    description="On the project, when they do not own it."
                    control={
                        <ToggleButtonGroup exclusive size="small" value={draft.share} aria-label="The user and group may"
                                           onChange={(_, value) => value && set({ share: value })} sx={choiceSx}>
                            <ToggleButton value="view"><Eye size={15} style={{ marginRight: 6 }} />Look at it</ToggleButton>
                            <ToggleButton value="work"><Wand2 size={15} style={{ marginRight: 6 }} />Work in it</ToggleButton>
                        </ToggleButtonGroup>
                    }
                />
            </SettingsSection>

            <SettingsSection
                plain
                icon={<ScanSearch size={19} />}
                title="Watching the microscopes"
                subtitle="How the folders of the sessions that acquire are looked at. These apply at once."
                colors={colors}
                isDarkMode={isDark}
            >
                <SettingRow colors={colors} title="Stalled after" labelFor="facility-stall"
                            description="A DATA acquiring without a new movie for this long raises an alert."
                            control={<NumberField id="facility-stall" value={draft.stall} onChange={(stall) => set({ stall })}
                                                  unit="minutes" fieldSx={fieldSx} />} />
                <SettingRow colors={colors} title="Look at the folders every" labelFor="facility-watch"
                            description="Slower network mounts may want more."
                            control={<NumberField id="facility-watch" value={draft.watch} onChange={(watch) => set({ watch })}
                                                  unit="seconds" fieldSx={fieldSx} />} />
                <SettingRow colors={colors} title="Calibration tolerance" labelFor="facility-tolerance"
                            description="A detector's calibrated pixel size further than this from the one in the movies is not used."
                            control={<NumberField id="facility-tolerance" value={draft.tolerance} decimal
                                                  onChange={(tolerance) => set({ tolerance })} unit="%" fieldSx={fieldSx} />} />
            </SettingsSection>

            <SettingsSection
                plain
                icon={<Clock size={19} />}
                title="Processing and time"
                subtitle="The limits a new session's processing starts with, and where the facility is."
                colors={colors}
                isDarkMode={isDark}
            >
                <SettingRow colors={colors} title="CTF limits"
                            description="Defocus from and to, and the resolution the CTF fit must reach. Each session can change them."
                            control={
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                                    <NumberField label="CTF: minimum defocus" value={draft.minDefocus} decimal width={140}
                                                 onChange={(minDefocus) => set({ minDefocus })} unit="Å" fieldSx={fieldSx} />
                                    <Typography sx={{ color: colors.muted, fontSize: FACILITY_TEXT.note }}>to</Typography>
                                    <NumberField label="CTF: maximum defocus" value={draft.maxDefocus} decimal width={140}
                                                 onChange={(maxDefocus) => set({ maxDefocus })} unit="Å" fieldSx={fieldSx} />
                                    <Typography sx={{ color: colors.muted, fontSize: FACILITY_TEXT.note, pl: { sm: 1 } }}>better than</Typography>
                                    <NumberField label="CTF: resolution better than" value={draft.resolution} decimal width={110}
                                                 onChange={(resolution) => set({ resolution })} unit="Å" fieldSx={fieldSx} />
                                </Stack>
                            } />
                <SettingRow colors={colors} title="Time zone" labelFor="facility-timezone"
                            description="Where the facility is: a booking's session is on the day it starts there, and the data are kept counting from its days."
                            control={zones.length ? (
                                <Autocomplete
                                    id="facility-timezone"
                                    size="small"
                                    sx={{ width: { xs: "100%", md: 300 } }}
                                    options={zones}
                                    value={draft.timezone}
                                    disableClearable
                                    onChange={(_, value) => value && set({ timezone: value })}
                                    renderInput={(params) => (
                                        <TextField {...params} sx={fieldSx} placeholder="Europe/Madrid"
                                                   InputProps={{ ...params.InputProps,
                                                                 startAdornment: <Globe2 size={16} style={{ color: colors.muted, marginLeft: 4 }} /> }} />
                                    )}
                                />
                            ) : (
                                <TextField id="facility-timezone" sx={{ ...fieldSx, width: 300 }} size="small" value={draft.timezone}
                                           placeholder="Europe/Madrid" onChange={(e) => set({ timezone: e.target.value })} />
                            )} />
            </SettingsSection>
        </Stack>
    );
}

/** What the facility tells its users in My sessions: how long it keeps their data, and how to take them home. */
function UsersSection({ answer, onSaved, fieldSx, colors, isDark, actionSx, saveSx }: SectionProps) {
    const savedDraft = {
        raw: String(answer.settings.rawRetentionDays ?? 0),
        processed: String(answer.settings.processedRetentionDays ?? 0),
        notices: (answer.settings.retentionNoticeDays ?? []).join(", "),
        instructions: answer.settings.downloadInstructions ?? "",
    };
    const savedKey = JSON.stringify(savedDraft);
    const [draft, setDraft] = useState(savedDraft);
    const [saving, setSaving] = useState(false);
    const set = (change: Partial<typeof draft>) => setDraft((old) => ({ ...old, ...change }));
    const changed = JSON.stringify(draft) !== savedKey;

    useEffect(() => setDraft(JSON.parse(savedKey)), [savedKey]);

    const save = async () => {
        // "30, 7, 1": the API checks each day and how many there are
        const noticeDays = draft.notices.split(/[\s,;]+/).filter(Boolean).map(Number);
        if (noticeDays.some((day) => !Number.isInteger(day))) {
            toast.error("The notice days are whole numbers separated by commas, e.g. 30, 7, 1");
            return;
        }
        setSaving(true);
        try {
            onSaved(await saveFacilitySettings({
                rawRetentionDays: Number(draft.raw) || 0, processedRetentionDays: Number(draft.processed) || 0,
                downloadInstructions: draft.instructions.trim(),
                retentionNoticeDays: noticeDays,
            }));
            toast.success("Saved: the users see it in My sessions.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the settings"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Stack spacing={2}>
            <SaveActions changed={changed} saving={saving} onReset={() => setDraft(JSON.parse(savedKey))}
                         onSave={() => void save()} actionSx={actionSx} saveSx={saveSx} colors={colors} />
            <SettingsSection
                plain
                icon={<CalendarClock size={19} />}
                title="How long the data are kept"
                subtitle="Counted from the day a session finished. Every user sees it in My sessions. Nothing is deleted by itself: the staff do it in Data retention."
                colors={colors}
                isDarkMode={isDark}
            >
                <SettingRow colors={colors} title="Raw movies kept" labelFor="facility-raw-days"
                            description="0: no date is given."
                            control={<NumberField id="facility-raw-days" value={draft.raw} onChange={(raw) => set({ raw })}
                                                  unit="days" fieldSx={fieldSx} />} />
                <SettingRow colors={colors} title="Projects kept" labelFor="facility-processed-days"
                            description="The processing of each DATA. 0: no date is given."
                            control={<NumberField id="facility-processed-days" value={draft.processed}
                                                  onChange={(processed) => set({ processed })} unit="days" fieldSx={fieldSx} />} />
                <SettingRow colors={colors} title="Notices before the data go" labelFor="facility-notices"
                            description="The session's user and the group's PI are told this many days before each date, in their bell and by mail. Empty: no notices."
                            control={
                                <TextField id="facility-notices" sx={{ ...fieldSx, width: 220 }} size="small" value={draft.notices}
                                           placeholder="30, 7, 1" onChange={(e) => set({ notices: e.target.value })}
                                           InputProps={{ startAdornment: <InputAdornment position="start"><BellRing size={15} /></InputAdornment>,
                                                         endAdornment: <InputAdornment position="end">days</InputAdornment> }} />
                            } />
            </SettingsSection>

            <SettingsSection
                plain
                icon={<Download size={19} />}
                title="Taking the data home"
                subtitle="What every user reads in My sessions about downloading their data."
                colors={colors}
                isDarkMode={isDark}
            >
                <Box sx={{ py: 2 }}>
                    <TextField sx={fieldSx} size="small" fullWidth multiline minRows={5} value={draft.instructions}
                               inputProps={{ "aria-label": "Taking the data home" }}
                               placeholder="How to download the data: the iRODS ticket, rsync, a disk…"
                               onChange={(e) => set({ instructions: e.target.value })} />
                </Box>
            </SettingsSection>
        </Stack>
    );
}

/** Who is told of the facility's alerts: a list of addresses, else the users who run sessions (as each chose). */
function AlertsSection({ answer, onSaved, fieldSx, colors, isDark, actionSx, saveSx }: SectionProps) {
    const saved = answer.settings.alertRecipients ?? "";
    const [recipients, setRecipients] = useState(saved);
    const [saving, setSaving] = useState(false);
    const changed = recipients.trim() !== saved;

    useEffect(() => setRecipients(saved), [saved]);

    const save = async () => {
        setSaving(true);
        try {
            onSaved(await saveFacilitySettings({ alertRecipients: recipients.trim() }));
            toast.success("Saved.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the alert recipients"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsSection
            plain
            icon={<Mail size={19} />}
            title="Alerts"
            subtitle="When a DATA stops receiving movies, or its processing or a protocol of its project fails, the operators are told at once, besides the red banner of the web."
            colors={colors}
            isDarkMode={isDark}
            actions={<SaveActions changed={changed} saving={saving} onReset={() => setRecipients(saved)}
                                  onSave={() => void save()} actionSx={actionSx} saveSx={saveSx} colors={colors} />}
        >
            <SettingRow colors={colors} title="Mail the alerts to" labelFor="facility-alert-recipients"
                        description="Addresses separated by commas. Empty: every user who runs sessions, in their bell and by mail as each of them chose."
                        control={
                            <TextField id="facility-alert-recipients" sx={{ ...fieldSx, width: { xs: "100%", md: 420 } }} size="small"
                                       value={recipients} placeholder="ops1@example.org, ops2@example.org"
                                       onChange={(e) => setRecipients(e.target.value)} />
                        } />
            <SettingRow colors={colors} title="Mail server"
                        description={<>ScipionWeb's own, set in{" "}
                            <RouterLink to="/settings?tab=notifications" style={{ textDecoration: "underline" }}>Settings, Notifications</RouterLink>.
                            No mail goes out until an administrator turns mail on there.</>}
                        control={null} />
        </SettingsSection>
    );
}

/** The link of the microscopes' room screen: whoever has it sees the screen, so a new one stops the old one. */
function RoomScreenSection({ colors, isDark, actionSx, saveSx }: {
    colors: SectionProps["colors"];
    isDark: boolean;
    actionSx: any;
    saveSx: any;
}) {
    const [link, setLink] = useState<RoomScreenLink | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getRoomScreenLink().then(setLink).catch((e: any) => setError(String(e?.message || "Failed to load the link")));
    }, []);

    const url = link?.token ? `${window.location.origin}/room?token=${encodeURIComponent(link.token)}` : "";
    const act = async (action: () => Promise<RoomScreenLink>, done: string) => {
        setBusy(true);
        try {
            setLink(await action());
            toast.success(done);
        } catch (e: any) {
            toast.error(String(e?.message || "That did not work"));
        } finally {
            setBusy(false);
        }
    };
    const copy = () => {
        navigator.clipboard?.writeText(url).then(() => toast.success("Link copied."), () => toast.error("The browser did not let it copy."));
    };

    if (error) return <Alert severity="error">{error}</Alert>;
    if (!link) return null;
    const on = link.enabled;
    const stateColor = on ? "#16a34a" : "#64748b";
    const shows: [ReactNode, string][] = [
        [<MonitorPlay size={15} />, "Each microscope's state and session"],
        [<ScanSearch size={15} />, "Its grids' progress"],
        [<BellRing size={15} />, "The alerts"],
        [<CalendarClock size={15} />, "The sessions of the next days"],
    ];

    return (
        <SettingsSection
            plain
            icon={<MonitorPlay size={19} />}
            title="Room screen"
            subtitle="A screen beside the microscopes, readable from across the room. It shows names and states only, and needs no one signed in: open its link on the room's screen."
            colors={colors}
            isDarkMode={isDark}
            actions={on ? (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="flex-end">
                    <Button size="small" variant="outlined" sx={actionSx} startIcon={<RefreshCw size={15} />}
                            disabled={busy} onClick={() => void act(makeRoomScreenLink, "New link made: the old one no longer works.")}>
                        New link
                    </Button>
                    <Button size="small" variant="outlined" sx={{ ...actionSx, color: "#dc2626" }} startIcon={<Power size={15} />}
                            disabled={busy} onClick={() => void act(turnOffRoomScreen, "The room screen is off.")}>
                        Turn off
                    </Button>
                </Stack>
            ) : (
                <Button size="small" variant="contained" sx={saveSx} startIcon={<MonitorPlay size={15} />}
                        disabled={busy} onClick={() => void act(makeRoomScreenLink, "The room screen is on: open its link there.")}>
                    Make its link
                </Button>
            )}
        >
            <SettingRow
                colors={colors}
                title="State"
                description={on ? "On: its link opens the screen." : "The room screen is off: no link opens it."}
                control={
                    <Box component="span" sx={{ px: 1.25, borderRadius: 10, fontSize: FACILITY_TEXT.badge, fontWeight: 700,
                                                lineHeight: 1.9, color: stateColor, bgcolor: `${stateColor}1f` }}>
                        {on ? "On" : "Off"}
                    </Box>
                }
            />
            {on && (
                <Box sx={{ py: 2 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text, mb: 0.75 }}>Its link</Typography>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
                        <Box sx={{ flex: 1, minWidth: 0, border: `1px solid ${colors.border}`, borderRadius: 2, px: 1.5, py: 0.9,
                                   bgcolor: sectionTint(isDark), fontFamily: "monospace", fontSize: FACILITY_TEXT.itemLine,
                                   wordBreak: "break-all", color: colors.text }}>
                            {url}
                        </Box>
                        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                            <Tooltip arrow title="Copy the link">
                                <Button size="small" variant="outlined" sx={actionSx} startIcon={<Copy size={15} />} onClick={copy}>
                                    Copy the link
                                </Button>
                            </Tooltip>
                            <Button size="small" variant="outlined" sx={actionSx} startIcon={<ExternalLink size={15} />}
                                    component="a" href={url} target="_blank" rel="noreferrer">
                                Open the screen
                            </Button>
                        </Stack>
                    </Stack>
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.75 }}>
                        Whoever has this link sees the screen: give it only to the room's screen. If it goes further, make a new one.
                    </Typography>
                </Box>
            )}
            <Box sx={{ py: 2 }}>
                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text, mb: 1 }}>What it shows</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
                    {shows.map(([icon, text]) => (
                        <Stack key={text} direction="row" spacing={1} alignItems="center"
                               sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, px: 1.25, py: 0.9, color: colors.muted }}>
                            {icon}
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text }}>{text}</Typography>
                        </Stack>
                    ))}
                </Box>
            </Box>
        </SettingsSection>
    );
}
