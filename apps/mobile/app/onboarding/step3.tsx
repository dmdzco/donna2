import { useRouter } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';

interface Reminder {
  id: string;
  title: string;
  time: string;
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 32 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i < step ? colors.primary : colors.card,
          }}
        />
      ))}
    </View>
  );
}

export default function OnboardingStep3() {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([
    { id: '1', title: 'Take morning medication', time: '9:00 AM' },
    { id: '2', title: 'Drink water', time: '12:00 PM' },
  ]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');

  function addReminder() {
    if (!newTitle.trim()) return;
    const r: Reminder = { id: Date.now().toString(), title: newTitle.trim(), time: newTime || '12:00 PM' };
    setReminders((prev) => [...prev, r]);
    setNewTitle('');
    setNewTime('');
    setModalVisible(false);
  }

  function deleteReminder(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <ProgressBar step={3} total={5} />

          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            Step 3 of 5
          </Text>
          <Text style={{ fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
            Initial Reminders
          </Text>
          <Text style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 32, lineHeight: 22 }}>
            Donna will mention these reminders during calls. You can add more later.
          </Text>

          {reminders.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ fontSize: 15, color: colors.textSecondary }}>No reminders yet. Add one below!</Text>
            </View>
          )}

          {reminders.map((r) => (
            <View
              key={r.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.card,
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
                marginBottom: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>{r.title}</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{r.time}</Text>
              </View>
              <Pressable onPress={() => deleteReminder(r.id)} hitSlop={8}>
                <Trash2 size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}

          <Pressable
            onPress={() => setModalVisible(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 14,
              marginTop: 8,
              marginBottom: 32,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Plus size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>Add Reminder</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/onboarding/step4')}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: colors.white, fontSize: 17, fontWeight: '600' }}>Continue</Text>
          </Pressable>
        </ScrollView>

        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 20 }}>New Reminder</Text>

              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>Title</Text>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="e.g. Take medication"
                style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.textPrimary, marginBottom: 16 }}
                autoFocus
              />

              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>Time</Text>
              <TextInput
                value={newTime}
                onChangeText={setNewTime}
                placeholder="9:00 AM"
                style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.textPrimary, marginBottom: 24 }}
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  onPress={() => setModalVisible(false)}
                  style={{ flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.card }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={addReminder}
                  style={({ pressed }) => ({
                    flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                    backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.white }}>Add</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
