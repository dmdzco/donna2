import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@/src/lib/api";
import { useStableIdempotencyKey } from "@/src/hooks/useStableIdempotencyKey";

export function useConversations(seniorId: string | undefined) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["conversations", seniorId],
    queryFn: async () => {
      const token = await getToken();
      return api.conversations.listForSenior(seniorId!, token!);
    },
    enabled: !!seniorId,
  });
}

export function useInitiateCall() {
  const { getToken } = useAuth();
  const idempotency = useStableIdempotencyKey("call-initiate");

  return useMutation({
    mutationFn: async (seniorId: string) => {
      const token = await getToken();
      return api.calls.initiate(seniorId, token!, {
        idempotencyKey: idempotency.getKey({ seniorId }),
      });
    },
    onSuccess: () => {
      idempotency.reset();
    },
  });
}
