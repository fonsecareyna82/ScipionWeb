// src/components/WrapWithDrop.tsx
import React, { useState } from 'react';
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
  const [dragMatch, setDragMatch] = useState<null | boolean>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(paramKey);

    // leer dataTransfer por si no está en estado
    let dragged = currentDraggedOutput;
    if (!dragged) {
      try {
        const raw =
          e.dataTransfer.getData('application/scipion-output') ||
          e.dataTransfer.getData('text/plain') ||
          e.dataTransfer.getData('text');
        if (raw) {
          dragged = JSON.parse(raw);
        }
      } catch {}
    }

    if (dragged && expected) {
      setDragMatch(dragged._class === expected);
    } else {
      setDragMatch(null);
    }
  };

  const handleDragLeave = () => {
    setDragOverKey(null);
    setDragMatch(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
    setDragMatch(null);

    let dragged = currentDraggedOutput;
    if (!dragged) {
      try {
        const raw =
          e.dataTransfer.getData('application/scipion-output') ||
          e.dataTransfer.getData('text/plain') ||
          e.dataTransfer.getData('text');
        if (raw) {
          dragged = JSON.parse(raw);
        }
      } catch {}
    }

    if (!dragged) return;
    if (expected && dragged._class !== expected) return;

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

  const isOver = dragOverKey === paramKey;

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        border: isOver
          ? dragMatch === true
            ? '2px dashed #22c55e' // verde
            : dragMatch === false
            ? '2px dashed #ef4444' // rojo
            : '2px dashed #f59e0b' // amarillo = indefinido
          : '2px dashed transparent',
        backgroundColor: isOver
          ? dragMatch === true
            ? 'rgba(34,197,94,0.15)'
            : dragMatch === false
            ? 'rgba(239,68,68,0.15)'
            : 'rgba(245,158,11,0.15)'
          : 'transparent',
        borderRadius: 1,
        p: 0.5,
        transition: 'all 0.2s ease-in-out',
      }}
    >
      {control}
    </Box>
  );
}
