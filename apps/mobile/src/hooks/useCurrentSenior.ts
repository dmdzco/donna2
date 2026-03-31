import { useProfile } from "./useProfile";
import type { Senior } from "@/src/types";

export function useCurrentSenior() {
  const { data: profile, ...rest } = useProfile();
  const senior: Senior | undefined = profile?.seniors?.[0];

  return {
    senior,
    seniorId: senior?.id,
    ...rest,
  };
}
