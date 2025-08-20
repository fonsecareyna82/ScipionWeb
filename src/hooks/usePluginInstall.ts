import { useState } from "react";
import { installPlugin, checkTaskStatus } from "@/api/plugins";

export function usePluginInstall() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleInstall = async (pipName: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Lanza la tarea en el backend
      const { task_id } = await installPlugin(pipName);

      // Polling cada 2 segundos hasta que Celery termine
      let status = "PENDING";
      let result = null;
      while (status !== "SUCCESS" && status !== "FAILURE") {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await checkTaskStatus(task_id);
        status = poll.status;
        result = poll.result;
      }

      if (status === "SUCCESS") {
        setSuccess(result || "Plugin installed successfully!");
      } else {
        setError(result || "Installation failed.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, success, handleInstall };
}
