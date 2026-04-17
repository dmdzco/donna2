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
import { ArrowLeft, ChevronDown, Check } from "lucide-react-native";
import { Button, Input, Modal, ProgressBar } from "@/src/components/ui";
import { COLORS, RELATIONSHIP_OPTIONS } from "@/src/constants/theme";
import { useOnboardingStore } from "@/src/stores/onboarding";

export default function Step2Screen() {
  const router = useRouter();
  const {
    lovedOneName,
    lovedOnePhone,
    relationship,
    city,
    state,
    zipcode,
    setField,
  } = useOnboardingStore();

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showRelationshipPicker, setShowRelationshipPicker] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!lovedOneName.trim()) next.lovedOneName = "Name is required";
    if (!lovedOnePhone.trim()) next.lovedOnePhone = "Phone number is required";
    if (!relationship) next.relationship = "Please select a relationship";
    if (state.trim() && state.trim().length !== 2)
      next.state = "Use 2-letter code";
    if (zipcode.trim() && zipcode.trim().length !== 5)
      next.zipcode = "Use 5-digit zip";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleNext() {
    if (validate()) {
      router.push("/(onboarding)/step3");
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
            <ProgressBar current={3} total={6} />
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
            About Your Loved One
          </Text>
          <Text className="text-[15px] text-muted mb-8">
            Tell us about the person Donna will be calling
          </Text>

          {/* Form */}
          <View className="gap-4">
            <Input
              label="Their Name"
              placeholder="Margaret"
              value={lovedOneName}
              onChangeText={(v) => setField("lovedOneName", v)}
              error={errors.lovedOneName}
              autoCapitalize="words"
              textContentType="name"
              testID="input-their-name"
            />

            <Input
              label="Their Phone Number"
              placeholder="(555) 987-6543"
              value={lovedOnePhone}
              onChangeText={(v) => setField("lovedOnePhone", v)}
              error={errors.lovedOnePhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              testID="input-their-phone"
            />

            {/* Relationship Picker */}
            <View className="w-full">
              <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
                Your Relationship
              </Text>
              <Pressable
                onPress={() => setShowRelationshipPicker(true)}
                className={`w-full bg-white px-4 py-3.5 rounded-2xl border flex-row items-center justify-between ${
                  errors.relationship ? "border-red-500" : "border-charcoal/10"
                }`}
                accessibilityRole="button"
                accessibilityLabel="Select relationship"
              >
                <Text
                  className={`text-[15px] ${relationship ? "text-charcoal" : "text-muted"}`}
                >
                  {relationship || "Select relationship"}
                </Text>
                <ChevronDown size={18} color={COLORS.muted} />
              </Pressable>
              {errors.relationship && (
                <Text className="text-red-500 text-[13px] mt-1">
                  {errors.relationship}
                </Text>
              )}
            </View>

            <Input
              label="City"
              placeholder="Dallas"
              value={city}
              onChangeText={(v) => setField("city", v)}
              autoCapitalize="words"
              textContentType="addressCity"
              testID="input-city"
            />

            {/* State + Zip side by side */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input
                  label="State"
                  placeholder="TX"
                  value={state}
                  onChangeText={(v) =>
                    setField("state", v.toUpperCase().slice(0, 2))
                  }
                  error={errors.state}
                  autoCapitalize="characters"
                  maxLength={2}
                  textContentType="addressState"
                  testID="input-state"
                />
              </View>
              <View className="flex-1">
                <Input
                  label="Zip Code"
                  placeholder="75201"
                  value={zipcode}
                  onChangeText={(v) =>
                    setField("zipcode", v.replace(/\D/g, "").slice(0, 5))
                  }
                  error={errors.zipcode}
                  keyboardType="number-pad"
                  maxLength={5}
                  textContentType="postalCode"
                  testID="input-zipcode"
                />
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Fixed bottom button */}
        <View className="absolute bottom-0 left-0 right-0 bg-cream border-t border-charcoal/10 px-6 pt-4 pb-8">
          <Button title="Next" onPress={handleNext} />
        </View>
      </KeyboardAvoidingView>

      {/* Relationship picker modal */}
      <Modal
        visible={showRelationshipPicker}
        onClose={() => setShowRelationshipPicker(false)}
        title="Select Relationship"
      >
        <View className="gap-1 pb-4">
          {RELATIONSHIP_OPTIONS.map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                setField("relationship", option);
                setShowRelationshipPicker(false);
              }}
              className="flex-row items-center justify-between py-3.5 px-2 rounded-xl active:bg-beige"
              accessibilityRole="button"
              accessibilityLabel={option}
            >
              <Text className="text-[16px] text-charcoal">{option}</Text>
              {relationship === option && (
                <Check size={18} color={COLORS.sage} />
              )}
            </Pressable>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
