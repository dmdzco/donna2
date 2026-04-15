import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@/src/lib/api";

export function useProfile() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) { console.log("[profile] no token"); return null; }
      try {
        const result = await api.caregivers.me(token);
        console.log("[profile] response:", JSON.stringify(result));
        return result;
      } catch (e: any) {
        console.log("[profile] error:", e?.status, e?.message);
        throw e;
      }
    },
    staleTime: 0,
    gcTime: 0,
  });
}
