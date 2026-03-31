import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DashboardScreen() {
  return (
    <SafeAreaView className="flex-1 bg-cream">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-serif-semibold text-charcoal mb-2">
          Dashboard
        </Text>
        <Text className="text-muted text-center">
          Your loved one's activity will appear here
        </Text>
      </View>
    </SafeAreaView>
  );
}
