// src/components/projects/ShareProjectModal.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useProjectService } from "@/ProjectServiceContext";
import { Users, Search, ShieldCheck, UserMinus, X } from "lucide-react";
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

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

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

  const dialogRef = useRef<HTMLDivElement | null>(null);

  const resetState = useCallback(() => {
    setUsers([]);
    setSelectedIds([]);
    setSearch("");
    setLoadingUsers(false);
    setSubmitting(false);
    setErrorMsg("");
    setRevokeTarget(null);
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (revokeTarget) setRevokeTarget(null);
        else onClose();
      }
    },
    [onClose, revokeTarget],
  );

  const onOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

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

  const revokeGroup = useCallback(async (group: ShareableGroup) => {
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

  return (
    <div
      className={classNames(
        crispText,
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-black/[0.02] dark:bg-white/[0.02]",
      )}
      onMouseDown={onOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-project-title"
      aria-describedby="share-project-desc"
    >
      <div
        ref={dialogRef}
        className={classNames(
          crispText,
          "relative flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border shadow-2xl",
          "border-gray-300/90 bg-white",
          "ring-1 ring-inset ring-black/[0.08]",
          "dark:border-gray-700 dark:bg-gray-900",
          "dark:ring-white/[0.08]",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative flex h-full flex-col">
          <div className="flex items-start justify-between border-b border-gray-300/80 px-5 pb-3 pt-4 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300/80 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 id="share-project-title" className="text-[15px] font-semibold tracking-[0.01em] text-gray-950 dark:text-white">
                  Share project
                </h3>
                <p id="share-project-desc" className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">
                  Share access to <span className="font-semibold">{projectName || "this project"}</span>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full border border-amber-300/80 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 sm:inline-flex">
                <ShieldCheck className="h-4 w-4" />
                Managers only
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className={classNames(
                  "inline-flex items-center justify-center rounded-xl border p-2 transition",
                  "border-gray-300/80 bg-white text-gray-800 hover:shadow-sm",
                  "dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200",
                  submitting ? "opacity-60" : "",
                )}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-b border-gray-300/80 px-5 py-3 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center">
                  <Search className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users…"
                  className={classNames(
                    crispText,
                    "w-full rounded-xl border px-8 py-2.5 text-sm font-medium outline-none transition",
                    "border-gray-300/80 bg-white text-gray-950 placeholder:text-gray-400",
                    "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                    "dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500",
                  )}
                />
              </div>

              <div className="hidden items-center gap-2 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 md:flex">
                <ShieldCheck className="h-4 w-4" />
                <span>Whoever manages the project can change access.</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3">
            <div className="rounded-2xl border border-gray-300/80 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              {loadingUsers && (
                <div className="py-6 text-center text-sm leading-6 text-gray-700 dark:text-gray-300">
                  Loading users...
                </div>
              )}

              {!loadingUsers && !filteredUsers.length && (
                <div className="py-6 text-center text-sm leading-6 text-gray-700 dark:text-gray-300">
                  No users found.
                </div>
              )}

              {!loadingUsers && filteredUsers.length > 0 && (
                <ul className="divide-y divide-gray-200/90 dark:divide-gray-700">
                  {filteredUsers.map((u) => {
                    const checked = selectedIds.includes(u.id);
                    const disabled = Boolean(u.isOwner || u.alreadyShared);

                    const statusLabel = u.isOwner
                      ? "Owner"
                      : u.alreadyShared
                        ? `Shared · ${LEVEL_LABELS[u.sharedLevel ?? ""] ?? "Work"}`
                        : "Invite";

                    const statusClasses = u.isOwner
                      ? "border-emerald-300/80 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : u.alreadyShared
                        ? "border-sky-300/80 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200"
                        : "border-gray-300/80 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200";

                    const canRevoke = Boolean(u.alreadyShared && !u.isOwner);

                    return (
                      <li key={String(u.id)} className="flex items-center justify-between px-4 py-3 text-sm">
                        <label
                          className={classNames(
                            "flex min-w-0 flex-1 items-center gap-3",
                            disabled ? "cursor-default opacity-60" : "cursor-pointer",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            checked={checked}
                            disabled={disabled || submitting}
                            onChange={() => !disabled && !submitting && toggleUser(u.id)}
                          />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-gray-950 dark:text-white">
                                {u.name}
                              </span>
                              <span
                                className={classNames(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                                  statusClasses,
                                )}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            <span className="mt-1 truncate text-sm leading-6 text-gray-700 dark:text-gray-300">
                              {u.email}
                            </span>
                          </div>
                        </label>

                        {canRevoke && (
                          <button
                            type="button"
                            onClick={() => openRevokeDialog(u)}
                            disabled={submitting}
                            className={classNames(
                              "ml-3 shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-60",
                              "bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 hover:brightness-[0.98] hover:shadow-md",
                            )}
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {groups.length > 0 && (
              <div className="mt-3 rounded-2xl border border-gray-300/80 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  Groups
                </div>
                <ul className="divide-y divide-gray-200/90 dark:divide-gray-700">
                  {groups.map((g) => {
                    const shared = Boolean(g.sharedLevel);
                    return (
                      <li key={g.id} className="flex items-center justify-between px-4 py-3 text-sm">
                        <label className={classNames("flex min-w-0 flex-1 items-center gap-3",
                                                     shared ? "cursor-default opacity-60" : "cursor-pointer")}>
                          <input
                            type="checkbox"
                            aria-label={`Share with ${g.name}`}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selectedGroupIds.includes(g.id)}
                            disabled={shared || submitting}
                            onChange={() => setSelectedGroupIds((prev) =>
                              prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id])}
                          />
                          <span className="truncate font-medium text-gray-950 dark:text-white">{g.name}</span>
                          {shared && (
                            <span className="inline-flex items-center rounded-full border border-sky-300/80 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200">
                              Shared · {LEVEL_LABELS[g.sharedLevel ?? ""] ?? "Work"}
                            </span>
                          )}
                        </label>
                        {shared && svc.revokeProjectGroupShare && (
                          <button
                            type="button"
                            onClick={() => void revokeGroup(g)}
                            disabled={submitting}
                            className="ml-3 shrink-0 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 px-3 py-2 text-xs font-semibold text-white transition hover:shadow-md disabled:opacity-60"
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {errorMsg ? (
              <div className="mt-2 text-sm leading-6 text-red-600 dark:text-red-300">{errorMsg}</div>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-gray-300/80 px-5 py-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
            <div className="flex items-center gap-3 leading-6">
              <span>
                {selectedCount + selectedGroupIds.length > 0
                  ? `${selectedCount + selectedGroupIds.length} selected.`
                  : "No new users or groups selected."}
              </span>
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold">Access</span>
                <select
                  aria-label="Access level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as AccessLevel)}
                  className="rounded-lg border border-gray-300/80 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                  title={ACCESS_LEVELS.find((l) => l.value === level)?.help}
                >
                  {ACCESS_LEVELS.map((l) => (
                    <option key={l.value} value={l.value} title={l.help}>{l.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className={classNames(
                  "rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60",
                  "border-gray-300/80 bg-white text-gray-800 hover:shadow-sm",
                  "dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200",
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || selectedCount + selectedGroupIds.length === 0}
                className={classNames(
                  "rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60",
                  "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600 hover:brightness-[0.98] hover:shadow-md",
                )}
              >
                {submitting
                  ? "Sharing..."
                  : selectedCount + selectedGroupIds.length > 0
                    ? `Share (${selectedCount + selectedGroupIds.length})`
                    : "Share"}
              </button>
            </div>
          </div>

          {revokeTarget && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
              <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-red-300/80 bg-white px-5 py-4 text-sm shadow-2xl dark:border-red-800/70 dark:bg-gray-900">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200">
                    <UserMinus className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-gray-950 dark:text-white">Remove access</h4>
                    <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">
                      Remove access to <span className="font-semibold">{projectName || "this project"}</span> for:
                    </p>
                    <p className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{revokeTarget.name}</p>
                    {revokeTarget.email ? (
                      <span className="block text-sm leading-6 text-gray-700 dark:text-gray-300">
                        {revokeTarget.email}
                      </span>
                    ) : null}
                    <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                      The user will no longer see this project or its data.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelRevoke}
                    disabled={submitting}
                    className={classNames(
                      "rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60",
                      "border-gray-300/80 bg-white text-gray-800 hover:shadow-sm",
                      "dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200",
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmRevokeAccess}
                    disabled={submitting}
                    className={classNames(
                      "rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60",
                      "bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 hover:brightness-[0.98] hover:shadow-md",
                    )}
                  >
                    {submitting ? "Removing..." : "Remove access"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}