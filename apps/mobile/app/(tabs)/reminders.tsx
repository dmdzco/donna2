import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Edit2, Trash2, Plus, Bell, Clock, Check, ChevronDown } from "lucide-react-native";
import { COLORS, TIME_OPTIONS } from "@/src/constants/theme";
import {
  useCurrentSenior,
  useReminders,
  useCreateReminder,
  useUpdateReminder,
  useDeleteReminder,
} from "@/src/hooks";
import { Button, Input, Modal } from "@/src/components/ui";
import type { Reminder } from "@/src/types";

// --- Types ---

type ReminderFormData = {
  title: string;
  description: string;
  faqs: string;
  time: string;
  isRecurring: boolean;
};

const EMPTY_FORM: ReminderFormData = {
  title: "",
  description: "",
  faqs: "",
  time: "9:00 AM",
  isRecurring: true,
};

// --- Helpers ---

/** Convert "9:00 AM" → UTC ISO string using device's local timezone */
function timeToISO(timeStr: string): string {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return new Date().toISOString();
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Convert UTC ISO string → local "9:00 AM" display string */
function isoToTimeString(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? "AM" : "PM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
}

function getScheduleLabel(reminder: Reminder): string {
  if (!reminder.scheduledTime) return "Not scheduled";
  const timeStr = isoToTimeString(reminder.scheduledTime);
  return reminder.isRecurring ? `Daily · ${timeStr}` : timeStr;
}

// --- Component ---

export default function RemindersScreen() {
  const { senior, seniorId, isLoading: seniorLoading } = useCurrentSenior();
  const {
    data: reminders,
    isLoading: remindersLoading,
    refetch: refetchReminders,
  } = useReminders(seniorId);
  const createReminder = useCreateReminder(seniorId);
  const updateReminder = useUpdateReminder(seniorId);
  const deleteReminder = useDeleteReminder(seniorId);

  const [refreshing, setRefreshing] = useState(false);
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [deletingReminder, setDeletingReminder] = useState<Reminder | null>(null);
  const [form, setForm] = useState<ReminderFormData>(EMPTY_FORM);

  const seniorFirstName = useMemo(
    () => (senior?.name ?? "your loved one").split(" ")[0],
    [senior?.name],
  );

  const activeReminders = useMemo(
    () => (reminders ?? []).filter((r) => r.isActive),
    [reminders],
  );

  // --- Handlers ---

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchReminders();
    setRefreshing(false);
  }, [refetchReminders]);

  const openAddModal = useCallback(() => {
    setEditingReminder(null);
    setShowTimePicker(false);
    setForm(EMPTY_FORM);
    setFormModalVisible(true);
  }, []);

  const openEditModal = useCallback((reminder: Reminder) => {
    setEditingReminder(reminder);
    setShowTimePicker(false);
    setForm({
      title: reminder.title,
      description: reminder.description ?? "",
      faqs: "",
      time: reminder.scheduledTime ? isoToTimeString(reminder.scheduledTime) : "9:00 AM",
      isRecurring: reminder.isRecurring ?? true,
    });
    setFormModalVisible(true);
  }, []);

  const closeFormModal = useCallback(() => {
    setFormModalVisible(false);
    setShowTimePicker(false);
    setEditingReminder(null);
    setForm(EMPTY_FORM);
  }, []);

  const openDeleteModal = useCallback((reminder: Reminder) => {
    setDeletingReminder(reminder);
    setDeleteModalVisible(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalVisible(false);
    setDeletingReminder(null);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) return;

    const description = [form.description.trim(), form.faqs.trim()]
      .filter(Boolean)
      .join("\n\nFAQs:\n");

    try {
      if (editingReminder) {
        await updateReminder.mutateAsync({
          id: editingReminder.id,
          data: {
            title: trimmedTitle,
            description: description || undefined,
            isRecurring: form.isRecurring,
            scheduledTime: timeToISO(form.time),
          },
        });
      } else {
        await createReminder.mutateAsync({
          type: "custom",
          title: trimmedTitle,
          description: description || undefined,
          isRecurring: form.isRecurring,
          isActive: true,
          scheduledTime: timeToISO(form.time),
        });
      }
      closeFormModal();
    } catch {
      // Error handled by react-query
    }
  }, [form, editingReminder, createReminder, updateReminder, closeFormModal]);

  const handleDelete = useCallback(async () => {
    if (!deletingReminder) return;
    try {
      await deleteReminder.mutateAsync(deletingReminder.id);
      closeDeleteModal();
    } catch {
      // Error handled by react-query
    }
  }, [deletingReminder, deleteReminder, closeDeleteModal]);

  const isSaving = createReminder.isPending || updateReminder.isPending;
  const canSave = form.title.trim().length > 0 && !isSaving && !!seniorId;

  // --- Loading state ---

  if (seniorLoading) {
    return (
      <SafeAreaView className="flex-1 bg-cream">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.sage} />
        </View>
      </SafeAreaView>
    );
  }

  // --- Render ---

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
      {/* Header */}
      <View className="px-6 pt-4 pb-2">
        <Text className="text-[28px] font-semibold text-charcoal">
          Reminders
        </Text>
        <Text className="text-[15px] text-muted mt-1">
          Manage what Donna reminds {seniorFirstName} about
        </Text>
      </View>

      {/* Add New Reminder Button — fuera del FlatList para evitar problemas de touch */}
      <View className="px-6 pt-2 pb-2">
        <Button
          title="Add New Reminder"
          onPress={openAddModal}
          icon={<Plus size={18} color={COLORS.white} />}
        />
      </View>

      {/* Reminder List */}
      {remindersLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.sage} />
        </View>
      ) : (
        <FlatList
          data={activeReminders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.sage}
            />
          }
          ListEmptyComponent={
            <View
              className="bg-white rounded-2xl p-6 items-center mt-2"
              style={{ borderWidth: 1, borderColor: COLORS.border }}
            >
              <Bell size={32} color={COLORS.muted} />
              <Text className="text-muted text-[15px] mt-3 text-center">
                No reminders yet.{"\n"}Add a reminder for Donna to mention during
                calls with {seniorFirstName}.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ReminderCard
              reminder={item}
              onEdit={openEditModal}
              onDelete={openDeleteModal}
            />
          )}
        />
      )}

      {/* Add / Edit Reminder Modal */}
      <Modal
        visible={formModalVisible}
        onClose={closeFormModal}
        title={editingReminder ? "Edit Reminder" : "Add Reminder"}
        variant="bottom-sheet"
      >
        <View style={{ paddingBottom: 24 }}>
          <View style={{ marginBottom: 16 }}>
            <Input
              label="Title"
              placeholder="e.g. Take blood pressure medicine"
              value={form.title}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, title: text }))
              }
            />
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
              Description
            </Text>
            <TextInput
              style={{
                width: "100%",
                backgroundColor: "white",
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(0,0,0,0.08)",
                fontSize: 15,
                color: COLORS.charcoal,
                minHeight: 80,
                textAlignVertical: "top",
              }}
              placeholder="Details Donna should know about this reminder"
              placeholderTextColor={COLORS.muted}
              multiline
              value={form.description}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, description: text }))
              }
              accessibilityLabel="Description"
            />
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
              FAQs (optional)
            </Text>
            <TextInput
              style={{
                width: "100%",
                backgroundColor: "white",
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(0,0,0,0.08)",
                fontSize: 15,
                color: COLORS.charcoal,
                minHeight: 80,
                textAlignVertical: "top",
              }}
              placeholder="Common questions and answers about this reminder"
              placeholderTextColor={COLORS.muted}
              multiline
              value={form.faqs}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, faqs: text }))
              }
              accessibilityLabel="Frequently asked questions"
            />
          </View>

          {/* Time picker */}
          <View style={{ marginBottom: 16 }}>
            <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
              Time
            </Text>
            <Pressable
              onPress={() => setShowTimePicker((prev) => !prev)}
              style={{
                width: "100%",
                backgroundColor: "white",
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(0,0,0,0.08)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              accessibilityRole="button"
              accessibilityLabel="Select reminder time"
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Clock size={16} color={COLORS.muted} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 15, color: COLORS.charcoal }}>{form.time}</Text>
              </View>
              <ChevronDown size={18} color={COLORS.muted} />
            </Pressable>
            {showTimePicker && (
              <View
                style={{
                  backgroundColor: "white",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(0,0,0,0.08)",
                  marginTop: 4,
                  maxHeight: 300,
                  overflow: "hidden",
                }}
              >
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                >
                  {TIME_OPTIONS.map((time) => (
                    <Pressable
                      key={time}
                      onPress={() => {
                        setForm((prev) => ({ ...prev, time }));
                        setShowTimePicker(false);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={time}
                    >
                      <Text style={{ fontSize: 15, color: COLORS.charcoal }}>{time}</Text>
                      {form.time === time && <Check size={18} color={COLORS.sage} />}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Recurring toggle */}
          <View style={{ marginBottom: 20 }}>
            <Text className="text-[13px] font-medium text-muted mb-2 uppercase tracking-wider">
              Frequency
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => setForm((prev) => ({ ...prev, isRecurring: true }))}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  backgroundColor: form.isRecurring ? COLORS.sage : "white",
                  borderColor: form.isRecurring ? COLORS.sage : "rgba(0,0,0,0.08)",
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: form.isRecurring }}
                accessibilityLabel="Daily"
              >
                <Text style={{ fontSize: 13, fontWeight: "500", color: form.isRecurring ? "white" : COLORS.charcoal }}>
                  Daily
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setForm((prev) => ({ ...prev, isRecurring: false }))}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  backgroundColor: !form.isRecurring ? COLORS.sage : "white",
                  borderColor: !form.isRecurring ? COLORS.sage : "rgba(0,0,0,0.08)",
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: !form.isRecurring }}
                accessibilityLabel="One-time"
              >
                <Text style={{ fontSize: 13, fontWeight: "500", color: !form.isRecurring ? "white" : COLORS.charcoal }}>
                  One-Time
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Tip box */}
          <View
            style={{
              backgroundColor: COLORS.beige,
              borderRadius: 16,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 20 }}>
              Donna will weave this reminder naturally into the conversation —
              no robotic announcements.
            </Text>
          </View>

          <Button
            title={editingReminder ? "Save Changes" : "Add Reminder"}
            onPress={handleSave}
            disabled={!canSave}
            loading={isSaving}
          />

          {(createReminder.isError || updateReminder.isError) && (
            <Text
              style={{ fontSize: 13, textAlign: "center", marginTop: 12, color: COLORS.destructive }}
            >
              Something went wrong. Please try again.
            </Text>
          )}
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        onClose={closeDeleteModal}
        title="Delete Reminder"
        variant="centered"
      >
        <Text className="text-muted text-[15px] mb-5 leading-5">
          This will permanently remove "{deletingReminder?.title}" and it will
          no longer be mentioned during calls with {seniorFirstName}.
        </Text>

        <View className="gap-3">
          <Button
            title="Delete Reminder"
            onPress={handleDelete}
            variant="destructive"
            loading={deleteReminder.isPending}
            disabled={deleteReminder.isPending}
            className="bg-accent-pink"
          />
          <Button
            title="Cancel"
            onPress={closeDeleteModal}
            variant="secondary"
            disabled={deleteReminder.isPending}
          />
        </View>

        {deleteReminder.isError && (
          <Text className="text-[13px] text-center mt-3" style={{ color: COLORS.destructive }}>
            Failed to delete reminder. Please try again.
          </Text>
        )}
      </Modal>
    </SafeAreaView>
  );
}

