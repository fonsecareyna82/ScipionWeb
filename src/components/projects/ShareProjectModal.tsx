// src/components/projects/ShareProjectModal.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useProjectService } from "@/ProjectServiceContext";
import { Users, Search, ShieldCheck, UserMinus, UserRound, UsersRound } from "lucide-react";
import {
  Box, Button, Checkbox, InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";

import { useIsDark } from "@/context/ThemeContext";
import SettingsDialog from "@/pages/Settings/SettingsDialog";
import { choiceButtonsSx, sectionTint } from "@/pages/Settings/SettingsSection";
import { DialogPart } from "@/pages/Facility/DialogParts";
import { listGroupNames } from "@/api/access";

type AccessLevel = "view" | "work" | "manage";

// What each level lets the people it is shared with do
const ACCESS_LEVELS: { value: AccessLevel; label: string; help: string }[] = [
  { value: "view", label: "View", help: "Open it and analyze its results" },
  { value: "work", label: "Work", help: "Also launch, stop and edit protocols" },
  { value: "manage", label: "Manage", help: "Also share, rename and delete it" },
];

const LEVEL_LABELS: Record<string, string> = { view: "View", work: "Work", manage: "Manage" };

interface ShareableGroup {
  id: number;
  name: string;
  sharedLevel?: string;
}

interface ShareProjectModalProps {
  open: boolean;
  projectId: string | number | null;
  projectName?: string;
  projectOwnerId?: string | number;
  onClose: () => void;
}

interface ShareableUser {
  id: string | number;
  name: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  hasAccess?: boolean;
  disabled?: boolean;
  isOwner?: boolean;
  alreadyShared?: boolean;
  sharedLevel?: string;
}



export default function ShareProjectModal({
  open,
  projectId,
  projectName,
  projectOwnerId,
  onClose,
}: ShareProjectModalProps) {
  const svc = useProjectService();
  const [users, setUsers] = useState<ShareableUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [revokeTarget, setRevokeTarget] = useState<ShareableUser | null>(null);
  const [groups, setGroups] = useState<ShareableGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [level, setLevel] = useState<AccessLevel>("work");

  const [revokeGroup, setRevokeGroup] = useState<ShareableGroup | null>(null);
  const isDark = useIsDark();
  const tint = sectionTint(isDark);
  const colors = isDark
    ? { border: "rgba(255,255,255,0.14)", text: "#f1f5f9", muted: "#94a3b8", soft: "rgba(255,255,255,0.04)" }
    : { border: "#e2e8f0", text: "#0f172a", muted: "#64748b", soft: "#f8fafc" };

  const resetState = useCallback(() => {
    setUsers([]);
    setSelectedIds([]);
    setSearch("");
    setLoadingUsers(false);
    setSubmitting(false);
    setErrorMsg("");
    setRevokeTarget(null);
    setRevokeGroup(null);
    setGroups([]);
    setSelectedGroupIds([]);
    setLevel("work");
  }, []);

  useEffect(() => {
    if (!open || !projectId) {
      resetState();
      return;
    }

    const fetchUsers = async () => {
      setLoadingUsers(true);
      setErrorMsg("");
      try {
        const [rawUsers, shares, groupNames] = await Promise.all([
          svc.listUsers(),
          svc.listProjectShares(String(projectId)),
          listGroupNames().catch(() => [] as { id: number; name: string }[]),
        ]);

        const shareList = Array.isArray(shares) ? shares : shares?.results || shares?.shares || [];
        const userLevels = new Map<string, string>(
          shareList.filter((s: any) => s.userId != null).map((s: any) => [String(s.userId), String(s.permission)]),
        );
        const groupLevels = new Map<number, string>(
          shareList.filter((s: any) => s.groupId != null).map((s: any) => [Number(s.groupId), String(s.permission)]),
        );
        setGroups((groupNames || []).map((g) => ({ id: g.id, name: g.name, sharedLevel: groupLevels.get(g.id) })));

        const sharedUserIds = new Set<string | number>(
          shareList.map(
            (s: any) =>
              s.userId ?? s.sharedUserId ?? s.shared_with_id ?? s.targetUserId ?? s.user_id,
          ),
        );

        const ownerId = projectOwnerId != null ? String(projectOwnerId) : null;

        const normalized: ShareableUser[] = rawUsers.map((u: any) => {
          const rawId = u.id ?? u.pk ?? u.username ?? u.email ?? "";
          const id = String(rawId);

          const firstName: string | undefined = u.firstName ?? u.first_name ?? undefined;
          const lastName: string | undefined = u.lastName ?? u.last_name ?? undefined;

          const isOwner = ownerId !== null && id === ownerId;
          const alreadyShared = sharedUserIds.has(rawId) || sharedUserIds.has(id);

          let displayName = u.name ?? u.fullName ?? u.username ?? u.email ?? "Unknown user";

          if (!u.name && (firstName || lastName)) {
            const full = `${firstName ?? ""} ${lastName ?? ""}`.trim();
            if (full) displayName = full;
          }

          return {
            id: rawId,
            name: displayName,
            email: u.email,
            firstName,
            lastName,
            isOwner,
            alreadyShared,
            sharedLevel: userLevels.get(id),
          };
        });

        setUsers(normalized);
      } catch (err: any) {
        console.error("Failed to load users for sharing", err);
        setErrorMsg(err?.message || "Failed to load users.");
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    void fetchUsers();
  }, [open, svc, resetState, projectId, projectOwnerId]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const name = String(u.name || "").toLowerCase();
      const email = String(u.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [users, search]);

  const toggleUser = useCallback((userId: string | number) => {
    setSelectedIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!projectId) return;

    const effectiveIds = selectedIds.filter((id) => {
      const user = users.find((u) => String(u.id) === String(id));
      if (!user) return false;
      if (user.isOwner || user.alreadyShared) return false;
      return true;
    });

    const effectiveGroupIds = selectedGroupIds.filter((id) => !groups.find((g) => g.id === id)?.sharedLevel);

    if (!effectiveIds.length && !effectiveGroupIds.length) {
      setErrorMsg("Select at least one new user or group.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    try {
      await svc.shareProject(String(projectId), effectiveIds.map((id) => String(id)),
                             { groupIds: effectiveGroupIds, permission: level });
      toast.success("Project shared successfully");
      onClose();
    } catch (err: any) {
      console.error("Failed to share project", err);
      setErrorMsg(err?.message || "Failed to share project.");
      toast.error(err?.message || "Failed to share project");
    } finally {
      setSubmitting(false);
    }
  }, [svc, projectId, selectedIds, onClose, users, selectedGroupIds, groups, level]);

  const revokeGroupAccess = useCallback(async (group: ShareableGroup) => {
    if (!projectId || !svc.revokeProjectGroupShare) return;
    try {
      await svc.revokeProjectGroupShare(String(projectId), group.id);
      toast.success(`Access revoked for ${group.name}`);
      setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, sharedLevel: undefined } : g)));
      setSelectedGroupIds((prev) => prev.filter((id) => id !== group.id));
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke the group's access");
    }
  }, [projectId, svc]);

  const openRevokeDialog = useCallback((user: ShareableUser) => {
    if (user.isOwner) return;
    setErrorMsg("");
    setRevokeTarget(user);
  }, []);

  const cancelRevoke = useCallback(() => setRevokeTarget(null), []);

  const confirmRevokeAccess = useCallback(async () => {
    if (!projectId || !revokeTarget) return;

    const label = revokeTarget.email || revokeTarget.name;

    setSubmitting(true);
    try {
      await svc.revokeProjectShare(String(projectId), String(revokeTarget.id));
      toast.success(`Access revoked for ${label}`);

      setUsers((prev) =>
        prev.map((u) => (String(u.id) === String(revokeTarget.id) ? { ...u, alreadyShared: false } : u)),
      );
      setSelectedIds((prev) => prev.filter((id) => String(id) !== String(revokeTarget.id)));
      setRevokeTarget(null);
    } catch (err: any) {
      console.error("Failed to revoke project share", err);
      toast.error(err?.message || "Failed to revoke project share");
    } finally {
      setSubmitting(false);
    }
  }, [projectId, revokeTarget, svc]);

  if (!open) return null;
  const selectedCount = selectedIds.length;
  const chosen = selectedCount + selectedGroupIds.length;

  return (
    <>
      <SettingsDialog
        title="Share project"
        description={`Who else may open ${projectName ? `“${projectName}”` : "this project"}, and what they may do in it. Whoever manages the project can change it.`}
        icon={<Users size={20} color="white" />}
        confirmLabel={chosen > 0 ? `Share (${chosen})` : "Share"}
        busyLabel="Sharing…"
        busy={submitting}
        confirmDisabled={chosen === 0}
        maxWidth="md"
        footerNote={chosen > 0 ? `${chosen} selected.` : "No new users or groups selected."}
        closeButton
        onConfirm={() => void handleSubmit()}
        onClose={onClose}
      >
        <Stack spacing={2}>
          <DialogPart icon={<UserRound size={18} />} title="People" tint={tint} colors={colors}
                      subtitle="Tick those to share it with. Those who already have it can lose it with Remove.">
            <TextField size="small" fullWidth value={search} placeholder="Search users…"
                       inputProps={{ "aria-label": "Search users" }} onChange={(e) => setSearch(e.target.value)}
                       InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
            {loadingUsers && <Typography sx={{ fontSize: 14, color: colors.muted, py: 1 }}>Loading users...</Typography>}
            {!loadingUsers && !filteredUsers.length && (
              <Typography sx={{ fontSize: 14, color: colors.muted, py: 1 }}>No users found.</Typography>
            )}
            {!loadingUsers && filteredUsers.length > 0 && (
              <Box component="ul" aria-label="People" sx={{ listStyle: "none", m: 0, p: 0, border: `1px solid ${colors.border}`,
                                                          borderRadius: 2, overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
                {filteredUsers.map((u, index) => {
                  const disabled = Boolean(u.isOwner || u.alreadyShared);
                  const checked = selectedIds.includes(u.id);
                  return (
                    <ShareRow key={String(u.id)} first={index === 0} colors={colors}
                              name={u.name} detail={u.email}
                              pill={u.isOwner ? { text: "Owner", color: "#16a34a" }
                                : u.alreadyShared ? { text: `Shared · ${LEVEL_LABELS[u.sharedLevel ?? ""] ?? "Work"}`, color: "#2563eb" }
                                  : { text: "Invite", color: colors.muted }}
                              checked={checked || disabled} disabled={disabled || submitting}
                              onToggle={() => !disabled && !submitting && toggleUser(u.id)}
                              onRemove={u.alreadyShared && !u.isOwner ? () => openRevokeDialog(u) : undefined} />
                  );
                })}
              </Box>
            )}
          </DialogPart>

          {groups.length > 0 && (
            <DialogPart icon={<UsersRound size={18} />} title="Groups" tint={tint} colors={colors}
                        subtitle="Every member of a group gets it.">
              <Box component="ul" aria-label="Groups" sx={{ listStyle: "none", m: 0, p: 0, border: `1px solid ${colors.border}`,
                                                          borderRadius: 2, overflow: "hidden" }}>
                {groups.map((g, index) => {
                  const shared = Boolean(g.sharedLevel);
                  return (
                    <ShareRow key={g.id} first={index === 0} colors={colors} name={g.name} group
                              checkboxLabel={`Share with ${g.name}`}
                              pill={shared ? { text: `Shared · ${LEVEL_LABELS[g.sharedLevel ?? ""] ?? "Work"}`, color: "#2563eb" } : undefined}
                              checked={selectedGroupIds.includes(g.id) || shared} disabled={shared || submitting}
                              onToggle={() => setSelectedGroupIds((prev) =>
                                prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id])}
                              onRemove={shared && svc.revokeProjectGroupShare ? () => setRevokeGroup(g) : undefined} />
                  );
                })}
              </Box>
            </DialogPart>
          )}

          <DialogPart icon={<ShieldCheck size={18} />} title="What they may do" tint={tint} colors={colors}
                      subtitle="For those ticked now. Those who already have it keep theirs.">
            <ToggleButtonGroup exclusive size="small" value={level} aria-label="Access level"
                               onChange={(_, value) => value && setLevel(value as AccessLevel)}
                               sx={choiceButtonsSx({ ...colors, card: "", primary: isDark ? "#60a5fa" : "#2563eb", hover: colors.soft }, isDark)}>
              {ACCESS_LEVELS.map((l) => <ToggleButton key={l.value} value={l.value}>{l.label}</ToggleButton>)}
            </ToggleButtonGroup>
            <Typography sx={{ fontSize: 14, color: colors.text }}>
              {ACCESS_LEVELS.find((l) => l.value === level)?.help}.
            </Typography>
          </DialogPart>

          {errorMsg ? <Typography sx={{ fontSize: 14, color: "#dc2626" }}>{errorMsg}</Typography> : null}
        </Stack>
      </SettingsDialog>

      {revokeTarget && (
        <SettingsDialog
          title="Remove access"
          description={`${projectName ? `“${projectName}”` : "This project"} stops being shared with them.`}
          icon={<UserMinus size={20} color="#fca5a5" />}
          confirmLabel="Remove access"
          busyLabel="Removing…"
          busy={submitting}
          destructive
          maxWidth="xs"
          closeButton
          onConfirm={() => void confirmRevokeAccess()}
          onClose={cancelRevoke}
        >
          <Stack spacing={1.25}>
            <Box sx={{ border: `1px solid ${colors.border}`, borderLeft: "4px solid #dc2626", borderRadius: 2, px: 1.5, py: 1.25 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: colors.text }}>{revokeTarget.name}</Typography>
              {revokeTarget.email ? <Typography sx={{ fontSize: 13.5, color: colors.muted }}>{revokeTarget.email}</Typography> : null}
            </Box>
            <Typography sx={{ fontSize: 14, color: colors.muted }}>The user will no longer see this project or its data.</Typography>
          </Stack>
        </SettingsDialog>
      )}

      {revokeGroup && (
        <SettingsDialog
          title="Remove the group's access"
          description={`${projectName ? `“${projectName}”` : "This project"} stops being shared with its members.`}
          icon={<UserMinus size={20} color="#fca5a5" />}
          confirmLabel="Remove access"
          destructive
          maxWidth="xs"
          closeButton
          onConfirm={() => { const group = revokeGroup; setRevokeGroup(null); void revokeGroupAccess(group); }}
          onClose={() => setRevokeGroup(null)}
        >
          <Box sx={{ border: `1px solid ${colors.border}`, borderLeft: "4px solid #dc2626", borderRadius: 2, px: 1.5, py: 1.25 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: colors.text }}>{revokeGroup.name}</Typography>
            <Typography sx={{ fontSize: 13.5, color: colors.muted }}>
              Its members keep it only if it is shared with them some other way.
            </Typography>
          </Box>
        </SettingsDialog>
      )}
    </>
  );
}

/** A person or a group in the share list: a tick, the name, how they have it, and Remove. */
function ShareRow({ name, detail, pill, checked, disabled, onToggle, onRemove, first, colors, group = false, checkboxLabel }: {
  name: string;
  detail?: string;
  pill?: { text: string; color: string };
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  first: boolean;
  colors: { border: string; text: string; muted: string; soft: string };
  group?: boolean;
  checkboxLabel?: string;
}) {
  return (
    <Box component="li" sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.6,
                              borderTop: first ? "none" : `1px solid ${colors.border}`, "&:hover": { bgcolor: colors.soft } }}>
      <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 0,
                                   cursor: disabled ? "default" : "pointer" }}>
        <Checkbox size="small" checked={checked} disabled={disabled} onChange={onToggle}
                  inputProps={checkboxLabel ? { "aria-label": checkboxLabel } : undefined} />
        <Box sx={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                   bgcolor: "rgba(37,99,235,0.12)", color: "#2563eb", fontWeight: 800, fontSize: 13 }}>
          {group ? <UsersRound size={15} /> : (name || "?").charAt(0).toUpperCase()}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: colors.text, overflow: "hidden", textOverflow: "ellipsis",
                              whiteSpace: "nowrap" }}>
              {name}
            </Typography>
            {pill && (
              <Box component="span" sx={{ flexShrink: 0, px: 1, borderRadius: 10, fontSize: 13, fontWeight: 700, lineHeight: 1.7,
                                          color: pill.color, bgcolor: `${pill.color}1f` }}>
                {pill.text}
              </Box>
            )}
          </Stack>
          {detail && <Typography sx={{ fontSize: 13.5, color: colors.muted }}>{detail}</Typography>}
        </Box>
      </Box>
      {onRemove && (
        <Button size="small" startIcon={<UserMinus size={14} />} onClick={onRemove}
                sx={{ textTransform: "none", fontSize: 13.5, color: "#dc2626", flexShrink: 0 }}>
          Remove
        </Button>
      )}
    </Box>
  );
}
