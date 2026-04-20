import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetInfo } from "@react-native-community/netinfo";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/constants/theme";

export function OfflineBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const isOffline =
    netInfo.isConnected === false || netInfo.isInternetReachable === false;

  if (!isOffline) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        paddingTop: insets.top + 8,
        paddingBottom: 10,
        paddingHorizontal: 18,
        backgroundColor: COLORS.warningBg,
        borderBottomColor: COLORS.border,
        borderBottomWidth: 1,
      }}
    >
      <Text
        style={{
          color: COLORS.charcoal,
          fontSize: 14,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {t("common.offlineMessage")}
      </Text>
    </View>
  );
}
