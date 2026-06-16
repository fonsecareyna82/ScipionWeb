import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Box, Chip, CircularProgress, Collapse, IconButton, Paper, Stack, Typography } from "@mui/material";
import { Activity, Box as BoxIcon, ChevronDown, ChevronRight, GitBranch, Layers, Table as TableIcon } from "lucide-react";
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

type ContextTreeItem = {
  id: string;
  section: IntegratedSection;
  label: string;
  description?: string;
  status?: ContextStatus;
  icon: ReactElement;
  badgeLabel?: string;
  children?: ContextTreeItem[];
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

function getTreeLabel(section: IntegratedSection) {
  if (section === "coordinates") return "Coordinates 3D";
  if (section === "tomogram") return "Tomograms";
  if (section === "tiltSeries") return "Tilt series";
  if (section === "ctf") return "CTFs";
  return "Metadata";
}

function getTreeDescription(section: IntegratedSection, node?: ContextNode) {
  if (section === "coordinates") return node?.description || "Picked particles and tomogram coordinates";
  if (section === "tomogram") return node?.description || "3D volumes linked to this context";
  if (section === "tiltSeries") return node?.description || "Acquisition tilt-series context";
  if (section === "ctf") return node?.description || "Per-view CTF estimation context";
  return node?.description || "Tables and raw object metadata";
}

function getTreeIcon(section: IntegratedSection) {
  if (section === "coordinates") return <GitBranch size={15} />;
  if (section === "tomogram") return <BoxIcon size={15} />;
  if (section === "tiltSeries") return <Layers size={15} />;
  if (section === "ctf") return <Activity size={15} />;
  return <TableIcon size={15} />;
}

function ContextTreeRow({
  item,
  depth,
  active,
  expanded,
  onToggle,
  onSelect,
}: {
  item: ContextTreeItem;
  depth: number;
  active: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
  onSelect: (item: ContextTreeItem) => void;
}) {
  const hasChildren = Boolean(item.children?.length);
  const badge = item.badgeLabel || (item.status ? getStatusLabel(item.status) : null);

  return (
    <Box>
      <Box
        onClick={() => onSelect(item)}
        sx={{
          minHeight: 34,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          pl: 0.25 + depth * 1.45,
          pr: 0.55,
          py: 0.35,
          borderRadius: 1.25,
          cursor: "pointer",
          position: "relative",
          color: active ? "#0f172a" : "#334155",
          background: active ? "rgba(37,99,235,0.10)" : "transparent",
          border: active ? "1px solid rgba(37,99,235,0.28)" : "1px solid transparent",
          "&:hover": {
            background: active ? "rgba(37,99,235,0.12)" : "rgba(148,163,184,0.13)",
          },
          "&:before":
            depth > 0
              ? {
                  content: '""',
                  position: "absolute",
                  left: 10 + (depth - 1) * 18,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  bgcolor: "rgba(148,163,184,0.32)",
                }
              : undefined,
        }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(item.id);
            }}
            sx={{ width: 20, height: 20, color: "#64748b", flexShrink: 0 }}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </IconButton>
        ) : (
          <Box sx={{ width: 20, flexShrink: 0 }} />
        )}

        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: active ? "#1d4ed8" : "#64748b",
            background: active ? "rgba(37,99,235,0.12)" : "rgba(148,163,184,0.12)",
            flexShrink: 0,
          }}
        >
          {item.icon}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                minWidth: 0,
                flex: 1,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                fontWeight: active ? 800 : 700,
                lineHeight: 1.15,
              }}
            >
              {item.label}
            </Typography>

            {badge ? (
              <Chip
                size="small"
                color={item.status ? getStatusColor(item.status) : "default"}
                label={badge}
                sx={{
                  height: 17,
                  maxWidth: 86,
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  "& .MuiChip-label": { px: 0.6, overflow: "hidden", textOverflow: "ellipsis" },
                }}
              />
            ) : null}
          </Box>

          {item.description ? (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mt: 0.1,
                color: "#64748b",
                lineHeight: 1.15,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {item.description}
            </Typography>
          ) : null}
        </Box>
      </Box>
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
  const [selectedRelation, setSelectedRelation] = useState<IntegratedContextItemRelation | null>(null);
  const [selectedRelationSource, setSelectedRelationSource] = useState<RelationSource | null>(null);
  const [collapsedTreeIds, setCollapsedTreeIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelectedRelation(null);
    setSelectedRelationSource(null);
    setCollapsedTreeIds(new Set());
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

  const treeItems = useMemo<ContextTreeItem[]>(() => {
    const bySection = new Map<IntegratedSection, ContextNode>();
    visibleNodes.forEach((node) => bySection.set(node.key, node));

    const canShow = (section: IntegratedSection) => Boolean(bySection.get(section));

    const makeItem = (section: IntegratedSection, children: ContextTreeItem[] = []): ContextTreeItem | null => {
      const node = bySection.get(section);
      if (!node) return null;

      return {
        id: `section-${section}`,
        section,
        label: getTreeLabel(section),
        description: getTreeDescription(section, node),
        status: node.status,
        icon: getTreeIcon(section),
        badgeLabel: node.badgeLabel,
        children,
      };
    };

    const makeAvailableChildren = () => {
      const children: ContextTreeItem[] = [];

      if (canShow("tiltSeries")) {
        const item = makeItem("tiltSeries");
        if (item) children.push(item);
      }

      if (canShow("ctf")) {
        const item = makeItem("ctf");
        if (item) children.push(item);
      }

      return children;
    };

    const roots: Array<ContextTreeItem | null> = [];

    if (isCoords3dKind(pointerClass)) {
      const tomogramChildren = makeAvailableChildren();
      const tomogramItem = canShow("tomogram") ? makeItem("tomogram", tomogramChildren) : null;
      const coordinatesChildren = tomogramItem ? [tomogramItem] : tomogramChildren;
      roots.push(makeItem("coordinates", coordinatesChildren));
    } else if (isTomogramKind(pointerClass)) {
      roots.push(makeItem("tomogram", makeAvailableChildren()));
    } else if (isCTFTomoKind(pointerClass)) {
      const ctfChildren: ContextTreeItem[] = [];

      if (canShow("tiltSeries")) {
        const item = makeItem("tiltSeries");
        if (item) ctfChildren.push(item);
      }

      roots.push(makeItem("ctf", ctfChildren));
    } else if (isTiltSeriesKind(pointerClass)) {
      roots.push(makeItem("tiltSeries"));
    } else {
      roots.push(...visibleNodes.map((node) => makeItem(node.key)));
    }

    return roots.filter((item): item is ContextTreeItem => Boolean(item));
  }, [pointerClass, visibleNodes]);

  const toggleTreeItem = (id: string) => {
    setCollapsedTreeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTreeItemSelect = (item: ContextTreeItem) => {
    setActiveSection(item.section);
    setSelectedRelationSource(null);
  };

  const isTreeItemActive = (item: ContextTreeItem) => {
    return activeSection === item.section;
  };

  const renderTreeItem = (item: ContextTreeItem, depth = 0): ReactElement => {
    const expanded = !collapsedTreeIds.has(item.id);

    return (
      <Box key={item.id}>
        <ContextTreeRow
          item={item}
          depth={depth}
          active={isTreeItemActive(item)}
          expanded={expanded}
          onToggle={toggleTreeItem}
          onSelect={handleTreeItemSelect}
        />

        {item.children?.length ? (
          <Collapse in={expanded} timeout={120} unmountOnExit>
            <Stack spacing={0.25} sx={{ mt: 0.25 }}>
              {item.children.map((child) => renderTreeItem(child, depth + 1))}
            </Stack>
          </Collapse>
        ) : null}
      </Box>
    );
  };

  useEffect(() => {
    const availableSections = new Set<IntegratedSection>([
      ...visibleNodes.map((node) => node.key),
      "metadata",
    ]);

    if (!availableSections.has(activeSection)) {
      setActiveSection(visibleNodes[0]?.key || "metadata");
    }
  }, [activeSection, visibleNodes]);

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
        gridTemplateColumns: "280px minmax(0, 1fr)",
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
          background: "linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(241,245,249,0.94) 100%)",
          p: 0.85,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, mb: 0.75 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="overline" sx={{ display: "block", color: "#64748b", fontWeight: 800, letterSpacing: 0.7, lineHeight: 1.1 }}>
              Tomography context
            </Typography>
            <Typography variant="caption" sx={{ display: "block", color: "#94a3b8", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pointerClass || "Integrated viewer"}
            </Typography>
          </Box>
          {contextLoading ? <CircularProgress size={14} /> : null}
        </Box>

        {contextError ? (
          <Typography variant="caption" sx={{ display: "block", color: "#b91c1c", mb: 0.65 }}>
            {contextError}
          </Typography>
        ) : null}

        <Stack spacing={0.3}>
          {treeItems.map((item) => renderTreeItem(item))}
        </Stack>

        <Box sx={{ height: 1, bgcolor: "rgba(148,163,184,0.35)", mx: 0.4, my: 0.8 }} />

        <ContextTreeRow
          item={{
            id: "metadata",
            section: "metadata",
            label: metadataNode.label,
            description: metadataNode.description,
            status: metadataNode.status,
            icon: metadataNode.icon,
            badgeLabel: metadataNode.badgeLabel,
          }}
          depth={0}
          active={activeSection === "metadata"}
          expanded
          onToggle={toggleTreeItem}
          onSelect={handleTreeItemSelect}
        />
      </Paper>

      <Box sx={{ minHeight: 0, minWidth: 0, overflow: "hidden" }}>{renderSection()}</Box>
    </Box>
  );
}