import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Button, Chip, CircularProgress, Divider, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";
import { Activity, Box as BoxIcon, Database, GitBranch, Layers, Table as TableIcon } from "lucide-react";
import { BASE_URL } from "@/config";
import { useProjectService } from "@/ProjectServiceContext";
import { MetadataViewer } from "./metadata-viewer";
import VolumeViewer from "./volume-viewer";
import Coords3dViewer from "./coords3d-viewer";
import TiltSeriesViewer from "./tiltseries-viewer";
import CTFTomoViewer from "./ctftomo-viewer";

type IntegratedTomographyViewerProps = {
  projectId: string | number;
  protocolId: string | number;
  protocolLabel?: string;
  outputName: string;
  pointerClass?: string;
};

type IntegratedSection = "overview" | "tiltSeries" | "ctf" | "tomogram" | "coordinates" | "metadata";
type ContextKey = "tiltSeries" | "ctf" | "tomogram" | "coordinates3d";
type ContextStatus = "source" | "linked" | "planned" | "unavailable";
type IntegratedContextStatus = "available" | "missing" | "unknown" | "inferred";
type FetchJsonUrl = (url: string, opts?: { signal?: AbortSignal; cache?: RequestCache }) => Promise<any>;

type IntegratedContextLink = {
  protocolId?: string | number | null;
  outputName?: string | null;
  itemId?: string | number | null;
  label?: string | null;
  status?: IntegratedContextStatus | null;
};

type IntegratedAnalyzeContext = {
  root?: {
    projectId?: string | number | null;
    protocolId?: string | number | null;
    outputName?: string | null;
    outputClass?: string | null;
  };
  links?: Partial<Record<ContextKey, IntegratedContextLink | null>>;
  summaries?: Partial<Record<ContextKey, Record<string, unknown> | null>>;
};

type ContextNode = {
  key: IntegratedSection;
  contextKey: ContextKey;
  label: string;
  description: string;
  status: ContextStatus;
  icon: ReactNode;
};

