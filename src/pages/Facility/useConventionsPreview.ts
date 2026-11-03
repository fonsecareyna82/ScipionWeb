import { useEffect, useState } from "react";

import { previewConventions, type ConventionExamples } from "@/api/facility";

const PREVIEW_DELAY_MS = 350;

/** What a facility's patterns make for an example session, asked as they are typed; error says why not. */
export function useConventionsPreview(patterns: {
  sessionNamePattern?: string; dataFolderPattern?: string; atlasFolderPattern?: string; microscopeCode?: string;
}): { examples: ConventionExamples | null; error: string | null } {
  const [examples, setExamples] = useState<ConventionExamples | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(patterns);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      previewConventions(JSON.parse(key))
        .then((made) => {
          if (cancelled) return;
          setExamples(made);
          setError(null);
        })
        .catch((e: any) => {
          if (cancelled) return;
          setExamples(null);
          setError(String(e?.message || "The pattern makes no name"));
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  return { examples, error };
}
