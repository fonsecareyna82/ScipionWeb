import { ProtocolNode } from "./protocolNode";

export interface Project {
  id: string;
  name: string;
  shortName: string;
  description: string;
  createdAt: Date;
  updatedAt?: Date;
  status: string;
  protocolsCount?: string;
  diskUsage?: string;
  protocols?: Record<string, ProtocolNode>;
  isShared: boolean,
  isOwner: boolean,
  permission: string,
  // owner, share, group (a PI of the owner's group) or role
  accessVia?: string | null;
  projectOwnerId: string | number;
  thumbnailUrl?: string | null;
  thumbnailRebuildUrl?: string | null;
  thumbnailItemsUrl?: string | null;
  thumbnailVersion?: string | number | null;
}