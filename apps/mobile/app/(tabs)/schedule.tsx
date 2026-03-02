import DateTimePicker from '@react-native-community/datetimepicker';
import { Plus, ChevronLeft, ChevronRight, Edit2, Trash2 } from 'lucide-react-native';
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { useApi } from '../../lib/api';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ScheduledCall {
  id: string;
  date: string; // ISO date
  time: string;
  note?: string;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatTime(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${ampm}`;
}

export default function ScheduleTab() {
  const api = useApi();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<number>(today.getDate());
  const [calls, setCalls] = useState<ScheduledCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCall, setEditingCall] = useState<ScheduledCall | null>(null);
  const [callTime, setCallTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await api.getCalls();
      setCalls(data?.calls ?? []);
    } catch {
      // empty
    } finally {
      setLoading(false);
    }
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const callsThisMonth = calls.filter((c) => {
    const d = new Date(c.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const datesWithCalls = new Set(
    callsThisMonth.map((c) => new Date(c.date).getDate())
  );

  const selectedDateISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;
  const callsForSelected = calls.filter((c) => c.date === selectedDateISO);

  function openAdd() {
    setEditingCall(null);
    setCallTime(new Date());
    setModalVisible(true);
  }

  function openEdit(call: ScheduledCall) {
    setEditingCall(call);
    const [h, mStr] = call.time.replace(' AM', '').replace(' PM', '').split(':');
    const isPM = call.time.includes('PM');
    const d = new Date();
    d.setHours(isPM ? parseInt(h) % 12 + 12 : parseInt(h) % 12, parseInt(mStr));
    setCallTime(d);
    setModalVisible(true);
  }

  async function deleteCall(id: string) {
    Alert.alert('Delete Call', 'Remove this scheduled call?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteReminder(id); // reuse delete endpoint
            setCalls((prev) => prev.filter((c) => c.id !== id));
          } catch {
            Alert.alert('Error', 'Could not delete call.');
          }
        },
      },
    ]);
  }

  async function saveCall() {
    const timeStr = formatTime(callTime);
    if (editingCall) {
      setCalls((prev) =>
        prev.map((c) => (c.id === editingCall.id ? { ...c, time: timeStr } : c))
      );
    } else {
      const newCall: ScheduledCall = {
        id: Date.now().toString(),
        date: selectedDateISO,
        time: timeStr,
      };
      setCalls((prev) => [...prev, newCall]);
    }
    setModalVisible(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.textPrimary }}>Schedule</Text>
        </View>

        {/* Calendar */}
        <View style={{ margin: 16, backgroundColor: colors.card, borderRadius: 20, padding: 16 }}>
          {/* Month nav */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Pressable onPress={prevMonth} hitSlop={8}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>
              {MONTHS[month]} {year}
            </Text>
            <Pressable onPress={nextMonth} hitSlop={8}>
              <ChevronRight size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Day labels */}
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            {DAYS_SHORT.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Date grid */}
          {Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) }).map((_, weekIdx) => (
            <View key={weekIdx} style={{ flexDirection: 'row', marginBottom: 4 }}>
              {Array.from({ length: 7 }).map((_, dayIdx) => {
                const dayNum = weekIdx * 7 + dayIdx - firstDay + 1;
                if (dayNum < 1 || dayNum > daysInMonth) {
                  return <View key={dayIdx} style={{ flex: 1 }} />;
                }
                const isToday =
                  dayNum === today.getDate() &&
                  month === today.getMonth() &&
                  year === today.getFullYear();
                const isSelected = dayNum === selectedDate;
                const hasCall = datesWithCalls.has(dayNum);

                return (
                  <Pressable
                    key={dayIdx}
                    onPress={() => setSelectedDate(dayNum)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 6,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: isSelected
                          ? colors.primary
                          : isToday
                          ? colors.card
                          : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: isToday && !isSelected ? 1.5 : 0,
                        borderColor: colors.primary,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isSelected || isToday ? '700' : '400',
                          color: isSelected ? colors.white : colors.textPrimary,
                        }}
                      >
                        {dayNum}
                      </Text>
                    </View>
                    {hasCall && (
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 2.5,
                          backgroundColor: isSelected ? colors.white : colors.primary,
                          marginTop: 2,
                        }}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* Calls for selected date */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 }}>
            {MONTHS[month]} {selectedDate}
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : callsForSelected.length === 0 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 20, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No calls scheduled for this day.</Text>
            </View>
          ) : (
            callsForSelected.map((c) => (
              <View
                key={c.id}
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
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Text style={{ color: colors.white, fontSize: 11, fontWeight: '700' }}>
                    {c.time.split(':')[0]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>Donna's Call</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{c.time}</Text>
                </View>
                <Pressable onPress={() => openEdit(c)} hitSlop={8} style={{ marginRight: 12 }}>
                  <Edit2 size={16} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => deleteCall(c.id)} hitSlop={8}>
                  <Trash2 size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Add FAB */}
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
        <Text style={{ color: colors.white, fontWeight: '700', fontSize: 15 }}>Add Call</Text>
      </Pressable>

      {/* Time Picker Modal */}
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
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>
              {editingCall ? 'Edit Call Time' : 'Add Call'}
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 20 }}>
              {MONTHS[month]} {selectedDate}, {year}
            </Text>

            <Pressable
              onPress={() => setShowTimePicker(true)}
              style={{
                backgroundColor: colors.card,
                borderRadius: 14,
                padding: 16,
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primary }}>
                {formatTime(callTime)}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>Tap to change</Text>
            </Pressable>

            {showTimePicker && (
              <DateTimePicker
                value={callTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, date) => {
                  setShowTimePicker(Platform.OS === 'ios');
                  if (date) setCallTime(date);
                }}
              />
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ fontWeight: '600', color: colors.textSecondary, fontSize: 16 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveCall}
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
