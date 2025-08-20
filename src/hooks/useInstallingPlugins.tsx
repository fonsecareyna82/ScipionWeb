import React, { createContext, useContext, useEffect, useState } from "react";

type InstallerContext = {
  installing: Set<string>;
  start: (pipName: string) => void;
  finish: (pipName: string) => void;
};

const INSTALL_LS_KEY = "installing-plugins";

const InstallerContext = createContext<InstallerContext | null>(null);

export function InstallingProvider({ children }: { children: React.ReactNode }) {
  const [installingSet, setInstallingSet] = useState<Set<string>>(new Set());

  // At mount, loading LS
  useEffect(() => {
    const raw = localStorage.getItem(INSTALL_LS_KEY);
    if (raw) {
      try {
        const arr = JSON.parse(raw) as string[];
        setInstallingSet(new Set(arr));
      } catch {}
    }
  }, []);

  // When change installingSet, syncronicing with LS
  useEffect(() => {
    localStorage.setItem(
      INSTALL_LS_KEY,
      JSON.stringify(Array.from(installingSet))
    );
  }, [installingSet]);

  const start = (pipName: string) =>
    setInstallingSet((s) => new Set(s).add(pipName));
  const finish = (pipName: string) =>
    setInstallingSet((s) => {
      const copy = new Set(s);
      copy.delete(pipName);
      return copy;
    });

  return (
    <InstallerContext.Provider
      value={{ installing: installingSet, start, finish }}
    >
      {children}
    </InstallerContext.Provider>
  );
}

export function useInstallingPlugins() {
  const ctx = useContext(InstallerContext);
  if (!ctx) throw new Error("useInstallingPlugins must be under Provider");
  return ctx;
}
