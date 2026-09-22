import React from "react";
import { useDrag } from "./DragContext";
import { Box } from "@mui/material";
import { setScalarPointerSelection } from "@/utils/protocolform.state";
import { matchesPointerClassHierarchy, } from "@/utils/protocolform.utils";

export type WrapWithDropProps = {
  control: React.ReactNode;
  def: any;
  paramKey: string;
  setProtocolDetails: React.Dispatch<React.SetStateAction<any>>;
  setDragOverKey: (key: string | null) => void;
  dragOverKey: string | null;
};

function splitClassTokens(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.flatMap(splitClassTokens);
  }

  if (typeof value !== "string") return [];

  return value
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeClassToken(value: string): string {
  return value
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/^class\s+/i, "");
}


function getExpectedClasses(def: any): string[] {
  if (!def) return [];

  const candidates = [
    def.pointerClass,
    def.accept,
    def.accepts,
    def.accepted,
    def.objectClass,
    def.targetClass,
    def._expectedClass,
    def.acceptsClass,
    def.type,
    def._type,
    def._classAccepted,
    def.class,
  ];

  return Array.from(
    new Set(
      candidates
        .flatMap(splitClassTokens)
        .map(normalizeClassToken)
        .filter(Boolean),
    ),
  );
}


export default function WrapWithDrop({
  control,
  def,
  paramKey,
  setProtocolDetails,
  setDragOverKey,
  dragOverKey,
}: WrapWithDropProps) {
  const { currentDraggedOutput } = useDrag();

  const expectedClasses =
    getExpectedClasses(def);

  const isMatch =
    matchesPointerClassHierarchy(
      expectedClasses,
      currentDraggedOutput,
    );
  const isActive = dragOverKey === paramKey && Boolean(currentDraggedOutput);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOverKey(paramKey);
  };

  const handleDragLeave = () => {
    setDragOverKey(null);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOverKey(null);

    if (!isMatch || !currentDraggedOutput) return;

    if (def?.allowsPointers === true) {
      setProtocolDetails((prev: any) =>
        setScalarPointerSelection(prev, paramKey, currentDraggedOutput),
      );
      return;
    }

    setProtocolDetails((prev: any) => ({
      ...prev,
      params: {
        ...prev.params,
        [paramKey]: {
          ...prev.params[paramKey],
          editableValue: currentDraggedOutput.value ?? "",
          value: currentDraggedOutput.value ?? "",
          info: currentDraggedOutput.info ?? "",
          parentId: currentDraggedOutput.parentId ?? null,
        },
      },
    }));
  };

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        display: "block",
        width: "98%",
        minWidth: 0,
        borderRadius: 1,
        mt: 1,
        outline: "2px dashed #5f5d5dff",
        outlineOffset: 2,
        backgroundColor: isActive ? (isMatch ? "#b7f5c7" : "#f5b7b7") : "transparent",
        transition: "background-color 0.2s",
      }}
    >
      {control}
    </Box>
  );
}