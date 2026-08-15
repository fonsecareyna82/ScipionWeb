// src/hooks/useProtocolTags.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import { useProjectService } from "@/ProjectServiceContext";
import { useTagStore } from "@/stores/tag_store";
import type { Id } from "@/services/ProjectService";

type UseProtocolTagsArgs = {
  projectId: Id | null | undefined;
  protocolId: Id | null | undefined;

  // when enabled=false, the hook won't fetch from backend
  enabled?: boolean;
};

function isValidId(v: any): boolean {
  // isValidId
  const s = String(v ?? "").trim();
  return Boolean(s) && s !== "null" && s !== "undefined";
}

function coerceErrorMessage(e: any, fallback: string): string {
  // coerceErrorMessage
  const msg =
    (typeof e?.data?.detail === "string" && e.data.detail) ||
    (typeof e?.response?.data?.detail === "string" && e.response.data.detail) ||
    (typeof e?.message === "string" && e.message) ||
    String(e ?? "");
  return msg.trim() ? msg : fallback;
}

function uniqStrings(values: unknown): string[] {
  // uniqStrings
  const arr = Array.isArray(values) ? values : [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }

  return out;
}

export function useProtocolTags({ projectId, protocolId, enabled = true }: UseProtocolTagsArgs) {
  const svc = useProjectService();
  const svcRef = useRef(svc);

  useEffect(() => {
    // syncSvcRef
    svcRef.current = svc;
  }, [svc]);

  const { getAssignedTagIds, setAssignedTagIds, toggleAssignedTagId } = useTagStore();

  const pid = useMemo(() => (isValidId(projectId) ? (projectId as Id) : null), [projectId]);
  const prId = useMemo(() => (isValidId(protocolId) ? (protocolId as Id) : null), [protocolId]);

  const canReadRemote = useMemo(() => {
    // canReadRemote
    if (!enabled) return false;
    if (!pid || !prId) return false;
    return typeof (svcRef.current as any)?.listProtocolTagIds === "function";
  }, [enabled, pid, prId]);

  const canWriteRemote = useMemo(() => {
    // canWriteRemote
    if (!enabled) return false;
    if (!pid || !prId) return false;
    return typeof (svcRef.current as any)?.setProtocolTagIds === "function";
  }, [enabled, pid, prId]);

  const cachedTagIds = useMemo(() => {
    // cachedTagIds
    if (!pid || !prId) return [];
    return uniqStrings(getAssignedTagIds(pid as any, prId as any));
  }, [getAssignedTagIds, pid, prId]);

  const [isLoading, setIsLoading] = useState(false);

  const loadOnceKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    // refresh
    if (!canReadRemote) return;

    const localRequestId = ++requestIdRef.current;
    setIsLoading(true);

    try {
      const tagIds = await (svcRef.current as any).listProtocolTagIds(pid, prId);
      if (requestIdRef.current !== localRequestId) return;

      setAssignedTagIds(pid as any, prId as any, uniqStrings(tagIds));
    } catch (e: any) {
      if (requestIdRef.current !== localRequestId) return;
      toast.error(coerceErrorMessage(e, "Failed to load protocol tags"));
    } finally {
      if (requestIdRef.current === localRequestId) {
        setIsLoading(false);
      }
    }
  }, [canReadRemote, pid, prId, setAssignedTagIds]);

  useEffect(() => {
    // lazyLoadOncePerProtocol
    if (!canReadRemote) return;

    const key = `${String(pid)}::${String(prId)}`;
    if (loadOnceKeyRef.current === key) return;

    loadOnceKeyRef.current = key;
    void refresh();
  }, [canReadRemote, pid, prId, refresh]);

  const setTagIdsRemote = useCallback(
    async (nextTagIds: string[]) => {
      // setTagIdsRemote
      if (!pid || !prId) return;

      const normalized = uniqStrings(nextTagIds);

      // optimisticUpdate
      const prev = uniqStrings(getAssignedTagIds(pid as any, prId as any));
      setAssignedTagIds(pid as any, prId as any, normalized);

      if (!canWriteRemote) return;

      try {
        await (svcRef.current as any).setProtocolTagIds(pid, prId, normalized);
      } catch (e: any) {
        // rollbackOnError
        setAssignedTagIds(pid as any, prId as any, prev);
        toast.error(coerceErrorMessage(e, "Failed to save protocol tags"));
      }
    },
    [canWriteRemote, getAssignedTagIds, pid, prId, setAssignedTagIds],
  );

  const toggleTagIdRemote = useCallback(
    async (tagId: string) => {
      // toggleTagIdRemote
      if (!pid || !prId) return;

      const nextId = String(tagId ?? "").trim();
      if (!nextId) return;

      const prev = uniqStrings(getAssignedTagIds(pid as any, prId as any));

      // optimisticUpdateViaStore
      const next = uniqStrings(toggleAssignedTagId(pid as any, prId as any, nextId));

      if (!canWriteRemote) return;

      try {
        await (svcRef.current as any).setProtocolTagIds(pid, prId, next);
      } catch (e: any) {
        // rollbackOnError
        setAssignedTagIds(pid as any, prId as any, prev);
        toast.error(coerceErrorMessage(e, "Failed to save protocol tags"));
      }
    },
    [canWriteRemote, getAssignedTagIds, pid, prId, setAssignedTagIds, toggleAssignedTagId],
  );

  return {
    tagIds: cachedTagIds,
    isLoading,
    refresh,
    setTagIdsRemote,
    toggleTagIdRemote,
  };
}
