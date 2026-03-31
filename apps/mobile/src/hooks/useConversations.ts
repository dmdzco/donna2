import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@/src/lib/api";
import type { Conversation } from "@/src/types";

export function useConversations(seniorId: string | undefined) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["conversations", seniorId],
    queryFn: async () => {
      const token = await getToken();
      return api.conversations.listForSenior(seniorId!, token!) as Promise<Conversation[]>;
    },
    enabled: !!seniorId,
  });
}

export function useInitiateCall() {
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (phoneNumber: string) => {
      const token = await getToken();
      return api.calls.initiate(phoneNumber, token!);
    },
  });
}
