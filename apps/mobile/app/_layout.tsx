import "../global.css";
import "@/src/i18n";
import { useEffect } from "react";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { useProfile } from "@/src/hooks/useProfile";
import { ApiError } from "@/src/lib/api";
import { QueryClientProvider } from "@tanstack/react-query";
import { tokenCache } from "@/src/lib/auth";
import {
  registerForPushNotifications,
  addNotificationResponseListener,
} from "@/src/lib/notifications";
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { COLORS } from "@/src/constants/theme";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { NetworkProvider } from "@/src/providers/NetworkProvider";
import { queryClient } from "@/src/lib/queryClient";
import { withErrorReporting } from "@/src/lib/errorReporting";

SplashScreen.preventAutoHideAsync();

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function AuthGuard() {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: profile, isLoading: profileLoading, isError: profileError, error: profileErrorObj } = useProfile();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const firstSegment = segments?.[0];
    const inTabsGroup = firstSegment === "(tabs)";
    const inAuthGroup = firstSegment === "(auth)";
    const isLanding = pathname === "/";
    const hasCompletedOnboarding = (profile?.seniors?.length ?? 0) > 0;

    if (!isSignedIn && inTabsGroup) {
      router.replace("/");
    } else if (isSignedIn && (isLanding || inAuthGroup)) {
      if (!profileLoading && profileError) {
        const needsOnboarding = profileErrorObj instanceof ApiError && profileErrorObj.needsOnboarding;
        if (needsOnboarding) {
          router.replace("/(onboarding)/step1" as any);
        } else {
          router.replace("/(tabs)");
        }
      } else if (!profileLoading && !hasCompletedOnboarding) {
        router.replace("/(onboarding)/step1" as any);
      } else if (hasCompletedOnboarding) {
        router.replace("/(tabs)");
      }
    } else if (isSignedIn && inTabsGroup && !profileLoading && !profileError && !hasCompletedOnboarding) {
      router.replace("/(onboarding)/step1" as any);
    }
  }, [isLoaded, isSignedIn, pathname, segments, profile, profileLoading, profileError, profileErrorObj]);

  // Register for push notifications once the user is signed in
  useEffect(() => {
    if (!isSignedIn) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        // TODO: Send token to backend when endpoint exists
        // api.notifications.registerPushToken(token);
      }
    });

    // Handle notification tap — navigate to relevant screen
    const subscription = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === "call_summary") {
        router.push("/(tabs)");
      } else if (data?.type === "missed_call") {
        router.push("/(tabs)/schedule");
      }
    });

    return () => subscription.remove();
  }, [isSignedIn]);

  if (!isLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.cream,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.sage} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
        <ClerkLoaded>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <SafeAreaProvider>
                <NetworkProvider>
                  <StatusBar style="dark" />
                  <AuthGuard />
                </NetworkProvider>
              </SafeAreaProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ClerkLoaded>
      </ClerkProvider>
    </ErrorBoundary>
  );
}

export default withErrorReporting(RootLayout);
