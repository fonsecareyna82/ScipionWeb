import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, RefreshCw } from "lucide-react";

import { fetchPlugin, type Plugin, installPlugin, uninstallPlugin } from "@/api/plugins";
import { AngleLeftIcon, FolderIcon, GroupIcon, HelpIcon, HomeIcon, ExecuteIcon } from "@/icons";
import { useProcessingPlugins } from "@/hooks/useProcessingPlugins";

type LocationState = { plugin?: Plugin };

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

function CardShell(props: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={classNames(
        "relative overflow-hidden rounded-2xl border p-5 shadow-sm backdrop-blur",
        "border-gray-200/70 bg-white/80",
        "dark:border-gray-800/80 dark:bg-white/[0.03]",
        "lg:p-6",
      )}
    >
      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{props.title}</h3>
            {props.subtitle ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{props.subtitle}</p>
            ) : null}
          </div>
          {props.right ? <div className="shrink-0">{props.right}</div> : null}
        </div>
        {props.children}
      </div>
    </div>
  );
}

function InfoCard(props: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white/70 p-4 shadow-sm dark:border-gray-800/80 dark:bg-white/[0.02]">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:ring-gray-800">
          {props.icon}
        </div>
        <div className="text-sm font-semibold text-gray-800 dark:text-white/90">{props.title}</div>
      </div>
      <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">{props.children}</div>
    </div>
  );
}

function StatPill(props: { label: string; value: ReactNode }) {
  return (
    <div
      className={classNames(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
        "border-gray-200/70 bg-white/70 text-gray-700",
        "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-200",
      )}
    >
      <span className="text-gray-600 dark:text-gray-300">{props.label}</span>
      <span>{props.value}</span>
    </div>
  );
}

