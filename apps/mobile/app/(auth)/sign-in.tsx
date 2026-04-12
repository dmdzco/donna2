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
import { COLORS } from "@/src/constants/theme";
import { api } from "@/src/lib/api";
import { getClerkErrorMessage, getClerkFieldErrors } from "@/src/lib/clerkErrors";

WebBrowser.maybeCompleteAuthSession();

type AuthFactor = {
  strategy: string;
  safeIdentifier?: string;
  emailAddressId?: string;
  phoneNumberId?: string;
  channel?: string;
};

type AuthStep =
  | { type: "credentials" }
  | { type: "forgot_password_code"; factor: AuthFactor }
  | { type: "forgot_password_new_password" }
  | { type: "choose_second_factor"; factors: AuthFactor[] }
  | { type: "second_factor_code"; factor: AuthFactor };

const SECOND_FACTOR_CODE_STRATEGIES = new Set([
  "email_code",
  "phone_code",
  "totp",
  "backup_code",
]);

const RESET_PASSWORD_CODE_STRATEGIES = new Set([
  "reset_password_email_code",
  "reset_password_phone_code",
]);

function getFactorLabel(factor: AuthFactor): string {
  switch (factor.strategy) {
    case "email_code":
      return factor.safeIdentifier
        ? `Email code to ${factor.safeIdentifier}`
        : "Email code";
    case "phone_code":
      return factor.safeIdentifier
        ? `Text code to ${factor.safeIdentifier}`
        : "Text message code";
    case "totp":
      return "Authenticator app code";
    case "backup_code":
      return "Backup code";
    case "reset_password_email_code":
      return factor.safeIdentifier
        ? `Password reset code to ${factor.safeIdentifier}`
        : "Password reset email code";
    case "reset_password_phone_code":
      return factor.safeIdentifier
        ? `Password reset code to ${factor.safeIdentifier}`
        : "Password reset phone code";
    default:
      return "Verification code";
  }
}

function getCodeInputLabel(factor: AuthFactor): string {
  switch (factor.strategy) {
    case "backup_code":
      return "Backup Code";
    case "totp":
      return "Authenticator Code";
    default:
      return "Verification Code";
  }
}

function isNumericCodeFactor(factor: AuthFactor): boolean {
  return factor.strategy !== "backup_code";
}

