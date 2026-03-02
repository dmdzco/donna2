import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
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
import { colors } from '../constants/colors';

type Mode = 'signup' | 'signin';

export default function CreateAccount() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { signUp, setActive: setActiveSignUp, isLoaded: signUpLoaded } = useSignUp();
  const { signIn, setActive: setActiveSignIn, isLoaded: signInLoaded } = useSignIn();

  async function handleSubmit() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!signUpLoaded) return;
        const result = await signUp.create({ emailAddress: email, password });
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        // For simplicity, attempt complete — in production add email verification
        if (result.status === 'complete') {
          await setActiveSignUp({ session: result.createdSessionId });
          router.replace('/onboarding/step1');
        } else {
          // Handle email verification step if needed
          router.replace('/onboarding/step1');
        }
      } else {
        if (!signInLoaded) return;
        const result = await signIn.create({ identifier: email, password });
        if (result.status === 'complete') {
          await setActiveSignIn({ session: result.createdSessionId });
          router.replace('/(tabs)');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <Pressable onPress={() => router.back()} style={{ marginBottom: 32 }}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>← Back</Text>
          </Pressable>

          {/* Title */}
          <Text
            style={{
              fontSize: 34,
              fontStyle: 'italic',
              fontFamily: 'serif',
              color: colors.primary,
              marginBottom: 8,
            }}
          >
            Donna
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 36 }}>
            {mode === 'signup'
              ? 'Set up your family account in minutes.'
              : 'Sign in to manage your loved one's calls.'}
          </Text>

          {/* Email */}
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
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

          {/* Password */}
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'signup' ? 'Create a password' : 'Enter your password'}
            secureTextEntry
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.textPrimary,
              marginBottom: 28,
            }}
          />

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: 'center',
              marginBottom: 20,
              opacity: pressed || loading ? 0.75 : 1,
            })}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={{ color: colors.white, fontSize: 17, fontWeight: '600' }}>
                {mode === 'signup' ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </Pressable>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{ marginHorizontal: 12, color: colors.textSecondary, fontSize: 13 }}>or</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Toggle mode */}
          <Pressable
            onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
            style={{ alignItems: 'center' }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
              {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                {mode === 'signup' ? 'Sign In' : 'Sign Up'}
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
