import { useCallback, useEffect, useState } from "react";
import {
    Alert, Box, Button, LinearProgress, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Gauge, Plus, Save, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { listStorageQuotas, saveStorageQuota, type StorageQuota, type StorageReport } from "@/api/storage";
import { formatBytes } from "@/components/projects/ProjectOverviewPanel";
import { SETTINGS_TEXT, SettingsSection } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";

const GB = 1024 ** 3;

type Styles = {
    fieldSx: any;
    actionButtonSx?: any;
    colors: { border: string; text: string; muted: string };
};

function gb(value: string): number | null {
    const number = Number(String(value).replace(",", "."));
    return Number.isFinite(number) && number > 0 ? Math.round(number * GB) : null;
}

function barColor(quota: StorageQuota): "error" | "warning" | "primary" {
    if (quota.full) return "error";
    return (quota.percent ?? 0) >= 80 ? "warning" : "primary";
}

/** A quota: how much of it is used, and (for who manages the settings) its limit to change or remove. */
function QuotaRow({ quota, canEdit, styles, onSaved }: {
    quota: StorageQuota; canEdit: boolean; styles: Styles; onSaved: (quotas: StorageQuota[]) => void;
}) {
    const { colors, fieldSx, actionButtonSx } = styles;
    const [limit, setLimit] = useState(String(Math.round((quota.limitBytes / GB) * 10) / 10));
    const [busy, setBusy] = useState(false);

    const save = async (value: number | null) => {
        setBusy(true);
        try {
            onSaved(await saveStorageQuota(quota.kind, quota.targetId, value));
            toast.success(value === null ? "Quota removed." : "Quota saved.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the quota"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box data-testid={`quota-${quota.kind}-${quota.targetId}`} sx={{ py: 1.75, borderBottom: `1px solid ${colors.border}` }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: SETTINGS_TEXT.title, fontWeight: 700, color: colors.text }}>
                        {quota.name ?? `#${quota.targetId}`}
                        <Box component="span" sx={{ ml: 1, fontSize: SETTINGS_TEXT.text, fontWeight: 400, color: colors.muted }}>
                            {quota.kind === "user" ? "person" : "group"}
                        </Box>
                    </Typography>
                    <LinearProgress variant="determinate" color={barColor(quota)}
                                    value={Math.min(100, quota.percent ?? 0)} sx={{ my: 0.75, height: 8, borderRadius: 4 }} />
                    <Typography sx={{ fontSize: 13.5, color: quota.full ? "error.main" : colors.muted }}>
                        {formatBytes(quota.usedBytes)} of {formatBytes(quota.limitBytes)}
                        {quota.percent != null ? ` (${Math.round(quota.percent)} %)` : ""}
                        {quota.full ? " · full: nothing new can be launched in its projects" : ""}
                    </Typography>
                </Box>
                {canEdit && (
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TextField size="small" sx={{ ...fieldSx, width: 130 }} label="Limit (GB)" value={limit}
                                   inputProps={{ inputMode: "decimal" }} onChange={(e) => setLimit(e.target.value)} />
                        <Button size="small" sx={actionButtonSx} startIcon={<Save size={14} />}
                                disabled={busy || gb(limit) === null} onClick={() => void save(gb(limit))}>
                            Save
                        </Button>
                        <Button size="small" sx={{ ...actionButtonSx, color: "#dc2626" }} startIcon={<Trash2 size={14} />}
                                disabled={busy} onClick={() => void save(null)} aria-label={`Remove the quota of ${quota.name}`}>
                            Remove
                        </Button>
                    </Stack>
                )}
            </Stack>
        </Box>
    );
}

/**
 * The disk quotas of users and groups (Settings, Usage): how much of each is used and, for who manages the
 * settings, the limits. A project counts for its owner; a group's quota for every project its members own.
 */
export default function StorageQuotasCard({ report, canEdit }: {
    report: StorageReport | null; canEdit: boolean;
    // The page's old look is still accepted, and not used
    [unused: string]: unknown;
}) {
    const isDarkMode = useTheme().palette.mode === "dark";
    const { colors, fieldSx, actionButtonSx, saveButtonSx } = useSettingsStyles(isDarkMode);
    const styles: Styles = { colors, fieldSx, actionButtonSx };
    const [quotas, setQuotas] = useState<StorageQuota[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [kind, setKind] = useState<StorageQuota["kind"]>("user");
    const [targetId, setTargetId] = useState("");
    const [limit, setLimit] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setQuotas(await listStorageQuotas());
            setError(null);
        } catch (e: any) {
            setError(String(e?.message || "Failed to load the disk quotas"));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const taken = new Set((quotas ?? []).filter((quota) => quota.kind === kind).map((quota) => quota.targetId));
    const options = kind === "user"
        ? (report?.users ?? []).map((user) => ({ id: user.userId, label: user.email ? `${user.name} (${user.email})` : user.name }))
        : (report?.groups ?? []).map((group) => ({ id: group.groupId, label: group.name }));

    const add = async () => {
        const value = gb(limit);
        if (!targetId || value === null) return;
        setBusy(true);
        try {
            setQuotas(await saveStorageQuota(kind, Number(targetId), value));
            setTargetId("");
            setLimit("");
            toast.success("Quota saved.");
        } catch (e: any) {
            toast.error(String(e?.message || "Failed to save the quota"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsSection
            icon={<Gauge size={19} />}
            title="Disk quotas"
            subtitle="How much the projects of a person, or of a group's members, may take. At 80 % they are told; when full, nothing new can be launched in those projects (what runs goes on)."
            colors={{ ...colors }}
            isDarkMode={isDarkMode}
            plain
        >
                {error && <Alert severity="error">{error}</Alert>}
                {quotas && quotas.length === 0 && (
                    <Typography sx={{ fontSize: SETTINGS_TEXT.control, color: colors.muted }}>No quota: the projects may take any space.</Typography>
                )}
                {(quotas ?? []).map((quota) => (
                    <QuotaRow key={`${quota.kind}-${quota.targetId}-${quota.limitBytes}`} quota={quota} canEdit={canEdit}
                              styles={styles} onSaved={setQuotas} />
                ))}
                {canEdit && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} sx={{ mt: 1.5 }}>
                        <TextField select size="small" sx={{ ...fieldSx, width: 130 }} label="For" value={kind}
                                   onChange={(e) => { setKind(e.target.value as StorageQuota["kind"]); setTargetId(""); }}>
                            <MenuItem value="user">A person</MenuItem>
                            <MenuItem value="group">A group</MenuItem>
                        </TextField>
                        <TextField select size="small" sx={{ ...fieldSx, flex: 1, minWidth: 200 }} label={kind === "user" ? "Person" : "Group"}
                                   value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                            {options.filter((option) => !taken.has(option.id)).map((option) => (
                                <MenuItem key={option.id} value={String(option.id)}>{option.label}</MenuItem>
                            ))}
                        </TextField>
                        <TextField size="small" sx={{ ...fieldSx, width: 130 }} label="Limit (GB)" value={limit}
                                   inputProps={{ inputMode: "decimal" }} onChange={(e) => setLimit(e.target.value)} />
                        <Button size="small" variant="contained" sx={saveButtonSx} startIcon={<Plus size={14} />}
                                disabled={busy || !targetId || gb(limit) === null} onClick={() => void add()}>
                            Add quota
                        </Button>
                    </Stack>
                )}
                {canEdit && kind === "user" && (
                    <Typography sx={{ fontSize: 13.5, color: colors.muted, mt: 0.75 }}>
                        Only people who own projects are listed.
                    </Typography>
                )}
        </SettingsSection>
    );
}
