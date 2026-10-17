// Renders what a protocol viewer action produced, with ScipionWeb's own viewers.
import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography,
} from "@mui/material";
import AnalyzeOutputDialog from "@/components/analyze/analyze-output-dialog";
import { ImagePreviewDialog, type ImagePreviewSource } from "@/components/analyze/image-preview-dialog";
import type { ProjectService } from "@/services/ProjectService";
import {
  unsupportedViewReason, viewerDataClassName,
  type ViewerActionData, type ViewerActionItem, type ViewerActionResult,
} from "@/utils/protocol_viewer_action_result";

type Props = {
  service: ProjectService;
  projectId: string;
  protocolId: string;
  protocolLabel: string;
  result: ViewerActionResult;
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

export default function ProtocolViewerActionResults({ service, projectId, protocolId, protocolLabel, result }: Props) {
  const [openData, setOpenData] = useState<OpenData | null>(null);
  const [image, setImage] = useState<ImagePreviewSource | null>(null);

  const openItem = (item: ViewerActionData) => {
    if (item.output) {
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
    const [only] = result.items;
    if (result.items.length === 1 && only.kind === "data" &&
        (canOpenInMetadataViewer(only) || (only.format === "image" && only.path))) {
      openItem(only);
    }
    // Only when a new result arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  if (result.items.length === 0 && result.messages.length === 0) {
    return <Typography variant="body2" sx={{ mt: 1 }}>The viewer returned nothing to show.</Typography>;
  }

  return (
    <Box data-testid="protocol-viewer-action-results" sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
      {result.messages.map((message, index) => (
        <Alert key={`message-${index}`} severity={message.level}>
          {message.title && <strong>{message.title}: </strong>}{message.text}
        </Alert>
      ))}
      {result.items.map((item, index) => (
        <ResultItem key={`${item.kind}-${index}`} item={item}
          onOpen={openItem}
          onOpenImage={(title, path) => setImage(previewImageSource(service, projectId, protocolId, title, path))}
          onOpenPlot={(title, src) => setImage({ title, path: title, loadImage: async () => ({ url: src, revoke: () => undefined }) })} />
      ))}
      {result.omittedItems > 0 && (
        <Typography variant="caption">{result.omittedItems} more results were not shown.</Typography>
      )}
      {openData && (
        <AnalyzeOutputDialog
          open
          onClose={() => setOpenData(null)}
          projectId={Number(projectId)}
          protocolId={openData.protocolId}
          protocolLabel={protocolLabel}
          outputName={openData.outputName}
          displayName={openData.displayName}
          outputRaw={openData.className ? { pointerClass: openData.className } : null}
          metadataFile={openData.metadataFile}
        />
      )}
      <ImagePreviewDialog image={image} onClose={() => setImage(null)} />
    </Box>
  );
}

type ResultItemProps = {
  item: ViewerActionItem;
  onOpen: (item: ViewerActionData) => void;
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
        <Paper variant="outlined" sx={{ p: 1 }}>
          {item.title && <Typography variant="subtitle2">{item.title}</Typography>}
          <Box component="img" src={item.src} alt={item.title || "Plot"}
            onClick={() => onOpenPlot(item.title || "Plot", item.src)}
            sx={{ display: "block", maxWidth: "100%", cursor: "zoom-in", mx: "auto" }} />
        </Paper>
      );
    case "table":
      return (
        <Paper variant="outlined" sx={{ p: 1 }}>
          {item.title && <Typography variant="subtitle2">{item.title}</Typography>}
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
        <Paper variant="outlined" sx={{ p: 1 }}>
          {item.title && <Typography variant="subtitle2">{item.title}</Typography>}
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
        <Paper variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Box>
            <Typography variant="subtitle2">{item.title}</Typography>
            <Typography variant="caption">{item.path}</Typography>
          </Box>
          <Button size="small" variant="outlined" onClick={() => onOpenImage(item.title, item.path)}>Open</Button>
        </Paper>
      );
    case "data": {
      const openable = item.output !== null ||
        (item.fileToken !== null && (item.format === "metadata" || item.format === "image"));
      const location = item.output
        ? `${item.output.outputName} (${item.output.className || "output"})`
        : `${item.table ? `${item.table}@` : ""}${item.path ?? ""}`;
      return (
        <Paper variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>{item.title}</Typography>
            <Typography variant="caption" sx={{ display: "block", wordBreak: "break-all" }}>{location}</Typography>
          </Box>
          {openable
            ? <Button size="small" variant="outlined" onClick={() => onOpen(item)}>Open</Button>
            : <Typography variant="caption">No web viewer for this file type yet.</Typography>}
        </Paper>
      );
    }
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
