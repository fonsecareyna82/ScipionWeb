// src/components/WrapWithDrop.tsx
import React from 'react';
import { Box } from '@mui/material';

type WrapWithDropProps = {
  control: React.ReactNode;
  def: any;
  paramKey: string;
  setProtocolDetails: React.Dispatch<React.SetStateAction<any>>;
  setDragOverKey: (key: string | null) => void;
  dragOverKey: string | null;
  currentDraggedOutput: any;
};

const getExpectedClass = (def: any): string | undefined => {
  if (!def) return undefined;
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
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
};

export default function WrapWithDrop({
  control,
  def,
  paramKey,
  setProtocolDetails,
  setDragOverKey,
  dragOverKey,
  currentDraggedOutput,
}: WrapWithDropProps) {
  const expected = getExpectedClass(def);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (currentDraggedOutput && currentDraggedOutput._class === expected) {
      setDragOverKey(paramKey);
    }
  };

  const handleDragLeave = () => {
    setDragOverKey(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);

    let dragged = currentDraggedOutput;

    // fallback: re-parse from DataTransfer
    if (!dragged) {
      try {
        const raw =
          e.dataTransfer.getData('application/scipion-output') ||
          e.dataTransfer.getData('text/plain') ||
          e.dataTransfer.getData('text');
        if (raw) {
          dragged = JSON.parse(raw);
        }
      } catch (err) {
        console.error('Drop parse error:', err);
      }
    }

    if (!dragged) return;
    if (expected && dragged._class !== expected) return;

    // Actualizar el valor del campo
    setProtocolDetails((prev: any) => ({
      ...prev,
      params: {
        ...prev.params,
        [paramKey]: {
          ...prev.params[paramKey],
          editableValue: dragged._objValue ?? dragged.id ?? dragged.name ?? '',
        },
      },
    }));
  };

  const isActive =
    dragOverKey === paramKey && currentDraggedOutput?._class === expected;

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        border: isActive ? '2px dashed #3b82f6' : '2px dashed transparent',
        borderRadius: 1,
        p: 0.5,
        transition: 'border 0.2s ease-in-out',
      }}
    >
      {control}
    </Box>
  );
}
