import { useState } from "react";
import {
  Keyboard,
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
import { useTranslation } from "react-i18next";
import { Button, Input, KeyboardAwareFooter, Modal, ProgressBar } from "@/src/components/ui";
import { COLORS } from "@/src/constants/theme";
import { useOnboardingStore } from "@/src/stores/onboarding";

export default function Step3Screen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { reminders, addReminder, removeReminder, updateReminder } =
    useOnboardingStore();

  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  function handleContinue() {
    Keyboard.dismiss();
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
            <ProgressBar current={4} total={6} />
          </View>

          {/* Back */}
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center mb-6 min-h-[48px] self-start"
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
          >
            <ArrowLeft size={18} color={COLORS.sage} />
            <Text className="text-sage text-[16px] font-medium ml-1">
              {t("common.back")}
            </Text>
          </Pressable>

          {/* Header */}
          <Text className="text-[28px] font-semibold text-charcoal mb-2">
            {t("onboarding.step3.title")}
          </Text>
          <Text className="text-[15px] text-muted mb-6">
            {t("onboarding.step3.subtitle")}
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
                    {t("onboarding.step3.reminderN", { n: index + 1 })}
                  </Text>
                  {reminders.length > 1 && (
                    <Pressable
                      onPress={() => setDeleteIndex(index)}
                      className="min-w-[48px] min-h-[48px] items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel={`${t("common.delete")} ${t("onboarding.step3.reminderN", { n: index + 1 })}`}
                    >
                      <X size={18} color={COLORS.muted} />
                    </Pressable>
                  )}
                </View>

                <View className="gap-3">
                  <Input
                    label={t("onboarding.step3.titleLabel")}
                    placeholder={t("onboarding.step3.titlePlaceholder")}
                    value={reminder.title}
                    onChangeText={(v) => updateReminder(index, "title", v)}
                    testID={`input-reminder-title-${index}`}
                  />

                  <View className="w-full">
                    <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
                      {t("onboarding.step3.description")}
                    </Text>
                    <TextInput
                      className="w-full bg-white px-4 py-3.5 rounded-2xl border border-charcoal/10 text-[15px] text-charcoal min-h-[80px]"
                      placeholder={t("onboarding.step3.descriptionPlaceholder")}
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
            title={t("onboarding.step3.addAnother")}
            onPress={addReminder}
            variant="secondary"
            icon={<Plus size={18} color={COLORS.charcoal} />}
            className="mb-6"
          />

          {/* Tip box */}
          <View className="bg-beige rounded-2xl p-4 flex-row items-start gap-3">
            <Lightbulb size={20} color={COLORS.sage} />
            <Text className="text-[14px] text-muted flex-1 leading-5">
              {t("onboarding.step3.tip")}
            </Text>
          </View>
        </ScrollView>

        {/* Fixed bottom button */}
        <KeyboardAwareFooter>
          <Button title={t("common.next")} onPress={handleContinue} />
        </KeyboardAwareFooter>
      </KeyboardAvoidingView>

      {/* Delete confirmation modal */}
      <Modal
        visible={deleteIndex !== null}
        onClose={() => setDeleteIndex(null)}
        title={t("onboarding.step3.deleteTitle")}
        variant="centered"
      >
        <Text className="text-[15px] text-muted mb-6">
          {t("onboarding.step3.deleteMessage")}
        </Text>
        <View className="gap-3">
          <Button
            title={t("common.delete")}
            onPress={confirmDelete}
            variant="destructive"
          />
          <Button
            title={t("common.cancel")}
            onPress={() => setDeleteIndex(null)}
            variant="ghost"
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}