// --- Reminder Card Sub-component ---

function ReminderCard({
  reminder,
  onEdit,
  onDelete,
}: {
  reminder: Reminder;
  onEdit: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
}) {
  const scheduleLabel = useMemo(() => getScheduleLabel(reminder), [reminder]);

  return (
    <View
      className="bg-white rounded-2xl p-4 mb-3"
      style={{
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
      }}
    >
      <View className="flex-row items-center justify-between">
        {/* Title + Badge */}
        <View className="flex-1 mr-3">
          <Text
            className="text-[16px] font-semibold text-charcoal"
            numberOfLines={2}
          >
            {reminder.title}
          </Text>
          <View className="flex-row mt-2">
            <View className="bg-beige rounded-full px-3 py-1">
              <Text className="text-muted text-[12px] font-medium">
                {scheduleLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="flex-row items-center gap-1">
          <Pressable
            className="w-12 h-12 items-center justify-center rounded-xl"
            onPress={() => onEdit(reminder)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${reminder.title}`}
            hitSlop={4}
          >
            <Edit2 size={18} color={COLORS.muted} />
          </Pressable>
          <Pressable
            className="w-12 h-12 items-center justify-center rounded-xl"
            onPress={() => onDelete(reminder)}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${reminder.title}`}
            hitSlop={4}
          >
            <Trash2 size={18} color={COLORS.accentPink} />
          </Pressable>
        </View>
      </View>

      {/* Description preview */}
      {reminder.description && (
        <Text
          className="text-muted text-[14px] mt-2 leading-5"
          numberOfLines={2}
        >
          {reminder.description}
        </Text>
      )}
    </View>
  );
}
