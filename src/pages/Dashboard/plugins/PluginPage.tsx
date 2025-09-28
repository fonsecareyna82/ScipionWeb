import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchPluginById, Plugin, installPlugin, uninstallPlugin } from "@/api/plugins";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { AngleLeftIcon, FolderIcon, GroupIcon, HelpIcon, HomeIcon, ExecuteIcon } from "@/icons";
import { useProcessingPlugins } from "@/hooks/useProcessingPlugins";

export default function PluginPage() {
    const { pipName } = useParams<{ pipName: string }>();
    const [plugin, setPlugin] = useState<Plugin | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success] = useState<string | null>(null);
    const navigate = useNavigate();
    const {
        installing,
        removing,
        startInstall,
        finishInstall,
        startRemove,
        finishRemove,
    } = useProcessingPlugins();

    useEffect(() => {
        if (pipName) {
            fetchPluginById(pipName).then(setPlugin);
        }
    }, [pipName]);

    if (!plugin) return <p className="text-center py-10">Loading plugin...</p>;

    // --- button logic ---
    const isInstalled = plugin.installed;
    const installedVersion = plugin.pipVersion;
    const releasedVersion = plugin.latestRelease;

    function isVersionGreater(v1: string, v2: string) {
        const a = v1.split(".").map(Number);
        const b = v2.split(".").map(Number);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const numA = a[i] || 0;
            const numB = b[i] || 0;
            if (numA > numB) return true;
            if (numA < numB) return false;
        }
        return false;
    }

    const isUpdateAvailable =
        isInstalled && isVersionGreater(releasedVersion, installedVersion);

    const isInstalling = pipName ? installing.has(pipName) : false;
    const isRemoving = pipName ? removing.has(pipName) : false;


    async function waitForCondition(
        pipName: string,
        condition: (p: Plugin) => boolean,
        interval = 2000,
        timeoutMs?: number
    ): Promise<Plugin> {
        const start = Date.now();

        while (true) {
            const fresh = await fetchPluginById(pipName);
            if (condition(fresh)) {
                return fresh;
            }
            if (timeoutMs != null && Date.now() - start > timeoutMs) {
                throw new Error("Timeout waiting for plugin state change");
            }
            await new Promise((res) => setTimeout(res, interval));
        }
    }

    // Polling helper: call fetchPluginById while installed===true
    function waitForInstalled(
        pipName: string,
        interval = 2000,
        timeoutMs?: number
    ): Promise<Plugin> {
        return waitForCondition(
            pipName,
            (p) => p.installed === true,
            interval,
            timeoutMs
        );
    }

    // Polling helper: call fetchPluginById while installed===false
    function waitForRemoved(
        pipName: string,
        interval = 2000,
        timeoutMs?: number
    ): Promise<Plugin> {
        return waitForCondition(
            pipName,
            (p) => p.installed === false,
            interval,
            timeoutMs
        );
    }

    // --- handle Install with pip ---
    const handleInstall = () => {
        if (!pipName) return;
        setError(null);
        startInstall(pipName);

        installPlugin(pipName)
            .then(() => waitForInstalled(pipName, 5000, 25 * 60000))
            .then((updated) => setPlugin(updated))
            .catch((err) => {
                console.error(err);
                setError("Error installing the plugin");
            })
            .finally(() => {
                finishInstall(pipName);
            });
    };


    // --- handle Install with pip ---
    const handleRemove = () => {
        if (!pipName) return;
        setError(null);
        startRemove(pipName);

        uninstallPlugin(pipName)
            .then(() => waitForRemoved(pipName, 5000, 25 * 60000))
            .then((updated) => setPlugin(updated))
            .catch((err) => {
                console.error(err);
                setError("Error uninstalling the plugin");
            })
            .finally(() => {
                finishRemove(pipName);
            });
    };

    // --- handle Install with Celery polling ---
    /*const handleInstall = async () => {
        if (!pipName) return;
        setInstalling(true);
        try {
            const { task_id } = await installPlugin(pipName);
            let taskFinished = false;
            while (!taskFinished) {
                await new Promise((resolve) => setTimeout(resolve, 2000)); // espera 2s
                const res = await fetch(`${BASE_URL}/plugins/tasks/${task_id}`);
                const data = await res.json();

                if (data.status === "SUCCESS") {
                    taskFinished = true;
                    console.log("Install finished:", data.result);
                } else if (data.status === "FAILURE") {
                    taskFinished = true;
                    console.error("Install failed:", data.result);
                }
            }

            const updated = await fetchPluginById(pipName);
            setPlugin(updated);
        } catch (err) {
            console.error("Error installing plugin:", err);
        } finally {
            setInstalling(false);
        }
    };*/

    return (
        <motion.div
            className="max-w-5xl mx-auto p-6 space-y-8 relative"
            initial={{ y: "100vh", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100vh", opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
        >
            {/* Back button */}
            <Button
                variant="default"
                size="icon"
                onClick={() => navigate(-1)}
                className="absolute h-12 w-12 top-1 left-1 rounded-full bg-gray-100 hover:bg-gray-400 "
            >
                <AngleLeftIcon className="h-12 w-12" />
            </Button>

            {/* Hero */}
            <div className="flex flex-wrap items-center gap-8 mt-10">
                {/* Logo */}
                <div className="flex-shrink-0">
                    <img
                        src={plugin.fullLogo}
                        alt={`${plugin.name} logo`}
                        className="w-40 h-40 object-contain rounded-xl bg-white shadow-md"
                    />
                </div>

                {/* Info + Actions */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight">
                        {plugin.name}
                    </h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Latest release: <span className="font-medium">v{plugin.latestRelease}</span>
                    </p>

                    {/* Actions */}
                    <div className="mt-4 flex flex-wrap gap-3">
                        {/* Install Button */}
                        <Button
                            onClick={handleInstall}
                            disabled={isInstalling || plugin.installed}
                            className={`flex items-center gap-2 text-white px-4 py-2 rounded-md transition
          ${plugin.installed
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : "bg-green-700 hover:bg-green-600"}
        `}
                        >
                            {isInstalling ? (
                                <>
                                    <ExecuteIcon className="h-4 w-4 animate-spin" />
                                    Installing…
                                </>
                            ) : plugin.installed ? (
                                "Installed"
                            ) : (
                                "Install"
                            )}
                        </Button>

                        {/* Update Button */}
                        <Button
                            disabled={!isUpdateAvailable}
                            className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-md transition"
                        >
                            Update
                        </Button>

                        {/* Remove Button */}
                        <Button
                            onClick={handleRemove}
                            disabled={isRemoving || !plugin.installed}
                            className={`flex items-center gap-2 text-white px-4 py-2 rounded-md transition
          ${!plugin.installed
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : "bg-red-700 hover:bg-red-600"}
        `}
                        >
                            {isRemoving ? (
                                <>
                                    <ExecuteIcon className="h-4 w-4 animate-spin" />
                                    Removing…
                                </>
                            ) : !plugin.installed ? (
                                "Removed"
                            ) : (
                                "Remove"
                            )}
                        </Button>
                    </div>

                    {/* Feedback messages */}
                    {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
                    {success && <p className="text-sm text-green-600 mt-3">{success}</p>}
                </div>
            </div>

            {/* Separator */}
            <div className="my-1 border-t border-gray-300 dark:border-gray-700 mb-5" />
            {/* Info */}
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                {/* Installed version */}
                <div className="flex items-center gap-2">
                    <span className="font-medium">Installed:</span>
                    <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white 
        ${isInstalled ? "bg-green-500" : "bg-red-800"}`}
                    >
                        {isInstalled ? `v${installedVersion}` : "Not installed"}
                    </span>
                </div>

                {/* Latest release */}
                <div>
                    <span className="font-medium">Latest release:</span>{" "}
                    <span className="text-gray-700 dark:text-gray-300">v{plugin.latestRelease}</span>
                </div>

                {/* Published date */}
                <div>
                    <span className="font-medium">Published:</span>{" "}
                    <span className="text-gray-700 dark:text-gray-300">
                        {plugin.compatibleReleases[plugin.latestRelease]["upload_time"].split("T")[0]}
                    </span>
                </div>
            </div>
            {/* Separator */}
            <div className="my-1 border-t border-gray-300 dark:border-gray-700 mb-5" />
            {/* Info cards */}
            <div className="grid md:grid-cols-3 gap-6">
                {/* Card: Pip Name */}
                <Card className="rounded-xl bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-800 dark:via-gray-700 dark:to-gray-900 shadow-sm">
                    <CardHeader className="flex items-center gap-3 px-4 pt-4">
                        <FolderIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                        <span className="text-base font-semibold text-gray-800 dark:text-white">Pip name</span>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 text-sm text-gray-700 dark:text-gray-300">
                        {plugin.pipName}
                    </CardContent>
                </Card>

                {/* Card: Author */}
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

                {/* Card: Summary */}
                <Card className="rounded-xl bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-800 dark:via-gray-700 dark:to-gray-900 shadow-sm">
                    <CardHeader className="flex items-center gap-3 px-4 pt-4">
                        <HelpIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                        <span className="text-base font-semibold text-gray-800 dark:text-white">Summary</span>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 text-sm text-gray-700 dark:text-gray-300">
                        {plugin.summary ?? "General"}
                    </CardContent>
                </Card>

                {/* Card: Home Page */}
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
