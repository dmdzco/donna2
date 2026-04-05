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
import { ArrowLeft, Plus, X, Lightbulb } from "lucide-react-native";
import { Button, Input, Modal, ProgressBar } from "@/src/components/ui";
import { COLORS } from "@/src/constants/theme";
import { useOnboardingStore } from "@/src/stores/onboarding";

export default function Step3Screen() {
  const router = useRouter();
  const { reminders, addReminder, removeReminder, updateReminder } =
    useOnboardingStore();

  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  function handleContinue() {
    router.push("/(onboarding)/step4");
  }

  function confirmDelete() {
    if (deleteIndex !== null) {
      removeReminder(deleteIndex);
      setDeleteIndex(null);
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
            <ProgressBar current={3} total={5} />
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
            Reminders
          </Text>
          <Text className="text-[15px] text-muted mb-6">
            Add things you'd like Donna to remind your loved one about during
            calls
          </Text>

          {/* Reminder cards */}
          <View className="gap-4 mb-4">
            {reminders.map((reminder, index) => (
              <View
                key={index}
                className="bg-white rounded-2xl border border-charcoal/10 p-4"
              >
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-[15px] font-medium text-charcoal">
                    Reminder {index + 1}
                  </Text>
                  {reminders.length > 1 && (
                    <Pressable
                      onPress={() => setDeleteIndex(index)}
                      className="min-w-[48px] min-h-[48px] items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel={`Delete reminder ${index + 1}`}
                    >
                      <X size={18} color={COLORS.muted} />
                    </Pressable>
                  )}
                </View>

                <View className="gap-3">
                  <Input
                    label="Title"
                    placeholder="e.g., Take morning medication"
                    value={reminder.title}
                    onChangeText={(v) => updateReminder(index, "title", v)}
                  />

                  <View className="w-full">
                    <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
                      Description
                    </Text>
                    <TextInput
                      className="w-full bg-white px-4 py-3.5 rounded-2xl border border-charcoal/10 text-[15px] text-charcoal min-h-[80px]"
                      placeholder="e.g., Take the blue pill with breakfast. It's on the kitchen counter."
                      placeholderTextColor={COLORS.muted}
                      value={reminder.description}
                      onChangeText={(v) =>
                        updateReminder(index, "description", v)
                      }
                      multiline
                      textAlignVertical="top"
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Add another */}
          <Button
            title="Add Another Reminder"
            onPress={addReminder}
            variant="secondary"
            icon={<Plus size={18} color={COLORS.charcoal} />}
            className="mb-6"
          />

          {/* Tip box */}
          <View className="bg-beige rounded-2xl p-4 flex-row items-start gap-3">
            <Lightbulb size={20} color={COLORS.sage} />
            <Text className="text-[14px] text-muted flex-1 leading-5">
              The more detailed you make the reminders, the better! Donna will
              weave them naturally into the conversation.
            </Text>
          </View>
        </ScrollView>

        {/* Fixed bottom button */}
        <View className="absolute bottom-0 left-0 right-0 bg-cream border-t border-charcoal/10 px-6 pt-4 pb-8">
          <Button title="Continue" onPress={handleContinue} />
        </View>
      </KeyboardAvoidingView>

      {/* Delete confirmation modal */}
      <Modal
        visible={deleteIndex !== null}
        onClose={() => setDeleteIndex(null)}
        title="Delete Reminder"
        variant="centered"
      >
        <Text className="text-[15px] text-muted mb-6">
          Are you sure you want to delete this reminder? This action cannot be
          undone.
        </Text>
        <View className="gap-3">
          <Button
            title="Delete"
            onPress={confirmDelete}
            variant="destructive"
          />
          <Button
            title="Cancel"
            onPress={() => setDeleteIndex(null)}
            variant="ghost"
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}
