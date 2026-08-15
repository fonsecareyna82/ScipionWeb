import { useQuery } from "@tanstack/react-query";
import { fetchPlugins, type Plugin } from "../api/plugins";

export function usePlugins(options?: { refetchInterval?: number | false }) {
  return useQuery<Plugin[]>({
    queryKey: ["plugins"],
    queryFn: fetchPlugins,
    staleTime: 1000 * 60 * 5,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: true,
  });
}