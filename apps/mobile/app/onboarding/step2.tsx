import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';

const RELATIONSHIPS = ['Son', 'Daughter', 'Spouse', 'Partner', 'Sibling', 'Friend', 'Other'];

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

export default function OnboardingStep2() {
  const router = useRouter();
  const [lovedOneName, setLovedOneName] = useState('');
  const [lovedOnePhone, setLovedOnePhone] = useState('');
  const [relationship, setRelationship] = useState('Daughter');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <ProgressBar step={2} total={5} />

          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            Step 2 of 5
          </Text>
          <Text style={{ fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
            About Your Loved One
          </Text>
          <Text style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 32, lineHeight: 22 }}>
            Donna will call this person. We need their name and phone number.
          </Text>

          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>Their Name</Text>
          <TextInput
            value={lovedOneName}
            onChangeText={setLovedOneName}
            placeholder="Margaret"
            autoCapitalize="words"
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.textPrimary,
              marginBottom: 16,
            }}
          />

          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>Their Phone Number</Text>
          <TextInput
            value={lovedOnePhone}
            onChangeText={setLovedOnePhone}
            placeholder="+1 (555) 000-0000"
            keyboardType="phone-pad"
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.textPrimary,
              marginBottom: 16,
            }}
          />

          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>Your Relationship</Text>
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              marginBottom: 40,
              overflow: 'hidden',
            }}
          >
            <Picker
              selectedValue={relationship}
              onValueChange={(val) => setRelationship(val)}
              style={{ color: colors.textPrimary }}
            >
              {RELATIONSHIPS.map((r) => (
                <Picker.Item key={r} label={r} value={r} />
              ))}
            </Picker>
          </View>

          <Pressable
            onPress={() => router.push('/onboarding/step3')}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
