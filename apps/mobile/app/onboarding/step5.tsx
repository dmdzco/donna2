import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 32 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step ? colors.primary : colors.card }}
        />
      ))}
    </View>
  );
}

function formatTime(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${ampm}`;
}

export default function OnboardingStep5() {
  const router = useRouter();
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([1, 3, 5]));
  const [callTime, setCallTime] = useState(new Date(2024, 0, 1, 10, 0));
  const [showPicker, setShowPicker] = useState(false);

  function toggleDay(idx: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <ProgressBar step={5} total={5} />

        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          Step 5 of 5
        </Text>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
          Configure Donna
        </Text>
        <Text style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 32, lineHeight: 22 }}>
          Choose when Donna should call. You can always adjust this later.
        </Text>

        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 }}>Call Days</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 32 }}>
          {DAYS.map((day, idx) => {
            const active = selectedDays.has(idx);
            return (
              <Pressable
                key={day}
                onPress={() => toggleDay(idx)}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: active ? colors.primary : colors.card,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? colors.white : colors.textSecondary }}>
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 }}>Call Time</Text>
        <Pressable
          onPress={() => setShowPicker(true)}
          style={{
            backgroundColor: colors.card,
            borderRadius: 14,
            paddingHorizontal: 20,
            paddingVertical: 16,
            marginBottom: 32,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>{formatTime(callTime)}</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary }}>Tap to change</Text>
        </Pressable>

        {showPicker && (
          <DateTimePicker
            value={callTime}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, date) => {
              setShowPicker(Platform.OS === 'ios');
              if (date) setCallTime(date);
            }}
          />
        )}

        <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 32 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 }}>
            Your schedule
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 22 }}>
            Donna will call on{' '}
            {selectedDays.size === 0
              ? 'no days selected'
              : Array.from(selectedDays).sort().map((i) => DAYS[i]).join(', ')}{' '}
            at {formatTime(callTime)}.
          </Text>
        </View>

        <Pressable
          onPress={() => router.push('/onboarding/success')}
          style={({ pressed }) => ({
            backgroundColor: colors.primary,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: colors.white, fontSize: 17, fontWeight: '600' }}>Finish Setup</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
