// Renders what a protocol viewer action produced, with ScipionWeb's own viewers.
import { useEffect, useState, type ReactNode } from "react";
import { Box as Box3D, Database, ExternalLink, File, FileText, Image as ImageIcon, Table2 } from "lucide-react";
import {
  Alert, Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography,
} from "@mui/material";
import AnalyzeOutputDialog from "@/components/analyze/analyze-output-dialog";
import FloatingWindow from "@/components/ui/floating-window/FloatingWindow";
import { ImagePreviewDialog, type ImagePreviewSource } from "@/components/analyze/image-preview-dialog";
import type { ProjectService } from "@/services/ProjectService";
import {
  unsupportedViewReason, viewerDataClassName,
  type ViewerActionData, type ViewerActionItem, type ViewerActionResult, type ViewerActionVolumes,
} from "@/utils/protocol_viewer_action_result";

type Props = {
  service: ProjectService;
  projectId: string;
  protocolId: string;
  protocolLabel: string;
  /** Label of the option whose eye produced this result. */
  title: string;
  result: ViewerActionResult;
  /** Called once every window opened for this result has been closed. */
  onClose: () => void;
};

type OpenData = {
  protocolId: number;
  outputName: string;
  displayName: string;
  className?: string;
  metadataFile: { initialTable: string | null } | null;
};

function canOpenInMetadataViewer(item: ViewerActionData): boolean {
  return item.output !== null || (item.format === "metadata" && item.fileToken !== null);
}

type OpenableItem = ViewerActionData | ViewerActionVolumes;

/** A result made of one data set, image or group of volumes opens straight in its viewer. */
export function directlyOpenableItem(result: ViewerActionResult): OpenableItem | null {
  const [only] = result.items;
  if (result.items.length !== 1 || result.messages.length !== 0) return null;
  if (only.kind === "volumes") return only.desktopProgram ? null : only;
  return only.kind === "data" &&
    (canOpenInMetadataViewer(only) || (only.format === "image" && only.path !== null))
    ? only : null;
}

/** Shown in the form rather than in a results window, like desktop message boxes. */
export function isInlineItem(item: ViewerActionItem): boolean {
  return item.kind === "message" || item.kind === "link" || item.kind === "desktop" ||
    (item.kind === "volumes" && item.desktopProgram !== null);
}

export function hasWindowContent(result: ViewerActionResult): boolean {
  return result.items.some(item => !isInlineItem(item));
}

/** Viewer for volumes given as files, e.g. those a viewer hands to ChimeraX. */
export function openVolumesTarget(item: ViewerActionVolumes, protocolId: string) {
  return {
    protocolId: Number(protocolId),
    outputName: item.fileToken,
    displayName: item.title,
    className: "SetOfVolumes",
    metadataFile: null,
  };
}

/** Opens a page the viewer asked for, in a new browser tab. */
export function ViewerLinkButton({ url }: { url: string }) {
  return (
    <Button size="small" variant="contained" component="a" href={url} target="_blank"
      rel="noopener noreferrer" startIcon={<ExternalLink size={14} />}
      sx={{ textTransform: "none", flex: "0 0 auto", bgcolor: "#333d49", "&:hover": { bgcolor: "#25303b" } }}>
      Open in a new tab
    </Button>
  );
}

function previewImageSource(
  service: ProjectService, projectId: string, protocolId: string, title: string, path: string,
): ImagePreviewSource {
  return {
    title,
    path,
    loadImage: async () => {
      const preview = await service.previewRemoteEntry(projectId, protocolId, path);
      const blob = preview?.source?.blob;
      if (!(blob instanceof Blob)) throw new Error(preview?.note || "This image cannot be previewed.");
      const url = URL.createObjectURL(blob);
      return { url, revoke: () => URL.revokeObjectURL(url) };
    },
  };
}

