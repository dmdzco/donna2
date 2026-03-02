import { Plus, Trash2, Edit2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useApi } from '../../lib/api';

type TabType = 'active' | 'completed';

interface Reminder {
  id: string;
  title: string;
  time: string;
  completed: boolean;
}

export default function RemindersTab() {
  const api = useApi();
  const [tab, setTab] = useState<TabType>('active');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await api.getReminders();
      setReminders(data?.reminders ?? []);
    } catch {
      // use empty list
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingId(null);
    setTitle('');
    setTime('');
    setModalVisible(true);
  }

  function openEdit(r: Reminder) {
    setEditingId(r.id);
    setTitle(r.title);
    setTime(r.time);
    setModalVisible(true);
  }

  async function save() {
    if (!title.trim()) return;
    try {
      if (editingId) {
        await api.updateReminder(editingId, { title: title.trim(), time });
        setReminders((prev) =>
          prev.map((r) => (r.id === editingId ? { ...r, title: title.trim(), time } : r))
        );
      } else {
        const data = await api.createReminder({ title: title.trim(), time });
        const newReminder = data?.reminder ?? { id: Date.now().toString(), title: title.trim(), time, completed: false };
        setReminders((prev) => [...prev, newReminder]);
      }
      setModalVisible(false);
    } catch {
      Alert.alert('Error', 'Could not save reminder.');
    }
  }

  async function deleteReminder(id: string) {
    Alert.alert('Delete Reminder', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteReminder(id);
            setReminders((prev) => prev.filter((r) => r.id !== id));
          } catch {
            Alert.alert('Error', 'Could not delete reminder.');
          }
        },
      },
    ]);
  }

  const filtered = reminders.filter((r) =>
    tab === 'active' ? !r.completed : r.completed
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.textPrimary }}>Reminders</Text>
      </View>

      {/* Tab Toggle */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: 20,
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 4,
          marginBottom: 20,
        }}
      >
        {(['active', 'completed'] as TabType[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              paddingVertical: 10,
              alignItems: 'center',
              borderRadius: 10,
              backgroundColor: tab === t ? colors.white : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: tab === t ? colors.primary : colors.textSecondary,
                textTransform: 'capitalize',
              }}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 15, color: colors.textSecondary }}>
                No {tab} reminders.
              </Text>
            </View>
          ) : (
            filtered.map((r) => (
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
                  {r.time ? (
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 3 }}>{r.time}</Text>
                  ) : null}
                </View>
                <Pressable onPress={() => openEdit(r)} hitSlop={8} style={{ marginRight: 12 }}>
                  <Edit2 size={16} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => deleteReminder(r.id)} hitSlop={8}>
                  <Trash2 size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add Button */}
      <Pressable
        onPress={openAdd}
        style={({ pressed }) => ({
          position: 'absolute',
          bottom: 96,
          right: 20,
          backgroundColor: colors.primary,
          borderRadius: 28,
          paddingVertical: 14,
          paddingHorizontal: 22,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 5,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Plus size={20} color={colors.white} />
        <Text style={{ color: colors.white, fontWeight: '700', fontSize: 15 }}>Add New</Text>
      </Pressable>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <View style={{ backgroundColor: 'rgba(0,0,0,0.4)', position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
          <View
            style={{
              backgroundColor: colors.bg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 20 }}>
              {editingId ? 'Edit Reminder' : 'New Reminder'}
            </Text>

            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Take medication"
              style={{
                backgroundColor: colors.card,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontSize: 16,
                color: colors.textPrimary,
                marginBottom: 16,
              }}
              autoFocus
            />

            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>Time (optional)</Text>
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="9:00 AM"
              style={{
                backgroundColor: colors.card,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontSize: 16,
                color: colors.textPrimary,
                marginBottom: 24,
              }}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ fontWeight: '600', color: colors.textSecondary, fontSize: 16 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={save}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: colors.primary,
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontWeight: '600', color: colors.white, fontSize: 16 }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
