import { LinearGradient } from "expo-linear-gradient";
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
        {/* Placeholder: sage-to-dark gradient until real hero image is available */}
        <LinearGradient
          colors={[COLORS.sageDark, COLORS.sage, "#5a7060"]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Gradient fade from hero into cream background */}
        <LinearGradient
          colors={["transparent", COLORS.cream]}
          locations={[0.4, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 120,
          }}
        />
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
