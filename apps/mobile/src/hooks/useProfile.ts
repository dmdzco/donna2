import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { ApiError, api } from "@/src/lib/api";
import { getProfileQueryKey } from "@/src/lib/profileSession";

export function useProfile() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();

  return useQuery({
    queryKey: getProfileQueryKey(userId),
    enabled: isLoaded && isSignedIn && !!userId,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new ApiError("Authentication required", 401, {}, "unauthorized");
      }
      return api.caregivers.me(token);
    },
  });
}
