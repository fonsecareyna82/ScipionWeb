import { useQuery } from "@tanstack/react-query";
import { fetchPlugins, Plugin } from "../api/plugins";

export function usePlugins() {
  return useQuery<Plugin[]>({
    queryKey: ["plugins"],
    queryFn: fetchPlugins,
    staleTime: 1000 * 60 * 5, // 5 min
  });
}
