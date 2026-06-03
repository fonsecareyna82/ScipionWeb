import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, FolderPlus, Loader2, RefreshCw } from "lucide-react";

import {
  fetchDevelPluginBrowserPaths,
  installDevelPlugin,
  listDevelPluginBrowserDirectory,
  validateDevelPluginPath,
  type DevelPluginValidation,
} from "@/api/plugins";
import RemoteFileDialog, { type RemoteEntry } from "@/components/files/RemoteFileDialog";
import { useProcessingPlugins } from "@/hooks/useProcessingPlugins";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

type InstallDevelPluginDialogProps = {
  open: boolean;
  onClose: () => void;
  onTaskStarted?: (taskId: string, pipName: string) => void;
};

function ValidationRow(props: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
      {props.ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
      ) : (
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
      )}
      <span>{props.label}</span>
    </div>
  );
}

export default function InstallDevelPluginDialog({
  open,
  onClose,
  onTaskStarted,
}: InstallDevelPluginDialogProps) {
  const [pluginPath, setPluginPath] = useState("");
  const [skipBinaries, setSkipBinaries] = useState(false);
  const [force, setForce] = useState(false);
  const [validation, setValidation] = useState<DevelPluginValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { registerTask } = useProcessingPlugins();

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  useEffect(() => {
    if (open) return;
    setBrowserOpen(false);
  }, [open]);

  useEffect(() => {
    setValidation(null);
    setError(null);
  }, [pluginPath]);

  const canInstall = Boolean(validation?.valid) && !validating && !installing;

  const listPluginBrowserDirectory = async (relPath: string): Promise<RemoteEntry[]> => {
    return listDevelPluginBrowserDirectory(relPath);
  };

  const runValidationForPath = async (pathValue: string) => {
    const path = pathValue.trim();
    if (!path) {
      setValidation(null);
      setError("Plugin path is required");
      return null;
    }

    setValidating(true);
    setError(null);

    try {
      const result = await validateDevelPluginPath(path);
      setValidation(result);
      if (!result.valid) {
        setError(result.message || "Invalid devel plugin path");
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error validating devel plugin path";
      setValidation(null);
      setError(message);
      return null;
    } finally {
      setValidating(false);
    }
  };

  const runValidation = async () => runValidationForPath(pluginPath);

  const handlePickPluginPath = (pickedPath: string, entry: RemoteEntry) => {
    const nextPath = (entry.absPath || pickedPath || "").trim();
    if (!nextPath) return;

    setPluginPath(nextPath);
    setBrowserOpen(false);
    void runValidationForPath(nextPath);
  };

  const handleInstall = async () => {
    setError(null);

    const currentValidation = validation?.valid ? validation : await runValidation();
    if (!currentValidation?.valid) return;

    setInstalling(true);

    try {
      const started = await installDevelPlugin({
        path: currentValidation.path,
        skipBinaries,
        force,
      });

      const pipName = currentValidation.pipName || currentValidation.path;

      registerTask({
        taskId: started.taskId,
        pipName,
        pluginName: currentValidation.pipName || "Local devel plugin",
        operation: "install-devel",
        initialStatus: started.status,
      });

      onTaskStarted?.(started.taskId, pipName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error installing devel plugin");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-950 dark:text-white">
              <FolderPlus className="h-5 w-5" />
              Install plugin in devel mode
            </DialogTitle>
            <DialogDescription>
              Install a local Scipion plugin source directory using Scipion editable/devel mode.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                Plugin path
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  value={pluginPath}
                  onChange={(event) => setPluginPath(event.target.value)}
                  placeholder="Select a local plugin folder or paste its absolute path"
                  className={classNames(
                    "min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm font-medium outline-none transition",
                    "border-gray-300 bg-white text-gray-900 placeholder:text-gray-400",
                    "focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/15",
                    "dark:border-gray-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-gray-500",
                  )}
                  disabled={installing}
                />

                <button
                  type="button"
                  onClick={() => setBrowserOpen(true)}
                  disabled={installing}
                  className={classNames(
                    "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition",
                    "border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm hover:border-indigo-400 hover:shadow-md",
                    "dark:border-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:border-indigo-700",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </button>

                <button
                  type="button"
                  onClick={runValidation}
                  disabled={validating || installing || !pluginPath.trim()}
                  className={classNames(
                    "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition",
                    "border-gray-300 bg-white text-gray-800 shadow-sm hover:border-gray-400 hover:shadow-md",
                    "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:border-gray-600",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Validate
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-300/80 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-slate-950/60 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200/80 bg-white p-3 text-sm dark:border-gray-800 dark:bg-slate-900">
                <input
                  type="checkbox"
                  checked={skipBinaries}
                  onChange={(event) => setSkipBinaries(event.target.checked)}
                  className="mt-1"
                  disabled={installing}
                />
                <span>
                  <span className="block font-semibold text-gray-900 dark:text-white">Skip binaries</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-600 dark:text-gray-400">
                    Request Python-package-only install when the backend supports it.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200/80 bg-white p-3 text-sm dark:border-gray-800 dark:bg-slate-900">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(event) => setForce(event.target.checked)}
                  className="mt-1"
                  disabled={installing}
                />
                <span>
                  <span className="block font-semibold text-gray-900 dark:text-white">Force reinstall</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-600 dark:text-gray-400">
                    Request a reinstall when the backend supports a force argument.
                  </span>
                </span>
              </label>
            </div>

            {validation ? (
              <div
                className={classNames(
                  "rounded-2xl border p-4",
                  validation.valid
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
                    : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100",
                )}
              >
                <div className="flex items-start gap-3">
                  {validation.valid ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : <AlertCircle className="mt-0.5 h-5 w-5" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{validation.message}</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <ValidationRow ok={Boolean(validation.exists)} label="Folder exists" />
                      <ValidationRow ok={Boolean(validation.isDirectory)} label="Is a directory" />
                      <ValidationRow ok={Boolean(validation.allowed)} label="Path is allowed" />
                      <ValidationRow ok={Boolean(validation.hasInstallMetadata)} label="Install metadata found" />
                    </div>

                    {validation.pipName ? (
                      <div className="mt-3 rounded-xl border border-white/60 bg-white/60 px-3 py-2 text-xs font-semibold text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-white">
                        Candidate pip name: {validation.pipName}
                      </div>
                    ) : null}

                    {validation.allowedRoots && validation.allowedRoots.length > 0 ? (
                      <div className="mt-3 text-xs leading-5 opacity-80">
                        Allowed roots: {validation.allowedRoots.join(", ")}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={installing}
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:border-gray-400 hover:shadow-md disabled:opacity-60 dark:border-gray-700 dark:bg-slate-900 dark:text-white"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleInstall}
              disabled={!canInstall}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-[0.98] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              Install in devel mode
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RemoteFileDialog
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        title="Select local plugin folder"
        confirmLabel="Use selected path"
        resolveBrowserPaths={fetchDevelPluginBrowserPaths}
        listRemoteDirectory={listPluginBrowserDirectory}
        onPick={handlePickPluginPath}
      />
    </>
  );
}
