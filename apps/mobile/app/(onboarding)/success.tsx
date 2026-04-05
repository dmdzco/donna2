import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Sparkles } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { Button } from "@/src/components/ui";
import { COLORS } from "@/src/constants/theme";
import { api } from "@/src/lib/api";
import { useOnboardingStore } from "@/src/stores/onboarding";

// Simple confetti circles
const CONFETTI_COLORS = [
  COLORS.sage,
  COLORS.accentPink,
  "#F5D76E",
  "#7EC8E3",
  COLORS.sage,
  COLORS.accentPink,
];

function ConfettiCircle({
  delay,
  startX,
  color,
}: {
  delay: number;
  startX: number;
  color: string;
}) {
  const translateY = useSharedValue(-20);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    translateY.value = withDelay(
      delay,
      withTiming(600, { duration: 2500, easing: Easing.out(Easing.quad) }),
    );
    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(20, { duration: 800 }),
          withTiming(-20, { duration: 800 }),
        ),
        -1,
        true,
      ),
    );
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0, { duration: 2100 }),
      ),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: startX,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

export default function SuccessScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const store = useOnboardingStore();
  const [loading, setLoading] = useState(false);

  // Entrance animation for icon
  const iconScale = useSharedValue(0);
  const iconOpacity = useSharedValue(0);

  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 500 });
    iconScale.value = withSequence(
      withTiming(1.15, { duration: 400, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 200 }),
    );
  }, []);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: iconOpacity.value,
  }));

  async function handleContinue() {
    setLoading(true);
    try {
      const token = await getToken();

      // Build payload matching OnboardingInput type
      const selectedInterestIds = Object.keys(store.selectedInterests);
      const interestDetails: Record<string, string> = {};
      for (const [id, detail] of Object.entries(store.selectedInterests)) {
        if (detail.trim()) {
          interestDetails[id] = detail;
        }
      }

      const payload = {
        senior: {
          name: store.lovedOneName,
          phone: store.lovedOnePhone,
          city: store.city || undefined,
          state: store.state || undefined,
          zipCode: store.zipcode || undefined,
        },
        relation: store.relationship,
        interests: selectedInterestIds,
        familyInfo: {
          interestDetails:
            Object.keys(interestDetails).length > 0
              ? interestDetails
              : undefined,
        },
        additionalInfo: store.additionalTopics || undefined,
        reminders: store.reminders
          .filter((r) => r.title.trim())
          .map((r) => (r.description ? `${r.title}: ${r.description}` : r.title)),
        updateTopics: store.topicsToAvoid
          ? [store.topicsToAvoid]
          : undefined,
        callSchedule: {
          time: store.calls[0]?.callTime,
        },
      };

      await api.onboarding.complete(payload, token!);

      store.reset();
      router.replace("/(tabs)");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  }

  // Generate confetti positions
  const confettiPieces = CONFETTI_COLORS.map((color, i) => ({
    color,
    delay: i * 150,
    startX: 40 + (i * 55) % 280,
  }));

  return (
    <SafeAreaView className="flex-1 bg-cream">
      {/* Confetti layer */}
      <View className="absolute inset-0 overflow-hidden" pointerEvents="none">
        {confettiPieces.map((piece, i) => (
          <ConfettiCircle
            key={i}
            delay={piece.delay}
            startX={piece.startX}
            color={piece.color}
          />
        ))}
      </View>

      <View className="flex-1 items-center justify-center px-8">
        {/* Icon */}
        <Animated.View
          style={iconAnimatedStyle}
          className="w-24 h-24 rounded-full bg-sage items-center justify-center mb-8"
        >
          <Sparkles size={40} color={COLORS.white} />
        </Animated.View>

        {/* Heading */}
        <Text className="text-[28px] font-semibold text-charcoal text-center mb-4 leading-9">
          Congratulations, your account set up is complete!
        </Text>

        {/* Subtitle */}
        <Text className="text-[16px] text-muted text-center leading-6">
          We're excited for you and {store.lovedOneName || "your loved one"} to
          get started with Donna
        </Text>
      </View>

      {/* Fixed bottom button */}
      <View className="bg-cream border-t border-charcoal/10 px-6 pt-4 pb-8">
        <Button
          title="Continue to Homepage"
          onPress={handleContinue}
          loading={loading}
          disabled={loading}
        />
      </View>
    </SafeAreaView>
  );
}
