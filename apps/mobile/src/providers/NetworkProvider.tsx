import { onlineManager } from "@tanstack/react-query";
import { ReactNode, useEffect } from "react";
import { OfflineBanner } from "@/src/components/OfflineBanner";

let NetInfo: typeof import("@react-native-community/netinfo").default | null = null;
try {
  NetInfo = require("@react-native-community/netinfo").default;
} catch {
  // Native module not available (e.g. Expo Go without dev client)
}

type NetworkProviderProps = {
  children: ReactNode;
};

function isOnline(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function NetworkProvider({ children }: NetworkProviderProps) {
  useEffect(() => {
    if (!NetInfo) return;
    return onlineManager.setEventListener((setOnline) =>
      NetInfo!.addEventListener((state) => {
        setOnline(isOnline(state));
      }),
    );
  }, []);

  return (
    <>
      {children}
      <OfflineBanner />
    </>
  );
}
