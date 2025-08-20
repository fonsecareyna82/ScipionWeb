import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchPluginById, Plugin, installPlugin, checkTaskStatus, uninstallPlugin } from "@/api/plugins";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { AngleLeftIcon, FolderIcon, GroupIcon, HelpIcon, HomeIcon, ExecuteIcon } from "@/icons";
import { useProcessingPlugins } from "@/hooks/useProcessingPlugins";

export default function PluginPage() {
    const { pipName } = useParams<{ pipName: string }>();
    const [plugin, setPlugin] = useState<Plugin | null>(null);
    const [uninstalling, setUnstalling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
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
    const installedVersion = plugin.latestRelease;
    const releasedVersion = plugin.pipVersion;

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

    // Polling helper: vuelve a llamar a fetchPluginById hasta que installed===true
    async function waitForInstalled(
        pipName: string,
        interval = 1500,
        retries = 10
    ): Promise<Plugin> {
        for (let i = 0; i < retries; i++) {
            const fresh = await fetchPluginById(pipName);
            if (fresh.installed) {
                return fresh;
            }
            await new Promise((r) => setTimeout(r, interval));
        }
        throw new Error("Timeout waiting for the installation");
    }

    async function waitForRemoved(
        pip: string,
        interval = 1500,
        retries = 10
    ): Promise<Plugin> {
        for (let i = 0; i < retries; i++) {
            const fresh = await fetchPluginById(pip);
            if (!fresh.installed) return fresh;
            await new Promise((r) => setTimeout(r, interval));
        }
        throw new Error("Timeout esperando la desinstalación");
    }

    // --- handle Install with pip ---
    const handleInstall = () => {
        if (!pipName) return;
        setError(null);
        startInstall(pipName);

        installPlugin(pipName)
            .then(() => waitForInstalled(pipName))
            .then((updated) => setPlugin(updated))
            .catch((err) => {
                console.error(err);
                setError("Error instalando el plugin");
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
            .then(() => waitForRemoved(pipName))
            .then((updated) => setPlugin(updated))
            .catch((err) => {
                console.error(err);
                setError("Error desinstalando el plugin");
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
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="absolute h-12 w-12 top-4 left-1 rounded-full bg-gray-100"
            >
                <AngleLeftIcon className="h-12 w-12" />
            </Button>

            {/* Hero */}
            <div className="flex items-center gap-6 mt-10">
                <img
                    src={plugin.fullLogo}
                    alt={`${plugin.name} logo`}
                    className="w-30 h-30 object-contain rounded-xl bg-white mr-8"
                />
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                        {plugin.name}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        v{plugin.latestRelease}
                    </p>
                    <div className="mt-4 flex gap-3">
                        <Button
                            onClick={handleInstall}
                            disabled={isInstalling || plugin.installed}
                            className={`${plugin.installed
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-green-700 hover:bg-green-600"
                                } text-white flex items-center gap-2`}
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
                        <Button disabled={!isUpdateAvailable} className="bg-yellow-700 hover:bg-yellow-600 text-white">
                            Update
                        </Button>
                        <Button
                            onClick={handleRemove}
                            disabled={isRemoving || !plugin.installed}
                            className={`${!plugin.installed
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : "bg-red-700 hover:bg-red-600"
                                } text-white flex items-center gap-2`}
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

                    {error && <p className="text-red-500 mt-2">{error}</p>}
                    {success && <p className="text-green-500 mt-2">{success}</p>}
                </div>
            </div>
            {/* Separator */}
            <div className="my-1 border-t border-gray-200 dark:border-gray-700 mb-5" />
            {/* Info */}
            <p className="text-gray-500 dark:text-gray-400">
                Installed:{" "}
                <span
                    className={`mb-2 inline-flex items-center justify-center px-3 py-1 rounded-full text-white  ${isInstalled ? "bg-green-500" : "bg-red-800"
                        }`}
                >
                    {isInstalled ? `v${installedVersion}` : "Not installed"}
                </span>
                <br />
                Latest release: v{plugin.latestRelease}
                <br />
                Published: {plugin.compatibleReleases[plugin.latestRelease]['upload_time'].split('T')[0]}
            </p>
            {/* Separator */}
            <div className="my-1 border-t border-gray-200 dark:border-gray-700 mb-5" />
            {/* Info cards */}
            <div className="grid md:grid-cols-3 gap-6">
                <Card className="bg-gray-200 dark:bg-gray-800">
                    <CardHeader className="flex items-center space-x-2">
                        <FolderIcon className="h-5 w-5" />
                        <span className="text-xl">Pip name</span>
                    </CardHeader>
                    <CardContent>{plugin.pipName}</CardContent>
                </Card>

                <Card className="bg-gray-200 dark:bg-gray-800">
                    <CardHeader className="flex items-center space-x-2">
                        <GroupIcon className="h-5 w-5" />
                        <span className="text-xl">Author</span>
                    </CardHeader>
                    <CardContent>{plugin.author ?? "Unknown"}</CardContent>
                </Card>

                <Card className="bg-gray-200 dark:bg-gray-800">
                    <CardHeader className="flex items-center space-x-2">
                        <HelpIcon className="h-5 w-5" />
                        <span className="text-xl">Summary</span>
                    </CardHeader>
                    <CardContent>{plugin.summary ?? "General"}</CardContent>
                </Card>

                <Card className="bg-gray-200 dark:bg-gray-800">
                    <CardHeader className="flex items-center space-x-2">
                        <HomeIcon className="h-5 w-5" />
                        <span className="text-xl">Home page</span>
                    </CardHeader>
                    <CardContent>
                        {plugin.homePage ? (
                            <a
                                href={plugin.homePage}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 underline"
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
