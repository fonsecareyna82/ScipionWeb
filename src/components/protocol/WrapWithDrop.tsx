// src/components/WrapWithDrop.tsx
import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';

type WrapWithDropProps = {
  control: React.ReactNode;
  def: any;
  paramKey: string;
  setProtocolDetails: React.Dispatch<any>;
  dragOverKey: string | null;
  setDragOverKey: React.Dispatch<React.SetStateAction<string | null>>;
  currentDraggedOutput: any;
};

export default function WrapWithDrop({
  control,
  def,
  paramKey,
  setProtocolDetails,
  dragOverKey,
  setDragOverKey,
  currentDraggedOutput,
}: WrapWithDropProps) {
  const [isOver, setIsOver] = useState(false);

  const expectedClass = def._class;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Verificamos que haya un objeto arrastrado
    if (!currentDraggedOutput) return;

    const draggedClass = currentDraggedOutput._class;
    if (draggedClass && draggedClass === expectedClass) {
      setIsOver(true);
      setDragOverKey(paramKey);
    } else {
      setIsOver(false);
      setDragOverKey(null);
    }
  };

  const handleDragLeave = () => {
    setIsOver(false);
    setDragOverKey(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!currentDraggedOutput) return;

    const draggedClass = currentDraggedOutput._class;
    if (draggedClass && draggedClass === expectedClass) {
      // Actualizamos editableValue del PointerParam
      setProtocolDetails((prev: any) => ({
        ...prev,
        params: {
          ...prev.params,
          [paramKey]: {
            ...prev.params[paramKey],
            editableValue: currentDraggedOutput.id || currentDraggedOutput.name || '',
          },
        },
      }));
    }
    setIsOver(false);
    setDragOverKey(null);
  };

  // Si el dragOverKey cambia externamente, mantenemos el borde correcto
  useEffect(() => {
    setIsOver(dragOverKey === paramKey);
  }, [dragOverKey, paramKey]);

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        width: '100%',
        height: '100%',
        border: isOver ? '2px dashed #4caf50' : '2px dashed transparent',
        borderRadius: 1,
        transition: 'border 0.15s ease-in-out',
      }}
    >
      {control}
    </Box>
  );
}
