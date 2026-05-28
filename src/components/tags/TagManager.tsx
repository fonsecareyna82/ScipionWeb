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
    open?: boolean; // openFlag

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
    const description = typeof raw?.description === "string" && raw.description.trim() ? raw.description : undefined;

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

const dialogHeaderSx = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#333d49",
    color: "white",
    px: 2,
    py: 1.5,
    boxSizing: "border-box",
    m: 0,
} as const;

const dialogCloseButtonSx = {
    color: "white",
    borderRadius: "50%",
    backgroundColor: "rgba(255,255,255,0.10)",
    width: 32,
    height: 32,
    "&:hover": { backgroundColor: "rgba(255,255,255,0.18)" },
    "&:focus-visible": {
        outline: "2px solid rgba(255,255,255,0.55)",
        outlineOffset: 2,
    },
} as const;

const textFieldSx = {
    "& .MuiInputBase-root": {
        borderRadius: 2,
        backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(15,23,42,0.72)" : "#ffffff",
    },
    "& .MuiInputBase-input, & .MuiInputBase-inputMultiline": {
        color: (theme: any) => theme.palette.mode === "dark" ? "#e5e7eb" : "#111827",
    },
    "& .MuiInputLabel-root": {
        color: (theme: any) => theme.palette.mode === "dark" ? "#94a3b8" : "#6b7280",
    },
    "& .MuiOutlinedInput-notchedOutline": {
        borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.45)",
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(125,211,252,0.48)" : "rgba(37,99,235,0.42)",
    },
    "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: (theme: any) => theme.palette.mode === "dark" ? "#38bdf8" : "#2563eb",
    },
} as const;

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
        borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.28)" : "rgba(203,213,225,0.95)",
        backgroundImage: "none",
        backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "#0f172a" : "#ffffff",
        color: (theme: any) => theme.palette.mode === "dark" ? "#e5e7eb" : "#111827",
        boxShadow: (theme: any) => theme.palette.mode === "dark"
            ? "0 24px 70px rgba(0,0,0,0.62)"
            : "0 18px 50px rgba(15,23,42,0.18)",
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
                        sx: {
                            backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(2,6,23,0.42)" : "rgba(15,23,42,0.12)",
                            backdropFilter: "blur(2px)",
                        },
                    },
                }}
                PaperProps={{ sx: paperSx }}
            >
                <DialogTitle sx={dialogHeaderSx}>
                    <Box sx={{ minWidth: 0, pr: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>{dialogTitle}</Typography>
                    </Box>

                    <IconButton
                        onClick={onClose}
                        aria-label="Close"
                        size="small"
                        disabled={!!isSaving}
                        sx={dialogCloseButtonSx}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>

                <DialogContent
                    sx={{
                        px: 2,
                        py: 1.75,
                        overflow: "visible",
                        backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "#0f172a" : "#ffffff",
                    }}
                >
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
                                sx={textFieldSx}
                            />
                            {hasTitleHelp ? (
                                <Tooltip title="Help">
                                    <IconButton
                                        size="small"
                                        onClick={() => setOpenHelp("title")}
                                        sx={{ mt: 0.75, color: (theme: any) => theme.palette.mode === "dark" ? "#93c5fd" : "#2563eb" }}
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
                                sx={textFieldSx}
                            />
                            {hasDescriptionHelp ? (
                                <Tooltip title="Help">
                                    <IconButton
                                        size="small"
                                        onClick={() => setOpenHelp("description")}
                                        sx={{ mt: 0.75, color: (theme: any) => theme.palette.mode === "dark" ? "#93c5fd" : "#2563eb" }}
                                        disabled={!!isSaving}
                                    >
                                        <HelpIcon fontSize="1.1rem" />
                                    </IconButton>
                                </Tooltip>
                            ) : null}
                        </Box>

                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography
                                    sx={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        mb: 0.75,
                                        color: (theme: any) => theme.palette.mode === "dark" ? "#cbd5e1" : "#374151",
                                    }}
                                >
                                    Color
                                </Typography>

                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                                    {defaultTagColors.map((c) => {
                                        const isSelected = c.toLowerCase() === String(draft.color).toLowerCase();
                                        return (
                                            <Box
                                                key={c}
                                                component="button"
                                                type="button"
                                                onClick={() => onChange({ color: c })}
                                                disabled={!!isSaving}
                                                sx={{
                                                    width: 24,
                                                    height: 24,
                                                    borderRadius: "50%",
                                                    border: "2px solid",
                                                    borderColor: isSelected
                                                        ? (theme: any) => theme.palette.mode === "dark" ? "#f8fafc" : "#111827"
                                                        : (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.34)" : "rgba(15,23,42,0.20)",
                                                    backgroundColor: c,
                                                    cursor: isSaving ? "default" : "pointer",
                                                    opacity: isSaving ? 0.65 : 1,
                                                    boxShadow: isSelected ? "0 0 0 3px rgba(59,130,246,0.26)" : "none",
                                                    transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
                                                    "&:hover": {
                                                        transform: isSaving ? "none" : "translateY(-1px)",
                                                    },
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
                                            sx={{ ...textFieldSx, width: 140 }}
                                            inputProps={{ "aria-label": "Custom color" }}
                                            margin="dense"
                                            disabled={!!isSaving}
                                        />
                                        <Box
                                            component="input"
                                            type="color"
                                            value={draft.color}
                                            onChange={(e: any) => onChange({ color: e.target.value })}
                                            disabled={!!isSaving}
                                            sx={{
                                                width: 36,
                                                height: 36,
                                                border: "1px solid",
                                                borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.38)" : "rgba(15,23,42,0.22)",
                                                borderRadius: 1.5,
                                                backgroundColor: "transparent",
                                                padding: 0.25,
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
                                        sx={{ mt: 0.75, color: (theme: any) => theme.palette.mode === "dark" ? "#93c5fd" : "#2563eb" }}
                                        disabled={!!isSaving}
                                    >
                                        <HelpIcon fontSize="1.1rem" />
                                    </IconButton>
                                </Tooltip>
                            ) : null}
                        </Box>

                        {validationError ? (
                            <Typography
                                sx={{
                                    color: (theme: any) => theme.palette.mode === "dark" ? "#fca5a5" : "#dc2626",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {validationError}
                            </Typography>
                        ) : null}
                    </Box>
                </DialogContent>

                <DialogActions
                    sx={{
                        justifyContent: "center",
                        gap: 1,
                        px: 2,
                        py: 1.5,
                        borderTop: "1px solid",
                        borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.20)" : "rgba(226,232,240,0.95)",
                        backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(15,23,42,0.98)" : "#f8fafc",
                    }}
                >
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        disabled={!!isSaving}
                        sx={{
                            textTransform: "none",
                            minWidth: 112,
                            borderRadius: 2,
                            color: (theme: any) => theme.palette.mode === "dark" ? "#e5e7eb" : "#334155",
                            borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.34)" : "rgba(100,116,139,0.42)",
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => void onSave()}
                        disabled={!!isSaving}
                        sx={{ textTransform: "none", minWidth: 112, borderRadius: 2, boxShadow: "none" }}
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
                        sx: {
                            backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(2,6,23,0.42)" : "rgba(15,23,42,0.12)",
                            backdropFilter: "blur(2px)",
                        },
                    },
                }}
                PaperProps={{ sx: paperSx }}
            >
                <DialogTitle sx={dialogHeaderSx}>
                    <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>Help</Typography>

                    <IconButton
                        onClick={() => setOpenHelp(null)}
                        aria-label="Close"
                        size="small"
                        sx={dialogCloseButtonSx}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>

                <DialogContent
                    sx={{
                        px: 2,
                        py: 1.75,
                        mt: 2.25,
                        backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "#0f172a" : "#ffffff",
                    }}
                >
                    <Box sx={{ maxHeight: "60vh", overflow: "auto", pr: 0.5 }}>
                        <Typography
                            sx={{
                                fontSize: 13,
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                color: (theme: any) => theme.palette.mode === "dark" ? "#cbd5e1" : "#374151",
                            }}
                        >
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
                        borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.20)" : "rgba(226,232,240,0.95)",
                        backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(15,23,42,0.98)" : "#f8fafc",
                    }}
                >
                    <Button
                        variant="outlined"
                        onClick={() => setOpenHelp(null)}
                        sx={{
                            textTransform: "none",
                            minWidth: 112,
                            borderRadius: 2,
                            color: (theme: any) => theme.palette.mode === "dark" ? "#e5e7eb" : "#334155",
                            borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.34)" : "rgba(100,116,139,0.42)",
                        }}
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

const TagManager = memo(function TagManager({ title, projectId, open = true, tags, onTagsChange, initialTags }: TagManagerProps) {
    const svc = useProjectService();
    const svcRef = useRef(svc);
    useEffect(() => {
        // syncSvcRef
        svcRef.current = svc;
    }, [svc]);

    const normalizedProjectId = useMemo(() => {
        // normalizedProjectId
        const s = String(projectId ?? "").trim();
        if (!s || s === "null" || s === "undefined") return null;
        return projectId as Id;
    }, [projectId]);

    const backendEnabled = normalizedProjectId != null;

    const isControlled = !backendEnabled && Array.isArray(tags) && typeof onTagsChange === "function";

    const [backendTags, setBackendTags] = useState<ProtocolTag[]>([]);
    const { tags: storeTags, setTags: storeSetTags, deleteTag: storeDeleteTag } = useTagStore();

    const effectiveTags: ProtocolTag[] = useMemo(() => {
        // effectiveTags
        if (backendEnabled) return Array.isArray(backendTags) ? backendTags : [];
        if (isControlled) return Array.isArray(tags) ? tags : [];
        return Array.isArray(storeTags) ? storeTags : [];
    }, [backendEnabled, backendTags, isControlled, tags, storeTags]);

    const persistTags = useCallback(
        (next: ProtocolTag[]) => {
            // persistTags
            const list = Array.isArray(next) ? next : [];

            if (backendEnabled) {
                setBackendTags(list);
            }

            // keepGlobalStoreInSync
            storeSetTags(list);

            // notifyParentAlways
            onTagsChange?.(list);
        },
        [backendEnabled, onTagsChange, storeSetTags],
    );

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});

    useEffect(() => {
        // logProjectIdWhenChanges
        if (!import.meta.env.DEV) return;
        if (projectId == null) return;
        // eslint-disable-next-line no-console
        console.debug("TagManager projectId:", projectId);
    }, [projectId]);

    useEffect(() => {
        // syncPropsTagsToStore
        if (backendEnabled) return;
        if (!Array.isArray(tags)) return;
        storeSetTags(tags);
    }, [backendEnabled, tags, storeSetTags]);

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

    useEffect(() => {
        // loadTagsFromBackend
        if (!backendEnabled) return;
        if (!open) return;

        const pidKey = String(normalizedProjectId ?? "").trim();
        if (!pidKey) return;

        let cancelled = false;
        setIsLoading(true);

        const run = async () => {
            // run
            try {
                const remote = await svcRef.current.listProjectTags(normalizedProjectId as Id);
                if (cancelled) return;

                const list = normalizeTagList(remote as ServiceProtocolTag[]);
                persistTags(list);
            } catch (e: any) {
                if (cancelled) return;
                toast.error(coerceErrorMessage(e, "Failed to load tags"));
            } finally {
                if (cancelled) return;
                setIsLoading(false);
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [backendEnabled, normalizedProjectId, open, persistTags]);

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
                    persistTags([createdTag, ...withoutSameId]);
                    setEditorOpen(false);
                    return;
                }

                const next: ProtocolTag = {
                    id: generateTagId(),
                    title: draft.title.trim(),
                    description: draft.description.trim() ? draft.description.trim() : undefined,
                    color: draft.color,
                };

                persistTags([next, ...(effectiveTags ?? [])]);
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
                persistTags(nextTags);
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

            persistTags(nextTags);
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
                persistTags((effectiveTags ?? []).filter((t) => String(t.id) !== tid));
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
            persistTags((effectiveTags ?? []).filter((t) => String(t.id) !== tid));
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
                border: "1px solid",
                borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.24)" : "rgba(203,213,225,0.95)",
                borderRadius: 3,
                backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "#0f172a" : "#ffffff",
                color: (theme: any) => theme.palette.mode === "dark" ? "#e5e7eb" : "#111827",
                overflow: "hidden",
                boxShadow: (theme: any) => theme.palette.mode === "dark" ? "0 18px 46px rgba(0,0,0,0.34)" : "0 8px 28px rgba(15,23,42,0.06)",
            }}
        >
            <Box
                sx={{
                    px: 1.75,
                    py: 1.35,
                    backgroundColor: "#333d49",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                }}
            >
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{title ?? "Tags"}</Typography>
                    {isLoading ? <CircularProgress size={14} sx={{ color: "rgba(255,255,255,0.88)" }} /> : null}
                </Box>

                <Button
                    variant="contained"
                    onClick={openCreate}
                    disabled={isLoading}
                    sx={{
                        textTransform: "none",
                        backgroundColor: "#16a34a",
                        borderRadius: 2,
                        boxShadow: "none",
                        fontWeight: 700,
                        "&:hover": { backgroundColor: "#15803d", boxShadow: "none" },
                    }}
                >
                    New tag
                </Button>
            </Box>

            <Box sx={{ p: 1.5, backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "#0f172a" : "#ffffff" }}>
                {(effectiveTags ?? []).length === 0 ? (
                    <Box
                        sx={{
                            border: "1px dashed",
                            borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.26)" : "rgba(148,163,184,0.45)",
                            borderRadius: 2.5,
                            px: 1.5,
                            py: 1.25,
                            backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(15,23,42,0.82)" : "#f8fafc",
                        }}
                    >
                        <Typography sx={{ fontSize: 12, color: (theme: any) => theme.palette.mode === "dark" ? "#94a3b8" : "#64748b" }}>
                            No tags yet.
                        </Typography>
                    </Box>
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
                                        border: "1px solid",
                                        borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.18)" : "rgba(226,232,240,0.95)",
                                        borderRadius: 2.5,
                                        px: 1.25,
                                        py: 1,
                                        opacity: isDeleting ? 0.65 : 1,
                                        backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(15,23,42,0.78)" : "#ffffff",
                                        transition: "border-color 140ms ease, background-color 140ms ease, transform 140ms ease",
                                        "&:hover": {
                                            borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(125,211,252,0.34)" : "rgba(59,130,246,0.28)",
                                            backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(30,41,59,0.78)" : "#f8fafc",
                                        },
                                    }}
                                >
                                    <Box sx={{ minWidth: 0 }}>
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                                            <Box
                                                sx={{
                                                    width: 11,
                                                    height: 11,
                                                    borderRadius: "50%",
                                                    backgroundColor: t.color,
                                                    border: "1px solid",
                                                    borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(248,250,252,0.32)" : "rgba(15,23,42,0.18)",
                                                    boxShadow: "0 0 0 3px rgba(148,163,184,0.10)",
                                                    flex: "0 0 auto",
                                                }}
                                            />
                                            <Typography
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: 13,
                                                    color: (theme: any) => theme.palette.mode === "dark" ? "#f8fafc" : "#111827",
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
                                                    color: (theme: any) => theme.palette.mode === "dark" ? "#94a3b8" : "#4b5563",
                                                    mt: 0.35,
                                                    whiteSpace: "pre-wrap",
                                                    wordBreak: "break-word",
                                                }}
                                            >
                                                {t.description}
                                            </Typography>
                                        ) : null}
                                    </Box>

                                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                                        <Button
                                            size="small"
                                            variant="contained"
                                            onClick={() => openEdit(t)}
                                            disabled={isDeleting || isLoading}
                                            sx={{
                                                textTransform: "none",
                                                borderRadius: 2,
                                                backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "#2563eb" : "#2b5ac0",
                                                color: "white",
                                                boxShadow: "none",
                                                "&:hover": {
                                                    backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "#1d4ed8" : "#1a43b3",
                                                    boxShadow: "none",
                                                },
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
                                                    sx={{
                                                        color: (theme: any) => theme.palette.mode === "dark" ? "#fca5a5" : "#b91c1c",
                                                        borderRadius: 2,
                                                        "&:hover": {
                                                            backgroundColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(248,113,113,0.12)" : "rgba(239,68,68,0.08)",
                                                        },
                                                    }}
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

            <Divider sx={{ borderColor: (theme: any) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.16)" : "rgba(226,232,240,0.95)" }} />

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
