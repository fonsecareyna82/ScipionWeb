import React from 'react';
import { useDrag } from './DragContext';
import { Box } from '@mui/material';

export type WrapWithDropProps = {
  control: React.ReactNode;
  def: any;
  paramKey: string;
  setProtocolDetails: React.Dispatch<React.SetStateAction<any>>;
  setDragOverKey: (key: string | null) => void;
  dragOverKey: string | null;
};

const getExpectedClass = (def: any): string | string[] | undefined => {
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
  const result: string[] = [];
  candidates.forEach((c) => {
    if (typeof c === 'string' && c.trim()) result.push(c.trim());
    if (Array.isArray(c)) result.push(...c.map((s) => s.trim()));
  });
  if (result.length === 0) return undefined;
  if (result.length === 1) return result[0];
  return result;
};

export default function WrapWithDrop({
  control,
  def,
  paramKey,
  setProtocolDetails,
  setDragOverKey,
  dragOverKey,
}: WrapWithDropProps) {
  const { currentDraggedOutput } = useDrag();
  const expected = getExpectedClass(def);

  const isMatch =
    !expected || // si no hay clase esperada, siempre match
    (Array.isArray(expected)
      ? expected.includes(currentDraggedOutput?._class)
      : currentDraggedOutput?._class === expected);

  const isActive = dragOverKey === paramKey;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(paramKey);
  };

  const handleDragLeave = () => setDragOverKey(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
    if (isMatch && currentDraggedOutput) {
      setProtocolDetails((prev: any) => ({
        ...prev,
        params: {
          ...prev.params,
          [paramKey]: {
            ...prev.params[paramKey],
            editableValue: currentDraggedOutput._objValue ?? '',
          },
        },
      }));
    }
  };

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        border: '2px dashed #888',
        borderRadius: 1,
        p: 0.5,
        backgroundColor: isActive
          ? isMatch
            ? '#b7f5c7' // verde si match
            : '#f5b7b7' // rojo si no match
          : 'transparent',
        transition: 'background-color 0.2s',
      }}
    >
      {control}
    </Box>
  );
}
