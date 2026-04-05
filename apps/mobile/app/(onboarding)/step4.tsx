import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  X,
  Dumbbell,
  Landmark,
  Music,
  Film,
  Vote,
  Feather,
  Globe,
  PawPrint,
  BookOpen,
  Flower2,
  Plane,
  ChefHat,
} from "lucide-react-native";
import { Button, Input, ProgressBar } from "@/src/components/ui";
import { COLORS } from "@/src/constants/theme";
import { INTERESTS } from "@/src/constants/interests";
import { useOnboardingStore } from "@/src/stores/onboarding";

const ICON_MAP: Record<string, React.ElementType> = {
  Dumbbell,
  Landmark,
  Music,
  Film,
  Vote,
  Feather,
  Globe,
  PawPrint,
  BookOpen,
  Flower2,
  Plane,
  ChefHat,
};

export default function Step4Screen() {
  const router = useRouter();
  const {
    selectedInterests,
    additionalTopics,
    topicsToAvoid,
    toggleInterest,
    updateInterestDetail,
    removeInterest,
    setField,
  } = useOnboardingStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleTilePress(id: string) {
    if (id in selectedInterests) {
      // Already selected -- expand it for editing
      setExpandedId(id);
    } else {
      toggleInterest(id);
      setExpandedId(id);
    }
  }

  function handleDone(id: string) {
    setExpandedId(null);
  }

  function handleRemove(id: string) {
    removeInterest(id);
    if (expandedId === id) setExpandedId(null);
  }

  function handleContinue() {
    router.push("/(onboarding)/step5");
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
            <ProgressBar current={4} total={5} />
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
            Interests
          </Text>
          <Text className="text-[15px] text-muted mb-6">
            Select topics your loved one enjoys. Donna will use these to start
            engaging conversations.
          </Text>

          {/* Interest grid */}
          <View className="flex-row flex-wrap gap-3 mb-6">
            {INTERESTS.map((interest) => {
              const isSelected = interest.id in selectedInterests;
              const isExpanded = expandedId === interest.id;
              const Icon = ICON_MAP[interest.icon];

              if (isExpanded && isSelected) {
                // Expanded card -- full width
                return (
                  <View
                    key={interest.id}
                    className="w-full bg-sage rounded-2xl p-4"
                  >
                    <View className="flex-row items-center justify-between mb-3">
                      <View className="flex-row items-center gap-2">
                        {Icon && <Icon size={18} color={COLORS.white} />}
                        <Text className="text-[15px] font-semibold text-white">
                          {interest.label}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleRemove(interest.id)}
                        className="min-w-[48px] min-h-[48px] items-center justify-center"
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${interest.label}`}
                      >
                        <X size={16} color={COLORS.white} />
                      </Pressable>
                    </View>

                    <Text className="text-[14px] text-white/80 mb-2">
                      {interest.question}
                    </Text>
                    <TextInput
                      className="w-full bg-white/20 px-4 py-3 rounded-xl text-[15px] text-white min-h-[44px]"
                      placeholder={interest.placeholder}
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      value={selectedInterests[interest.id] ?? ""}
                      onChangeText={(v) =>
                        updateInterestDetail(interest.id, v)
                      }
                      multiline
                    />
                    <Button
                      title="Done"
                      onPress={() => handleDone(interest.id)}
                      variant="secondary"
                      className="mt-3"
                    />
                  </View>
                );
              }

              // Tile (selected or unselected)
              // Each tile is ~1/3 width minus gap. Using a fixed-width approach.
              return (
                <Pressable
                  key={interest.id}
                  onPress={() => handleTilePress(interest.id)}
                  className={`items-center justify-center rounded-2xl py-4 px-2 ${
                    isSelected ? "bg-sage" : "bg-beige"
                  }`}
                  style={{ width: "31%" }}
                  accessibilityRole="button"
                  accessibilityLabel={`${interest.label}${isSelected ? ", selected" : ""}`}
                >
                  {/* X badge for selected */}
                  {isSelected && (
                    <View className="absolute top-2 right-2">
                      <X size={12} color={COLORS.white} />
                    </View>
                  )}
                  {Icon && (
                    <Icon
                      size={24}
                      color={isSelected ? COLORS.white : COLORS.muted}
                    />
                  )}
                  <Text
                    className={`text-[12px] font-medium mt-1.5 text-center ${
                      isSelected ? "text-white" : "text-muted"
                    }`}
                    numberOfLines={1}
                  >
                    {interest.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Additional topics */}
          <View className="mb-4">
            <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
              Additional Topics
            </Text>
            <TextInput
              className="w-full bg-white px-4 py-3.5 rounded-2xl border border-charcoal/10 text-[15px] text-charcoal min-h-[80px]"
              placeholder="Any other topics they enjoy talking about..."
              placeholderTextColor={COLORS.muted}
              value={additionalTopics}
              onChangeText={(v) => setField("additionalTopics", v)}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Topics to avoid */}
          <View className="mb-6">
            <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
              Topics to Avoid
            </Text>
            <TextInput
              className="w-full bg-white px-4 py-3.5 rounded-2xl border-2 border-accent-pink text-[15px] text-charcoal min-h-[80px]"
              placeholder="Any topics that should be avoided..."
              placeholderTextColor={COLORS.muted}
              value={topicsToAvoid}
              onChangeText={(v) => setField("topicsToAvoid", v)}
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        {/* Fixed bottom button */}
        <View className="absolute bottom-0 left-0 right-0 bg-cream border-t border-charcoal/10 px-6 pt-4 pb-8">
          <Button title="Continue" onPress={handleContinue} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
