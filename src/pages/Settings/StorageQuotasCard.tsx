import { useCallback, useEffect, useState } from "react";
import {
    Alert, Box, Button, Card, CardContent, CardHeader, LinearProgress, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { Plus, Save, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { listStorageQuotas, saveStorageQuota, type StorageQuota, type StorageReport } from "@/api/storage";
import { formatBytes } from "@/components/projects/ProjectOverviewPanel";

const GB = 1024 ** 3;

type Styles = {
    fieldSx: any;
    cardSx: any;
    cardHeaderSx: any;
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
        <Box data-testid={`quota-${quota.kind}-${quota.targetId}`} sx={{ py: 1, borderBottom: `1px solid ${colors.border}` }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: colors.text }}>
                        {quota.name ?? `#${quota.targetId}`}
                        <Box component="span" sx={{ ml: 1, fontSize: 13, fontWeight: 400, color: colors.muted }}>
                            {quota.kind === "user" ? "user" : "group"}
                        </Box>
                    </Typography>
                    <LinearProgress variant="determinate" color={barColor(quota)}
                                    value={Math.min(100, quota.percent ?? 0)} sx={{ my: 0.5, height: 6, borderRadius: 3 }} />
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
                        <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<Save size={14} />}
                                disabled={busy || gb(limit) === null} onClick={() => void save(gb(limit))}>
                            Save
                        </Button>
                        <Button size="small" variant="outlined" color="error" sx={actionButtonSx} startIcon={<Trash2 size={14} />}
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
export default function StorageQuotasCard({ report, canEdit, ...styles }: Styles & {
    report: StorageReport | null; canEdit: boolean;
}) {
    const { cardSx, cardHeaderSx, colors, fieldSx, actionButtonSx } = styles;
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
        <Card variant="outlined" sx={cardSx}>
            <CardHeader
                title="Disk quotas"
                subheader="How much the projects of a user, or of a group's members, may take. At 80 % they are told; when full, nothing new can be launched in those projects (what runs goes on)."
                sx={cardHeaderSx}
            />
            <CardContent sx={{ pt: 1 }}>
                {error && <Alert severity="error">{error}</Alert>}
                {quotas && quotas.length === 0 && (
                    <Typography sx={{ fontSize: 14, color: colors.muted }}>No quota: the projects may take any space.</Typography>
                )}
                {(quotas ?? []).map((quota) => (
                    <QuotaRow key={`${quota.kind}-${quota.targetId}-${quota.limitBytes}`} quota={quota} canEdit={canEdit}
                              styles={styles} onSaved={setQuotas} />
                ))}
                {canEdit && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} sx={{ mt: 1.5 }}>
                        <TextField select size="small" sx={{ ...fieldSx, width: 130 }} label="For" value={kind}
                                   onChange={(e) => { setKind(e.target.value as StorageQuota["kind"]); setTargetId(""); }}>
                            <MenuItem value="user">A user</MenuItem>
                            <MenuItem value="group">A group</MenuItem>
                        </TextField>
                        <TextField select size="small" sx={{ ...fieldSx, flex: 1, minWidth: 200 }} label={kind === "user" ? "User" : "Group"}
                                   value={targetId} onChange={(e) => setTargetId(e.target.value)}
                                   helperText={kind === "user" ? "Users with projects" : undefined}>
                            {options.filter((option) => !taken.has(option.id)).map((option) => (
                                <MenuItem key={option.id} value={String(option.id)}>{option.label}</MenuItem>
                            ))}
                        </TextField>
                        <TextField size="small" sx={{ ...fieldSx, width: 130 }} label="Limit (GB)" value={limit}
                                   inputProps={{ inputMode: "decimal" }} onChange={(e) => setLimit(e.target.value)} />
                        <Button size="small" variant="contained" sx={actionButtonSx} startIcon={<Plus size={14} />}
                                disabled={busy || !targetId || gb(limit) === null} onClick={() => void add()}>
                            Add quota
                        </Button>
                    </Stack>
                )}
            </CardContent>
        </Card>
    );
}