/** Shows an action result in front of the viewer form, in floating windows. */
export default function ProtocolViewerActionResults({
  service, projectId, protocolId, protocolLabel, title, result, onClose,
}: Props) {
  const direct = directlyOpenableItem(result);
  const [openData, setOpenData] = useState<OpenData | null>(null);
  const [image, setImage] = useState<ImagePreviewSource | null>(null);

  const openItem = (item: OpenableItem) => {
    if (item.kind === "volumes") {
      setOpenData(openVolumesTarget(item, protocolId));
    } else if (item.output) {
      setOpenData({
        protocolId: item.output.protocolId,
        outputName: item.output.outputName,
        displayName: item.output.outputName,
        className: item.output.className,
        metadataFile: null,
      });
    } else if (item.format === "metadata" && item.fileToken) {
      setOpenData({
        protocolId: Number(protocolId),
        outputName: item.fileToken,
        displayName: item.table ? `${item.table}@${item.title}` : item.title,
        className: viewerDataClassName(item),
        metadataFile: { initialTable: item.table },
      });
    } else if (item.format === "image" && item.path) {
      const path = item.index ? `${item.index}@${item.path}` : item.path;
      setImage(previewImageSource(service, projectId, protocolId, item.title, path));
    }
  };

  // The desktop opens a single result directly; do the same.
  useEffect(() => {
    if (direct) openItem(direct);
    // Only when a new result arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Without a results window, closing the viewer closes the whole result.
  const closeData = () => { setOpenData(null); if (direct) onClose(); };
  const closeImage = () => { setImage(null); if (direct) onClose(); };

  return (
    <>
      {!direct && (
        <FloatingWindow
          open
          onClose={onClose}
          title={`Result · ${title}`}
          ariaLabel={`Result of ${title}`}
          closeAriaLabel="Close result"
          initialWidth="min(980px, 92vw)"
          initialHeight="min(760px, 84vh)"
          minWidth={420}
          minHeight={260}
        >
          <Box data-testid="protocol-viewer-action-results" sx={{
            display: "flex", flexDirection: "column", gap: 1.25, p: 2, height: "100%",
            overflowY: "auto", boxSizing: "border-box", bgcolor: "#f8fafc",
          }}>
            {result.messages.map((message, index) => (
              <Alert key={`message-${index}`} severity={message.level}>
                {message.title && <strong>{message.title}: </strong>}{message.text}
              </Alert>
            ))}
            {result.items.filter(item => !isInlineItem(item)).map((item, index) => (
              <ResultItem key={`${item.kind}-${index}`} item={item}
                onOpen={openItem}
                onOpenImage={(imageTitle, path) => setImage(previewImageSource(service, projectId, protocolId, imageTitle, path))}
                onOpenPlot={(plotTitle, src) => setImage({ title: plotTitle, path: plotTitle, loadImage: async () => ({ url: src, revoke: () => undefined }) })} />
            ))}
            {result.omittedItems > 0 && (
              <Typography variant="caption">{result.omittedItems} more results were not shown.</Typography>
            )}
          </Box>
        </FloatingWindow>
      )}
      {openData && (
        <AnalyzeOutputDialog
          open
          onClose={closeData}
          projectId={Number(projectId)}
          protocolId={openData.protocolId}
          protocolLabel={protocolLabel}
          outputName={openData.outputName}
          displayName={openData.displayName}
          outputRaw={openData.className ? { pointerClass: openData.className } : null}
          metadataFile={openData.metadataFile}
        />
      )}
      <ImagePreviewDialog image={image} onClose={closeImage} />
    </>
  );
}

const CARD_SX = {
  p: 1.5, borderRadius: 1.5, borderColor: "rgba(148, 163, 184, 0.45)", bgcolor: "#ffffff",
} as const;

function CardTitle({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a", mb: 1 }}>{children}</Typography>;
}

const FORMAT_ICONS = { metadata: Table2, image: ImageIcon, text: FileText, file: File } as const;

type ResultItemProps = {
  item: ViewerActionItem;
  onOpen: (item: OpenableItem) => void;
  onOpenImage: (title: string, path: string) => void;
  onOpenPlot: (title: string, src: string) => void;
};

function ResultItem({ item, onOpen, onOpenImage, onOpenPlot }: ResultItemProps) {
  switch (item.kind) {
    case "message":
      return (
        <Alert severity={item.level}>
          {item.title && <strong>{item.title}: </strong>}{item.text}
        </Alert>
      );
    case "plot":
      return (
        <Paper variant="outlined" sx={CARD_SX}>
          {item.title && <CardTitle>{item.title}</CardTitle>}
          <Box component="img" src={item.src} alt={item.title || "Plot"}
            onClick={() => onOpenPlot(item.title || "Plot", item.src)}
            sx={{ display: "block", maxWidth: "100%", cursor: "zoom-in", mx: "auto" }} />
        </Paper>
      );
    case "table":
      return (
        <Paper variant="outlined" sx={CARD_SX}>
          {item.title && <CardTitle>{item.title}</CardTitle>}
          {item.message && <Typography variant="body2" sx={{ mb: 1 }}>{item.message}</Typography>}
          <TableContainer sx={{ maxHeight: 360 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>{item.header.map((h, i) => <TableCell key={i}>{h}</TableCell>)}</TableRow>
              </TableHead>
              <TableBody>
                {item.rows.map((row, r) => (
                  <TableRow key={r}>
                    {row.map((value, c) => <TableCell key={c}>{value === null ? "" : String(value)}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {item.truncated && <Typography variant="caption">Only the first rows are shown.</Typography>}
        </Paper>
      );
    case "text":
      return (
        <Paper variant="outlined" sx={CARD_SX}>
          {item.title && <CardTitle>{item.title}</CardTitle>}
          {item.files.map((file, i) => (
            <Box key={i} sx={{ mt: 1 }}>
              <Typography variant="caption" sx={{ display: "block" }}>{file.path || file.name}</Typography>
              {file.missing ? (
                <Typography variant="body2">This file does not exist yet.</Typography>
              ) : (
                <Box component="pre" sx={{ m: 0, p: 1, maxHeight: 400, overflow: "auto", fontSize: 12,
                  bgcolor: "action.hover", whiteSpace: "pre-wrap" }}>
                  {file.content}
                </Box>
              )}
              {file.truncated && <Typography variant="caption">Only the beginning of the file is shown.</Typography>}
            </Box>
          ))}
        </Paper>
      );
    case "image":
      return (
        <Paper variant="outlined" sx={{ ...CARD_SX, display: "flex", alignItems: "center", gap: 1.5 }}>
          <FileIcon icon={ImageIcon} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap sx={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>{item.title}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "#64748b", wordBreak: "break-all" }}>{item.path}</Typography>
          </Box>
          <OpenButton onClick={() => onOpenImage(item.title, item.path)} />
        </Paper>
      );
    case "data": {
      const openable = item.output !== null ||
        (item.fileToken !== null && (item.format === "metadata" || item.format === "image"));
      const location = item.output
        ? `${item.output.outputName} (${item.output.className || "output"})`
        : `${item.table ? `${item.table}@` : ""}${item.path ?? ""}`;
      return (
        <Paper variant="outlined" sx={{ ...CARD_SX, display: "flex", alignItems: "center", gap: 1.5 }}>
          <FileIcon icon={item.output ? Database : FORMAT_ICONS[item.format]} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap sx={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>{item.title}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "#64748b", wordBreak: "break-all" }}>{location}</Typography>
          </Box>
          {openable
            ? <OpenButton onClick={() => onOpen(item)} />
            : <Typography sx={{ fontSize: "0.75rem", color: "#64748b" }}>No web viewer for this file type yet.</Typography>}
        </Paper>
      );
    }
    case "volumes":
      return (
        <Paper variant="outlined" sx={{ ...CARD_SX, display: "flex", alignItems: "center", gap: 1.5 }}>
          <FileIcon icon={Box3D} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap sx={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>{item.title}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "#64748b", wordBreak: "break-all" }}>{item.paths.join(", ")}</Typography>
          </Box>
          <OpenButton onClick={() => onOpen(item)} />
        </Paper>
      );
    case "link":
      return (
        <Paper variant="outlined" sx={{ ...CARD_SX, display: "flex", alignItems: "center", gap: 1.5 }}>
          <FileIcon icon={ExternalLink} />
          <Typography sx={{ minWidth: 0, flex: 1, fontSize: "0.8rem", color: "#334155", wordBreak: "break-all" }}>
            {item.url}
          </Typography>
          <ViewerLinkButton url={item.url} />
        </Paper>
      );
    case "unsupported":
      return (
        <Alert severity="info" variant="outlined">
          {item.viewClass ? `${item.viewClass}: ` : ""}{unsupportedViewReason(item.reason)}
        </Alert>
      );
    default:
      return null;
  }
}

function FileIcon({ icon: Icon }: { icon: typeof File }) {
  return (
    <Box sx={{ width: 36, height: 36, borderRadius: 1.5, display: "grid", placeItems: "center", flex: "0 0 auto",
      bgcolor: "#eef2f6", color: "#333d49" }}>
      <Icon size={18} />
    </Box>
  );
}

function OpenButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="small" variant="contained" onClick={onClick} startIcon={<ExternalLink size={14} />}
      sx={{ textTransform: "none", flex: "0 0 auto", bgcolor: "#333d49", "&:hover": { bgcolor: "#25303b" } }}>
      Open
    </Button>
  );
}
