import { useCallback, useEffect, useState } from "react";

import { loadFacilityStatusOnce, type FacilityStatus } from "@/api/facility";

/** Whether this installation runs a facility, and what the signed-in user may do in it (the API decides). */
export function useFacilityStatus() {
  const [status, setStatus] = useState<FacilityStatus>({ enabled: false, permissions: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadFacilityStatusOnce()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const facilityCan = useCallback(
    (permission: string) => status.enabled && status.permissions.includes(permission),
    [status],
  );

  return { enabled: status.enabled, loaded, facilityCan };
}
