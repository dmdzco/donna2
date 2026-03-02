import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';

const INTERESTS = [
  { id: '1', emoji: '🎶', label: 'Music' },
  { id: '2', emoji: '📚', label: 'Books' },
  { id: '3', emoji: '🌿', label: 'Gardening' },
  { id: '4', emoji: '🍳', label: 'Cooking' },
  { id: '5', emoji: '⛪', label: 'Faith' },
  { id: '6', emoji: '📺', label: 'TV Shows' },
  { id: '7', emoji: '🌍', label: 'Travel' },
  { id: '8', emoji: '🧶', label: 'Crafts' },
  { id: '9', emoji: '⚽', label: 'Sports' },
  { id: '10', emoji: '👨‍👩‍👧', label: 'Family' },
  { id: '11', emoji: '🐾', label: 'Pets' },
  { id: '12', emoji: '🎯', label: 'Games' },
];

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

export default function OnboardingStep4() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24 }}>
        <ProgressBar step={4} total={5} />

        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          Step 4 of 5
        </Text>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
          Interests
        </Text>
        <Text style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 28, lineHeight: 22 }}>
          What does your loved one enjoy talking about? Select all that apply.
        </Text>

        <FlatList
          data={INTERESTS}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 10, marginBottom: 10 }}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <Pressable
                onPress={() => toggle(item.id)}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: isSelected ? colors.primary : colors.card,
                  borderRadius: 16,
                  paddingVertical: 20,
                  alignItems: 'center',
                  gap: 6,
                  opacity: pressed ? 0.8 : 1,
                  borderWidth: isSelected ? 0 : 1,
                  borderColor: colors.border,
                })}
              >
                <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: isSelected ? colors.white : colors.textPrimary,
                    textAlign: 'center',
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
          style={{ marginBottom: 24 }}
          showsVerticalScrollIndicator={false}
        />

        <Pressable
          onPress={() => router.push('/onboarding/step5')}
          style={({ pressed }) => ({
            backgroundColor: colors.primary,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
            marginBottom: 24,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: colors.white, fontSize: 17, fontWeight: '600' }}>
            {selected.size > 0 ? `Continue (${selected.size} selected)` : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
