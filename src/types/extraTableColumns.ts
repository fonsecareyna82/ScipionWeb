export type ExtraTableColumnType =
  | "text"
  | "number"
  | "datetime"
  | "duration"
  | "bytes"
  | "boolean";

export type ExtraTableColumnDescriptor = {
  label?: string;
  value: unknown;
  type?: ExtraTableColumnType;
  defaultVisible?: boolean;
};

export type ExtraTableColumnValue =
  | ExtraTableColumnDescriptor
  | string
  | number
  | boolean
  | null;

export type ExtraTableColumns = Record<string, ExtraTableColumnValue>;