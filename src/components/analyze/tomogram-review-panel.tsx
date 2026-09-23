import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { CheckCircle2, ClipboardCheck, Plus } from "lucide-react";

import { useProjectService } from "@/ProjectServiceContext";
import type {
  TomogramReview,
  TomogramReviewContext,
  TomogramReviewSchema,
  TomogramReviewSubsetFilter,
} from "@/services/ProjectService";

type SelectedTomogram = {
  id: string | number;
  label?: string;
};

export type TomogramReviewFilter = TomogramReviewSubsetFilter;

type TomogramReviewPanelProps = {
  projectId: string | number;
  protocolId: string | number;
  outputName: string;
  selectedTomogram: SelectedTomogram | null;
  reviewFilter?: TomogramReviewFilter;
  onReviewFilterChange?: (filter: TomogramReviewFilter) => void;
  onContextChange?: (context: TomogramReviewContext) => void;
  onNextUnreviewed?: () => void;
  hasNextUnreviewed?: boolean;
};

type Notice = {
  severity: "success" | "warning" | "error";
  message: string;
} | null;

type TagDefinition = {
  key: string;
  label: string;
};

const QUALITY_OPTIONS = ["Excellent", "Good", "Ambiguous", "Bad"] as const;

function schemaTags(schema: TomogramReviewSchema | null | undefined): TagDefinition[] {
  const rawTags = schema?.definition?.tags;
  if (!Array.isArray(rawTags)) return [];

  const seen = new Set<string>();
  return rawTags.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const tag = candidate as { key?: unknown; label?: unknown };
    const key = typeof tag.key === "string" ? tag.key.trim() : "";
    const label = typeof tag.label === "string" ? tag.label.trim() : "";
    if (!key || !label || seen.has(key)) return [];
    seen.add(key);
    return [{ key, label }];
  });
}

function storedTagKeys(values: Record<string, unknown>): string[] {
  if (!Array.isArray(values.tags)) return [];
  return values.tags.filter((value): value is string => typeof value === "string");
}

