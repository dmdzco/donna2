import { useAuth, useOAuth, useSignIn } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Chrome } from "lucide-react-native";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { api } from "@/src/lib/api";
import { COLORS } from "@/src/constants/theme";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
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
  const passwordRef = useRef<TextInput>(null);

  async function navigateAfterAuth() {
    const token = await getToken();
    try {
      const profile = await api.caregivers.me(token!);
      if (profile.seniors?.length > 0) {
        router.replace("/(tabs)");
      } else {
        router.replace("/(onboarding)/step1");
      }
    } catch {
      router.replace("/(onboarding)/step1" as any);
    }
  }

  async function handleSignIn() {
    const newErrors: { email?: string; password?: string } = {};
    if (!email.trim()) newErrors.email = "Email is required";
    if (!password) newErrors.password = "Password is required";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    if (!isLoaded) return;
    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        await navigateAfterAuth();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not sign in";
      Alert.alert("Sign In Failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert(
        "Enter your email",
        "Please enter your email address first, then tap Forgot Password."
      );
      return;
    }

    if (!isLoaded) return;

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      Alert.alert(
        "Check your email",
        "We sent a password reset code to your email address."
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not send reset email";
      Alert.alert("Error", message);
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
        err instanceof Error ? err.message : `${provider} sign in failed`;
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
            Welcome Back
          </Text>
          <Text className="text-[15px] text-muted mb-8">
            Sign in to your Donna account
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
              textContentType="none"
              autoComplete="off"
              testID="sign-in-email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>

          {/* Password input */}
          <View className="mb-2">
            <Input
              ref={passwordRef}
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              secureTextEntry
              textContentType="none"
              autoComplete="off"
              testID="sign-in-password"
              returnKeyType="go"
              onSubmitEditing={handleSignIn}
            />
          </View>

          {/* Forgot password */}
          <Pressable
            onPress={handleForgotPassword}
            className="self-end mb-6 min-h-[48px] justify-center"
            accessibilityRole="link"
            accessibilityLabel="Forgot password"
          >
            <Text className="text-sage text-[14px] font-medium">
              Forgot password?
            </Text>
          </Pressable>

          {/* Sign In button */}
          <Button
            title="Sign In"
            onPress={handleSignIn}
            loading={loading}
            disabled={loading || oauthLoading !== null}
            className="mb-6"
            testID="sign-in-submit"
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
              Don't have an account?{" "}
            </Text>
            <Pressable
              onPress={() => router.replace("/(auth)/create-account")}
              className="min-h-[48px] justify-center"
              accessibilityRole="link"
              accessibilityLabel="Sign Up"
            >
              <Text className="text-sage text-[15px] font-semibold">
                Sign Up
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
