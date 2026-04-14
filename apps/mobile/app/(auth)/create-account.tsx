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
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { COLORS } from "@/src/constants/theme";
import { api } from "@/src/lib/api";
import { getClerkErrorMessage, getClerkFieldErrors } from "@/src/lib/clerkErrors";

WebBrowser.maybeCompleteAuthSession();

type CreateAccountStep = "form" | "verify_email";

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

  const [step, setStep] = useState<CreateAccountStep>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState<string>();
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
        router.replace("/(onboarding)/step1");
      }
    } catch {
      router.replace("/(onboarding)/step1" as any);
    }
  }

  function resetVerificationState() {
    setVerificationCode("");
    setVerificationError(undefined);
  }

  function handleBack() {
    if (step === "verify_email") {
      setStep("form");
      resetVerificationState();
      return;
    }

    router.back();
  }

  async function handleCreateAccount() {
    const nextErrors: { email?: string; password?: string } = {};

    if (!email.trim()) nextErrors.email = "Email is required";
    if (!password) nextErrors.password = "Password is required";
    if (password && password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (!isLoaded) return;

    setLoading(true);
    setVerificationError(undefined);

    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
      });

      if (result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        await navigateAfterAuth();
        return;
      }

      await result.prepareEmailAddressVerification({ strategy: "email_code" });
      resetVerificationState();
      setStep("verify_email");
    } catch (err: unknown) {
      const clerkFieldErrors = getClerkFieldErrors(err);
      const nextFieldErrors = {
        email: clerkFieldErrors.emailAddress,
        password: clerkFieldErrors.password,
      };

      if (nextFieldErrors.email || nextFieldErrors.password) {
        setErrors((current) => ({
          ...current,
          ...nextFieldErrors,
        }));
      } else {
        Alert.alert(
          "Sign Up Failed",
          getClerkErrorMessage(err, "Could not create account")
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailVerification() {
    const normalizedCode = verificationCode.replace(/\s+/g, "");

    if (!normalizedCode) {
      setVerificationError("Verification code is required");
      return;
    }

    if (!isLoaded) return;
    setLoading(true);
    setVerificationError(undefined);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: normalizedCode,
      });

      if (result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        await navigateAfterAuth();
        return;
      }

      setVerificationError("Verification is not complete yet. Try again.");
    } catch (err: unknown) {
      setVerificationError(
        getClerkErrorMessage(err, "Could not verify that code")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerificationCode() {
    if (!isLoaded) return;
    setLoading(true);
    setVerificationError(undefined);

    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      Alert.alert("Code Sent", `We sent a fresh verification code to ${email.trim()}.`);
    } catch (err: unknown) {
      setVerificationError(
        getClerkErrorMessage(err, "Could not resend the verification code")
      );
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
      Alert.alert(
        "OAuth Error",
        getClerkErrorMessage(err, `${provider} sign up failed`)
      );
    } finally {
      setOauthLoading(null);
    }
  }

  const title =
    step === "verify_email" ? "Verify Your Email" : "Create Account";
  const subtitle =
    step === "verify_email"
      ? `Enter the code we sent to ${email.trim()}.`
      : "Set up your Donna account to get started";

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
          <Pressable
            onPress={handleBack}
            className="mt-2 mb-6 min-h-[48px] justify-center self-start"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text className="text-sage text-[16px] font-medium">
              {"<"} Back
            </Text>
          </Pressable>

          <Text className="text-[28px] font-semibold text-charcoal mb-2">
            {title}
          </Text>
          <Text className="text-[15px] text-muted mb-8">{subtitle}</Text>

          {step === "form" ? (
            <>
              <View className="mb-4">
                <Input
                  label="Email Address"
                  placeholder="your@email.com"
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    if (errors.email) {
                      setErrors((current) => ({ ...current, email: undefined }));
                    }
                  }}
                  error={errors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  autoComplete="email"
                  testID="create-account-email"
                />
              </View>

              <View className="mb-6">
                <Input
                  label="Password"
                  placeholder="••••••••"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (errors.password) {
                      setErrors((current) => ({
                        ...current,
                        password: undefined,
                      }));
                    }
                  }}
                  error={errors.password}
                  secureTextEntry
                  textContentType="oneTimeCode"
                  autoComplete="off"
                  testID="create-account-password"
                />
              </View>

              <Button
                title="Continue"
                onPress={handleCreateAccount}
                loading={loading}
                disabled={loading || oauthLoading !== null}
                className="mb-6"
                testID="create-account-submit"
              />

              <View className="flex-row items-center mb-6">
                <View className="flex-1 h-[1px] bg-charcoal/10" />
                <Text className="mx-3 text-muted text-[13px]">or</Text>
                <View className="flex-1 h-[1px] bg-charcoal/10" />
              </View>

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
                  icon={
                    <Ionicons
                      name="logo-google"
                      size={18}
                      color={COLORS.charcoal}
                    />
                  }
                />
              </View>

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
            </>
          ) : (
            <>
              <View className="mb-4">
                <Input
                  label="Verification Code"
                  placeholder="123456"
                  value={verificationCode}
                  onChangeText={(value) => {
                    setVerificationCode(value);
                    if (verificationError) {
                      setVerificationError(undefined);
                    }
                  }}
                  error={verificationError}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="create-account-verification-code"
                />
              </View>

              <Button
                title="Verify Email"
                onPress={handleEmailVerification}
                loading={loading}
                disabled={loading}
                className="mb-4"
                testID="create-account-verify-submit"
              />

              <Button
                title="Resend Code"
                onPress={handleResendVerificationCode}
                variant="secondary"
                disabled={loading}
                className="mb-4"
              />

              <Pressable
                onPress={() => {
                  setStep("form");
                  resetVerificationState();
                }}
                className="min-h-[48px] justify-center self-center mb-8"
                accessibilityRole="button"
                accessibilityLabel="Edit email address"
              >
                <Text className="text-sage text-[15px] font-medium">
                  Edit email address
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
