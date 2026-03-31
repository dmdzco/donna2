import { useRouter } from "expo-router";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "@/src/constants/theme";

export default function LandingScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();

  return (
    <View className="flex-1 bg-cream">
      {/* Hero image area — top 45% of viewport */}
      <View style={{ height: height * 0.45 }} className="relative">
        {/* Placeholder: sage background until real hero image is available */}
        <View className="absolute inset-0 bg-sage" />

        {/* Gradient fade from hero into cream background (layered opacity Views) */}
        <View className="absolute bottom-0 left-0 right-0" style={{ height: 120 }}>
          <View
            className="flex-1"
            style={{ backgroundColor: COLORS.cream, opacity: 0.15 }}
          />
          <View
            className="flex-1"
            style={{ backgroundColor: COLORS.cream, opacity: 0.35 }}
          />
          <View
            className="flex-1"
            style={{ backgroundColor: COLORS.cream, opacity: 0.6 }}
          />
          <View
            className="flex-1"
            style={{ backgroundColor: COLORS.cream, opacity: 0.85 }}
          />
          <View
            className="flex-1"
            style={{ backgroundColor: COLORS.cream, opacity: 1 }}
          />
        </View>
      </View>

      {/* Content below hero */}
      <SafeAreaView edges={["bottom"]} className="flex-1 px-7">
        <View className="flex-1 justify-between">
          {/* Branding */}
          <View>
            <Text
              className="font-serif text-sage mb-3"
              style={{ fontSize: 56, letterSpacing: -1 }}
            >
              Donna
            </Text>
            <Text className="text-[18px] text-muted leading-[26px]">
              A helpful assistant for your parents.{"\n"}A game-changing
              caregiving tool for you.
            </Text>
          </View>

          {/* Actions */}
          <View className="pb-3">
            <Pressable
              onPress={() => router.push("/(auth)/create-account")}
              className="bg-sage rounded-3xl min-h-[52px] items-center justify-center mb-4"
              accessibilityRole="button"
              accessibilityLabel="Get Started"
            >
              <Text className="text-white text-[17px] font-semibold">
                Get Started
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/(auth)/sign-in")}
              className="min-h-[48px] items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Sign In"
            >
              <Text className="text-sage text-[16px] font-medium">
                Sign In
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