function normalizedKind(value?: string) {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function isVolumeKind(value?: string) {
  const kind = normalizedKind(value);
  return kind === "volume" || kind === "volumemask" || kind === "setofvolumes" || kind === "setoftomograms";
}

function isCoords3dKind(value?: string) {
  return normalizedKind(value).includes("setofcoordinates3d");
}

function isTiltSeriesKind(value?: string) {
  const kind = normalizedKind(value);
  return kind.includes("setoftiltseries") && kind !== "setoftiltseriesm";
}

function isCTFTomoKind(value?: string) {
  return normalizedKind(value).includes("setofctftomoseries");
}

function getInitialSection(pointerClass?: string): IntegratedSection {
  if (isCoords3dKind(pointerClass)) return "coordinates";
  if (isVolumeKind(pointerClass)) return "tomogram";
  if (isCTFTomoKind(pointerClass)) return "ctf";
  if (isTiltSeriesKind(pointerClass)) return "tiltSeries";
  return "overview";
}

function getStatusColor(status: ContextStatus): "success" | "info" | "default" {
  if (status === "source" || status === "linked") return "success";
  if (status === "planned") return "info";
  return "default";
}

function getStatusLabel(status: ContextStatus) {
  if (status === "source") return "Current output";
  if (status === "linked") return "Context linked";
  if (status === "planned") return "Needs context link";
  return "Not available";
}

function isAvailableLink(link?: IntegratedContextLink | null) {
  return Boolean(link?.outputName && (link.status === "available" || link.status === "inferred"));
}

function getNodeStatus(isSource: boolean, link: IntegratedContextLink | null | undefined, canBeLinked: boolean): ContextStatus {
  if (isSource) return "source";
  if (isAvailableLink(link)) return "linked";
  if (canBeLinked) return "planned";
  return "unavailable";
}

function getLinkedProtocolId(link: IntegratedContextLink | null | undefined, fallbackProtocolId: number) {
  const next = Number(link?.protocolId);
  return Number.isFinite(next) ? next : fallbackProtocolId;
}

function getLinkedOutputName(link: IntegratedContextLink | null | undefined, fallbackOutputName: string) {
  return link?.outputName || fallbackOutputName;
}

function buildContextUrl(projectId: number, protocolId: number, outputName: string) {
  const encodedOutputName = encodeURIComponent(outputName);
  return `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${encodedOutputName}/integrated-context`;
}

async function fetchIntegratedContext(fetchJsonUrl: FetchJsonUrl, projectId: number, protocolId: number, outputName: string, signal: AbortSignal) {
  try {
    const raw = await fetchJsonUrl(buildContextUrl(projectId, protocolId, outputName), {
      signal,
      cache: "no-store",
    });
    return raw && typeof raw === "object" ? (raw as IntegratedAnalyzeContext) : null;
  } catch (error) {
    if ((error as { status?: number })?.status === 404) return null;
    throw error;
  }
}

function getContextStateLabel(context: IntegratedAnalyzeContext | null, loading: boolean, error: string | null) {
  if (loading) return "Loading context";
  if (error) return "Context error";
  if (context) return "Context ready";
  return "Pointer fallback";
}

function ContextNodeCard({ node, active, onSelect }: { node: ContextNode; active: boolean; onSelect: () => void }) {
  return (
    <Paper
      variant="outlined"
      onClick={onSelect}
      sx={{
        p: 1.25,
        borderRadius: 2,
        cursor: "pointer",
        borderColor: active ? "rgba(37,99,235,0.55)" : "rgba(148,163,184,0.28)",
        background: active ? "rgba(239,246,255,0.95)" : "rgba(255,255,255,0.92)",
        boxShadow: active ? "0 6px 18px rgba(37,99,235,0.10)" : "none",
        transition: "border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: active ? "#1d4ed8" : "#475569",
            background: active ? "rgba(37,99,235,0.10)" : "rgba(148,163,184,0.12)",
            flexShrink: 0,
          }}
        >
          {node.icon}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>
            {node.label}
          </Typography>
          <Typography variant="caption" sx={{ color: "#64748b", display: "block", mt: 0.25 }}>
            {node.description}
          </Typography>
          <Chip
            size="small"
            color={getStatusColor(node.status)}
            label={getStatusLabel(node.status)}
            sx={{ mt: 0.75, height: 20, fontSize: "0.68rem", fontWeight: 700 }}
          />
        </Box>
      </Box>
    </Paper>
  );
}

function EmptyIntegratedPanel({ title, outputName }: { title: string; outputName: string }) {
  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
        background: "linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(241,245,249,0.92) 100%)",
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          maxWidth: 520,
          p: 2.5,
          borderRadius: 3,
          borderColor: "rgba(148,163,184,0.28)",
          textAlign: "center",
          background: "rgba(255,255,255,0.92)",
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "#0f172a" }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          This panel is ready for the integrated context API. The current output is {" "}
          <strong>{outputName}</strong>, but this related entity is not linked yet.
        </Typography>
      </Paper>
    </Box>
  );
}

