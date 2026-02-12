// src/components/tags/TagManager.tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";

import { TrashBinIcon, HelpIcon, CloseIcon } from "../../icons";

import type { ProtocolTag } from "./tagTypes";
import { useTagStore } from "@/stores/tag_store";
import { useProjectService } from "@/ProjectServiceContext";
import type { Id, ProtocolTag as ServiceProtocolTag } from "@/services/ProjectService";

type TagManagerProps = {
    title?: string;

    // backendMode
    projectId?: Id;

    // controlledMode
    tags?: ProtocolTag[];
    onTagsChange?: (next: ProtocolTag[]) => void;

    // uncontrolledMode
    initialTags?: ProtocolTag[];
};

const defaultTagColors = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#84cc16",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#6366f1",
    "#a855f7",
    "#ec4899",
    "#64748b",
    "#111827",
] as const;

function generateTagId(): string {
    // generateTagId
    const hasUuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
    if (hasUuid) return crypto.randomUUID();
    return `tag_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isNonEmptyString(v: any): boolean {
    // isNonEmptyString
    return typeof v === "string" && v.trim().length > 0;
}

function coerceErrorMessage(e: any, fallback: string): string {
    // coerceErrorMessage
    const msg =
        (typeof e?.data?.detail === "string" && e.data.detail) ||
        (typeof e?.response?.data?.detail === "string" && e.response.data.detail) ||
        (typeof e?.message === "string" && e.message) ||
        String(e ?? "");
    return msg.trim() ? msg : fallback;
}

function normalizeTag(raw: any): ProtocolTag {
    // normalizeTag
    const description =
        typeof raw?.description === "string" && raw.description.trim()
            ? raw.description
            : undefined;

    return {
        id: String(raw?.id ?? ""),
        title: String(raw?.title ?? ""),
        description,
        color: typeof raw?.color === "string" && raw.color.trim() ? raw.color : "#3b82f6",
    };
}

function normalizeTagList(raw: unknown): ProtocolTag[] {
    // normalizeTagList
    if (!Array.isArray(raw)) return [];
    return raw
        .map((t) => normalizeTag(t))
        .filter((t) => typeof t.title === "string" && t.title.trim().length > 0);
}

type TagDraft = {
    id?: string;
    title: string;
    description: string;
    color: string;
};

type TagEditorDialogProps = {
    open: boolean;
    mode: "create" | "edit";
    draft: TagDraft;
    onChange: (patch: Partial<TagDraft>) => void;
    onClose: () => void;
    onSave: () => void | Promise<void>;

    isSaving?: boolean;

    titleHelpText?: string;
    descriptionHelpText?: string;
    colorHelpText?: string;
    validationError?: string | null;
};

function TagEditorDialog({
    open,
    mode,
    draft,
    onChange,
    onClose,
    onSave,
    isSaving,
    titleHelpText,
    descriptionHelpText,
    colorHelpText,
    validationError,
}: TagEditorDialogProps) {
    // TagEditorDialog
    const [openHelp, setOpenHelp] = useState<null | "title" | "description" | "color">(null);

    const dialogTitle = mode === "create" ? "Create tag" : "Edit tag";

    const helpText = useMemo(() => {
        // helpText
        if (openHelp === "title") return titleHelpText ?? "";
        if (openHelp === "description") return descriptionHelpText ?? "";
        if (openHelp === "color") return colorHelpText ?? "";
        return "";
    }, [openHelp, titleHelpText, descriptionHelpText, colorHelpText]);

    const hasTitleHelp = isNonEmptyString(titleHelpText);
    const hasDescriptionHelp = isNonEmptyString(descriptionHelpText);
    const hasColorHelp = isNonEmptyString(colorHelpText);

    const paperSx = {
        // paperSx
        borderRadius: 4,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
    } as const;

    return (
        <>
            <Dialog
                open={open}
                onClose={isSaving ? undefined : onClose}
                maxWidth="sm"
                fullWidth
                slotProps={{
                    backdrop: {
                        sx: { backgroundColor: "transparent" },
                    },
                }}
                PaperProps={{ sx: paperSx }}
            >
                <DialogTitle
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: "#333d49",
                        color: "white",
                        px: 2,
                        py: 1.5,
                        boxSizing: "border-box",
                        m: 0,
                    }}
                >
                    <Box sx={{ minWidth: 0, pr: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>
                            {dialogTitle}
                        </Typography>
                    </Box>

                    <IconButton
                        onClick={onClose}
                        aria-label="Close"
                        size="small"
                        disabled={!!isSaving}
                        sx={{
                            color: "white",
                            borderRadius: "50%",
                            backgroundColor: "rgba(206, 170, 170, 0.1)",
                            width: 32,
                            height: 32,
                            "&:hover": { backgroundColor: "rgba(253, 253, 253, 0.1)" },
                            "&:focus-visible": {
                                outline: "2px solid rgba(255,255,255,0.55)",
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>

                <DialogContent sx={{ px: 2, py: 1.5, overflow: "visible" }}>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                            <TextField
                                label="Title"
                                value={draft.title}
                                onChange={(e) => onChange({ title: e.target.value })}
                                fullWidth
                                size="small"
                                required
                                margin="dense"
                                disabled={!!isSaving}
                            />
                            {hasTitleHelp ? (
                                <Tooltip title="Help">
                                    <IconButton
                                        size="small"
                                        onClick={() => setOpenHelp("title")}
                                        sx={{ mt: 0.75 }}
                                        disabled={!!isSaving}
                                    >
                                        <HelpIcon fontSize="1.1rem" />
                                    </IconButton>
                                </Tooltip>
                            ) : null}
                        </Box>

                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                            <TextField
                                label="Description (optional)"
                                value={draft.description}
                                onChange={(e) => onChange({ description: e.target.value })}
                                fullWidth
                                size="small"
                                multiline
                                minRows={3}
                                margin="dense"
                                disabled={!!isSaving}
                            />
                            {hasDescriptionHelp ? (
                                <Tooltip title="Help">
                                    <IconButton
                                        size="small"
                                        onClick={() => setOpenHelp("description")}
                                        sx={{ mt: 0.75 }}
                                        disabled={!!isSaving}
                                    >
                                        <HelpIcon fontSize="1.1rem" />
                                    </IconButton>
                                </Tooltip>
                            ) : null}
                        </Box>

                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.75 }}>
                                    Color
                                </Typography>

                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                                    {defaultTagColors.map((c) => {
                                        const isSelected = c.toLowerCase() === String(draft.color).toLowerCase();
                                        return (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => onChange({ color: c })}
                                                disabled={!!isSaving}
                                                style={{
                                                    width: 22,
                                                    height: 22,
                                                    borderRadius: "50%",
                                                    border: isSelected ? "2px solid #111827" : "1px solid rgba(0,0,0,0.2)",
                                                    background: c,
                                                    cursor: isSaving ? "default" : "pointer",
                                                    opacity: isSaving ? 0.65 : 1,
                                                }}
                                                aria-label={`Pick color ${c}`}
                                            />
                                        );
                                    })}

                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <TextField
                                            size="small"
                                            value={draft.color}
                                            onChange={(e) => onChange({ color: e.target.value })}
                                            sx={{ width: 140 }}
                                            inputProps={{ "aria-label": "Custom color" }}
                                            margin="dense"
                                            disabled={!!isSaving}
                                        />
                                        <input
                                            type="color"
                                            value={draft.color}
                                            onChange={(e) => onChange({ color: e.target.value })}
                                            disabled={!!isSaving}
                                            style={{
                                                width: 34,
                                                height: 34,
                                                border: "1px solid rgba(0,0,0,0.25)",
                                                background: "transparent",
                                                padding: 0,
                                                cursor: isSaving ? "default" : "pointer",
                                                opacity: isSaving ? 0.65 : 1,
                                            }}
                                            aria-label="Pick custom color"
                                        />
                                    </Box>
                                </Box>
                            </Box>

                            {hasColorHelp ? (
                                <Tooltip title="Help">
                                    <IconButton
                                        size="small"
                                        onClick={() => setOpenHelp("color")}
                                        sx={{ mt: 0.75 }}
                                        disabled={!!isSaving}
                                    >
                                        <HelpIcon fontSize="1.1rem" />
                                    </IconButton>
                                </Tooltip>
                            ) : null}
                        </Box>

                        {validationError ? (
                            <Typography sx={{ color: "#dc2626", fontSize: 12, whiteSpace: "pre-wrap" }}>
                                {validationError}
                            </Typography>
                        ) : null}
                    </Box>
                </DialogContent>

                <DialogActions
                    sx={{
                        justifyContent: "center",
                        px: 2,
                        py: 1.5,
                        borderTop: "1px solid",
                        borderColor: "divider",
                        backgroundColor: "background.paper",
                    }}
                >
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        disabled={!!isSaving}
                        sx={{ textTransform: "none", minWidth: 112, borderRadius: 2 }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => void onSave()}
                        disabled={!!isSaving}
                        sx={{ textTransform: "none", minWidth: 112, borderRadius: 2 }}
                    >
                        {isSaving ? "Saving..." : "Save"}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={openHelp !== null}
                onClose={() => setOpenHelp(null)}
                maxWidth="sm"
                fullWidth
                slotProps={{
                    backdrop: {
                        sx: { backgroundColor: "transparent" },
                    },
                }}
                PaperProps={{ sx: paperSx }}
            >
                <DialogTitle
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: "#333d49",
                        color: "white",
                        px: 2,
                        py: 1.5,
                        boxSizing: "border-box",
                        m: 0,
                    }}
                >
                    <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>
                        Help
                    </Typography>

                    <IconButton
                        onClick={() => setOpenHelp(null)}
                        aria-label="Close"
                        size="small"
                        sx={{
                            color: "white",
                            borderRadius: "50%",
                            backgroundColor: "rgba(206, 170, 170, 0.1)",
                            width: 32,
                            height: 32,
                            "&:hover": { backgroundColor: "rgba(253, 253, 253, 0.1)" },
                            "&:focus-visible": {
                                outline: "2px solid rgba(255,255,255,0.55)",
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>

                <DialogContent sx={{ px: 2, py: 1.5, marginTop: 2.25 }}>
                    <Box sx={{ maxHeight: "60vh", overflow: "auto", pr: 0.5 }}>
                        <Typography sx={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                            {helpText || "No help available."}
                        </Typography>
                    </Box>
                </DialogContent>

                <DialogActions
                    sx={{
                        justifyContent: "center",
                        px: 2,
                        py: 1.5,
                        borderTop: "1px solid",
                        borderColor: "divider",
                        backgroundColor: "background.paper",
                    }}
                >
                    <Button variant="outlined" onClick={() => setOpenHelp(null)} sx={{ textTransform: "none", minWidth: 112 }}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

const TagManager = memo(function TagManager({ title, projectId, tags, onTagsChange, initialTags }: TagManagerProps) {
    const svc = useProjectService();
    const svcRef = useRef(svc);
    useEffect(() => {
        // syncSvcRef
        svcRef.current = svc;
    }, [svc]);


    const isControlled = Array.isArray(tags) && typeof onTagsChange === "function";

    const normalizedProjectId = useMemo(() => {
        // normalizedProjectId
        const s = String(projectId ?? "").trim();
        if (!s || s === "null" || s === "undefined") return null;
        return projectId as Id;
    }, [projectId]);

    const backendEnabled = normalizedProjectId != null;

    const { tags: storeTags, setTags: storeSetTags, deleteTag: storeDeleteTag } = useTagStore();

    const effectiveTags: ProtocolTag[] = storeTags ?? [];

    const persistLocalTags = useCallback(
        (next: ProtocolTag[]) => {
            // persistLocalTags
            const list = Array.isArray(next) ? next : [];

            // Keep global store in sync so ProtocolNodeCard / TagPicker update immediately
            storeSetTags(list);

            // If TagManager is controlled, also notify parent
            if (isControlled) onTagsChange?.(list);
        },
        [isControlled, onTagsChange, storeSetTags],
    );


    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});

    useEffect(() => {
        // logProjectIdWhenChanges
        if (projectId == null) return;
        // eslint-disable-next-line no-console
        console.debug("TagManager projectId:", projectId);
    }, [projectId]);

    useEffect(() => {
        // syncPropsTagsToStore
        if (!Array.isArray(tags)) return;
        storeSetTags(tags);
    }, [tags, storeSetTags]);


    useEffect(() => {
        // debugProjectId
        if (!import.meta.env.DEV) return;
        // eslint-disable-next-line no-console
        console.debug("TagManager projectId:", normalizedProjectId);
    }, [normalizedProjectId]);

    useEffect(() => {
        // seedStoreFromInitialTags
        if (backendEnabled) return;
        if (isControlled) return;
        if (!Array.isArray(initialTags) || initialTags.length === 0) return;
        if (Array.isArray(storeTags) && storeTags.length > 0) return;

        storeSetTags(initialTags);
    }, [backendEnabled, isControlled, initialTags, storeSetTags, storeTags]);


    const loadedProjectIdRef = useRef<string | null>(null);
    const inFlightProjectIdRef = useRef<string | null>(null);
    const clearedProjectIdRef = useRef<string | null>(null);

    useEffect(() => {
        // loadTagsFromBackend
        if (!backendEnabled) return;

        const pidKey = String(normalizedProjectId ?? "").trim();
        if (!pidKey) return;

        if (loadedProjectIdRef.current === pidKey) return;
        if (inFlightProjectIdRef.current === pidKey) return;

        // clearOncePerProjectLoad
        if (clearedProjectIdRef.current !== pidKey) {
            clearedProjectIdRef.current = pidKey;
            storeSetTags([]);
            if (isControlled) onTagsChange?.([]);
        }

        let cancelled = false;
        inFlightProjectIdRef.current = pidKey;
        setIsLoading(true);

        const run = async () => {
            // run
            try {
                const remote = await svcRef.current.listProjectTags(normalizedProjectId as Id);
                if (cancelled) return;

                const list = normalizeTagList(remote as ServiceProtocolTag[]);
                persistLocalTags(list);

                loadedProjectIdRef.current = pidKey;
            } catch (e: any) {
                if (cancelled) return;
                toast.error(coerceErrorMessage(e, "Failed to load tags"));
            } finally {
                if (inFlightProjectIdRef.current === pidKey) inFlightProjectIdRef.current = null;
                if (cancelled) return;
                setIsLoading(false);
            }
        };

        void run();

        return () => {
            cancelled = true;
            if (inFlightProjectIdRef.current === pidKey) inFlightProjectIdRef.current = null;
        };
    }, [backendEnabled, normalizedProjectId, isControlled, onTagsChange, persistLocalTags, storeSetTags]);


    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
    const [draft, setDraft] = useState<TagDraft>({
        title: "",
        description: "",
        color: "#3b82f6",
    });
    const [validationError, setValidationError] = useState<string | null>(null);

    const openCreate = () => {
        // openCreate
        setValidationError(null);
        setEditorMode("create");
        setDraft({ title: "", description: "", color: "#3b82f6" });
        setEditorOpen(true);
    };

    const openEdit = (tag: ProtocolTag) => {
        // openEdit
        setValidationError(null);
        setEditorMode("edit");
        setDraft({
            id: tag.id,
            title: tag.title,
            description: tag.description ?? "",
            color: tag.color ?? "#3b82f6",
        });
        setEditorOpen(true);
    };

    const closeEditor = () => {
        // closeEditor
        if (isSaving) return;
        setEditorOpen(false);
    };

    const validateDraft = (): string | null => {
        // validateDraft
        if (!isNonEmptyString(draft.title)) return "Title is required.";

        const normalizedTitle = draft.title.trim().toLowerCase();
        const conflict = (effectiveTags ?? []).some((t) => {
            if (editorMode === "edit" && draft.id && String(t.id) === String(draft.id)) return false;
            return String(t.title).trim().toLowerCase() === normalizedTitle;
        });

        if (conflict) return "A tag with the same title already exists.";
        if (!isNonEmptyString(draft.color)) return "Color is required.";

        return null;
    };

    const saveDraft = async () => {
        // saveDraft
        const err = validateDraft();
        if (err) {
            setValidationError(err);
            return;
        }

        setIsSaving(true);
        setValidationError(null);

        try {
            if (editorMode === "create") {
                if (backendEnabled) {
                    const created = await svcRef.current.createProjectTag(normalizedProjectId as Id, {
                        title: draft.title.trim(),
                        description: draft.description.trim() ? draft.description.trim() : null,
                        color: draft.color,
                    } as any);

                    const createdTag = normalizeTag(created);
                    const withoutSameId = (effectiveTags ?? []).filter((t) => String(t.id) !== String(createdTag.id));
                    persistLocalTags([createdTag, ...withoutSameId]);
                    setEditorOpen(false);
                    return;
                }

                const next: ProtocolTag = {
                    id: generateTagId(),
                    title: draft.title.trim(),
                    description: draft.description.trim() ? draft.description.trim() : undefined,
                    color: draft.color,
                };

                persistLocalTags([next, ...(effectiveTags ?? [])]);
                setEditorOpen(false);
                return;
            }

            if (!draft.id) {
                setValidationError("Missing tag id.");
                return;
            }

            if (backendEnabled) {
                const updated = await svcRef.current.updateProjectTag(normalizedProjectId as Id, String(draft.id), {
                    title: draft.title.trim(),
                    description: draft.description.trim() ? draft.description.trim() : null,
                    color: draft.color,
                } as any);

                const updatedTag = normalizeTag(updated);
                const nextTags = (effectiveTags ?? []).map((t) => (String(t.id) === String(draft.id) ? updatedTag : t));
                persistLocalTags(nextTags);
                setEditorOpen(false);
                return;
            }

            const nextTags = (effectiveTags ?? []).map((t) => {
                if (String(t.id) !== String(draft.id)) return t;
                return {
                    ...t,
                    title: draft.title.trim(),
                    description: draft.description.trim() ? draft.description.trim() : undefined,
                    color: draft.color,
                };
            });

            persistLocalTags(nextTags);
            setEditorOpen(false);
        } catch (e: any) {
            toast.error(coerceErrorMessage(e, "Failed to save tag"));
        } finally {
            setIsSaving(false);
        }
    };

    const deleteTag = async (tagId: string) => {
        // deleteTag
        const tid = String(tagId);

        if (!backendEnabled) {
            if (isControlled) {
                persistLocalTags((effectiveTags ?? []).filter((t) => String(t.id) !== tid));
            } else {
                storeDeleteTag(tid);
            }
            return;
        }

        setDeletingIds((prev) => ({ ...prev, [tid]: true }));
        try {
            const res = await svcRef.current.deleteProjectTag(normalizedProjectId as Id, tid);
            if (res && (res as any).success === false) {
                toast.error("Delete failed");
                return;
            }
            persistLocalTags((effectiveTags ?? []).filter((t) => String(t.id) !== tid));
        } catch (e: any) {
            toast.error(coerceErrorMessage(e, "Failed to delete tag"));
        } finally {
            setDeletingIds((prev) => {
                const next = { ...prev };
                delete next[tid];
                return next;
            });
        }
    };

    return (
        <Box
            sx={{
                border: "1px solid #e5e7eb",
                borderRadius: 2,
                backgroundColor: "#fff",
                overflow: "hidden",
            }}
        >
            <Box
                sx={{
                    px: 1.5,
                    py: 1.25,
                    backgroundColor: "#333d49",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                }}
            >
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                        {title ?? "Tags"}
                    </Typography>
                    {isLoading ? <CircularProgress size={14} /> : null}
                </Box>

                <Button
                    variant="contained"
                    onClick={openCreate}
                    disabled={isLoading}
                    sx={{
                        textTransform: "none",
                        backgroundColor: "#25991a",
                        borderRadius: 2,
                        "&:hover": { backgroundColor: "#176d0f" },
                    }}
                >
                    New tag
                </Button>
            </Box>

            <Box sx={{ p: 1.5 }}>
                {(effectiveTags ?? []).length === 0 ? (
                    <Typography sx={{ fontSize: 12, color: "#6b7280" }}>
                        No tags yet.
                    </Typography>
                ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {(effectiveTags ?? []).map((t) => {
                            const isDeleting = !!deletingIds[String(t.id)];
                            return (
                                <Box
                                    key={t.id}
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "minmax(0,1fr) auto",
                                        alignItems: "center",
                                        gap: 1,
                                        border: "1px solid #e5e7eb",
                                        borderRadius: 2,
                                        px: 1.25,
                                        py: 1,
                                        opacity: isDeleting ? 0.65 : 1,
                                    }}
                                >
                                    <Box sx={{ minWidth: 0 }}>
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                                            <Box
                                                sx={{
                                                    width: 10,
                                                    height: 10,
                                                    borderRadius: "50%",
                                                    backgroundColor: t.color,
                                                    border: "1px solid rgba(0,0,0,0.15)",
                                                    flex: "0 0 auto",
                                                }}
                                            />
                                            <Typography
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: 13,
                                                    color: "#111827",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                                title={t.title}
                                            >
                                                {t.title}
                                            </Typography>
                                        </Box>

                                        {t.description ? (
                                            <Typography
                                                sx={{
                                                    fontSize: 12,
                                                    color: "#4b5563",
                                                    mt: 0.25,
                                                    whiteSpace: "pre-wrap",
                                                    wordBreak: "break-word",
                                                }}
                                            >
                                                {t.description}
                                            </Typography>
                                        ) : null}
                                    </Box>

                                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            onClick={() => openEdit(t)}
                                            disabled={isDeleting || isLoading}
                                            sx={{
                                                textTransform: "none",
                                                borderRadius: 2,
                                                backgroundColor: "#2b5ac0",
                                                color: "white",
                                                "&:hover": { backgroundColor: "#1a43b3" },
                                            }}
                                        >
                                            Edit
                                        </Button>

                                        <Tooltip title="Delete">
                                            <span>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => void deleteTag(String(t.id))}
                                                    disabled={isDeleting || isLoading}
                                                >
                                                    <TrashBinIcon fontSize="1.2rem" />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </Box>

            <Divider />

            <TagEditorDialog
                open={editorOpen}
                mode={editorMode}
                draft={draft}
                onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
                onClose={closeEditor}
                onSave={saveDraft}
                isSaving={isSaving}
                validationError={validationError}
                titleHelpText={"Tag title used to identify and filter protocols."}
                descriptionHelpText={"Optional. You can add a short explanation for the tag."}
                colorHelpText={"Pick a color to quickly recognize the tag in chips and lists."}
            />
        </Box>
    );
});

export default TagManager;
