import { useQuery } from "@tanstack/react-query";
import { fetchPluginById, Plugin } from "../api/plugins";

export function usePluginDetail(id: string) {
  return useQuery<Plugin>({
    queryKey: ["plugin", id],
    queryFn: () => fetchPluginById(id),
    enabled: Boolean(id),
  });
}
