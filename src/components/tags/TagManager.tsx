// src/components/tags/TagManager.tsx
import { useMemo, useState } from "react";
import {
    Box,
    Button,
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

type TagManagerProps = {
    title?: string;

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
    onSave: () => void;

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
                onClose={onClose}
                maxWidth="sm"
                fullWidth
                slotProps={{
                    backdrop: {
                        sx: { backgroundColor: "transparent" },
                    },
                }}
                PaperProps={{ sx: paperSx }}
            >
                {/* headerBar */}
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
                        sx={{
                            color: "white",
                            borderRadius: "50%", // makeCloseButtonRound
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

                {/* body */}
                <DialogContent
                    sx={{
                        px: 2,
                        py: 1.5,
                        overflow: "visible",
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            pt: 0.5, // labelTopRoom
                        }}
                    >
                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                            <TextField
                                label="Title"
                                value={draft.title}
                                onChange={(e) => onChange({ title: e.target.value })}
                                fullWidth
                                size="small"
                                required
                                margin="dense"
                            />
                            {hasTitleHelp ? (
                                <Tooltip title="Help">
                                    <IconButton size="small" onClick={() => setOpenHelp("title")} sx={{ mt: 0.75 }}>
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
                            />
                            {hasDescriptionHelp ? (
                                <Tooltip title="Help">
                                    <IconButton size="small" onClick={() => setOpenHelp("description")} sx={{ mt: 0.75 }}>
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
                                                style={{
                                                    width: 22,
                                                    height: 22,
                                                    borderRadius: "50%", // makeCloseButtonRound
                                                    border: isSelected ? "2px solid #111827" : "1px solid rgba(0,0,0,0.2)",
                                                    background: c,
                                                    cursor: "pointer",
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
                                            sx={{ width: 140}}
                                            inputProps={{ "aria-label": "Custom color" }}
                                            margin="dense"
                                        />
                                        <input
                                            type="color"
                                            value={draft.color}
                                            onChange={(e) => onChange({ color: e.target.value })}
                                            style={{
                                                width: 34,
                                                height: 34,
                                                border: "1px solid rgba(0,0,0,0.25)",
                                                background: "transparent",
                                                padding: 0,
                                                cursor: "pointer",
                                            }}
                                            aria-label="Pick custom color"
                                        />
                                    </Box>
                                </Box>
                            </Box>

                            {hasColorHelp ? (
                                <Tooltip title="Help">
                                    <IconButton size="small" onClick={() => setOpenHelp("color")} sx={{ mt: 0.75 }}>
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

                {/* footer */}
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
                    <Button variant="outlined" onClick={onClose} sx={{ textTransform: "none", minWidth: 112 }}>
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={onSave} sx={{ textTransform: "none", minWidth: 112 }}>
                        Save
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
                    <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2, display: "flex", alignItems: "center", gap: 1    }}>
                        Help
                    </Typography>

                    <IconButton
                        onClick={() => setOpenHelp(null)}
                        aria-label="Close"
                        size="small"
                        sx={{
                            color: "white",
                            borderRadius: "50%", // makeCloseButtonRound
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

export default function TagManager({ title, tags, onTagsChange, initialTags }: TagManagerProps) {
    const isControlled = Array.isArray(tags) && typeof onTagsChange === "function";

    const [localTags, setLocalTags] = useState<ProtocolTag[]>(() => {
        // initLocalTags
        return Array.isArray(initialTags) ? initialTags : [];
    });

    const effectiveTags = isControlled ? (tags as ProtocolTag[]) : localTags;

    const setTags = (next: ProtocolTag[]) => {
        // setTags
        if (isControlled) onTagsChange?.(next);
        else setLocalTags(next);
    };

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
            color: tag.color,
        });
        setEditorOpen(true);
    };

    const closeEditor = () => {
        // closeEditor
        setEditorOpen(false);
    };

    const validateDraft = (): string | null => {
        // validateDraft
        if (!isNonEmptyString(draft.title)) return "Title is required.";

        const normalizedTitle = draft.title.trim().toLowerCase();
        const conflict = effectiveTags.some((t) => {
            if (editorMode === "edit" && draft.id && t.id === draft.id) return false;
            return String(t.title).trim().toLowerCase() === normalizedTitle;
        });

        if (conflict) return "A tag with the same title already exists.";
        if (!isNonEmptyString(draft.color)) return "Color is required.";

        return null;
    };

    const saveDraft = () => {
        // saveDraft
        const err = validateDraft();
        if (err) {
            setValidationError(err);
            return;
        }

        if (editorMode === "create") {
            const next: ProtocolTag = {
                id: generateTagId(),
                title: draft.title.trim(),
                description: draft.description.trim() ? draft.description.trim() : undefined,
                color: draft.color,
            };
            setTags([next, ...effectiveTags]);
            setEditorOpen(false);
            return;
        }

        // editMode
        if (!draft.id) {
            setValidationError("Missing tag id.");
            return;
        }

        const nextTags = effectiveTags.map((t) => {
            if (t.id !== draft.id) return t;
            return {
                ...t,
                title: draft.title.trim(),
                description: draft.description.trim() ? draft.description.trim() : undefined,
                color: draft.color,
            };
        });

        setTags(nextTags);
        setEditorOpen(false);
    };

    const deleteTag = (tagId: string) => {
        // deleteTag
        setTags(effectiveTags.filter((t) => t.id !== tagId));
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
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                    {title ?? "Tags"}
                </Typography>

                <Button
                    variant="contained"
                    onClick={openCreate}
                    sx={{
                        textTransform: "none",
                        backgroundColor: "#25991a",
                        "&:hover": { backgroundColor: "#176d0f" },
                    }}
                >
                    New tag
                </Button>
            </Box>

            <Box sx={{ p: 1.5 }}>
                {effectiveTags.length === 0 ? (
                    <Typography sx={{ fontSize: 12, color: "#6b7280" }}>
                        No tags yet.
                    </Typography>
                ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {effectiveTags.map((t) => (
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
                                        sx={{ textTransform: "none" }}
                                    >
                                        Edit
                                    </Button>

                                    <Tooltip title="Delete">
                                        <IconButton size="small" onClick={() => deleteTag(t.id)}>
                                            <TrashBinIcon fontSize="1.2rem" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Box>
                        ))}
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
                validationError={validationError}
                titleHelpText={"Tag title used to identify and filter protocols."}
                descriptionHelpText={"Optional. You can add a short explanation for the tag."}
                colorHelpText={"Pick a color to quickly recognize the tag in chips and lists."}
            />
        </Box>
    );
}
