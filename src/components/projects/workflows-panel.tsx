import { useState } from "react";
import { X, RefreshCw, Search } from "lucide-react";
import toast from "react-hot-toast";

import { useProjectService } from "@/ProjectServiceContext";

import styles from "./workflows-panel.module.css";

export interface ProjectWorkflow {
  id: string;
  name: string;
  description: string;
}

interface ProjectWorkflowsPanelProps {
  open: boolean;
  onClose: () => void;
  workflows: ProjectWorkflow[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onWorkflowClick?: (workflow: ProjectWorkflow) => void;
  onWorkflowDoubleClick?: (workflow: ProjectWorkflow) => void;
  projectId: string | number;
  projectName?: string;
}

export function ProjectWorkflowsPanel({
  open,
  onClose,
  workflows,
  loading = false,
  errorMessage = null,
  onRetry,
  onWorkflowClick,
  onWorkflowDoubleClick,
  projectId,
  projectName,
}: ProjectWorkflowsPanelProps) {
  const hasWorkflows = Array.isArray(workflows) && workflows.length > 0;

  const [selectedWorkflow, setSelectedWorkflow] =
    useState<ProjectWorkflow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleRowDoubleClick = (wf: ProjectWorkflow) => {
    onWorkflowDoubleClick?.(wf);
    setSelectedWorkflow(wf);
    setDialogOpen(true);
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredWorkflows = normalizedSearch
    ? workflows.filter((wf) =>
        (wf.name ?? "").toString().toLowerCase().includes(normalizedSearch),
      )
    : workflows;

  const hasFilteredWorkflows =
    Array.isArray(filteredWorkflows) && filteredWorkflows.length > 0;

  const shellClassName = [
    styles.shell,
    open ? styles.shellOpen : styles.shellClosed,
  ].join(" ");

  return (
    <>
      <div className={styles.host}>
        <div className={shellClassName} aria-hidden={!open}>
          <div className={styles.panel}>
            {/* headerSection */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <span className={styles.headerTitle}>Workflows</span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className={styles.closeButton}
                aria-label="Close workflows panel"
              >
                <X className={styles.closeIcon} />
              </button>
            </div>

            {/* contentSection */}
            <div className={styles.content}>
              {loading ? (
                <div className={styles.loadingWrap}>
                  <div className={styles.loadingPill}>
                    <span className={styles.loadingDot} />
                    <span>Loading workflows…</span>
                  </div>
                  <p className={styles.loadingHint}>
                    This may take a few seconds the first time.
                  </p>
                </div>
              ) : errorMessage ? (
                <div className={styles.errorWrap}>
                  <span className={styles.errorTitle}>
                    Could not load workflows.
                  </span>
                  <span className={styles.errorMessage} title={errorMessage}>
                    {errorMessage}
                  </span>

                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className={styles.retryButton}
                    >
                      <RefreshCw className={styles.retryIcon} />
                      Retry
                    </button>
                  )}
                </div>
              ) : !hasWorkflows ? (
                <p className={styles.emptyText}>
                  No workflows defined yet. You can add predefined pipelines
                  later.
                </p>
              ) : (
                <div className={styles.bodyWrap}>
                  {/* searchSection */}
                  <div className={styles.searchRow}>
                    <div className={styles.searchBox}>
                      <Search className={styles.searchIcon} />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search workflow…"
                        className={styles.searchInput}
                      />
                    </div>
                  </div>

                  {/* tableSection */}
                  <div className={styles.table}>
                    <div className={styles.tableHeader}>
                      <span>Workflow</span>
                      <span>Description</span>
                    </div>

                    <div className={styles.tableBody}>
                      {!hasFilteredWorkflows ? (
                        <div className={styles.noMatch}>
                          No workflows match the current search.
                        </div>
                      ) : (
                        filteredWorkflows.map((wf) => (
                          <button
                            key={wf.id}
                            type="button"
                            onClick={() => onWorkflowClick?.(wf)}
                            onDoubleClick={() => handleRowDoubleClick(wf)}
                            className={styles.rowButton}
                          >
                            <div className={styles.rowName} title={wf.name}>
                              {wf.name}
                            </div>
                            <div className={styles.rowDescription}>
                              {wf.description}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* footerSection */}
            <div className={styles.footer}>
              Double-click a workflow to apply it to the current project.
            </div>
          </div>
        </div>
      </div>

      <ApplyWorkflowToCurrentProjectDialog
        open={dialogOpen}
        workflow={selectedWorkflow}
        projectId={projectId}
        projectName={projectName}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}

interface ApplyWorkflowToCurrentProjectDialogProps {
  open: boolean;
  workflow: ProjectWorkflow | null;
  projectId: string | number;
  projectName?: string;
  onClose: () => void;
}

function ApplyWorkflowToCurrentProjectDialog({
  open,
  workflow,
  projectId,
  projectName,
  onClose,
}: ApplyWorkflowToCurrentProjectDialogProps) {
  const svc = useProjectService();

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!workflow) {
      onClose();
      return;
    }

    setSubmitError(null);
    setSubmitting(true);

    try {
      await svc.loadWorkflow(projectId, {
        workflowId: String(workflow.id),
      });

      const targetName = projectName ?? String(projectId);

      toast.success(
        `Workflow "${workflow.name}" applied to project "${targetName}".`,
      );

      onClose();
    } catch (err: any) {
      console.error(
        "[ApplyWorkflowToCurrentProjectDialog] handleApply error:",
        err,
      );
      setSubmitError(
        err?.message || "Failed to apply workflow. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !workflow) return null;

  return (
    <div className={styles.applyOverlay} role="dialog" aria-modal="true">
      <div className={styles.applyCard}>
        <button
          type="button"
          onClick={onClose}
          className={styles.applyCloseButton}
          aria-label="Close apply workflow dialog"
          disabled={submitting}
        > 
          <X className={styles.applyCloseIcon} />
        </button>

        <div className={styles.applyHeader}>
          <h2 className={styles.applyTitle}>Load workflow</h2>
          <p className={styles.applySubtitle}>{workflow.name}</p>
          <p className={styles.applyHint}>
            This workflow will be loaded to the current project.
          </p>
        </div>

        {workflow.description ? (
          <div className={styles.applyDescriptionBlock}>
            <div className={styles.applyDescriptionLabel}>
              Workflow description
            </div>
            <div className={styles.applyDescriptionBox}>
              {workflow.description}
            </div>
          </div>
        ) : null}

        {submitError ? (
          <div className={styles.applyError}>{submitError}</div>
        ) : null}

        <div className={styles.applyActions}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={styles.cancelButton}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={submitting}
            className={styles.applyButton}
          >
            {submitting ? "loading…" : "Load"}
          </button>
        </div>
      </div>
    </div>
  );
}
