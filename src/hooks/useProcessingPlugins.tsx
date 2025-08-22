// src/hooks/useProcessingPlugins.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

type ProcessingContextType = {
  installing: Set<string>;
  removing: Set<string>;
  startInstall: (pip: string) => void;
  finishInstall: (pip: string) => void;
  startRemove: (pip: string) => void;
  finishRemove: (pip: string) => void;
  clearProcessingState: () => void;
};

const LS_KEY = "processing-plugins";

const ProcessingCtx = createContext<ProcessingContextType | null>(null);

export function ProcessingProvider({ children }: { children: React.ReactNode }) {
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  // Al montar cargamos de localStorage
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    try {
      const { inst = [], rem = [] } = JSON.parse(raw) as {
        inst?: string[];
        rem?: string[];
      };
      setInstalling(new Set(inst));
      setRemoving(new Set(rem));
    } catch { }
  }, []);

  // Cuando cambia installing/removing, lo persistimos
  useEffect(() => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        inst: Array.from(installing),
        rem: Array.from(removing),
      })
    );
  }, [installing, removing]);

  const startInstall = (pip: string) =>
    setInstalling((s) => new Set(s).add(pip));
  const finishInstall = (pip: string) =>
    setInstalling((s) => {
      const c = new Set(s);
      c.delete(pip);
      return c;
    });
  const startRemove = (pip: string) =>
    setRemoving((s) => new Set(s).add(pip));
  const finishRemove = (pip: string) =>
    setRemoving((s) => {
      const c = new Set(s);
      c.delete(pip);
      return c;
    });

  const clearProcessingState = () => {
    setInstalling(new Set());
    setRemoving(new Set());
    localStorage.removeItem(LS_KEY);
  };

  return (
    <ProcessingCtx.Provider
      value={{
        installing,
        removing,
        startInstall,
        finishInstall,
        startRemove,
        finishRemove,
        clearProcessingState,
      }}
    >
      {children}
    </ProcessingCtx.Provider>
  );
}

export function useProcessingPlugins() {
  const ctx = useContext(ProcessingCtx);
  if (!ctx)
    throw new Error("useProcessingPlugins must be under <ProcessingProvider>");
  return ctx;
}