function tagKeyFromLabel(label: string) {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function appendTagDefinition(tags: TagDefinition[], rawLabel: string): TagDefinition[] {
  const label = rawLabel.trim();
  const normalizedLabel = label.toLocaleLowerCase();
  if (!label || tags.some((tag) => tag.label.toLocaleLowerCase() === normalizedLabel)) {
    return tags;
  }

  const usedKeys = new Set(tags.map((tag) => tag.key));
  const baseKey = tagKeyFromLabel(label) || `tag_${tags.length + 1}`;
  let key = baseKey;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${baseKey}_${suffix}`;
    suffix += 1;
  }

  return [...tags, { key, label }];
}

function conflictCurrentReview(error: unknown): TomogramReview | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as {
    status?: number;
    detail?: unknown;
    data?: unknown;
  };

  if (candidate.status !== 409) return null;

  const data = candidate.data as {
    detail?: {
      current?: TomogramReview | null;
    };
  } | null;
  const detail = candidate.detail as {
    current?: TomogramReview | null;
  } | null;

  return data?.detail?.current ?? detail?.current ?? null;
}

function conflictCurrentSchema(error: unknown): TomogramReviewSchema | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as {
    status?: number;
    detail?: unknown;
    data?: unknown;
  };
  if (candidate.status !== 409) return null;

  const data = candidate.data as {
    detail?: { current?: TomogramReviewSchema | null };
  } | null;
  const detail = candidate.detail as {
    current?: TomogramReviewSchema | null;
  } | null;

  return data?.detail?.current ?? detail?.current ?? null;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function TomogramReviewPanel({
  projectId,
  protocolId,
  outputName,
  selectedTomogram,
  reviewFilter = "all",
  onReviewFilterChange,
  onContextChange,
  onNextUnreviewed,
  hasNextUnreviewed = false,
}: TomogramReviewPanelProps) {
  const svc = useProjectService();
  const [context, setContext] = useState<TomogramReviewContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [reviewed, setReviewed] = useState(false);
  const [quality, setQuality] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [baseValues, setBaseValues] = useState<Record<string, unknown>>({});
  const [revision, setRevision] = useState(0);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState<TagDefinition[]>([]);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [savingSchema, setSavingSchema] = useState(false);
  const [creatingSubset, setCreatingSubset] = useState(false);

  const selectedKey = selectedTomogram == null ? null : String(selectedTomogram.id);
  const selectedReview = useMemo(
    () => selectedKey == null ? null : context?.reviews[selectedKey] ?? null,
    [context, selectedKey],
  );
  const tagDefinitions = useMemo(
    () => schemaTags(context?.schema),
    [context?.schema],
  );
  const tagCounts = useMemo(() => {
    const counts = new Map(tagDefinitions.map((tag) => [tag.key, 0]));

    Object.values(context?.reviews ?? {}).forEach((review) => {
      new Set(storedTagKeys(review.values)).forEach((key) => {
        if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });

    return counts;
  }, [context?.reviews, tagDefinitions]);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setLoadError(null);

    svc.fetchTomogramReviewContext(projectId, protocolId, outputName, {
      signal: abort.signal,
    })
      .then((nextContext) => {
        if (!abort.signal.aborted) setContext(nextContext);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setLoadError(errorMessage(error, "Failed to load tomogram reviews"));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });

    return () => abort.abort();
  }, [svc, projectId, protocolId, outputName]);

  useLayoutEffect(() => {
    const values = selectedReview?.values ?? {};

    setReviewed(Boolean(selectedReview?.reviewed));
    setQuality(typeof values.quality === "string" ? values.quality : "");
    const availableKeys = new Set(tagDefinitions.map((tag) => tag.key));
    setSelectedTags(storedTagKeys(values).filter((key) => availableKeys.has(key)));
    setComment(selectedReview?.comment ?? "");
    setBaseValues(values);
    setRevision(selectedReview?.revision ?? 0);
  }, [selectedKey, selectedReview, tagDefinitions]);

  useEffect(() => {
    setNotice(null);
  }, [selectedKey]);

  useEffect(() => {
    if (context) onContextChange?.(context);
  }, [context, onContextChange]);

  const applyStoredReview = (stored: TomogramReview) => {
    setContext((previous) => {
      if (!previous) return previous;

      const previousReview = previous.reviews[String(stored.scipionItemId)];
      const reviewedDelta = Number(stored.reviewed) - Number(Boolean(previousReview?.reviewed));

      return {
        ...previous,
        progress: {
          ...previous.progress,
          reviewed: Math.max(0, previous.progress.reviewed + reviewedDelta),
        },
        reviews: {
          ...previous.reviews,
          [String(stored.scipionItemId)]: stored,
        },
      };
    });

    setReviewed(stored.reviewed);
    setQuality(typeof stored.values.quality === "string" ? stored.values.quality : "");
    const availableKeys = new Set(tagDefinitions.map((tag) => tag.key));
    setSelectedTags(storedTagKeys(stored.values).filter((key) => availableKeys.has(key)));
    setComment(stored.comment ?? "");
    setBaseValues(stored.values);
    setRevision(stored.revision);
  };

  const saveReview = async () => {
    if (selectedTomogram == null || saving) return;

    setSaving(true);
    setNotice(null);

    try {
      const values: Record<string, unknown> = {
        ...baseValues,
        quality,
      };
      if (tagDefinitions.length > 0) values.tags = selectedTags;

      const stored = await svc.saveTomogramReview(
        projectId,
        protocolId,
        outputName,
        selectedTomogram.id,
        {
          reviewed,
          values,
          comment,
          revision,
        },
      );

      applyStoredReview(stored);
      setNotice({ severity: "success", message: "Review saved" });
    } catch (error: unknown) {
      const current = conflictCurrentReview(error);

      if (current) {
        applyStoredReview(current);
        setNotice({
          severity: "warning",
          message: "Another user updated this review. Their latest version is now loaded.",
        });
      } else {
        setNotice({
          severity: "error",
          message: errorMessage(error, "Failed to save tomogram review"),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const openTagConfiguration = () => {
    setTagDraft(tagDefinitions);
    setNewTagLabel("");
    setNotice(null);
    setTagDialogOpen(true);
  };

  const addTagToDraft = () => {
    setTagDraft((current) => appendTagDefinition(current, newTagLabel));
    setNewTagLabel("");
  };

  const saveTagConfiguration = async () => {
    if (savingSchema) return;
    setSavingSchema(true);
    setNotice(null);

    const definition = {
      ...(context?.schema?.definition ?? {}),
      tags: tagDraft,
    };

    try {
      const schema = await svc.saveTomogramReviewSchema(
        projectId,
        protocolId,
        outputName,
        {
          definition,
          revision: context?.schema?.revision ?? 0,
        },
      );
      setContext((previous) => previous ? { ...previous, schema } : previous);
      setTagDialogOpen(false);
      setNotice({ severity: "success", message: "Tag configuration saved" });
    } catch (error: unknown) {
      const current = conflictCurrentSchema(error);
      if (current) {
        setContext((previous) => previous ? { ...previous, schema: current } : previous);
        setTagDialogOpen(false);
        setNotice({
          severity: "warning",
          message: "Another user updated the tag configuration. Their latest version is now loaded.",
        });
      } else {
        setNotice({
          severity: "error",
          message: errorMessage(error, "Failed to save tag configuration"),
        });
      }
    } finally {
      setSavingSchema(false);
    }
  };

  const createSubset = async () => {
    if (creatingSubset) return;

    setCreatingSubset(true);
    setNotice(null);

    try {
      const result = await svc.createTomogramReviewSubset(
        projectId,
        protocolId,
        outputName,
        {
          filter: reviewFilter,
        },
      );

      if (result.success) {
        const unit = result.createdTomograms === 1 ? "tomogram" : "tomograms";
        setNotice({
          severity: "success",
          message: `Subset created: ${result.outputName} (${result.createdTomograms} ${unit})`,
        });
      } else {
        setNotice({
          severity: "warning",
          message: result.message || "No tomograms matched the active filter.",
        });
      }
    } catch (error: unknown) {
      setNotice({
        severity: "error",
        message: errorMessage(error, "Failed to create tomogram subset"),
      });
    } finally {
      setCreatingSubset(false);
    }
  };

  const total = context?.progress.total ?? 0;
  const reviewedCount = context?.progress.reviewed ?? 0;
  const progress = total > 0 ? Math.min(100, (reviewedCount / total) * 100) : 0;

  return (
    <Paper
      square
      elevation={0}
      sx={{
        height: "100%",
        minHeight: 0,
        borderLeft: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        "& .MuiTypography-subtitle2": { fontSize: "0.82rem" },
        "& .MuiTypography-body2": { fontSize: "0.78rem" },
        "& .MuiTypography-caption": { fontSize: "0.72rem" },
        "& .MuiTypography-overline": { fontSize: "0.68rem" },
        "& .MuiButton-root, & .MuiToggleButton-root": {
          fontSize: "0.74rem",
          textTransform: "none",
        },
        "& .MuiFormControlLabel-label": { fontSize: "0.76rem" },
        "& .MuiInputBase-root, & .MuiInputLabel-root": { fontSize: "0.76rem" },
      }}
    >
      <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 1.5,
              display: "grid",
              placeItems: "center",
              color: "primary.main",
              bgcolor: "action.selected",
            }}
          >
            <ClipboardCheck size={18} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
              Tomogram review
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {loading ? "Loading review status…" : `${reviewedCount} of ${total} reviewed`}
            </Typography>
          </Box>
          {loading ? <CircularProgress size={16} /> : null}
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ mt: 1.2, height: 5, borderRadius: 8 }}
        />
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={reviewFilter}
          onChange={(_, nextFilter: TomogramReviewFilter | null) => {
            if (nextFilter) onReviewFilterChange?.(nextFilter);
          }}
          sx={{ mt: 1.2 }}
        >
          <ToggleButton value="all" aria-label="All">All</ToggleButton>
          <ToggleButton value="pending" aria-label="Pending">Pending</ToggleButton>
          <ToggleButton value="reviewed" aria-label="Reviewed">Reviewed</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: "flex", gap: 0.75, mt: 0.7 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => void createSubset()}
            disabled={loading || total === 0 || creatingSubset}
            sx={{ flex: 1 }}
          >
            {creatingSubset ? "Creating…" : "Create subset"}
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={openTagConfiguration}
            disabled={loading}
            sx={{ flex: 1 }}
          >
            Configure tags
          </Button>
        </Box>
      </Box>

      <Box sx={{ minHeight: 0, flex: 1, overflowY: "auto", p: 1.5 }}>
        {loadError ? <Alert severity="error">{loadError}</Alert> : null}
        {notice ? <Alert severity={notice.severity} sx={{ mb: 1.25 }}>{notice.message}</Alert> : null}

        {!loading && !loadError && selectedTomogram == null ? (
          <Box sx={{ py: 5, px: 1.5, textAlign: "center" }}>
            <ClipboardCheck size={30} opacity={0.35} />
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>
              Select a tomogram to review it.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Review state is shared with every API node through PostgreSQL.
            </Typography>
          </Box>
        ) : null}

        {!loadError && selectedTomogram != null ? (
          <Stack spacing={1.6}>
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                Selected tomogram
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>
                {selectedTomogram.label || `Tomogram ${String(selectedTomogram.id)}`}
              </Typography>
            </Box>

            <FormControlLabel
              control={(
                <Checkbox
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
              )}
              label="Reviewed"
            />

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                Quality
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={quality}
                onChange={(_, nextQuality: string | null) => {
                  if (nextQuality != null) setQuality(nextQuality);
                }}
                sx={{ mt: 0.7 }}
              >
                {QUALITY_OPTIONS.map((option) => (
                  <ToggleButton key={option} value={option} aria-label={option}>
                    {option}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            {tagDefinitions.length > 0 ? (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                  Tags
                </Typography>
                <ToggleButtonGroup
                  value={selectedTags}
                  onChange={(_, nextTags: string[]) => setSelectedTags(nextTags)}
                  size="small"
                  sx={{ mt: 0.7, display: "flex", flexWrap: "wrap", gap: 0.7 }}
                >
                  {tagDefinitions.map((tag) => (
                    <ToggleButton
                      key={tag.key}
                      value={tag.key}
                      aria-label={`${tag.label} ${tagCounts.get(tag.key) ?? 0}`}
                      sx={{ m: "0 !important", border: "1px solid !important" }}
                    >
                      {tag.label}&nbsp;{tagCounts.get(tag.key) ?? 0}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
            ) : null}

            <TextField
              label="Comment"
              multiline
              minRows={4}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              fullWidth
            />

            <Button
              variant="outlined"
              disabled={!hasNextUnreviewed || saving}
              onClick={onNextUnreviewed}
              fullWidth
            >
              Next unreviewed
            </Button>

            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <CheckCircle2 size={16} />}
              disabled={saving || loading}
              onClick={saveReview}
              fullWidth
            >
              Save review
            </Button>
          </Stack>
        ) : null}
      </Box>

      <Dialog
        open={tagDialogOpen}
        onClose={() => setTagDialogOpen(false)}
        transitionDuration={0}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { overflow: "hidden" } }}
      >
        <DialogTitle
          sx={{
            py: 1.25,
            background: "linear-gradient(180deg, #0b1220 0%, #0a0f1e 100%)",
            color: "#e5e7eb",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            fontSize: "0.95rem",
            fontWeight: 800,
          }}
        >
          Configure review tags
        </DialogTitle>
        <DialogContent
          sx={{
            pt: "20px !important",
            "& .MuiTypography-body2": { fontSize: "0.78rem" },
            "& .MuiInputBase-root, & .MuiInputLabel-root": { fontSize: "0.76rem" },
            "& .MuiButton-root": { fontSize: "0.74rem", textTransform: "none" },
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
            Add the generic tags that reviewers can assign to any tomogram.
          </Typography>
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
            <TextField
              label="New tag"
              value={newTagLabel}
              onChange={(event) => setNewTagLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTagToDraft();
                }
              }}
              size="small"
              fullWidth
              autoFocus
            />
            <Button
              variant="contained"
              startIcon={<Plus size={15} />}
              onClick={addTagToDraft}
              disabled={!newTagLabel.trim()}
              sx={{ minWidth: 88, height: 40, textTransform: "none" }}
            >
              Add
            </Button>
          </Box>

          <Box
            aria-label="Configured tags"
            sx={{
              mt: 1.5,
              minHeight: 76,
              p: 1.25,
              display: "flex",
              alignContent: "flex-start",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 0.75,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.5,
              bgcolor: "action.hover",
            }}
          >
            {tagDraft.length > 0 ? tagDraft.map((tag) => (
              <Chip
                key={tag.key}
                label={tag.label}
                size="small"
                onDelete={() => setTagDraft((current) => current.filter((item) => item.key !== tag.key))}
              />
            )) : (
              <Typography variant="caption" color="text.secondary">
                No tags configured yet.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions
          sx={{
            px: 3,
            pb: 2,
            "& .MuiButton-root": { fontSize: "0.74rem", textTransform: "none" },
          }}
        >
          <Button onClick={() => setTagDialogOpen(false)} disabled={savingSchema}>
            Cancel
          </Button>
          <Button variant="contained" onClick={saveTagConfiguration} disabled={savingSchema}>
            Save tag configuration
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
