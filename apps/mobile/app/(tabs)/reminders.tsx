import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Edit2, Trash2, Plus, Bell } from "lucide-react-native";
import { COLORS } from "@/src/constants/theme";
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
};

const EMPTY_FORM: ReminderFormData = { title: "", description: "", faqs: "" };

// --- Helper ---

function getScheduleLabel(reminder: Reminder): string {
  if (reminder.isRecurring && reminder.cronExpression) return "Daily";
  if (reminder.scheduledTime) {
    try {
      return new Date(reminder.scheduledTime).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Scheduled";
    }
  }
  return "Not scheduled";
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
    setForm(EMPTY_FORM);
    setFormModalVisible(true);
  }, []);

  const openEditModal = useCallback((reminder: Reminder) => {
    setEditingReminder(reminder);
    setForm({
      title: reminder.title,
      description: reminder.description ?? "",
      faqs: "",
    });
    setFormModalVisible(true);
  }, []);

  const closeFormModal = useCallback(() => {
    setFormModalVisible(false);
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
          },
        });
      } else {
        await createReminder.mutateAsync({
          type: "custom",
          title: trimmedTitle,
          description: description || undefined,
          isRecurring: false,
          isActive: true,
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
  const canSave = form.title.trim().length > 0 && !isSaving;

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

      {/* Reminder List */}
      {remindersLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.sage} />
        </View>
      ) : (
        <FlatList
          data={activeReminders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.sage}
            />
          }
          ListHeaderComponent={
            <View className="mt-4">
              {/* Add New Reminder Button */}
              <Button
                title="Add New Reminder"
                onPress={openAddModal}
                icon={<Plus size={18} color={COLORS.white} />}
                className="mb-4"
              />
            </View>
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
        <View className="pb-6">
          <View className="mb-4">
            <Input
              label="Title"
              placeholder="e.g. Take blood pressure medicine"
              value={form.title}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, title: text }))
              }
              autoFocus
            />
          </View>

          <View className="mb-4">
            <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
              Description
            </Text>
            <TextInput
              className="w-full bg-white px-4 py-3.5 rounded-2xl border border-charcoal/10 text-[15px] text-charcoal"
              placeholder="Details Donna should know about this reminder"
              placeholderTextColor={COLORS.muted}
              multiline
              textAlignVertical="top"
              style={{ minHeight: 80 }}
              value={form.description}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, description: text }))
              }
              accessibilityLabel="Description"
            />
          </View>

          <View className="mb-5">
            <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
              FAQs (optional)
            </Text>
            <TextInput
              className="w-full bg-white px-4 py-3.5 rounded-2xl border border-charcoal/10 text-[15px] text-charcoal"
              placeholder="Common questions and answers about this reminder"
              placeholderTextColor={COLORS.muted}
              multiline
              textAlignVertical="top"
              style={{ minHeight: 80 }}
              value={form.faqs}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, faqs: text }))
              }
              accessibilityLabel="Frequently asked questions"
            />
          </View>

          {/* Tip box */}
          <View className="bg-beige rounded-2xl p-4 mb-5">
            <Text className="text-muted text-[13px] leading-5">
              Donna will weave this reminder naturally into the conversation --
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
            <Text className="text-destructive text-[13px] text-center mt-3">
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
            className="bg-accentPink"
          />
          <Button
            title="Cancel"
            onPress={closeDeleteModal}
            variant="secondary"
            disabled={deleteReminder.isPending}
          />
        </View>

        {deleteReminder.isError && (
          <Text className="text-destructive text-[13px] text-center mt-3">
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