function OverviewPanel({
  nodes,
  outputName,
  pointerClass,
  context,
  contextLoading,
  contextError,
}: {
  nodes: ContextNode[];
  outputName: string;
  pointerClass?: string;
  context: IntegratedAnalyzeContext | null;
  contextLoading: boolean;
  contextError: string | null;
}) {
  const sourceNode = nodes.find((node) => node.status === "source");
  const linkedCount = nodes.filter((node) => node.status === "linked").length;

  return (
    <Box sx={{ height: "100%", minHeight: 0, overflow: "auto", p: 2 }}>
      <Stack spacing={2}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 3,
            borderColor: "rgba(148,163,184,0.28)",
            background: "linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.96) 100%)",
            color: "#e2e8f0",
          }}
        >
          <Typography variant="overline" sx={{ color: "rgba(226,232,240,0.72)", letterSpacing: 0.8 }}>
            Integrated tomography context
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 850, lineHeight: 1.2, color: "#f8fafc" }}>
            {outputName}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, color: "rgba(226,232,240,0.82)" }}>
            The viewer keeps tilt series, CTF, tomograms and coordinates in one workspace. When the integrated context endpoint returns links, related panels open their existing viewers directly.
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderColor: "rgba(148,163,184,0.28)" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            {contextLoading ? <CircularProgress size={16} /> : null}
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "#0f172a", flex: 1 }}>
              Context loader
            </Typography>
            <Chip
              size="small"
              color={contextError ? "default" : context ? "success" : "info"}
              variant={contextError ? "outlined" : "filled"}
              label={getContextStateLabel(context, contextLoading, contextError)}
              sx={{ fontWeight: 700 }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {contextError
              ? contextError
              : context
                ? `${linkedCount} related panel${linkedCount === 1 ? "" : "s"} linked by backend context.`
                : "No integrated context was returned. The viewer is using pointer-class fallback without breaking existing viewers."}
          </Typography>
        </Paper>

        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 1.25 }}>
          {nodes.map((node) => (
            <Paper
              key={node.key}
              variant="outlined"
              sx={{ p: 1.5, borderRadius: 2.5, borderColor: "rgba(148,163,184,0.28)" }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                {node.label}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 800, color: "#0f172a" }}>
                {getStatusLabel(node.status)}
              </Typography>
            </Paper>
          ))}
        </Box>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: "rgba(148,163,184,0.28)" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "#0f172a" }}>
            Current source
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Source block: <strong>{sourceNode?.label ?? "Unknown"}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pointer class: <code>{context?.root?.outputClass || pointerClass || "unknown"}</code>
          </Typography>
        </Paper>
      </Stack>
    </Box>
  );
}

