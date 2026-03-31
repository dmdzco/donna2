import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-cream">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-[28px] font-semibold text-charcoal">
          Settings
        </Text>
        <Text className="text-[15px] text-muted mt-2">Coming soon</Text>
      </View>
    </SafeAreaView>
  );
}
