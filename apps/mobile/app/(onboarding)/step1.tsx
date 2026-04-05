import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Button, Input, ProgressBar } from "@/src/components/ui";
import { COLORS } from "@/src/constants/theme";
import { useOnboardingStore } from "@/src/stores/onboarding";

export default function Step1Screen() {
  const router = useRouter();
  const { firstName, lastName, email, phone, setField } =
    useOnboardingStore();

  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = "First name is required";
    if (!lastName.trim()) next.lastName = "Last name is required";
    if (!email.trim()) next.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email.trim()))
      next.email = "Enter a valid email";
    if (!phone.trim()) next.phone = "Phone number is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleNext() {
    if (validate()) {
      router.push("/(onboarding)/step2");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          className="px-6"
        >
          {/* Progress */}
          <View className="mt-4 mb-4">
            <ProgressBar current={1} total={5} />
          </View>

          {/* Back */}
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center mb-6 min-h-[48px] self-start"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={18} color={COLORS.sage} />
            <Text className="text-sage text-[16px] font-medium ml-1">
              Back
            </Text>
          </Pressable>

          {/* Header */}
          <Text className="text-[28px] font-semibold text-charcoal mb-2">
            About You
          </Text>
          <Text className="text-[15px] text-muted mb-8">
            Let's start with your information as the caregiver
          </Text>

          {/* Form */}
          <View className="gap-4">
            <Input
              label="First Name"
              placeholder="Jane"
              value={firstName}
              onChangeText={(v) => setField("firstName", v)}
              error={errors.firstName}
              autoCapitalize="words"
              textContentType="givenName"
              autoComplete="given-name"
            />
            <Input
              label="Last Name"
              placeholder="Doe"
              value={lastName}
              onChangeText={(v) => setField("lastName", v)}
              error={errors.lastName}
              autoCapitalize="words"
              textContentType="familyName"
              autoComplete="family-name"
            />
            <Input
              label="Email"
              placeholder="jane@example.com"
              value={email}
              onChangeText={(v) => setField("email", v)}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
            />
            <Input
              label="Phone Number"
              placeholder="(555) 123-4567"
              value={phone}
              onChangeText={(v) => setField("phone", v)}
              error={errors.phone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
            />
          </View>
        </ScrollView>

        {/* Fixed bottom button */}
        <View className="absolute bottom-0 left-0 right-0 bg-cream border-t border-charcoal/10 px-6 pt-4 pb-8">
          <Button title="Next" onPress={handleNext} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
