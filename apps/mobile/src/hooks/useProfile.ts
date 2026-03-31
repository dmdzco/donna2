import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@/src/lib/api";
import type { CaregiverProfile } from "@/src/types";

export function useProfile() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const token = await getToken();
      return api.caregivers.me(token!) as Promise<CaregiverProfile>;
    },
  });
}
