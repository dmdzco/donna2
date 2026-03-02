import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
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
import { useApi } from '../../../lib/api';

const INTERESTS = ['Music', 'Books', 'Gardening', 'Cooking', 'Faith', 'TV Shows', 'Travel', 'Crafts', 'Sports', 'Family', 'Pets', 'Games'];

export default function LovedOneProfile() {
  const router = useRouter();
  const api = useApi();

  const [seniorId, setSeniorId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());
  const [topicsToAvoid, setTopicsToAvoid] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSeniors()
      .then((data) => {
        const s = data?.seniors?.[0];
        if (s) {
          setSeniorId(s.id);
          setName(s.name ?? '');
          setPhone(s.phone ?? '');
          setEmail(s.email ?? '');
          setCity(s.city ?? '');
          setState(s.state ?? '');
          setZip(s.zip ?? '');
          if (s.interests) setSelectedInterests(new Set(s.interests));
          setTopicsToAvoid(s.topicsToAvoid ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleInterest(interest: string) {
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(interest)) next.delete(interest);
      else next.add(interest);
      return next;
    });
  }

  async function save() {
    if (!seniorId) return;
    setSaving(true);
    try {
      await api.updateSenior(seniorId, {
        name, phone, email, city, state, zip,
        interests: Array.from(selectedInterests),
        topicsToAvoid,
      });
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch {
      Alert.alert('Error', 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Nav */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginLeft: 12 }}>
            Loved One Profile
          </Text>
          <Pressable
            onPress={save}
            disabled={saving}
            style={({ pressed }) => ({ opacity: pressed || saving ? 0.6 : 1 })}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>Save</Text>
            }
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {['Name', 'Phone', 'Email'].map((label) => {
            const val = label === 'Name' ? name : label === 'Phone' ? phone : email;
            const setter = label === 'Name' ? setName : label === 'Phone' ? setPhone : setEmail;
            return (
              <View key={label} style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>{label}</Text>
                <TextInput
                  value={val}
                  onChangeText={setter}
                  keyboardType={label === 'Phone' ? 'phone-pad' : label === 'Email' ? 'email-address' : 'default'}
                  autoCapitalize={label === 'Email' ? 'none' : 'words'}
                  style={{
                    backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16,
                    paddingVertical: 14, fontSize: 16, color: colors.textPrimary,
                  }}
                />
              </View>
            );
          })}

          {/* Location */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <View style={{ flex: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>City</Text>
              <TextInput value={city} onChangeText={setCity} placeholder="City" style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.textPrimary }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>State</Text>
              <TextInput value={state} onChangeText={setState} placeholder="CA" autoCapitalize="characters" maxLength={2} style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.textPrimary }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>ZIP</Text>
              <TextInput value={zip} onChangeText={setZip} placeholder="90210" keyboardType="number-pad" style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.textPrimary }} />
            </View>
          </View>

          {/* Interests */}
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 }}>Interests</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {INTERESTS.map((interest) => {
              const active = selectedInterests.has(interest);
              return (
                <Pressable
                  key={interest}
                  onPress={() => toggleInterest(interest)}
                  style={({ pressed }) => ({
                    backgroundColor: active ? colors.primary : colors.card,
                    borderRadius: 20,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: active ? colors.white : colors.textPrimary }}>
                    {interest}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Topics to avoid */}
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>Topics to Avoid</Text>
          <TextInput
            value={topicsToAvoid}
            onChangeText={setTopicsToAvoid}
            placeholder="e.g. politics, health scares…"
            multiline
            numberOfLines={3}
            style={{
              backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
              fontSize: 16, color: colors.textPrimary, minHeight: 90, textAlignVertical: 'top',
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
