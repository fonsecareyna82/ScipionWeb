// src/hooks/useProjectTags.ts
//
// The one copy of a project's tags: the tag list and which protocol has which
// tag. Graph cards, the table and the tag filter all read it, and every
// assignment goes through `writeProtocolTags`.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import type { ProtocolTag } from "@/components/tags/tagTypes";
import type { Id, ProtocolTagCreatePayload, ProtocolTagIdsResult } from "@/services/ProjectService";
import {
  normalizeTag,
  normalizeTagIds,
  normalizeTagList,
  sameTagIds,
  sortTags,
  apiErrorMessage,
  type ProtocolTagAssignments,
} from "@/utils/protocol_tags";

export type TagService = {
  listProjectTags?: (projectId: Id) => Promise<unknown>;
  createProjectTag?: (projectId: Id, payload: ProtocolTagCreatePayload) => Promise<unknown>;
  setProtocolTagIds?: (projectId: Id, protocolId: Id, tagIds: string[]) => Promise<ProtocolTagIdsResult | undefined | void>;
};

export type TagWriteUpdate = { protocolId: string; tagIds: string[] };
export type TagWriteSummary = { succeeded: string[]; failed: string[] };

type UseProjectTagsOptions = {
  service: TagService | null | undefined;
  projectId: number | null | undefined;
  /** Every change made by a write, so the caller can mirror it elsewhere. */
  onAssignmentsChange?: (changed: ProtocolTagAssignments) => void;
};

