import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Autocomplete, Box, Button, Paper, Stack, TextField, Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { FolderOpen, Plus, RefreshCw, Tag } from "lucide-react";

import TagEditorDialog from "@/components/tags/TagEditorDialog";
import TagList from "@/components/tags/TagList";
import TagDeleteDialog from "@/components/tags/TagDeleteDialog";
import { useTagList } from "@/components/tags/useTagList";
import { useProjectService } from "@/ProjectServiceContext";
import { SETTINGS_TEXT, SettingRow, SettingsSection, sectionTint, settingLabelId } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";

type ProjectOption = { id: string; name: string };

function errorText(error: unknown, fallback: string): string {
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === "string" && message ? message : fallback;
}

function asProjectOptions(data: unknown): ProjectOption[] {
    // A plain list, or one inside "results"
    const results = (data as { results?: unknown } | null)?.results;
    const list = Array.isArray(data) ? data : Array.isArray(results) ? results : [];
    return list
        .map((p: Record<string, unknown>) => ({
            id: String(p?.id ?? p?.projectId ?? p?.name ?? "").trim(),
            name: String(p?.name ?? p?.title ?? p?.id ?? p?.projectId ?? "").trim(),
        }))
        .filter((p) => p.id && p.name);
}

/** Settings → Tags: the tags of each project, to create, rename, recolour and delete them. */
export default function TagsPanel() {
    const isDarkMode = useTheme().palette.mode === "dark";
    const { colors, fieldSx, menuPaperSx, actionButtonSx, saveButtonSx } = useSettingsStyles(isDarkMode);
    const svc = useProjectService();

    const [projects, setProjects] = useState<ProjectOption[] | null>(null);
    const [projectsError, setProjectsError] = useState<string | null>(null);
    const [projectsLoading, setProjectsLoading] = useState(false);
    const [project, setProject] = useState<ProjectOption | null>(null);

    const loadProjects = useCallback(async () => {
        setProjectsLoading(true);
        setProjectsError(null);
        try {
            const list = asProjectOptions(await svc.fetchList());
            setProjects(list);
            setProject((current) => list.find((p) => p.id === current?.id) ?? list[0] ?? null);
        } catch (e) {
            setProjectsError(errorText(e, "Failed to load the projects"));
            setProjects([]);
            setProject(null);
        } finally {
            setProjectsLoading(false);
        }
    }, [svc]);

    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);

    const projectId = useMemo(() => {
        if (!project) return null;
        const asNumber = Number(project.id);
        return Number.isFinite(asNumber) ? asNumber : project.id;
    }, [project]);

    const {
        tags, isLoading, isSaving, deletingIds, editor, openCreate, openEdit, closeEditor, changeDraft, saveDraft,
        confirmDelete, setConfirmDelete, deleteTag,
    } = useTagList({ projectId });

    const busy = isLoading || projectsLoading;
    const noProjects = projects !== null && projects.length === 0 && !projectsError;

    return (
        <Stack spacing={2}>
            <SettingsSection
                icon={<Tag size={19} />}
                title="Protocol tags"
                subtitle="Labels to group and filter the protocols of a project. Each project has its own."
                colors={colors}
                isDarkMode={isDarkMode}
                plain
                actions={
                    <Stack direction="row" spacing={1}>
                        <Button size="small" variant="outlined" sx={actionButtonSx} startIcon={<RefreshCw size={15} />}
                                disabled={projectsLoading} onClick={() => void loadProjects()}>
                            Reload
                        </Button>
                        <Button size="small" variant="contained" sx={saveButtonSx} startIcon={<Plus size={15} />}
                                disabled={!project || busy} onClick={openCreate}>
                            New tag
                        </Button>
                    </Stack>
                }
            >
                <SettingRow
                    colors={colors}
                    title="Project"
                    labelFor="tags-project"
                    description="The project whose tags you see and change. You can also manage them from the project itself."
                    control={
                        <Autocomplete<ProjectOption, false, true, false>
                            id="tags-project"
                            sx={{ width: { xs: "100%", md: 340 } }}
                            options={projects ?? []}
                            // Never undefined: the field must follow the project chosen from the first load
                            value={project as ProjectOption}
                            loading={projectsLoading}
                            disableClearable
                            disabled={projectsLoading || !projects?.length}
                            getOptionLabel={(option) => option.name}
                            isOptionEqualToValue={(a, b) => a.id === b.id}
                            onChange={(_, next) => setProject(next)}
                            PaperComponent={(props) => <Paper {...props} sx={menuPaperSx} />}
                            renderOption={(props, option) => (
                                <Box component="li" {...props} key={option.id} sx={{ fontSize: SETTINGS_TEXT.control }}>
                                    {option.name}
                                </Box>
                            )}
                            renderInput={(params) => (
                                <TextField {...params} size="small" sx={fieldSx}
                                           placeholder={projectsLoading ? "Loading projects…" : "Choose a project"}
                                           inputProps={{ ...params.inputProps, "aria-labelledby": settingLabelId("tags-project") }}
                                           InputProps={{
                                               ...params.InputProps,
                                               startAdornment: <FolderOpen size={16} style={{ color: colors.muted, marginLeft: 4 }} />,
                                           }} />
                            )}
                        />
                    }
                />

                {projectsError && (
                    <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: "#dc2626", py: 1 }}>{projectsError}</Typography>
                )}
                {noProjects && (
                    <Typography sx={{ fontSize: SETTINGS_TEXT.title, color: colors.muted, py: 1.5 }}>
                        There are no projects yet: tags belong to a project.
                    </Typography>
                )}

                {project && (
                    <Box sx={{ borderTop: `1px solid ${colors.border}`, pt: 2 }}>
                        <TagList tags={tags} isLoading={isLoading} deletingIds={deletingIds}
                                 colors={{ ...colors, ring: sectionTint(isDarkMode) }} buttonSx={actionButtonSx}
                                 fieldSx={fieldSx} onEdit={openEdit} onDelete={setConfirmDelete}
                                 emptyHint="Make one with New tag, then give it to protocols from their menu in the project." />
                    </Box>
                )}
            </SettingsSection>

            <TagEditorDialog
                open={editor.open}
                mode={editor.mode}
                draft={editor.draft}
                onChange={changeDraft}
                onClose={closeEditor}
                onSave={saveDraft}
                isSaving={isSaving}
                validationError={editor.validationError}
            />

            <TagDeleteDialog tag={confirmDelete} busy={!!(confirmDelete && deletingIds[confirmDelete.id])}
                             onConfirm={(tag) => void deleteTag(tag)} onClose={() => setConfirmDelete(null)} />
        </Stack>
    );
}
