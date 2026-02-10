// src/stores/tag_assignments_store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StoredTagAssignments = Record<string, Record<string, string[]>>;

type TagAssignmentUpdate = {
  projectId: string | number | undefined;
  protocolId: string | number | undefined;
  tagIds: string[];
};

type TagAssignmentsState = {
  assignments: StoredTagAssignments;

  setAssignedTagIds: (
    projectId: string | number | undefined,
    protocolId: string | number | undefined,
    tagIds: string[]
  ) => void;

  setAssignedTagIdsBatch: (updates: TagAssignmentUpdate[]) => void;

  pruneOrphanTagIds: (validTagIds: Set<string>) => void;
};

const storageKey = "scipion.protocolTagAssignments.v1";

function normalizeKey(raw: string | number | undefined, fallback: string): string {
  // normalizeKey
  const s = String(raw ?? "").trim();
  return s ? s : fallback;
}

function uniqStrings(values: string[]): string[] {
  // uniqStrings
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export const useTagAssignmentsStore = create<TagAssignmentsState>()(
  persist(
    (set, get) => ({
      assignments: {},

      setAssignedTagIds: (projectId, protocolId, tagIds) => {
        // setAssignedTagIds
        const pid = normalizeKey(projectId, "global");
        const prId = normalizeKey(protocolId, "");
        if (!prId) return;

        const nextTagIds = uniqStrings(tagIds ?? []);

        set((state) => {
          const current = state.assignments ?? {};
          const projectMap = { ...(current[pid] ?? {}) };
          projectMap[prId] = nextTagIds;

          return {
            assignments: {
              ...current,
              [pid]: projectMap,
            },
          };
        });
      },

      setAssignedTagIdsBatch: (updates) => {
        // setAssignedTagIdsBatch
        const list = Array.isArray(updates) ? updates : [];
        if (list.length === 0) return;

        set((state) => {
          const current = state.assignments ?? {};
          const next: StoredTagAssignments = { ...current };

          for (const u of list) {
            const pid = normalizeKey(u.projectId, "global");
            const prId = normalizeKey(u.protocolId, "");
            if (!prId) continue;

            const projectMap = { ...(next[pid] ?? {}) };
            projectMap[prId] = uniqStrings(u.tagIds ?? []);
            next[pid] = projectMap;
          }

          return { assignments: next };
        });
      },

      pruneOrphanTagIds: (validTagIds) => {
        // pruneOrphanTagIds
        const allowed = validTagIds instanceof Set ? validTagIds : new Set<string>();

        set((state) => {
          const current = state.assignments ?? {};
          const next: StoredTagAssignments = {};
          let changed = false;

          for (const [pid, protocolMap] of Object.entries(current)) {
            const nextProtocolMap: Record<string, string[]> = {};
            for (const [prId, ids] of Object.entries(protocolMap ?? {})) {
              const filtered = (Array.isArray(ids) ? ids : [])
                .map((x) => String(x))
                .filter((x) => allowed.has(x));
              const uniq = uniqStrings(filtered);

              nextProtocolMap[prId] = uniq;

              const sameLength = Array.isArray(ids) && ids.length === uniq.length;
              if (!sameLength) changed = true;
            }
            next[pid] = nextProtocolMap;
          }

          return changed ? { assignments: next } : state;
        });
      },
    }),
    {
      name: storageKey,
      partialize: (s) => ({ assignments: s.assignments }),
    }
  )
);

export function initTagAssignmentsStoreSync(): () => void {
  // initTagAssignmentsStoreSync
  if (typeof window === "undefined") return () => {};

  const onStorage = (e: StorageEvent) => {
    if (e.key !== storageKey) return;
    try {
      void useTagAssignmentsStore.persist.rehydrate();
    } catch {
      // ignore rehydrate errors
    }
  };

  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
