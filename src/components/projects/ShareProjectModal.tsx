// src/components/projects/ShareProjectModal.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { useProjectService } from "@/ProjectServiceContext";
import { Users, Search, ShieldCheck, UserMinus } from "lucide-react";

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

  const dialogRef = useRef<HTMLDivElement | null>(null);

  const resetState = useCallback(() => {
    setUsers([]);
    setSelectedIds([]);
    setSearch("");
    setLoadingUsers(false);
    setSubmitting(false);
    setErrorMsg("");
    setRevokeTarget(null);
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
        const [rawUsers, shares] = await Promise.all([
          svc.listUsers(),
          svc.listProjectShares(String(projectId)),
        ]);

        const shareList = Array.isArray(shares)
          ? shares
          : shares?.results || shares?.shares || [];

        const sharedUserIds = new Set<string | number>(
          shareList.map(
            (s: any) =>
              s.userId ??
              s.sharedUserId ??
              s.shared_with_id ??
              s.targetUserId ??
              s.user_id,
          ),
        );

        const ownerId = projectOwnerId != null ? String(projectOwnerId) : null;

        const normalized: ShareableUser[] = rawUsers.map((u: any) => {
          const rawId = u.id ?? u.pk ?? u.username ?? u.email ?? "";
          const id = String(rawId);

          const firstName: string | undefined =
            u.firstName ?? u.first_name ?? undefined;
          const lastName: string | undefined =
            u.lastName ?? u.last_name ?? undefined;

          const isOwner = ownerId !== null && id === ownerId;
          const alreadyShared =
            sharedUserIds.has(rawId) || sharedUserIds.has(id);

          let displayName =
            u.name ??
            u.fullName ??
            u.username ??
            u.email ??
            "Unknown user";

          if (!u.name && (firstName || lastName)) {
            const full = `${firstName ?? ""} ${lastName ?? ""}`.trim();
            if (full) {
              displayName = full;
            }
          }

          return {
            id: rawId,
            name: displayName,
            email: u.email,
            firstName,
            lastName,
            isOwner,
            alreadyShared,
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

    fetchUsers();
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
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (revokeTarget) {
          setRevokeTarget(null);
        } else {
          onClose();
        }
      }
    },
    [onClose, revokeTarget],
  );

  const handleSubmit = useCallback(async () => {
    if (!projectId) return;

    const effectiveIds = selectedIds.filter((id) => {
      const user = users.find((u) => String(u.id) === String(id));
      if (!user) return false;
      if (user.isOwner || user.alreadyShared) return false;
      return true;
    });

    if (!effectiveIds.length) {
      setErrorMsg("Select at least one new user.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    try {
      await svc.shareProject(
        String(projectId),
        effectiveIds.map((id) => String(id)),
      );
      toast.success("Project shared successfully");
      onClose();
    } catch (err: any) {
      console.error("Failed to share project", err);
      setErrorMsg(err?.message || "Failed to share project.");
      toast.error(err?.message || "Failed to share project");
    } finally {
      setSubmitting(false);
    }
  }, [svc, projectId, selectedIds, onClose, users]);

  const openRevokeDialog = useCallback((user: ShareableUser) => {
    if (user.isOwner) return;
    setErrorMsg("");
    setRevokeTarget(user);
  }, []);

  const cancelRevoke = useCallback(() => {
    setRevokeTarget(null);
  }, []);

  const confirmRevokeAccess = useCallback(async () => {
    if (!projectId || !revokeTarget) return;

    const label = revokeTarget.email || revokeTarget.name;

    setSubmitting(true);
    try {
      await svc.revokeProjectShare(
        String(projectId),
        String(revokeTarget.id),
      );
      toast.success(`Access revoked for ${label}`);

      setUsers((prev) =>
        prev.map((u) =>
          String(u.id) === String(revokeTarget.id)
            ? { ...u, alreadyShared: false }
            : u,
        ),
      );
      setSelectedIds((prev) =>
        prev.filter((id) => String(id) !== String(revokeTarget.id)),
      );
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-transparent"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-project-title"
      aria-describedby="share-project-desc"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-xl rounded-2xl border border-gray-200/70 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[82vh] text-[0.95rem]"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200/80 dark:border-gray-800 px-5 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-100">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="share-project-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                Share project
              </h3>
              <p
                id="share-project-desc"
                className="mt-1 text-sm text-gray-600 dark:text-gray-300"
              >
                Share access to{" "}
                <span className="font-medium">
                  {projectName || "this project"}
                </span>
                .
              </p>
            </div>
          </div>
          <div className="mt-1 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            Owner only
          </div>
        </div>

        {/* Search + info */}
        <div className="border-b border-gray-200/80 px-5 py-3 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center">
                <Search className="h-4 w-4 text-gray-400" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full rounded-md border border-gray-300 bg-white px-8 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>

            <div className="hidden md:flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 border border-amber-100 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-800">
              <ShieldCheck className="h-4 w-4" />
              <span>Only the owner can change access.</span>
            </div>
          </div>
        </div>

        {/* Users list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/60">
            {loadingUsers && (
              <div className="py-4 text-center text-sm text-gray-500 dark:text-gray-300">
                Loading users...
              </div>
            )}

            {!loadingUsers && !filteredUsers.length && (
              <div className="py-4 text-center text-sm text-gray-500 dark:text-gray-300">
                No users found.
              </div>
            )}

            {!loadingUsers && filteredUsers.length > 0 && (
              <ul className="divide-y divide-gray-200/70 dark:divide-gray-800">
                {filteredUsers.map((u) => {
                  const checked = selectedIds.includes(u.id);
                  const disabled = u.isOwner || u.alreadyShared;

                  const statusLabel = u.isOwner
                    ? "Owner"
                    : u.alreadyShared
                    ? "Shared"
                    : "Invite";

                  const statusClasses = u.isOwner
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-100 dark:border-emerald-700"
                    : u.alreadyShared
                    ? "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-900/50 dark:text-sky-100 dark:border-sky-700"
                    : "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800/70 dark:text-gray-100 dark:border-gray-700";

                  const canRevoke = !!u.alreadyShared && !u.isOwner;

                  return (
                    <li
                      key={String(u.id)}
                      className="flex items-center justify-between px-3 py-3 text-sm text-gray-900 dark:text-gray-100"
                    >
                      <label
                        className={
                          "flex items-center gap-3 flex-1 min-w-0 " +
                          (disabled
                            ? "opacity-60 cursor-default"
                            : "cursor-pointer")
                        }
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={checked}
                          disabled={disabled || submitting}
                          onChange={() =>
                            !disabled && !submitting && toggleUser(u.id)
                          }
                        />
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {u.name}
                            </span>
                            <span
                              className={
                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold " +
                                statusClasses
                              }
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <span className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                            {u.email}
                          </span>
                        </div>
                      </label>

                      {canRevoke && (
                        <button
                          type="button"
                          onClick={() => openRevokeDialog(u)}
                          disabled={submitting}
                          className="ml-3 shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 hover:border-red-300 dark:border-red-700 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/70 transition disabled:opacity-60"
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

          {errorMsg && (
            <div className="mt-2 text-sm text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200/80 px-5 py-3 flex items-center justify-between text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <div>
            {selectedCount > 0
              ? `${selectedCount} user${selectedCount > 1 ? "s" : ""} selected.`
              : "No new users selected."}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-2 rounded-md bg-gray-200 text-gray-800 text-sm hover:bg-gray-300 transition disabled:opacity-60 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || selectedCount === 0}
              className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition disabled:opacity-60"
            >
              {submitting
                ? "Sharing..."
                : selectedCount > 0
                ? `Share (${selectedCount})`
                : "Share"}
            </button>
          </div>
        </div>

        {/* Revoke access confirmation dialog */}
        {revokeTarget && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-transparent"
          >
            <div className="w-full max-w-sm rounded-xl border border-red-200/70 bg-white shadow-xl dark:border-red-800/70 dark:bg-gray-900 px-5 py-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-100">
                  <UserMinus className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                    Remove access
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Remove access to{" "}
                    <span className="font-medium">
                      {projectName || "this project"}
                    </span>{" "}
                    for:
                  </p>
                  <p className="mt-2 text-sm text-gray-900 dark:text-gray-100">
                    {revokeTarget.name}
                    {revokeTarget.email && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">
                        {revokeTarget.email}
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    The user will no longer see this project or its data.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelRevoke}
                  disabled={submitting}
                  className="px-3 py-2 rounded-md bg-gray-100 text-gray-800 text-sm hover:bg-gray-200 transition disabled:opacity-60 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRevokeAccess}
                  disabled={submitting}
                  className="px-3 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 transition disabled:opacity-60"
                >
                  {submitting ? "Removing..." : "Remove access"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
