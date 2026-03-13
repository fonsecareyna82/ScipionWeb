import { Box } from "@mui/material";
import JsonTree from "./json-tree";

type ProtocolMetadataPanelProps = {
  metadataSnapshot: any;
};

export default function ProtocolMetadataPanel({
  metadataSnapshot,
}: ProtocolMetadataPanelProps) {
  return (
    <Box sx={{ height: "100%", maxHeight: "100%", overflow: "auto" }}>
      <JsonTree data={metadataSnapshot} />
    </Box>
  );
}