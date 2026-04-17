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
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Plus,
  X,
  Lightbulb,
} from "lucide-react-native";
import { Button, Input, Modal, ProgressBar } from "@/src/components/ui";
import { COLORS, TIME_OPTIONS } from "@/src/constants/theme";
import { useOnboardingStore, type OnboardingCall } from "@/src/stores/onboarding";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Step5Screen() {
  const router = useRouter();
  const { calls, reminders, addCall, removeCall, updateCall } =
    useOnboardingStore();

  const [activePicker, setActivePicker] = useState<{
    type: "time";
    callIndex: number;
  } | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [scheduleErrors, setScheduleErrors] = useState<Record<number, string>>({});

  function toggleDay(callIndex: number, day: number) {
    const current = calls[callIndex].selectedDays;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    updateCall(callIndex, "selectedDays", next);
  }

  function toggleReminder(callIndex: number, reminderIndex: number) {
    const current = calls[callIndex].selectedReminderIds;
    const next = current.includes(reminderIndex)
      ? current.filter((r) => r !== reminderIndex)
      : [...current, reminderIndex];
    updateCall(callIndex, "selectedReminderIds", next);
  }

  function handleCreateProfile() {
    const nextErrors: Record<number, string> = {};
    calls.forEach((call, index) => {
      if (call.frequency === "recurring" && call.selectedDays.length === 0) {
        nextErrors[index] = "Choose at least one day for this recurring call.";
      }
    });

    setScheduleErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    router.push("/(onboarding)/success");
  }

  function confirmDelete() {
    if (deleteIndex !== null) {
      removeCall(deleteIndex);
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
            <ProgressBar current={6} total={6} />
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
            Schedule Donna
          </Text>
          <Text className="text-[15px] text-muted mb-6">
            Set up when Donna should call your loved one
          </Text>

          {/* Call cards */}
          <View className="gap-4 mb-4">
            {calls.map((call, index) => (
              <View
                key={index}
                className="bg-white rounded-2xl border border-charcoal/10 p-4"
              >
                {/* Card header */}
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-[16px] font-semibold text-charcoal">
                    Call {index + 1}
                  </Text>
                  {calls.length > 1 && (
                    <Pressable
                      onPress={() => setDeleteIndex(index)}
                      className="min-w-[48px] min-h-[48px] items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel={`Delete call ${index + 1}`}
                    >
                      <X size={18} color={COLORS.muted} />
                    </Pressable>
                  )}
                </View>

                {/* Title */}
                <View className="mb-4">
                  <Input
                    label="Call Title"
                    placeholder="e.g., Daily Call, Morning Check-in"
                    value={call.title}
                    onChangeText={(v) => updateCall(index, "title", v)}
                    testID={`input-call-title-${index}`}
                  />
                </View>

                {/* Frequency */}
                <View className="mb-4">
                  <Text className="text-[13px] font-medium text-muted mb-2 uppercase tracking-wider">
                    Frequency
                  </Text>
                  <View className="flex-row gap-2">
                    {(
                      [
                        { key: "daily", label: "Daily" },
                        { key: "recurring", label: "Recurring" },
                        { key: "one-time", label: "One-Time" },
                      ] as const
                    ).map(({ key, label }) => (
                      <Pressable
                        key={key}
                        onPress={() => {
                          updateCall(index, "frequency", key);
                          if (key !== "recurring" && scheduleErrors[index]) {
                            setScheduleErrors((current) => {
                              const next = { ...current };
                              delete next[index];
                              return next;
                            });
                          }
                        }}
                        className={`flex-1 py-2.5 rounded-xl items-center border ${
                          call.frequency === key
                            ? "bg-sage border-sage"
                            : "bg-white border-charcoal/10"
                        }`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: call.frequency === key }}
                        accessibilityLabel={label}
                      >
                        <Text
                          className={`text-[13px] font-medium ${
                            call.frequency === key
                              ? "text-white"
                              : "text-charcoal"
                          }`}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Day picker for recurring */}
                {call.frequency === "recurring" && (
                  <View className="mb-4">
                    <Text className="text-[13px] font-medium text-muted mb-2 uppercase tracking-wider">
                      Select Days
                    </Text>
                    <View className="flex-row gap-1.5">
                      {DAY_LABELS.map((day, dayIndex) => (
                        <Pressable
                          key={day}
                          onPress={() => {
                            toggleDay(index, dayIndex);
                            if (scheduleErrors[index]) {
                              setScheduleErrors((current) => {
                                const next = { ...current };
                                delete next[index];
                                return next;
                              });
                            }
                          }}
                          className={`flex-1 py-2.5 rounded-xl items-center ${
                            call.selectedDays.includes(dayIndex)
                              ? "bg-sage"
                              : "bg-beige"
                          }`}
                          accessibilityRole="checkbox"
                          accessibilityState={{
                            checked: call.selectedDays.includes(dayIndex),
                          }}
                          accessibilityLabel={day}
                        >
                          <Text
                            className={`text-[12px] font-medium ${
                              call.selectedDays.includes(dayIndex)
                                ? "text-white"
                                : "text-muted"
                            }`}
                          >
                            {day}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    {scheduleErrors[index] && (
                      <Text className="text-red-500 text-[13px] mt-2">
                        {scheduleErrors[index]}
                      </Text>
                    )}
                  </View>
                )}

                {/* Date input for one-time */}
                {call.frequency === "one-time" && (
                  <View className="mb-4">
                    <Input
                      label="Date"
                      placeholder="MM/DD/YYYY"
                      value={call.selectedDate}
                      onChangeText={(v) =>
                        updateCall(index, "selectedDate", v)
                      }
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                )}

                {/* Time picker */}
                <View className="mb-4">
                  <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
                    Time
                  </Text>
                  <Pressable
                    onPress={() =>
                      setActivePicker({ type: "time", callIndex: index })
                    }
                    className="w-full bg-white px-4 py-3.5 rounded-2xl border border-charcoal/10 flex-row items-center justify-between"
                    accessibilityRole="button"
                    accessibilityLabel="Select call time"
                  >
                    <Text className="text-[15px] text-charcoal">
                      {call.callTime}
                    </Text>
                    <ChevronDown size={18} color={COLORS.muted} />
                  </Pressable>
                </View>

                {/* Reminder checkboxes */}
                {reminders.some((r) => r.title.trim()) && (
                  <View>
                    <Text className="text-[13px] font-medium text-muted mb-2 uppercase tracking-wider">
                      Include Reminders
                    </Text>
                    <View className="gap-2">
                      {reminders.map((reminder, rIndex) => {
                        if (!reminder.title.trim()) return null;
                        const isChecked =
                          call.selectedReminderIds.includes(rIndex);
                        return (
                          <Pressable
                            key={rIndex}
                            onPress={() => toggleReminder(index, rIndex)}
                            className="flex-row items-center gap-3 py-2"
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isChecked }}
                            accessibilityLabel={reminder.title}
                          >
                            <View
                              className={`w-5 h-5 rounded-md border items-center justify-center ${
                                isChecked
                                  ? "bg-sage border-sage"
                                  : "bg-white border-charcoal/20"
                              }`}
                            >
                              {isChecked && (
                                <Check size={14} color={COLORS.white} />
                              )}
                            </View>
                            <Text className="text-[14px] text-charcoal flex-1">
                              {reminder.title}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Add another call */}
          <Button
            title="Add Another Call"
            onPress={addCall}
            variant="secondary"
            icon={<Plus size={18} color={COLORS.charcoal} />}
            className="mb-6"
          />

          {/* Tip box */}
          <View className="bg-beige rounded-2xl p-4 flex-row items-start gap-3 mb-4">
            <Lightbulb size={20} color={COLORS.sage} />
            <Text className="text-[14px] text-muted flex-1 leading-5">
              You can always adjust the schedule later from the Schedule tab.
            </Text>
          </View>
        </ScrollView>

        {/* Fixed bottom button */}
        <View className="absolute bottom-0 left-0 right-0 bg-cream border-t border-charcoal/10 px-6 pt-4 pb-8">
          <Button title="Create Profile" onPress={handleCreateProfile} />
        </View>
      </KeyboardAvoidingView>

      {/* Time picker modal */}
      <Modal
        visible={activePicker?.type === "time"}
        onClose={() => setActivePicker(null)}
        title="Select Time"
      >
        <View className="gap-0.5 pb-4">
          {TIME_OPTIONS.map((time) => (
            <Pressable
              key={time}
              onPress={() => {
                updateCall(activePicker!.callIndex, "callTime", time);
                setActivePicker(null);
              }}
              className="flex-row items-center justify-between py-3 px-2 rounded-xl active:bg-beige"
              accessibilityRole="button"
              accessibilityLabel={time}
            >
              <Text className="text-[15px] text-charcoal">{time}</Text>
              {activePicker &&
                calls[activePicker.callIndex]?.callTime === time && (
                  <Check size={18} color={COLORS.sage} />
                )}
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        visible={deleteIndex !== null}
        onClose={() => setDeleteIndex(null)}
        title="Delete Call"
        variant="centered"
      >
        <Text className="text-[15px] text-muted mb-6">
          Are you sure you want to delete this scheduled call?
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
