import { useMemo, useState } from "react";
import {
    Box, Button, CircularProgress, InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Asterisk, List, PencilLine, Plus, RotateCcw, Search, SquareTerminal, Undo2 } from "lucide-react";

import SettingsDialog from "./SettingsDialog";
import { SETTINGS_TEXT, SettingsSection, choiceButtonsSx, sectionTint } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";

export type EnvironmentRow = {
    name: string;
    value: string;
    isOverride: boolean;
    default?: string;
    description?: string;
};

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const AMBER = "#b45309";

type Show = "all" | "changed" | "unsaved";

/**
 * Settings → Environment: the variables that say where the programs are and how they run, for everyone on this server.
 * The page keeps the list and saves it (Reload, Reset and Save at the top); this shows and edits it.
 */
export default function EnvironmentPanel({ rows, savedRows, loading, error, onChange, onAdd, onBackToDefault }: {
    rows: EnvironmentRow[];
    savedRows: EnvironmentRow[];
    loading: boolean;
    error: string | null;
    onChange: (name: string, value: string) => void;
    onAdd: (name: string, value: string) => void;
    onBackToDefault: (name: string) => void;
}) {
    const isDarkMode = useTheme().palette.mode === "dark";
    const { colors, fieldSx, actionButtonSx, saveButtonSx } = useSettingsStyles(isDarkMode);
    const [search, setSearch] = useState("");
    const [show, setShow] = useState<Show>("all");
    const [newName, setNewName] = useState("");
    const [newValue, setNewValue] = useState("");
    const [adding, setAdding] = useState(false);

    const saved = useMemo(() => new Map(savedRows.map((row) => [row.name, row.value])), [savedRows]);
    const isUnsaved = (row: EnvironmentRow) => saved.get(row.name) !== row.value;
    const unsavedCount = rows.filter(isUnsaved).length;
    const changedCount = rows.filter((row) => row.isOverride).length;

    const shown = useMemo(() => {
        const words = search.trim().toLowerCase();
        return rows.filter((row) => {
            if (show === "changed" && !row.isOverride) return false;
            if (show === "unsaved" && saved.get(row.name) === row.value) return false;
            if (!words) return true;
            return `${row.name} ${row.value} ${row.description ?? ""}`.toLowerCase().includes(words);
        });
    }, [rows, search, show, saved]);

    const trimmedName = newName.trim();
    const nameTaken = rows.some((row) => row.name === trimmedName);
    const nameInvalid = Boolean(trimmedName) && !NAME_PATTERN.test(trimmedName);
    const canAdd = Boolean(trimmedName) && !nameTaken && !nameInvalid && !loading;

    const closeAdd = () => {
        setAdding(false);
        setNewName("");
        setNewValue("");
    };

    const add = () => {
        if (!canAdd) return;
        onAdd(trimmedName, newValue);
        closeAdd();
        // Show it: the new variable is in the list, marked New
        setSearch(trimmedName);
        setShow("all");
    };

    const pill = (label: string, color: string, background: string) => (
        <Box component="span" sx={{ px: 1, borderRadius: 10, fontSize: SETTINGS_TEXT.text - 0.5, fontWeight: 700,
                                    lineHeight: 1.7, whiteSpace: "nowrap", color, bgcolor: background }}>
            {label}
        </Box>
    );
    const amberTint = isDarkMode ? "rgba(245,158,11,0.16)" : "rgba(245,158,11,0.12)";

    if (loading && rows.length === 0) {
        return (
            <SettingsSection plain icon={<SquareTerminal size={19} />} title="Environment" colors={colors} isDarkMode={isDarkMode}>
                <Stack spacing={1.5} alignItems="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} thickness={4.5} />
                    <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted }}>Loading the variables…</Typography>
                </Stack>
            </SettingsSection>
        );
    }

    return (
        <Stack spacing={2}>
            <SettingsSection
                plain
                icon={<SquareTerminal size={19} />}
                title="Environment"
                subtitle="Where the programs are installed and how they run, for everyone on this server. Saved changes apply to the runs launched after."
                colors={colors}
                isDarkMode={isDarkMode}
            >
                {error && (
                    <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: "#dc2626", pb: 1 }}>{error}</Typography>
                )}

                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}
                       justifyContent="space-between" sx={{ mb: 1.5 }}>
                    <ToggleButtonGroup exclusive size="small" value={show} aria-label="Variables shown"
                                       onChange={(_, value) => value && setShow(value)}
                                       sx={choiceButtonsSx(colors, isDarkMode)}>
                        <ToggleButton value="all"><List size={16} />All · {rows.length}</ToggleButton>
                        <ToggleButton value="changed"><PencilLine size={16} />Changed here · {changedCount}</ToggleButton>
                        <ToggleButton value="unsaved"><Asterisk size={16} />Not saved · {unsavedCount}</ToggleButton>
                    </ToggleButtonGroup>
                    <Stack direction="row" spacing={1} alignItems="center">
                    <TextField size="small" sx={{ ...fieldSx, width: { xs: "100%", md: 300 } }} value={search}
                               placeholder="Search name, value or meaning" aria-label="Search variables"
                               onChange={(e) => setSearch(e.target.value)}
                               InputProps={{ startAdornment: (
                                   <InputAdornment position="start"><Search size={16} /></InputAdornment>
                               ) }} />
                        <Button variant="outlined" sx={{ ...actionButtonSx, flexShrink: 0 }} startIcon={<Plus size={15} />}
                                disabled={loading} onClick={() => setAdding(true)}>
                            Add variable
                        </Button>
                    </Stack>
                </Stack>

                {rows.length === 0 ? (
                    <Typography sx={{ fontSize: SETTINGS_TEXT.title, color: colors.muted, py: 1 }}>
                        The server sent no variables.
                    </Typography>
                ) : shown.length === 0 ? (
                    <Typography sx={{ fontSize: SETTINGS_TEXT.title, color: colors.muted, py: 1 }}>
                        {show === "changed" ? "Nothing has been changed here: every variable has its own value."
                            : show === "unsaved" ? "There is nothing to save."
                                : "No variable matches the search."}
                    </Typography>
                ) : (
                    <Box component="ul" aria-label="Variables"
                         sx={{ listStyle: "none", m: 0, p: 0, border: `1px solid ${colors.border}`, borderRadius: 2,
                               maxHeight: 620, overflowY: "auto", opacity: loading ? 0.55 : 1,
                               transition: "opacity 160ms ease" }}>
                        {shown.map((row, index) => {
                            const unsaved = isUnsaved(row);
                            const isNew = !saved.has(row.name);
                            return (
                                <Box component="li" key={row.name} data-testid={`variable-${row.name}`}
                                     sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: { xs: 1, md: 2.5 },
                                           alignItems: { md: "flex-start" }, px: 2, py: 1.5,
                                           borderTop: index > 0 ? `1px solid ${colors.border}` : "none",
                                           bgcolor: unsaved ? (isDarkMode ? "rgba(245,158,11,0.05)" : "rgba(245,158,11,0.04)") : "transparent" }}>
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                            <Typography sx={{ fontFamily: MONO, fontSize: SETTINGS_TEXT.control, fontWeight: 700,
                                                              color: colors.text, wordBreak: "break-all" }}>
                                                {row.name}
                                            </Typography>
                                            {row.isOverride && pill("Changed here", colors.primary, sectionTint(isDarkMode))}
                                            {isNew ? pill("New", AMBER, amberTint) : unsaved && pill("Not saved", AMBER, amberTint)}
                                        </Stack>
                                        {row.description && (
                                            <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, mt: 0.25, lineHeight: 1.45 }}>
                                                {row.description}
                                            </Typography>
                                        )}
                                        {row.default && (
                                            <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, mt: 0.25,
                                                              wordBreak: "break-all" }}>
                                                Default: <Box component="span" sx={{ fontFamily: MONO }}>{row.default}</Box>
                                            </Typography>
                                        )}
                                    </Box>
                                    <Stack spacing={0.5} alignItems="flex-end" sx={{ width: { xs: "100%", md: 440 }, flexShrink: 0 }}>
                                        <TextField size="small" fullWidth multiline maxRows={6} value={row.value}
                                                   disabled={loading} placeholder="Empty"
                                                   inputProps={{ "aria-label": `Value of ${row.name}` }}
                                                   sx={{ ...fieldSx, "& .MuiInputBase-input": { fontFamily: MONO, fontSize: SETTINGS_TEXT.text,
                                                                                               color: colors.text } }}
                                                   onChange={(e) => onChange(row.name, e.target.value)} />
                                        <Stack direction="row" spacing={0.5}>
                                            {unsaved && !isNew && (
                                                <Button size="small" variant="text" startIcon={<Undo2 size={14} />}
                                                        sx={{ textTransform: "none", fontSize: SETTINGS_TEXT.text, fontWeight: 600,
                                                              color: colors.muted }}
                                                        onClick={() => onChange(row.name, saved.get(row.name) ?? "")}>
                                                    Undo
                                                </Button>
                                            )}
                                            {row.isOverride && (
                                                <Tooltip title={unsavedCount ? "Save or reset the other changes first" : ""}>
                                                    <span>
                                                        <Button size="small" variant="text" startIcon={<RotateCcw size={14} />}
                                                                disabled={loading || unsavedCount > 0}
                                                                sx={{ textTransform: "none", fontSize: SETTINGS_TEXT.text, fontWeight: 600 }}
                                                                onClick={() => onBackToDefault(row.name)}>
                                                            Back to the original
                                                        </Button>
                                                    </span>
                                                </Tooltip>
                                            )}
                                        </Stack>
                                    </Stack>
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </SettingsSection>

            {adding && (
                <SettingsDialog
                    title="Add a variable"
                    description="One the list does not have. It joins the list as not saved: Save keeps it."
                    icon={<SquareTerminal size={20} color="white" />}
                    confirmLabel="Add"
                    confirmDisabled={!canAdd}
                    maxWidth="sm"
                    actionButtonSx={actionButtonSx}
                    saveButtonSx={saveButtonSx}
                    closeButton
                    onConfirm={add}
                    onClose={closeAdd}
                >
                    <Stack spacing={2}>
                        <TextField size="small" label="Name" value={newName} sx={fieldSx} autoFocus fullWidth
                                   error={nameTaken || nameInvalid}
                                   helperText={nameTaken ? "It is already in the list."
                                       : nameInvalid ? "Letters, numbers and _ only, not starting with a number."
                                           : "For example SCIPION_HOME"}
                                   FormHelperTextProps={{ sx: { fontSize: SETTINGS_TEXT.text } }}
                                   inputProps={{ style: { fontFamily: MONO } }}
                                   onChange={(e) => setNewName(e.target.value)}
                                   onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
                        <TextField size="small" label="Value" value={newValue} sx={fieldSx} fullWidth
                                   inputProps={{ style: { fontFamily: MONO } }}
                                   helperText="A path, a number or any text; empty is allowed."
                                   FormHelperTextProps={{ sx: { fontSize: SETTINGS_TEXT.text } }}
                                   onChange={(e) => setNewValue(e.target.value)}
                                   onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
                        <Box sx={{ borderRadius: 2, bgcolor: sectionTint(isDarkMode), px: 1.5, py: 1.1 }}>
                            <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, mb: 0.25 }}>
                                The protocols will see
                            </Typography>
                            <Typography sx={{ fontFamily: MONO, fontSize: SETTINGS_TEXT.control, color: colors.text, wordBreak: "break-all" }}>
                                {newName.trim() || "NAME"}={newValue}
                            </Typography>
                        </Box>
                    </Stack>
                </SettingsDialog>
            )}
        </Stack>
    );
}
