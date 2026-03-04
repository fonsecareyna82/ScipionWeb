import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { fetchPlugin, type Plugin, installPlugin, uninstallPlugin } from "@/api/plugins";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { AngleLeftIcon, FolderIcon, GroupIcon, HelpIcon, HomeIcon, ExecuteIcon } from "@/icons";
import { useProcessingPlugins } from "@/hooks/useProcessingPlugins";

type LocationState = { plugin?: Plugin };

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

    const { tasks, installing, removing, startInstall, finishInstall, startRemove, finishRemove, registerTask, waitForTask } =
        useProcessingPlugins();

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
    }, [pipName]);

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

        // Immediate UI feedback (survives navigation because provider persists it)
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
                const msg = typeof finalTask.error === "string" && finalTask.error.trim().length > 0
                    ? finalTask.error
                    : "Plugin operation failed";
                throw new Error(msg);
            }

            await refreshPlugin();
            if (!isMountedRef.current) return;
            setSuccess(wasUpdate ? "Plugin updated successfully" : "Plugin installed successfully");
        } catch (err) {
            console.error(err);

            // If we failed before the task was registered/polled, avoid leaving stale state
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
                const msg = typeof finalTask.error === "string" && finalTask.error.trim().length > 0
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

    if (loading || !plugin) {
        return <p className="text-center py-10">Loading plugin...</p>;
    }

    const publishedDate = (() => {
        const uploadTime = plugin.compatibleReleases?.[plugin.latestRelease]?.upload_time;
        if (!uploadTime) return "N/A";
        return uploadTime.split("T")[0];
    })();

    return (
        <motion.div
            className="max-w-5xl mx-auto p-6 space-y-8 relative"
            initial={{ y: "100vh", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100vh", opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
        >
            <Button
                variant="default"
                size="icon"
                onClick={() => navigate(-1)}
                className="absolute h-12 w-12 top-1 left-1 rounded-full bg-gray-100 hover:bg-gray-400"
            >
                <AngleLeftIcon className="h-12 w-12" />
            </Button>

            <div className="flex flex-wrap items-center gap-8 mt-10">
                <div className="flex-shrink-0">
                    {plugin.fullLogo ? (
                        <img
                            src={plugin.fullLogo}
                            alt={`${plugin.name} logo`}
                            className="w-40 h-40 object-contain rounded-xl bg-white shadow-md"
                        />
                    ) : (
                        <div className="w-40 h-40 rounded-xl bg-gray-200 dark:bg-gray-700" />
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight">{plugin.name}</h1>

                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Latest release: <span className="font-medium">v{plugin.latestRelease}</span>
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                            onClick={handleInstallOrUpdate}
                            disabled={isInstalling || (plugin.installed && !isUpdateAvailable)}
                            className={[
                                "flex items-center gap-2 text-white px-4 py-2 rounded-md transition",
                                plugin.installed && !isUpdateAvailable
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : isUpdateAvailable
                                        ? "bg-yellow-700 hover:bg-yellow-600"
                                        : "bg-green-700 hover:bg-green-600",
                            ].join(" ")}
                        >
                            {isInstalling ? (
                                <>
                                    <ExecuteIcon className="h-4 w-4 animate-spin" />
                                    {isUpdateAvailable ? "Updating…" : "Installing…"}
                                    {currentStep ? `(${currentStep})` : ""}
                                </>
                            ) : plugin.installed ? (
                                isUpdateAvailable ? "Update" : "Installed"
                            ) : (
                                "Install"
                            )}
                        </Button>

                        <Button
                            onClick={handleRemove}
                            disabled={isRemoving || !plugin.installed}
                            className={[
                                "flex items-center gap-2 text-white px-4 py-2 rounded-md transition",
                                !plugin.installed ? "bg-gray-400 cursor-not-allowed" : "bg-red-700 hover:bg-red-600",
                            ].join(" ")}
                        >
                            {isRemoving ? (
                                <>
                                    <ExecuteIcon className="h-4 w-4 animate-spin" />
                                    Removing…
                                </>
                            ) : (
                                "Remove"
                            )}
                        </Button>
                    </div>

                    {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
                    {success && <p className="text-sm text-green-600 mt-3">{success}</p>}
                </div>
            </div>

            <div className="my-1 border-t border-gray-300 dark:border-gray-700 mb-5" />

            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-2">
                    <span className="font-medium">Installed:</span>
                    <span
                        className={[
                            "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white",
                            plugin.installed ? "bg-green-500" : "bg-red-800",
                        ].join(" ")}
                    >
                        {plugin.installed ? `v${plugin.pipVersion ?? "-"}` : "Not installed"}
                    </span>
                </div>

                <div>
                    <span className="font-medium">Latest release:</span>{" "}
                    <span className="text-gray-700 dark:text-gray-300">v{plugin.latestRelease}</span>
                </div>

                <div>
                    <span className="font-medium">Published:</span>{" "}
                    <span className="text-gray-700 dark:text-gray-300">{publishedDate}</span>
                </div>
            </div>

            <div className="my-1 border-t border-gray-300 dark:border-gray-700 mb-5" />

            <div className="grid md:grid-cols-3 gap-6">
                <Card className="rounded-xl bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-800 dark:via-gray-700 dark:to-gray-900 shadow-sm">
                    <CardHeader className="flex items-center gap-3 px-4 pt-4">
                        <FolderIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                        <span className="text-base font-semibold text-gray-800 dark:text-white">Pip name</span>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 text-sm text-gray-700 dark:text-gray-300">{plugin.pipName}</CardContent>
                </Card>

                <Card className="rounded-xl bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-800 dark:via-gray-700 dark:to-gray-900 shadow-sm">
                    <CardHeader className="flex items-center gap-3 px-4 pt-4">
                        <GroupIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                        <span className="text-base font-semibold text-gray-800 dark:text-white">Author</span>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 text-sm text-gray-700 dark:text-gray-300">
                        {plugin.author ? (
                            <div className="flex flex-wrap gap-2">
                                {plugin.author.split(",").map((name, index) => (
                                    <span
                                        key={index}
                                        className="inline-block max-w-full truncate bg-white/80 dark:bg-white/10 text-gray-800 dark:text-white px-3 py-1 rounded-full text-xs font-medium shadow-sm"
                                        title={name.trim()}
                                    >
                                        {name.trim()}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            "Unknown"
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-xl bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-800 dark:via-gray-700 dark:to-gray-900 shadow-sm">
                    <CardHeader className="flex items-center gap-3 px-4 pt-4">
                        <HelpIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                        <span className="text-base font-semibold text-gray-800 dark:text-white">Summary</span>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 text-sm text-gray-700 dark:text-gray-300">
                        {plugin.summary ?? "General"}
                    </CardContent>
                </Card>

                <Card className="rounded-xl bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-800 dark:via-gray-700 dark:to-gray-900 shadow-sm">
                    <CardHeader className="flex items-center gap-3 px-4 pt-4">
                        <HomeIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                        <span className="text-base font-semibold text-gray-800 dark:text-white">Home page</span>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 text-sm text-gray-700 dark:text-gray-300">
                        {plugin.homePage ? (
                            <a
                                href={plugin.homePage}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 underline break-words"
                            >
                                {plugin.homePage}
                            </a>
                        ) : (
                            "N/A"
                        )}
                    </CardContent>
                </Card>
            </div>
        </motion.div>
    );
}