import { useCallback, useRef } from "react";
import { createIdempotencyKey } from "@/src/lib/api";

export function useStableIdempotencyKey(scope: string) {
  const keyRef = useRef<string | undefined>(undefined);
  const signatureRef = useRef<string | undefined>(undefined);

  const getKey = useCallback(
    (payload: unknown = null) => {
      const signature = signatureFor(payload);
      if (!keyRef.current || signatureRef.current !== signature) {
        keyRef.current = createIdempotencyKey(scope);
        signatureRef.current = signature;
      }
      return keyRef.current;
    },
    [scope],
  );

  const reset = useCallback(() => {
    keyRef.current = undefined;
    signatureRef.current = undefined;
  }, []);

  return { getKey, reset };
}

function signatureFor(payload: unknown) {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(Date.now());
  }
}

