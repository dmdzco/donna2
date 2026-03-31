import { useAuth, useOAuth, useSignUp } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Chrome } from "lucide-react-native";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { api } from "@/src/lib/api";
import { COLORS } from "@/src/constants/theme";

WebBrowser.maybeCompleteAuthSession();

export default function CreateAccountScreen() {
  const router = useRouter();
  const { signUp, setActive, isLoaded } = useSignUp();
  const { getToken } = useAuth();
  const { startOAuthFlow: startGoogleOAuth } = useOAuth({
    strategy: "oauth_google",
  });
  const { startOAuthFlow: startAppleOAuth } = useOAuth({
    strategy: "oauth_apple",
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<
    "google" | "apple" | null
  >(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );

  async function navigateAfterAuth() {
    const token = await getToken();
    try {
      const profile = await api.caregivers.me(token!);
      if (profile.seniors?.length > 0) {
        router.replace("/(tabs)");
      } else {
        router.replace("/(onboarding)/step1" as any);
      }
    } catch {
      router.replace("/(onboarding)/step1" as any);
    }
  }

  async function handleCreateAccount() {
    const newErrors: { email?: string; password?: string } = {};
    if (!email.trim()) newErrors.email = "Email is required";
    if (!password) newErrors.password = "Password is required";
    if (password && password.length < 8)
      newErrors.password = "Password must be at least 8 characters";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    if (!isLoaded) return;
    setLoading(true);

    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        await navigateAfterAuth();
      } else {
        // Email verification may be required
        await signUp.prepareEmailAddressVerification({
          strategy: "email_code",
        });
        Alert.alert(
          "Verify your email",
          "Please check your inbox and verify your email to continue."
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not create account";
      Alert.alert("Sign Up Failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setOauthLoading(provider);
    try {
      const startFlow =
        provider === "google" ? startGoogleOAuth : startAppleOAuth;
      const { createdSessionId, setActive: setOAuthActive } =
        await startFlow();

      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
        await navigateAfterAuth();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : `${provider} sign up failed`;
      Alert.alert("OAuth Error", message);
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          className="px-6"
        >
          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            className="mt-2 mb-6 min-h-[48px] justify-center self-start"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text className="text-sage text-[16px] font-medium">
              {"<"} Back
            </Text>
          </Pressable>

          {/* Header */}
          <Text className="text-[28px] font-semibold text-charcoal mb-2">
            Create Account
          </Text>
          <Text className="text-[15px] text-muted mb-8">
            Set up your Donna account to get started
          </Text>

          {/* Email input */}
          <View className="mb-4">
            <Input
              label="Email Address"
              placeholder="your@email.com"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
            />
          </View>

          {/* Password input */}
          <View className="mb-6">
            <Input
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
            />
          </View>

          {/* Continue button */}
          <Button
            title="Continue"
            onPress={handleCreateAccount}
            loading={loading}
            disabled={loading || oauthLoading !== null}
            className="mb-6"
          />

          {/* Divider */}
          <View className="flex-row items-center mb-6">
            <View className="flex-1 h-[1px] bg-charcoal/10" />
            <Text className="mx-3 text-muted text-[13px]">or</Text>
            <View className="flex-1 h-[1px] bg-charcoal/10" />
          </View>

          {/* OAuth buttons */}
          <View className="gap-3 mb-8">
            <Button
              title="Continue with Apple"
              onPress={() => handleOAuth("apple")}
              variant="secondary"
              loading={oauthLoading === "apple"}
              disabled={loading || oauthLoading !== null}
              icon={
                <Ionicons
                  name="logo-apple"
                  size={20}
                  color={COLORS.charcoal}
                />
              }
            />
            <Button
              title="Continue with Google"
              onPress={() => handleOAuth("google")}
              variant="secondary"
              loading={oauthLoading === "google"}
              disabled={loading || oauthLoading !== null}
              icon={<Chrome size={18} color={COLORS.charcoal} />}
            />
          </View>

          {/* Footer link */}
          <View className="flex-row justify-center mb-8">
            <Text className="text-muted text-[15px]">
              Already have an account?{" "}
            </Text>
            <Pressable
              onPress={() => router.replace("/(auth)/sign-in")}
              className="min-h-[48px] justify-center"
              accessibilityRole="link"
              accessibilityLabel="Sign In"
            >
              <Text className="text-sage text-[15px] font-semibold">
                Sign In
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
