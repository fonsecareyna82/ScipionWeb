import { useCallback, useEffect, useState } from "react";

import { loadCurrentUserOnce } from "@/api/auth";
import type { UserProfile } from "@/types/user";

/** The signed-in user and what they may do (the API decides; this only hides what would be refused). */
export function usePermissions() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadCurrentUserOnce()
      .then((profile) => {
        if (!cancelled) setUser(profile);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const can = useCallback(
    (permission: string) => Boolean(user?.isSystemAdmin || user?.permissions?.includes(permission)),
    [user],
  );

  return { user, loaded, can };
}