function PrimaryButton(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={classNames(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
        "text-white shadow-sm",
        "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600",
        "hover:brightness-[0.98] hover:shadow-md",
        "disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

function SecondaryButton(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={classNames(
        "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition",
        "border-gray-200/70 bg-white/70 text-gray-800 shadow-sm hover:border-gray-300/80 hover:shadow-md",
        "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white/90 dark:hover:border-gray-700",
        "disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

export default function PluginPage() {
  const { pipName } = useParams<{ pipName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? null;

  const [plugin, setPlugin] = useState<Plugin | null>(state?.plugin ?? null);
  const [loading, setLoading] = useState<boolean>(!state?.plugin);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  const {
    tasks,
    installing,
    removing,
    startInstall,
    finishInstall,
    startRemove,
    finishRemove,
    registerTask,
    waitForTask,
  } = useProcessingPlugins();

  const currentTask = useMemo(() => tasks.find((t) => t.pipName === pipName), [tasks, pipName]);
  const currentStep = currentTask?.step;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pipName) return;

    setError(null);
    setSuccess(null);

    if (!state?.plugin) {
      setLoading(true);
    }

    fetchPlugin(pipName)
      .then((p) => {
        if (!isMountedRef.current) return;
        setPlugin(p);
      })
      .catch((err) => {
        console.error(err);
        if (!isMountedRef.current) return;
        setError("Error loading plugin details");
      })
      .finally(() => {
        if (!isMountedRef.current) return;
        setLoading(false);
      });
  }, [pipName, state?.plugin]);

  const isInstalling = useMemo(() => (pipName ? installing.has(pipName) : false), [installing, pipName]);
  const isRemoving = useMemo(() => (pipName ? removing.has(pipName) : false), [removing, pipName]);

  const isUpdateAvailable = Boolean(plugin?.installed && plugin?.toUpdate);

  async function refreshPlugin() {
    if (!pipName) return;
    const updated = await fetchPlugin(pipName);
    if (!isMountedRef.current) return;
    setPlugin(updated);
  }

  const handleInstallOrUpdate = async () => {
    if (!pipName) return;

    const wasUpdate = Boolean(plugin?.installed && plugin?.toUpdate);

    setError(null);
    setSuccess(null);

    startInstall(pipName);

    try {
      const started = await installPlugin(pipName);

      registerTask({
        taskId: started.taskId,
        pipName,
        pluginName: plugin?.name,
        operation: "install",
        initialStatus: started.status,
      });

      const finalTask = await waitForTask(started.taskId);

      if (finalTask.status === "FAILURE") {
        const msg =
          typeof finalTask.error === "string" && finalTask.error.trim().length > 0
            ? finalTask.error
            : "Plugin operation failed";
        throw new Error(msg);
      }

      await refreshPlugin();
      if (!isMountedRef.current) return;
      setSuccess(wasUpdate ? "Plugin updated successfully" : "Plugin installed successfully");
    } catch (err) {
      console.error(err);
      finishInstall(pipName);

      if (!isMountedRef.current) return;
      setError("Error installing/updating the plugin");
    }
  };

  const handleRemove = async () => {
    if (!pipName) return;

    setError(null);
    setSuccess(null);

    startRemove(pipName);

    try {
      const started = await uninstallPlugin(pipName);

      registerTask({
        taskId: started.taskId,
        pipName,
        pluginName: plugin?.name,
        operation: "uninstall",
        initialStatus: started.status,
      });

      const finalTask = await waitForTask(started.taskId);

      if (finalTask.status === "FAILURE") {
        const msg =
          typeof finalTask.error === "string" && finalTask.error.trim().length > 0
            ? finalTask.error
            : "Plugin operation failed";
        throw new Error(msg);
      }

      await refreshPlugin();
      if (!isMountedRef.current) return;
      setSuccess("Plugin removed successfully");
    } catch (err) {
      console.error(err);
      finishRemove(pipName);

      if (!isMountedRef.current) return;
      setError("Error uninstalling the plugin");
    }
  };

  const publishedDate = (() => {
    const uploadTime = plugin?.compatibleReleases?.[plugin.latestRelease]?.upload_time;
    if (!uploadTime) return "N/A";
    return uploadTime.split("T")[0];
  })();

  if (loading || !plugin) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <CardShell title="Plugin" subtitle="Loading plugin details...">
          <div className="flex min-h-[240px] items-center justify-center">
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="h-8 w-8 rounded-full border-2 border-gray-300 dark:border-gray-700" />
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-gray-700 dark:border-t-gray-200" />
              </div>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Loading plugin...</p>
            </div>
          </div>
        </CardShell>
      </div>
    );
  }

  return (
    <motion.div
      className="mx-auto max-w-6xl space-y-6 px-4 py-6"
      initial={{ y: "100vh", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100vh", opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="flex items-center gap-3">
        <SecondaryButton onClick={() => navigate(-1)} className="h-11 w-11 px-0" title="Go back">
          <AngleLeftIcon className="h-5 w-5" />
        </SecondaryButton>
      </div>

      <CardShell
        title={plugin.name}
        subtitle={`Latest release: v${plugin.latestRelease}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <SecondaryButton onClick={() => void refreshPlugin()} title="Refresh plugin details">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </SecondaryButton>

            <PrimaryButton
              onClick={handleInstallOrUpdate}
              disabled={isInstalling || (plugin.installed && !isUpdateAvailable)}
              title={isUpdateAvailable ? "Update plugin" : "Install plugin"}
            >
              {isInstalling ? (
                <>
                  <ExecuteIcon className="h-4 w-4 animate-spin" />
                  {isUpdateAvailable ? "Updating…" : "Installing…"}
                </>
              ) : plugin.installed ? (
                isUpdateAvailable ? (
                  <>
                    Update
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  "Installed"
                )
              ) : (
                <>
                  Install
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </PrimaryButton>

            <SecondaryButton
              onClick={handleRemove}
              disabled={isRemoving || !plugin.installed}
              title="Remove plugin"
              className={classNames(
                plugin.installed
                  ? "border-red-200/80 text-red-700 hover:border-red-300 dark:border-red-900/50 dark:text-red-300"
                  : "",
              )}
            >
              {isRemoving ? (
                <>
                  <ExecuteIcon className="h-4 w-4 animate-spin" />
                  Removing…
                </>
              ) : (
                "Remove"
              )}
            </SecondaryButton>
          </div>
        }
      >
        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="flex shrink-0 justify-center xl:block">
            {plugin.fullLogo ? (
              <img
                src={plugin.fullLogo}
                alt={`${plugin.name} logo`}
                className="h-40 w-40 rounded-2xl border border-gray-200/70 bg-white object-contain p-3 shadow-sm dark:border-gray-800/80 dark:bg-white/[0.03]"
              />
            ) : (
              <div className="h-40 w-40 rounded-2xl border border-gray-200/70 bg-gray-100 shadow-sm dark:border-gray-800/80 dark:bg-white/[0.03]" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatPill label="Installed" value={plugin.installed ? `v${plugin.pipVersion ?? "-"}` : "No"} />
              <StatPill label="Latest" value={`v${plugin.latestRelease}`} />
              <StatPill label="Published" value={publishedDate} />
              
            </div>

            {currentTask ? (
              <div className="mt-4 rounded-xl border border-gray-200/70 bg-white/70 p-4 text-sm text-gray-700 dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-300">
                <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white/90">
                  <ExecuteIcon className="h-4 w-4 animate-spin" />
                  Active task: {currentTask.operation === "install" ? "Install/Update" : "Uninstall"}
                </div>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Status: {currentTask.status}</div>
                {currentStep ? (
                  <div className="mt-1 break-all text-xs text-gray-600 dark:text-gray-300">{currentStep}</div>
                ) : null}
                {currentTask.error ? (
                  <div className="mt-2 break-all text-xs text-red-600 dark:text-red-300">{currentTask.error}</div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200/70 bg-red-50/80 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mt-4 rounded-xl border border-green-200/70 bg-green-50/80 p-4 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
                {success}
              </div>
            ) : null}

            <div className="mt-5 rounded-xl border border-gray-200/70 bg-white/70 p-4 shadow-sm dark:border-gray-800/80 dark:bg-white/[0.02]">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">Summary</div>
              <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">{plugin.summary ?? "General"}</div>
            </div>
          </div>
        </div>
      </CardShell>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          icon={<FolderIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />}
          title="Pip name"
        >
          <div className="break-all font-medium text-gray-800 dark:text-white/90">{plugin.pipName}</div>
        </InfoCard>

        <InfoCard
          icon={<GroupIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />}
          title="Author"
        >
          {plugin.author ? (
            <div className="flex flex-wrap gap-2">
              {plugin.author.split(",").map((name, index) => (
                <span
                  key={index}
                  className="inline-block max-w-full truncate rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800 dark:bg-white/[0.06] dark:text-white"
                  title={name.trim()}
                >
                  {name.trim()}
                </span>
              ))}
            </div>
          ) : (
            "Unknown"
          )}
        </InfoCard>

        <InfoCard
          icon={<HelpIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />}
          title="Summary"
        >
          {plugin.summary ?? "General"}
        </InfoCard>

        <InfoCard
          icon={<HomeIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />}
          title="Home page"
        >
          {plugin.homePage ? (
            <a
              href={plugin.homePage}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words text-gray-800 underline dark:text-white/90"
            >
              {plugin.homePage}
            </a>
          ) : (
            "N/A"
          )}
        </InfoCard>
      </div>
    </motion.div>
  );
}