function canResendFactorCode(factor: AuthFactor): boolean {
  return (
    factor.strategy === "email_code" ||
    factor.strategy === "phone_code" ||
    factor.strategy === "reset_password_email_code" ||
    factor.strategy === "reset_password_phone_code"
  );
}

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

  const [authStep, setAuthStep] = useState<AuthStep>({ type: "credentials" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [verificationError, setVerificationError] = useState<string>();
  const [resetPasswordError, setResetPasswordError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<
    "google" | "apple" | null
  >(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );
  const [secondFactorOptions, setSecondFactorOptions] = useState<AuthFactor[]>(
    []
  );
  const [resetPasswordFactor, setResetPasswordFactor] =
    useState<AuthFactor | null>(null);
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

  function clearVerificationUi() {
    setVerificationCode("");
    setVerificationError(undefined);
  }

  function clearResetPasswordUi() {
    setNewPassword("");
    setConfirmNewPassword("");
    setResetPasswordError(undefined);
  }

  function resetToCredentials() {
    setAuthStep({ type: "credentials" });
    clearVerificationUi();
    clearResetPasswordUi();
    setSecondFactorOptions([]);
    setResetPasswordFactor(null);
  }

  function handleBack() {
    switch (authStep.type) {
      case "credentials":
        router.back();
        return;
      case "forgot_password_code":
        resetToCredentials();
        return;
      case "forgot_password_new_password":
        clearResetPasswordUi();
        clearVerificationUi();
        if (resetPasswordFactor) {
          setAuthStep({
            type: "forgot_password_code",
            factor: resetPasswordFactor,
          });
        } else {
          resetToCredentials();
        }
        return;
      case "choose_second_factor":
        resetToCredentials();
        return;
      case "second_factor_code":
        clearVerificationUi();
        if (secondFactorOptions.length > 1) {
          setAuthStep({
            type: "choose_second_factor",
            factors: secondFactorOptions,
          });
        } else {
          resetToCredentials();
        }
        return;
    }
  }

  async function finishSession(createdSessionId?: string | null) {
    if (!createdSessionId) {
      throw new Error("Missing session after verification");
    }
    if (!setActive) {
      throw new Error("Clerk session activation is not available yet");
    }

    await setActive({ session: createdSessionId });
    await navigateAfterAuth();
  }

  function getSupportedSecondFactorOptions(resource: any): AuthFactor[] {
    return ((resource?.supportedSecondFactors as AuthFactor[] | undefined) || [])
      .filter((factor) => SECOND_FACTOR_CODE_STRATEGIES.has(factor.strategy));
  }

  function getSupportedResetPasswordFactors(resource: any): AuthFactor[] {
    return ((resource?.supportedFirstFactors as AuthFactor[] | undefined) || [])
      .filter((factor) => RESET_PASSWORD_CODE_STRATEGIES.has(factor.strategy));
  }

  async function prepareSecondFactorCode(factor: AuthFactor) {
    if (!isLoaded) return;

    setLoading(true);
    setVerificationError(undefined);

    try {
      if (factor.strategy === "email_code" && factor.emailAddressId) {
        await signIn.prepareSecondFactor({
          strategy: factor.strategy as any,
          emailAddressId: factor.emailAddressId,
        } as any);
      } else if (factor.strategy === "phone_code" && factor.phoneNumberId) {
        await signIn.prepareSecondFactor({
          strategy: factor.strategy as any,
          phoneNumberId: factor.phoneNumberId,
        } as any);
      }

      setVerificationCode("");
      setAuthStep({ type: "second_factor_code", factor });
    } catch (err: unknown) {
      setVerificationError(
        getClerkErrorMessage(err, "Could not prepare that verification method")
      );
    } finally {
      setLoading(false);
    }
  }

  async function routeToSecondFactor(resource: any) {
    const factors = getSupportedSecondFactorOptions(resource);

    if (factors.length === 0) {
      throw new Error(
        "This account requires a second-factor method that the app does not support yet."
      );
    }

    setSecondFactorOptions(factors);
    clearVerificationUi();

    if (factors.length === 1) {
      await prepareSecondFactorCode(factors[0]);
      return;
    }

    setAuthStep({ type: "choose_second_factor", factors });
  }

  async function handleSignInResult(result: any) {
    switch (result?.status) {
      case "complete":
        await finishSession(result.createdSessionId);
        return;
      case "needs_second_factor":
        await routeToSecondFactor(result);
        return;
      case "needs_new_password":
        clearResetPasswordUi();
        setAuthStep({ type: "forgot_password_new_password" });
        return;
      default:
        throw new Error("The sign-in flow needs an unsupported verification step.");
    }
  }

  async function handleSignIn() {
    const nextErrors: { email?: string; password?: string } = {};

    if (!email.trim()) nextErrors.email = "Email is required";
    if (!password) nextErrors.password = "Password is required";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (!isLoaded) return;

    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      await handleSignInResult(result);
    } catch (err: unknown) {
      const clerkFieldErrors = getClerkFieldErrors(err);
      const nextFieldErrors = {
        email: clerkFieldErrors.identifier || clerkFieldErrors.emailAddress,
        password: clerkFieldErrors.password,
      };

      if (nextFieldErrors.email || nextFieldErrors.password) {
        setErrors((current) => ({
          ...current,
          ...nextFieldErrors,
        }));
      } else {
        Alert.alert(
          "Sign In Failed",
          getClerkErrorMessage(err, "Could not sign in")
        );
      }
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
    setLoading(true);

    try {
      const result = await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });

      const factor = getSupportedResetPasswordFactors(result)[0];

      if (!factor) {
        throw new Error(
          "Password reset is not configured for this account in a code-based flow."
        );
      }

      setResetPasswordFactor(factor);
      clearVerificationUi();
      clearResetPasswordUi();

      await signIn.prepareFirstFactor({
        strategy: factor.strategy as any,
        ...(factor.emailAddressId
          ? { emailAddressId: factor.emailAddressId }
          : {}),
        ...(factor.phoneNumberId
          ? { phoneNumberId: factor.phoneNumberId }
          : {}),
      } as any);

      setAuthStep({ type: "forgot_password_code", factor });
    } catch (err: unknown) {
      Alert.alert(
        "Password Reset Failed",
        getClerkErrorMessage(err, "Could not send a password reset code")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPasswordCodeSubmit() {
    if (authStep.type !== "forgot_password_code" || !isLoaded) return;

    const normalizedCode = verificationCode.replace(/\s+/g, "");
    if (!normalizedCode) {
      setVerificationError("Verification code is required");
      return;
    }

    setLoading(true);
    setVerificationError(undefined);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: authStep.factor.strategy as any,
        code: normalizedCode,
      } as any);

      await handleSignInResult(result);
    } catch (err: unknown) {
      setVerificationError(
        getClerkErrorMessage(err, "Could not verify that code")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPasswordSubmit() {
    if (!isLoaded) return;

    if (!newPassword) {
      setResetPasswordError("New password is required");
      return;
    }

    if (newPassword.length < 8) {
      setResetPasswordError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setResetPasswordError("Passwords do not match");
      return;
    }

    setLoading(true);
    setResetPasswordError(undefined);

    try {
      const result = await signIn.resetPassword({
        password: newPassword,
        signOutOfOtherSessions: true,
      });

      await handleSignInResult(result);
    } catch (err: unknown) {
      setResetPasswordError(
        getClerkErrorMessage(err, "Could not update your password")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSecondFactorSubmit() {
    if (authStep.type !== "second_factor_code" || !isLoaded) return;

    const normalizedCode = verificationCode.replace(/\s+/g, "");
    if (!normalizedCode) {
      setVerificationError("Verification code is required");
      return;
    }

    setLoading(true);
    setVerificationError(undefined);

    try {
      const result = await signIn.attemptSecondFactor({
        strategy: authStep.factor.strategy as any,
        code: normalizedCode,
      } as any);

      await handleSignInResult(result);
    } catch (err: unknown) {
      setVerificationError(
        getClerkErrorMessage(err, "Could not verify that code")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCurrentCode() {
    if (!isLoaded) return;

    setLoading(true);
    setVerificationError(undefined);

    try {
      if (authStep.type === "forgot_password_code") {
        await signIn.prepareFirstFactor({
          strategy: authStep.factor.strategy as any,
          ...(authStep.factor.emailAddressId
            ? { emailAddressId: authStep.factor.emailAddressId }
            : {}),
          ...(authStep.factor.phoneNumberId
            ? { phoneNumberId: authStep.factor.phoneNumberId }
            : {}),
        } as any);
      } else if (authStep.type === "second_factor_code") {
        await prepareSecondFactorCode(authStep.factor);
        return;
      }
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
        getClerkErrorMessage(err, `${provider} sign in failed`)
      );
    } finally {
      setOauthLoading(null);
    }
  }

  const title = (() => {
    switch (authStep.type) {
      case "credentials":
        return "Welcome Back";
      case "forgot_password_code":
        return "Check Your Email";
      case "forgot_password_new_password":
        return "Set a New Password";
      case "choose_second_factor":
        return "Choose Verification Method";
      case "second_factor_code":
        return getFactorLabel(authStep.factor);
    }
  })();

  const subtitle = (() => {
    switch (authStep.type) {
      case "credentials":
        return "Sign in to your Donna account";
      case "forgot_password_code":
        return `Enter the code we sent for ${getFactorLabel(authStep.factor).toLowerCase()}.`;
      case "forgot_password_new_password":
        return "Choose a new password for your account.";
      case "choose_second_factor":
        return "Your account requires a second verification step.";
      case "second_factor_code":
        return "Enter the verification code to finish signing in.";
    }
  })();

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

          {authStep.type === "credentials" && (
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
                  textContentType="none"
                  autoComplete="off"
                  testID="sign-in-email"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>

              <View className="mb-2">
                <Input
                  ref={passwordRef}
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
                  secureTextEntry={!__DEV__}
                  textContentType="none"
                  autoComplete="off"
                  testID="sign-in-password"
                  returnKeyType="go"
                  onSubmitEditing={handleSignIn}
                />
              </View>

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

              <Button
                title="Sign In"
                onPress={handleSignIn}
                loading={loading}
                disabled={loading || oauthLoading !== null}
                className="mb-6"
                testID="sign-in-submit"
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
                  icon={<Chrome size={18} color={COLORS.charcoal} />}
                />
              </View>

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
            </>
          )}

          {authStep.type === "choose_second_factor" && (
            <View className="gap-3 mb-8">
              {authStep.factors.map((factor) => (
                <Button
                  key={`${factor.strategy}-${factor.emailAddressId || factor.phoneNumberId || factor.safeIdentifier || "default"}`}
                  title={getFactorLabel(factor)}
                  onPress={() => prepareSecondFactorCode(factor)}
                  variant="secondary"
                  disabled={loading}
                />
              ))}
            </View>
          )}

          {(authStep.type === "forgot_password_code" ||
            authStep.type === "second_factor_code") && (
            <>
              <View className="mb-4">
                <Input
                  label={getCodeInputLabel(authStep.factor)}
                  placeholder={
                    authStep.factor.strategy === "backup_code"
                      ? "Enter backup code"
                      : "123456"
                  }
                  value={verificationCode}
                  onChangeText={(value) => {
                    setVerificationCode(value);
                    if (verificationError) {
                      setVerificationError(undefined);
                    }
                  }}
                  error={verificationError}
                  keyboardType={
                    isNumericCodeFactor(authStep.factor)
                      ? "number-pad"
                      : "default"
                  }
                  textContentType={
                    isNumericCodeFactor(authStep.factor)
                      ? "oneTimeCode"
                      : "none"
                  }
                  autoComplete={
                    isNumericCodeFactor(authStep.factor)
                      ? "one-time-code"
                      : "off"
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="auth-verification-code"
                />
              </View>

              <Button
                title={
                  authStep.type === "forgot_password_code"
                    ? "Verify Code"
                    : "Continue"
                }
                onPress={
                  authStep.type === "forgot_password_code"
                    ? handleForgotPasswordCodeSubmit
                    : handleSecondFactorSubmit
                }
                loading={loading}
                disabled={loading}
                className="mb-4"
                testID="auth-verification-submit"
              />

              {canResendFactorCode(authStep.factor) && (
                <Button
                  title="Resend Code"
                  onPress={handleResendCurrentCode}
                  variant="secondary"
                  disabled={loading}
                  className="mb-4"
                />
              )}
            </>
          )}

          {authStep.type === "forgot_password_new_password" && (
            <>
              <View className="mb-4">
                <Input
                  label="New Password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChangeText={(value) => {
                    setNewPassword(value);
                    if (resetPasswordError) {
                      setResetPasswordError(undefined);
                    }
                  }}
                  error={resetPasswordError}
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="new-password"
                  testID="reset-password-new"
                />
              </View>

              <View className="mb-4">
                <Input
                  label="Confirm New Password"
                  placeholder="••••••••"
                  value={confirmNewPassword}
                  onChangeText={(value) => {
                    setConfirmNewPassword(value);
                    if (resetPasswordError) {
                      setResetPasswordError(undefined);
                    }
                  }}
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="new-password"
                  testID="reset-password-confirm"
                />
              </View>

              <Button
                title="Update Password"
                onPress={handleResetPasswordSubmit}
                loading={loading}
                disabled={loading}
                className="mb-4"
                testID="reset-password-submit"
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