export default function IntegratedTomographyViewer({
  projectId,
  protocolId,
  protocolLabel,
  outputName,
  pointerClass,
}: IntegratedTomographyViewerProps) {
  const svc = useProjectService();
  const projectIdNum = useMemo(() => Number(projectId), [projectId]);
  const protocolIdNum = useMemo(() => Number(protocolId), [protocolId]);
  const initialSection = useMemo(() => getInitialSection(pointerClass), [pointerClass]);
  const [activeSection, setActiveSection] = useState<IntegratedSection>(initialSection);
  const [context, setContext] = useState<IntegratedAnalyzeContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection, outputName]);

  useEffect(() => {
    if (!Number.isFinite(projectIdNum) || !Number.isFinite(protocolIdNum) || !outputName) {
      setContext(null);
      setContextLoading(false);
      setContextError(null);
      return;
    }

    const abort = new AbortController();
    setContextLoading(true);
    setContextError(null);

    fetchIntegratedContext(svc.fetchJsonUrl, projectIdNum, protocolIdNum, outputName, abort.signal)
      .then((nextContext) => {
        if (!abort.signal.aborted) setContext(nextContext);
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        setContext(null);
        setContextError(error instanceof Error ? error.message : "Failed to load integrated context");
      })
      .finally(() => {
        if (!abort.signal.aborted) setContextLoading(false);
      });

    return () => abort.abort();
  }, [svc.fetchJsonUrl, projectIdNum, protocolIdNum, outputName]);

  const nodes = useMemo<ContextNode[]>(() => {
    const tiltIsSource = isTiltSeriesKind(pointerClass);
    const ctfIsSource = isCTFTomoKind(pointerClass);
    const tomogramIsSource = isVolumeKind(pointerClass);
    const coordsIsSource = isCoords3dKind(pointerClass);
    const links = context?.links;

    return [
      {
        key: "tiltSeries",
        contextKey: "tiltSeries",
        label: "Tilt series",
        description: tiltIsSource ? "Source alignment stack" : links?.tiltSeries?.label || "Upstream acquisition context",
        status: getNodeStatus(tiltIsSource, links?.tiltSeries, coordsIsSource || tomogramIsSource || ctfIsSource),
        icon: <Layers size={17} />,
      },
      {
        key: "ctf",
        contextKey: "ctf",
        label: "CTF tomo",
        description: ctfIsSource ? "Source CTF estimation" : links?.ctf?.label || "Per-view defocus and PSD context",
        status: getNodeStatus(ctfIsSource, links?.ctf, coordsIsSource || tomogramIsSource),
        icon: <Activity size={17} />,
      },
      {
        key: "tomogram",
        contextKey: "tomogram",
        label: "Tomogram",
        description: tomogramIsSource ? "Source volume" : links?.tomogram?.label || "3D reconstruction context",
        status: getNodeStatus(tomogramIsSource, links?.tomogram, coordsIsSource),
        icon: <BoxIcon size={17} />,
      },
      {
        key: "coordinates",
        contextKey: "coordinates3d",
        label: "Coordinates 3D",
        description: coordsIsSource ? "Source particle coordinates" : links?.coordinates3d?.label || "Particles and picked points",
        status: getNodeStatus(coordsIsSource, links?.coordinates3d, false),
        icon: <GitBranch size={17} />,
      },
    ];
  }, [context, pointerClass]);

  const renderSection = () => {
    const links = context?.links;

    if (activeSection === "overview") {
      return (
        <OverviewPanel
          nodes={nodes}
          outputName={outputName}
          pointerClass={pointerClass}
          context={context}
          contextLoading={contextLoading}
          contextError={contextError}
        />
      );
    }

    if (activeSection === "tiltSeries") {
      const link = links?.tiltSeries;
      if (isTiltSeriesKind(pointerClass) || isAvailableLink(link)) {
        return (
          <TiltSeriesViewer
            projectId={projectIdNum}
            protocolId={getLinkedProtocolId(link, protocolIdNum)}
            outputName={getLinkedOutputName(link, outputName)}
            protocolLabel={protocolLabel}
          />
        );
      }
      return <EmptyIntegratedPanel title="Tilt series context" outputName={outputName} />;
    }

    if (activeSection === "ctf") {
      const link = links?.ctf;
      if (isCTFTomoKind(pointerClass) || isAvailableLink(link)) {
        return (
          <CTFTomoViewer
            projectId={projectIdNum}
            protocolId={getLinkedProtocolId(link, protocolIdNum)}
            outputName={getLinkedOutputName(link, outputName)}
            protocolLabel={protocolLabel}
          />
        );
      }
      return <EmptyIntegratedPanel title="CTF tomo context" outputName={outputName} />;
    }

    if (activeSection === "tomogram") {
      const link = links?.tomogram;
      if (isVolumeKind(pointerClass) || isAvailableLink(link)) {
        return (
          <VolumeViewer
            projectId={projectIdNum}
            protocolId={getLinkedProtocolId(link, protocolIdNum)}
            protocolLabel={protocolLabel}
            outputName={getLinkedOutputName(link, outputName)}
            pointerClass={isVolumeKind(pointerClass) ? pointerClass : "SetOfTomograms"}
          />
        );
      }
      return <EmptyIntegratedPanel title="Tomogram context" outputName={outputName} />;
    }

    if (activeSection === "coordinates") {
      const link = links?.coordinates3d;
      if (isCoords3dKind(pointerClass) || isAvailableLink(link)) {
        return (
          <Coords3dViewer
            projectId={projectIdNum}
            protocolId={getLinkedProtocolId(link, protocolIdNum)}
            protocolLabel={protocolLabel}
            outputName={getLinkedOutputName(link, outputName)}
          />
        );
      }
      return <EmptyIntegratedPanel title="Coordinates context" outputName={outputName} />;
    }

    return <MetadataViewer projectId={projectIdNum} protocolId={protocolIdNum} outputName={outputName} embedded />;
  };

  const sourceNode = nodes.find((node) => node.status === "source");

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#f8fafc",
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          borderBottom: "1px solid rgba(148,163,184,0.25)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.96) 100%)",
          flexShrink: 0,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 850, color: "#0f172a", lineHeight: 1.15 }}>
            Integrated tomography viewer
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
            {outputName} {pointerClass ? `- ${pointerClass}` : ""}
          </Typography>
        </Box>

        <Chip
          size="small"
          color="primary"
          variant="outlined"
          label={sourceNode ? `Source: ${sourceNode.label}` : "Source: unknown"}
          sx={{ fontWeight: 700 }}
        />
        <Chip
          size="small"
          color={context ? "success" : "default"}
          variant="outlined"
          label={getContextStateLabel(context, contextLoading, contextError)}
          sx={{ fontWeight: 700 }}
        />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, display: "grid", gridTemplateColumns: "280px minmax(0, 1fr) 300px" }}>
        <Paper
          square
          elevation={0}
          sx={{
            minHeight: 0,
            overflow: "auto",
            borderRight: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(241,245,249,0.82)",
            p: 1.25,
          }}
        >
          <Typography variant="overline" sx={{ color: "#64748b", fontWeight: 800, letterSpacing: 0.7 }}>
            Context chain
          </Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {nodes.map((node) => (
              <ContextNodeCard
                key={node.key}
                node={node}
                active={activeSection === node.key}
                onSelect={() => setActiveSection(node.key)}
              />
            ))}
          </Stack>
        </Paper>

        <Box sx={{ minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Tabs
            value={activeSection}
            onChange={(_event, value) => setActiveSection(value as IntegratedSection)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 40,
              borderBottom: "1px solid rgba(148,163,184,0.25)",
              background: "#ffffff",
              "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 750 },
            }}
          >
            <Tab icon={<Database size={15} />} iconPosition="start" label="Overview" value="overview" />
            <Tab icon={<Layers size={15} />} iconPosition="start" label="Tilt series" value="tiltSeries" />
            <Tab icon={<Activity size={15} />} iconPosition="start" label="CTF" value="ctf" />
            <Tab icon={<BoxIcon size={15} />} iconPosition="start" label="Tomogram" value="tomogram" />
            <Tab icon={<GitBranch size={15} />} iconPosition="start" label="Coordinates" value="coordinates" />
            <Tab icon={<TableIcon size={15} />} iconPosition="start" label="Metadata" value="metadata" />
          </Tabs>

          <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>{renderSection()}</Box>
        </Box>

        <Paper
          square
          elevation={0}
          sx={{
            minHeight: 0,
            overflow: "auto",
            borderLeft: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(255,255,255,0.94)",
            p: 1.5,
          }}
        >
          <Typography variant="overline" sx={{ color: "#64748b", fontWeight: 800, letterSpacing: 0.7 }}>
            Inspector
          </Typography>

          <Stack spacing={1.25} sx={{ mt: 1 }}>
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, borderColor: "rgba(148,163,184,0.28)" }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                Active panel
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 800, color: "#0f172a" }}>
                {activeSection}
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, borderColor: "rgba(148,163,184,0.28)" }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                Protocol
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: "#0f172a" }}>
                {protocolLabel || protocolIdNum}
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, borderColor: "rgba(148,163,184,0.28)" }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                Integrated context
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: "#0f172a" }}>
                {getContextStateLabel(context, contextLoading, contextError)}
              </Typography>
            </Paper>

            <Divider />

            <Typography variant="body2" color="text.secondary">
              Related panels use the existing specialized viewers. If the backend does not return an integrated context, this shell falls back to the current output only.
            </Typography>

            <Button variant="outlined" size="small" onClick={() => setActiveSection(initialSection)} sx={{ textTransform: "none", fontWeight: 700 }}>
              Open source viewer
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