export function useProjectTags({ service, projectId, onAssignmentsChange }: UseProjectTagsOptions) {
  const svcRef = useRef(service);
  svcRef.current = service;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const onChangeRef = useRef(onAssignmentsChange);
  onChangeRef.current = onAssignmentsChange;

  const [tags, setTags] = useState<ProtocolTag[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  // Only the newest list request may set the list.
  const tagsRequestRef = useRef(0);

  const [assignments, setAssignments] = useState<ProtocolTagAssignments>({});
  // Latest map, read by writes so rapid toggles build on each other.
  const assignmentsRef = useRef<ProtocolTagAssignments>({});
  // What the server last said each protocol has; failed writes go back to it.
  const confirmedRef = useRef<ProtocolTagAssignments>({});
  const writeSeqRef = useRef<Record<string, number>>({});
  const pendingRef = useRef<Record<string, number>>({});
  const queueRef = useRef<Record<string, Promise<unknown>>>({});
  // The project the map was seeded for: a load may land before `projectId` changes.
  const assignmentsProjectRef = useRef<number | null | undefined>(undefined);

  const applyAssignments = useCallback((changed: ProtocolTagAssignments, notify = true) => {
    if (Object.keys(changed).length === 0) return;
    assignmentsRef.current = { ...assignmentsRef.current, ...changed };
    setAssignments(assignmentsRef.current);
    if (notify) onChangeRef.current?.(changed);
  }, []);

  const refreshTags = useCallback(async () => {
    const pid = projectIdRef.current;
    const svc = svcRef.current;
    if (pid == null || typeof svc?.listProjectTags !== "function") return;

    const requestId = ++tagsRequestRef.current;
    setTagsLoading(true);
    try {
      const raw = await svc.listProjectTags(pid);
      if (requestId !== tagsRequestRef.current) return;
      setTags(normalizeTagList(raw));
      setTagsLoaded(true);
    } catch (error) {
      if (requestId !== tagsRequestRef.current) return;
      // Keep the previous list: an empty one would hide every tag.
      toast.error(apiErrorMessage(error, "Failed to load tags"), { id: "project-tags-load" });
    } finally {
      if (requestId === tagsRequestRef.current) setTagsLoading(false);
    }
  }, []);

  /** The list as the tag manager left it. */
  const replaceTags = useCallback((next: ProtocolTag[]) => {
    tagsRequestRef.current += 1;
    setTags(sortTags(next));
    setTagsLoaded(true);
    setTagsLoading(false);
  }, []);

  /** A deleted tag: the server already removed it from every protocol. */
  const forgetTag = useCallback((tagId: string) => {
    const changed: ProtocolTagAssignments = {};
    for (const [protocolId, ids] of Object.entries(assignmentsRef.current)) {
      if (ids.includes(tagId)) changed[protocolId] = ids.filter((id) => id !== tagId);
    }
    for (const [protocolId, ids] of Object.entries(confirmedRef.current)) {
      if (ids.includes(tagId)) confirmedRef.current[protocolId] = ids.filter((id) => id !== tagId);
    }
    applyAssignments(changed);
    setTags((prev) => prev.filter((tag) => tag.id !== tagId));
  }, [applyAssignments]);

  /**
   * Assignments from a graph load: the server is authoritative, so the map is
   * replaced whole. Protocols with a write in flight keep what they show; the
   * write's answer settles them.
   */
  const seedAssignments = useCallback((next: ProtocolTagAssignments, forProjectId?: number | null) => {
    if (forProjectId !== undefined) assignmentsProjectRef.current = forProjectId;
    const merged: ProtocolTagAssignments = { ...next };
    for (const [protocolId, count] of Object.entries(pendingRef.current)) {
      if (count > 0 && assignmentsRef.current[protocolId]) merged[protocolId] = assignmentsRef.current[protocolId];
    }
    confirmedRef.current = { ...next };
    assignmentsRef.current = merged;
    setAssignments(merged);
  }, []);

  // Another project: nothing of the previous one may stay.
  const previousProjectIdRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const previous = previousProjectIdRef.current;
    previousProjectIdRef.current = projectId;
    if (previous != null && previous !== projectId) {
      tagsRequestRef.current += 1;
      setTags([]);
      setTagsLoaded(false);
      writeSeqRef.current = {};
      pendingRef.current = {};
      queueRef.current = {};
      if (assignmentsProjectRef.current !== projectId) {
        assignmentsRef.current = {};
        confirmedRef.current = {};
        setAssignments({});
      }
    }
    if (projectId != null) void refreshTags();
  }, [projectId, refreshTags]);

  /**
   * Saves the tag set of each protocol: shown at once, then each protocol is
   * set to what the server answered, and only the failed ones go back.
   */
  const writeProtocolTags = useCallback(async (updates: TagWriteUpdate[]): Promise<TagWriteSummary> => {
    const pid = projectIdRef.current;
    const svc = svcRef.current;
    const summary: TagWriteSummary = { succeeded: [], failed: [] };
    if (pid == null || typeof svc?.setProtocolTagIds !== "function" || updates.length === 0) return summary;

    const optimistic: ProtocolTagAssignments = {};
    for (const update of updates) optimistic[String(update.protocolId)] = normalizeTagIds(update.tagIds);
    applyAssignments(optimistic);

    const errors: unknown[] = [];
    let ignoredSome = false;

    await Promise.all(
      Object.entries(optimistic).map(async ([protocolId, tagIds]) => {
        const seq = (writeSeqRef.current[protocolId] ?? 0) + 1;
        writeSeqRef.current[protocolId] = seq;
        pendingRef.current[protocolId] = (pendingRef.current[protocolId] ?? 0) + 1;

        // One request at a time per protocol: each one replaces the whole
        // set, so they must reach the server in the order they were made.
        const previous = queueRef.current[protocolId] ?? Promise.resolve();
        const request = previous
          .catch(() => undefined)
          .then(() => svc.setProtocolTagIds!(pid, protocolId, tagIds));
        queueRef.current[protocolId] = request;

        try {
          const result = await request;
          const saved = Array.isArray(result?.tagIds) ? normalizeTagIds(result.tagIds) : tagIds;
          if (Array.isArray(result?.ignoredTagIds) && result.ignoredTagIds.length > 0) ignoredSome = true;
          confirmedRef.current[protocolId] = saved;
          // When a newer toggle is pending, its own answer settles the protocol.
          if (writeSeqRef.current[protocolId] === seq && !sameTagIds(saved, assignmentsRef.current[protocolId] ?? [])) {
            applyAssignments({ [protocolId]: saved });
          }
          summary.succeeded.push(protocolId);
        } catch (error) {
          errors.push(error);
          summary.failed.push(protocolId);
          if (writeSeqRef.current[protocolId] === seq) {
            applyAssignments({ [protocolId]: confirmedRef.current[protocolId] ?? [] });
          }
        } finally {
          pendingRef.current[protocolId] = Math.max(0, (pendingRef.current[protocolId] ?? 1) - 1);
          if (queueRef.current[protocolId] === request) delete queueRef.current[protocolId];
        }
      }),
    );

    if (errors.length > 0) {
      const message = apiErrorMessage(errors[0], "Failed to update tags");
      const total = summary.succeeded.length + summary.failed.length;
      toast.error(
        summary.succeeded.length > 0
          ? `Tags updated on ${summary.succeeded.length} of ${total} protocols; ${summary.failed.length} failed: ${message}`
          : message,
      );
    }
    // Some tag no longer exists in the project: the list is out of date.
    if (ignoredSome) void refreshTags();

    return summary;
  }, [applyAssignments, refreshTags]);

  /**
   * Adds the tag to the protocols, or removes it when all of them have it
   * (or as `enabled` says). Built from the latest map, never from a render.
   */
  const toggleTag = useCallback(
    (protocolIds: string[], tagId: string, enabled?: boolean): Promise<TagWriteSummary> => {
      const ids = normalizeTagIds(protocolIds).filter((id) => id !== "PROJECT");
      const current = ids.map((id) => [id, assignmentsRef.current[id] ?? []] as const);
      const add = enabled ?? !current.every(([, assigned]) => assigned.includes(tagId));

      const updates = current
        .filter(([, assigned]) => assigned.includes(tagId) !== add)
        .map(([protocolId, assigned]) => ({
          protocolId,
          tagIds: add ? [...assigned, tagId] : assigned.filter((id) => id !== tagId),
        }));

      return writeProtocolTags(updates);
    },
    [writeProtocolTags],
  );

  /** Creates a tag and gives it to the protocols it was created from. */
  const createTagAndAssign = useCallback(
    async (payload: ProtocolTagCreatePayload, protocolIds: string[]): Promise<ProtocolTag> => {
      const pid = projectIdRef.current;
      const svc = svcRef.current;
      if (pid == null || typeof svc?.createProjectTag !== "function") throw new Error("Project is not loaded yet.");

      const created = normalizeTag(await svc.createProjectTag(pid, payload));
      if (!created) throw new Error("Invalid tag response");

      // A list requested before the create would not have it.
      tagsRequestRef.current += 1;
      setTags((prev) => sortTags([...prev.filter((tag) => tag.id !== created.id), created]));
      setTagsLoaded(true);
      setTagsLoading(false);

      if (protocolIds.length > 0) void toggleTag(protocolIds, created.id, true);
      return created;
    },
    [toggleTag],
  );

  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  return {
    tags,
    tagsById,
    tagsLoaded,
    tagsLoading,
    refreshTags,
    replaceTags,
    forgetTag,
    assignments,
    seedAssignments,
    writeProtocolTags,
    toggleTag,
    createTagAndAssign,
  };
}

export type ProjectTagsState = ReturnType<typeof useProjectTags>;
