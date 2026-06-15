import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Box, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { Activity, Box as BoxIcon, GitBranch, Layers, Table as TableIcon } from "lucide-react";
import { useProjectService } from "@/ProjectServiceContext";
import type { IntegratedAnalyzeContext, IntegratedContextItemRelation, IntegratedContextLink } from "@/services/ProjectService";
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

type IntegratedSection = "tiltSeries" | "ctf" | "tomogram" | "coordinates" | "metadata";
type ContextKey = "tiltSeries" | "ctf" | "tomogram" | "coordinates3d";
type ContextStatus = "source" | "linked" | "planned" | "unavailable";
type RelationSource = "coordinates" | "tomogram" | "tiltSeries" | "ctf";

type ContextNode = {
  key: IntegratedSection;
  contextKey?: ContextKey;
  label: string;
  description: string;
  status: ContextStatus;
  icon: ReactElement;
  badgeLabel?: string;
};

function normalizedKind(value?: string) {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function isTomogramKind(value?: string) {
  return normalizedKind(value) === "setoftomograms";
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
  if (isTomogramKind(pointerClass)) return "tomogram";
  if (isCTFTomoKind(pointerClass)) return "ctf";
  if (isTiltSeriesKind(pointerClass)) return "tiltSeries";
  return "metadata";
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

function ContextNodeCard({ node, active, onSelect }: { node: ContextNode; active: boolean; onSelect: () => void }) {
  return (
    <Paper
      variant="outlined"
      onClick={onSelect}
      sx={{
        p: 0.75,
        borderRadius: 2,
        cursor: "pointer",
        borderColor: active ? "rgba(37,99,235,0.55)" : "rgba(148,163,184,0.28)",
        background: active ? "rgba(239,246,255,0.95)" : "rgba(255,255,255,0.92)",
        boxShadow: active ? "0 5px 14px rgba(37,99,235,0.09)" : "none",
        transition: "border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75 }}>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: 1.25,
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
          <Typography variant="body2" sx={{ fontWeight: 800, color: "#0f172a", lineHeight: 1.12 }}>
            {node.label}
          </Typography>
          <Typography variant="caption" sx={{ color: "#64748b", display: "block", mt: 0.15, lineHeight: 1.2 }}>
            {node.description}
          </Typography>
          <Chip
            size="small"
            color={getStatusColor(node.status)}
            label={node.badgeLabel || getStatusLabel(node.status)}
            sx={{ mt: 0.45, height: 18, fontSize: "0.66rem", fontWeight: 700 }}
          />
        </Box>
      </Box>
    </Paper>
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
  const [selectedRelation, setSelectedRelation] = useState<IntegratedContextItemRelation | null>(null);
  const [selectedRelationSource, setSelectedRelationSource] = useState<RelationSource | null>(null);

  useEffect(() => {
    setSelectedRelation(null);
    setSelectedRelationSource(null);
  }, [projectIdNum, protocolIdNum, outputName]);

  const normalizeSelectionValue = (value: unknown) => {
    if (value == null) return null;
    const text = String(value);
    return text ? text : null;
  };

  const relationValueMatches = (value: unknown, candidates: string[]) => {
    const text = normalizeSelectionValue(value);
    return text != null && candidates.includes(text);
  };

  const selectRelationByCandidates = (source: RelationSource, rawCandidates: unknown[]) => {
    const candidates = rawCandidates
      .map(normalizeSelectionValue)
      .filter((value): value is string => Boolean(value));

    if (!candidates.length) {
      setSelectedRelationSource(source);
      setSelectedRelation(null);
      return;
    }

    const items = context?.relations?.items ?? [];

    const sourceMatch = items.find((item) => {
      if (source === "coordinates") {
        return (
          relationValueMatches(item.coordinatesTomogramId, candidates) ||
          relationValueMatches(item.tomogramId, candidates)
        );
      }

      if (source === "tomogram") {
        return (
          relationValueMatches(item.tomogramVolumeId, candidates) ||
          relationValueMatches(item.tomogramId, candidates)
        );
      }

      if (source === "tiltSeries") {
        return relationValueMatches(item.tiltSeriesId, candidates);
      }

      return (
        relationValueMatches(item.ctfSeriesId, candidates) ||
        relationValueMatches(item.tiltSeriesId, candidates)
      );
    });

    const fallbackMatch =
      sourceMatch ??
      items.find(
        (item) =>
          relationValueMatches(item.key, candidates) ||
          relationValueMatches(item.label, candidates),
      );

    setSelectedRelationSource(source);
    setSelectedRelation((prev) => {
      if (!fallbackMatch) return null;
      return prev?.key === fallbackMatch.key ? prev : fallbackMatch;
    });
  };

  const handleCoordinatesTomogramSelect = (tomogram: any) => {
    selectRelationByCandidates("coordinates", [
      tomogram?.tomoId,
      tomogram?.id,
      tomogram?.label,
      tomogram?.name,
      tomogram?.tsId,
    ]);
  };

  const handleVolumeSelect = (volume: any) => {
    selectRelationByCandidates("tomogram", [
      volume?.tomoId,
      volume?.id,
      volume?.label,
      volume?.name,
      volume?.tsId,
    ]);
  };

  const handleTiltSeriesSelect = (series: any) => {
    selectRelationByCandidates("tiltSeries", [
      series?.tiltSeriesId,
      series?.tsId,
      series?.id,
      series?.label,
    ]);
  };

  const handleCtfSeriesSelect = (series: any) => {
    selectRelationByCandidates("ctf", [
      series?.ctfSeriesId,
      series?.tiltSeriesId,
      series?.tsId,
      series?.id,
      series?.label,
    ]);
  };

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

    svc.fetchIntegratedAnalyzeContext(projectIdNum, protocolIdNum, outputName, {
      signal: abort.signal,
      cache: "no-store",
    })
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
  }, [svc, projectIdNum, protocolIdNum, outputName]);

  const nodes = useMemo<ContextNode[]>(() => {
    const tiltIsSource = isTiltSeriesKind(pointerClass);
    const ctfIsSource = isCTFTomoKind(pointerClass);
    const tomogramIsSource = isTomogramKind(pointerClass);
    const coordsIsSource = isCoords3dKind(pointerClass);
    const links = context?.links;

    return [
      {
        key: "tiltSeries",
        contextKey: "tiltSeries",
        label: "Tilt series",
        description: tiltIsSource ? "Source alignment stack" : links?.tiltSeries?.label || "Upstream acquisition context",
        status: getNodeStatus(tiltIsSource, links?.tiltSeries, coordsIsSource || tomogramIsSource || ctfIsSource),
        icon: <Layers size={16} />,
      },
      {
        key: "ctf",
        contextKey: "ctf",
        label: "CTF tomo",
        description: ctfIsSource ? "Source CTF estimation" : links?.ctf?.label || "Per-view defocus and PSD context",
        status: getNodeStatus(ctfIsSource, links?.ctf, coordsIsSource || tomogramIsSource),
        icon: <Activity size={16} />,
      },
      {
        key: "tomogram",
        contextKey: "tomogram",
        label: "Tomogram",
        description: tomogramIsSource ? "Source volume" : links?.tomogram?.label || "3D reconstruction context",
        status: getNodeStatus(tomogramIsSource, links?.tomogram, coordsIsSource),
        icon: <BoxIcon size={16} />,
      },
      {
        key: "coordinates",
        contextKey: "coordinates3d",
        label: "Coordinates 3D",
        description: coordsIsSource ? "Source particle coordinates" : links?.coordinates3d?.label || "Particles and picked points",
        status: getNodeStatus(coordsIsSource, links?.coordinates3d, false),
        icon: <GitBranch size={16} />,
      },
    ];
  }, [context, pointerClass]);

  const visibleNodes = useMemo(() => nodes.filter((node) => node.status === "source" || node.status === "linked"), [nodes]);

  const metadataNode = useMemo<ContextNode>(
    () => ({
      key: "metadata",
      label: "Metadata",
      description: "Tables and raw object metadata",
      status: "linked",
      icon: <TableIcon size={16} />,
      badgeLabel: "Always available",
    }),
    [],
  );

  const navigationNodes = useMemo(() => [...visibleNodes, metadataNode], [visibleNodes, metadataNode]);

  useEffect(() => {
    if (!navigationNodes.some((node) => node.key === activeSection)) {
      setActiveSection(navigationNodes[0]?.key || "metadata");
    }
  }, [activeSection, navigationNodes]);

  const renderSection = () => {
    const links = context?.links;

    if (activeSection === "tiltSeries") {
      const link = links?.tiltSeries;
      if (isTiltSeriesKind(pointerClass) || isAvailableLink(link)) {
        return (
          <TiltSeriesViewer
            projectId={projectIdNum}
            protocolId={getLinkedProtocolId(link, protocolIdNum)}
            outputName={getLinkedOutputName(link, outputName)}
            protocolLabel={protocolLabel}
            selectedTiltSeriesId={selectedRelationSource === "tiltSeries" ? null : selectedRelation?.tiltSeriesId ?? null}
            onTiltSeriesSelect={handleTiltSeriesSelect}
          />
        );
      }
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
            selectedCtfSeriesId={selectedRelationSource === "ctf" ? null : selectedRelation?.ctfSeriesId ?? null}
            selectedTiltSeriesId={selectedRelationSource === "ctf" ? null : selectedRelation?.tiltSeriesId ?? null}
            onCtfSeriesSelect={handleCtfSeriesSelect}
          />
        );
      }
    }

    if (activeSection === "tomogram") {
      const link = links?.tomogram;
      if (isTomogramKind(pointerClass) || isAvailableLink(link)) {
        return (
          <VolumeViewer
            projectId={projectIdNum}
            protocolId={getLinkedProtocolId(link, protocolIdNum)}
            protocolLabel={protocolLabel}
            outputName={getLinkedOutputName(link, outputName)}
            pointerClass={isTomogramKind(pointerClass) ? pointerClass : "SetOfTomograms"}
            selectedVolumeId={
              selectedRelationSource === "tomogram"
                ? null
                : selectedRelation?.tomogramVolumeId ?? selectedRelation?.tomogramId ?? null
            }
            onVolumeSelect={handleVolumeSelect}
          />
        );
      }
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
            selectedTomogramId={
              selectedRelationSource === "coordinates"
                ? null
                : selectedRelation?.coordinatesTomogramId ?? selectedRelation?.tomogramId ?? null
            }
            onTomogramSelect={handleCoordinatesTomogramSelect}
          />
        );
      }
    }

    return <MetadataViewer projectId={projectIdNum} protocolId={protocolIdNum} outputName={outputName} embedded />;
  };

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "grid",
        gridTemplateColumns: "220px minmax(0, 1fr)",
        overflow: "hidden",
        background: "#f8fafc",
      }}
    >
      <Paper
        square
        elevation={0}
        sx={{
          minHeight: 0,
          overflow: "auto",
          borderRight: "1px solid rgba(148,163,184,0.25)",
          background: "rgba(241,245,249,0.82)",
          p: 0.75,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: "#64748b", fontWeight: 800, letterSpacing: 0.7, flex: 1 }}>
            Context chain
          </Typography>
          {contextLoading ? <CircularProgress size={13} /> : null}
        </Box>

        {contextError ? (
          <Typography variant="caption" sx={{ display: "block", color: "#b91c1c", mt: 0.35, mb: 0.5 }}>
            {contextError}
          </Typography>
        ) : null}

        <Stack spacing={0.65} sx={{ mt: 0.55 }}>
          {visibleNodes.map((node) => (
            <ContextNodeCard
              key={node.key}
              node={node}
              active={activeSection === node.key}
              onSelect={() => setActiveSection(node.key)}
            />
          ))}

          {visibleNodes.length > 0 ? <Box sx={{ height: 1, bgcolor: "rgba(148,163,184,0.30)", mx: 0.4 }} /> : null}

          <ContextNodeCard
            node={metadataNode}
            active={activeSection === "metadata"}
            onSelect={() => setActiveSection("metadata")}
          />
        </Stack>
      </Paper>

      <Box sx={{ minHeight: 0, minWidth: 0, overflow: "hidden" }}>{renderSection()}</Box>
    </Box>
  );
}