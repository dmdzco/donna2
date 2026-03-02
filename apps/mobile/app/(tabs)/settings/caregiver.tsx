import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../../constants/colors';

export default function CaregiverProfile() {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState(
    (user?.phoneNumbers?.[0]?.phoneNumber as string) ?? ''
  );
  const [relationship, setRelationship] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await user?.update({ firstName, lastName });
      Alert.alert('Saved', 'Profile updated.');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  if (!isLoaded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const email = user?.primaryEmailAddress?.emailAddress ?? '';

  const fields = [
    { label: 'First Name', value: firstName, setter: setFirstName, auto: 'words' as const },
    { label: 'Last Name', value: lastName, setter: setLastName, auto: 'words' as const },
    { label: 'Email', value: email, setter: () => {}, auto: 'none' as const, disabled: true },
    { label: 'Phone', value: phone, setter: setPhone, auto: 'none' as const, keyboard: 'phone-pad' as const },
    { label: 'Relationship to Loved One', value: relationship, setter: setRelationship, auto: 'words' as const },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Nav */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginLeft: 12 }}>
            Your Profile
          </Text>
          <Pressable onPress={save} disabled={saving} style={({ pressed }) => ({ opacity: pressed || saving ? 0.6 : 1 })}>
            {saving
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>Save</Text>
            }
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <View style={{ alignItems: 'center', marginVertical: 24 }}>
            <View style={{
              width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: colors.white, fontSize: 32, fontWeight: '700' }}>
                {firstName[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
          </View>

          {fields.map((f) => (
            <View key={f.label} style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>{f.label}</Text>
              <TextInput
                value={f.value}
                onChangeText={f.setter}
                autoCapitalize={f.auto}
                keyboardType={(f as any).keyboard ?? 'default'}
                editable={!(f as any).disabled}
                style={{
                  backgroundColor: (f as any).disabled ? '#EDEBE4' : colors.card,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: (f as any).disabled ? colors.textSecondary : colors.textPrimary,
                }}
              />
            </View>
          ))}

          {/* Change Password */}
          <Pressable
            style={({ pressed }) => ({
              marginTop: 8,
              backgroundColor: colors.card,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              opacity: pressed ? 0.75 : 1,
            })}
            onPress={() => Alert.alert('Change Password', 'A password reset email will be sent to ' + email + '.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Send Email' },
            ])}
          >
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 16 }}>Change Password</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
