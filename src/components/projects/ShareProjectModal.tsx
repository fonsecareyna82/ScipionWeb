// src/components/projects/ShareProjectModal.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useProjectService } from "@/ProjectServiceContext";

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

                // Normalizamos la lista de userIds que ya tienen acceso
                const sharedUserIds = new Set<string | number>(
                    shareList.map((s: any) =>
                        s.userId ??
                        s.sharedUserId ??
                        s.shared_with_id ??
                        s.targetUserId ??
                        s.user_id
                    ),
                );

                const ownerId = projectOwnerId != null ? String(projectOwnerId) : null;

                const normalized: ShareableUser[] = rawUsers.map((u: any) => {
                    const rawId = u.id ?? u.pk ?? u.username ?? u.email ?? "";
                    const id = String(rawId);
                    const isOwner = ownerId !== null && id === ownerId;
                    const alreadyShared = sharedUserIds.has(rawId) || sharedUserIds.has(id);

                    return {
                        id: rawId,
                        name: u.name ?? u.fullName ?? u.username ?? u.email ?? "Unknown user",
                        email: u.email,
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

    const toggleUser = useCallback(
        (userId: string | number) => {
            setSelectedIds((prev) =>
                prev.includes(userId)
                    ? prev.filter((id) => id !== userId)
                    : [...prev, userId]
            );
        },
        []
    );

    const handleOverlayClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
                onClose();
            }
        },
        [onClose]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
            }
        },
        [onClose]
    );

    const handleSubmit = useCallback(async () => {
        if (!projectId) return;

        // No enviar owner ni ya compartidos aunque por error estuvieran en selectedIds
        const effectiveIds = selectedIds.filter((id) => {
            const user = users.find((u) => String(u.id) === String(id));
            if (!user) return false;
            if (user.isOwner || user.alreadyShared) return false;
            return true;
        });

        if (!effectiveIds.length) {
            setErrorMsg("Select at least one user who does not already have access.");
            return;
        }

        setSubmitting(true);
        setErrorMsg("");
        try {
            await svc.shareProject(String(projectId), effectiveIds.map((id) => String(id)));
            toast.success(`Project shared successfully`);
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

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onMouseDown={handleOverlayClick}
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-project-title"
            aria-describedby="share-project-desc"
        >
            <div
                ref={dialogRef}
                className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-lg shadow-lg max-h-[80vh] flex flex-col"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <h3
                    id="share-project-title"
                    className="text-lg font-semibold mb-3 text-gray-900 dark:text-white"
                >
                    Share project
                </h3>
                <p
                    id="share-project-desc"
                    className="text-sm text-gray-700 dark:text-gray-300 mb-3"
                >
                    Select one or more users to grant access to{" "}
                    <span className="font-medium">
                        {projectName || "this project"}
                    </span>
                    .
                </p>

                <div className="mb-3">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search users by name or email..."
                        className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white"
                    />
                </div>

                <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md">
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
                        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredUsers.map((u) => {
                                const checked = selectedIds.includes(u.id);
                                const disabled = u.isOwner || u.alreadyShared;

                                return (
                                    <li
                                        key={String(u.id)}
                                        className="flex items-center justify-between px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                                    >
                                        <label
                                            className={
                                                "flex items-center gap-3 w-full " +
                                                (disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer")
                                            }
                                        >
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4"
                                                checked={checked}
                                                disabled={disabled}
                                                onChange={() => !disabled && toggleUser(u.id)}
                                            />
                                            <div className="flex flex-col">
                                                <span className="font-medium">{u.name}</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {u.email}
                                                    {u.isOwner && " • Owner"}
                                                    {!u.isOwner && u.alreadyShared && " • Already has access"}
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
                    <div className="mt-2 text-sm text-red-600">
                        {errorMsg}
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
                    >
                        {submitting ? "Sharing..." : "Share"}
                    </button>
                </div>
            </div>
        </div>
    );
}
