import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, AlertTriangle } from "lucide-react-native";
import { COLORS } from "@/src/constants/theme";
import { Toggle } from "@/src/components/ui/Toggle";
import { Button } from "@/src/components/ui/Button";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "@/src/hooks";

type ToggleRow = {
  key: "callSummaries" | "missedCallAlerts" | "completedCallAlerts";
  title: string;
  description: string;
};

const NOTIFICATION_TOGGLES: ToggleRow[] = [
  {
    key: "callSummaries",
    title: "Call Summaries",
    description: "Receive a summary after each call",
  },
  {
    key: "missedCallAlerts",
    title: "Missed Call Alerts",
    description: "Get notified when a scheduled call is missed",
  },
  {
    key: "completedCallAlerts",
    title: "Completed Call Alerts",
    description: "Get notified when a call is completed",
  },
];

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const { data: preferences, isLoading } = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();

  const [callSummaries, setCallSummaries] = useState(true);
  const [missedCallAlerts, setMissedCallAlerts] = useState(true);
  const [completedCallAlerts, setCompletedCallAlerts] = useState(true);
  const [pauseCalls, setPauseCalls] = useState(false);

  // Pre-fill from server
  useEffect(() => {
    if (preferences) {
      setCallSummaries(preferences.callSummaries ?? true);
      setMissedCallAlerts(preferences.missedCallAlerts ?? true);
      setCompletedCallAlerts(preferences.completedCallAlerts ?? true);
      setPauseCalls(preferences.pauseCalls ?? false);
    }
  }, [preferences]);

  const toggleState: Record<string, boolean> = {
    callSummaries,
    missedCallAlerts,
    completedCallAlerts,
  };

  const toggleSetters: Record<string, (val: boolean) => void> = {
    callSummaries: setCallSummaries,
    missedCallAlerts: setMissedCallAlerts,
    completedCallAlerts: setCompletedCallAlerts,
  };

  const handleSave = async () => {
    try {
      await updatePreferences.mutateAsync({
        callSummaries,
        missedCallAlerts,
        completedCallAlerts,
        pauseCalls,
      });
      Alert.alert("Saved", "Notification preferences updated.");
      router.back();
    } catch {
      Alert.alert("Error", "Failed to update preferences. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-cream items-center justify-center">
        <Text className="text-muted">Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-2">
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center gap-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ minHeight: 48 }}
          >
            <ArrowLeft size={20} color={COLORS.charcoal} />
            <Text className="text-[15px] text-charcoal">Back</Text>
          </Pressable>
          <Text className="text-[28px] font-semibold text-charcoal mt-4">
            Notifications
          </Text>
        </View>

        {/* Scrollable Content */}
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Notification Toggles */}
          <View className="mt-4">
            <Text className="text-[13px] font-medium text-muted uppercase tracking-wider mb-3">
              Alerts
            </Text>
            <View className="bg-white rounded-2xl border border-charcoal/10 px-4">
              {NOTIFICATION_TOGGLES.map((toggle, index) => (
                <View key={toggle.key}>
                  <View
                    className="flex-row items-center justify-between py-4"
                    style={{ minHeight: 56 }}
                  >
                    <View className="flex-1 mr-4">
                      <Text className="text-[15px] font-medium text-charcoal">
                        {toggle.title}
                      </Text>
                      <Text className="text-[13px] text-muted mt-0.5">
                        {toggle.description}
                      </Text>
                    </View>
                    <Toggle
                      value={toggleState[toggle.key]}
                      onToggle={(val) => toggleSetters[toggle.key](val)}
                      accessibilityLabel={toggle.title}
                    />
                  </View>
                  {index < NOTIFICATION_TOGGLES.length - 1 && (
                    <View className="h-px bg-charcoal/5" />
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* Pause Calls */}
          <View className="mt-6">
            <Text className="text-[13px] font-medium text-muted uppercase tracking-wider mb-3">
              Call Settings
            </Text>
            <View className="bg-white rounded-2xl border border-charcoal/10 px-4">
              <View
                className="flex-row items-center justify-between py-4"
                style={{ minHeight: 56 }}
              >
                <View className="flex-1 mr-4">
                  <Text className="text-[15px] font-medium text-charcoal">
                    Pause Calls
                  </Text>
                  <Text className="text-[13px] text-muted mt-0.5">
                    Temporarily stop all scheduled calls
                  </Text>
                </View>
                <Toggle
                  value={pauseCalls}
                  onToggle={setPauseCalls}
                  accessibilityLabel="Pause Calls"
                />
              </View>
            </View>
            {pauseCalls && (
              <View className="flex-row items-start bg-orange-50 rounded-2xl p-4 mt-3 border border-orange-200">
                <AlertTriangle
                  size={18}
                  color={COLORS.warning}
                  style={{ marginTop: 1 }}
                />
                <Text className="text-[13px] text-orange-800 ml-2.5 flex-1">
                  Pausing will stop all scheduled calls to your loved one. They
                  won't receive any calls from Donna until you turn this off.
                </Text>
              </View>
            )}
          </View>

          {/* Subscription Card */}
          <View className="mt-6">
            <Text className="text-[13px] font-medium text-muted uppercase tracking-wider mb-3">
              Subscription
            </Text>
            <View
              className="rounded-2xl p-5 overflow-hidden"
              style={{ backgroundColor: COLORS.sage }}
            >
              <Text className="text-[18px] font-semibold text-white">
                Donna Companion Plan
              </Text>
              <Text className="text-[14px] text-white/80 mt-1">
                Unlimited calls, daily check-ins, and medication reminders
              </Text>
              <View className="mt-4">
                <Button
                  title="Manage Subscription"
                  variant="secondary"
                  onPress={() =>
                    Alert.alert(
                      "Coming Soon",
                      "Subscription management will be available in a future update."
                    )
                  }
                  className="bg-white/20 border-0"
                />
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Fixed Save Button */}
        <View className="absolute bottom-0 left-0 right-0 bg-cream border-t border-charcoal/5 px-6 py-4 pb-8">
          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={updatePreferences.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
