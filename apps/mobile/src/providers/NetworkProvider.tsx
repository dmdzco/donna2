import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { ReactNode, useEffect } from "react";
import { OfflineBanner } from "@/src/components/OfflineBanner";

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
    return onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state) => {
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
