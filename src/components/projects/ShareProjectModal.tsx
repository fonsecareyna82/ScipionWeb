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
import { Users, Search, ShieldCheck } from "lucide-react";

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

  const dialogRef = useRef<HTMLDivElement | null>(null);

  const resetState = useCallback(() => {
    setUsers([]);
    setSelectedIds([]);
    setSearch("");
    setLoadingUsers(false);
    setSubmitting(false);
    setErrorMsg("");
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

        // Normalize the list of userIds that already have access
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

          // Prefer explicit name, then fullName, then firstName + lastName, then fallback
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

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        dialogRef.current &&
        !dialogRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  const handleSubmit = useCallback(async () => {
    if (!projectId) return;

    // Do not send owner or already shared users, even if they were selected by mistake
    const effectiveIds = selectedIds.filter((id) => {
      const user = users.find((u) => String(u.id) === String(id));
      if (!user) return false;
      if (user.isOwner || user.alreadyShared) return false;
      return true;
    });

    if (!effectiveIds.length) {
      setErrorMsg(
        "Select at least one user who does not already have access.",
      );
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

  if (!open) return null;

  const selectedCount = selectedIds.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onMouseDown={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-project-title"
      aria-describedby="share-project-desc"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-xl rounded-2xl border border-gray-200/70 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[82vh]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200/70 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-300" />
            </div>
            <div>
              <h3
                id="share-project-title"
                className="text-sm font-semibold text-gray-900 dark:text-gray-50"
              >
                Share project
              </h3>
              <p
                id="share-project-desc"
                className="mt-0.5 text-xs text-gray-600 dark:text-gray-300"
              >
                Grant workspace access to selected users for{" "}
                <span className="font-medium">
                  {projectName || "this project"}
                </span>
                .
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-100 transition"
            aria-label="Close"
          >
            <span className="text-base leading-none">×</span>
          </button>
        </div>

        {/* Search + info */}
        <div className="px-5 pt-3 pb-2 border-b border-gray-100/80 dark:border-gray-800/80">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users by name or email..."
                className="w-full pl-8 pr-3 py-2 rounded-md border border-gray-300 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div className="hidden sm:flex items-center gap-1 rounded-full bg-gray-50 px-3 py-1 text-[0.7rem] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300 border border-gray-200/70 dark:border-gray-700/80">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Owner and existing guests are locked</span>
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

                  const canInvite = !u.isOwner && !u.alreadyShared;
                  const displayFullName =
                    (u.firstName || u.lastName
                      ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                      : "") || "";

                  const statusLabel = u.isOwner
                    ? "Owner"
                    : u.alreadyShared
                    ? "Has access"
                    : "Can be invited";

                  const statusClasses = u.isOwner
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-100 dark:border-emerald-700"
                    : u.alreadyShared
                    ? "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-900/50 dark:text-sky-100 dark:border-sky-700"
                    : "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800/70 dark:text-gray-100 dark:border-gray-700";

                  return (
                    <li
                      key={String(u.id)}
                      className="flex items-center justify-between px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100"
                    >
                      <label
                        className={
                          "flex items-center gap-3 w-full " +
                          (disabled
                            ? "opacity-60 cursor-not-allowed"
                            : "cursor-pointer")
                        }
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => !disabled && toggleUser(u.id)}
                        />
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">
                              {u.name}
                            </span>
                            <span
                              className={
                                "ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold " +
                                statusClasses
                              }
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <span className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                            {u.email}
                          </span>
                        </div>
                      </label>
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
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-200/70 dark:border-gray-800">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {selectedCount > 0 ? (
              <span>
                {selectedCount} user
                {selectedCount > 1 ? "s" : ""} selected
              </span>
            ) : (
              <span>Select one or more users to invite.</span>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-2 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-60 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {submitting ? "Sharing..." : "Share"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
