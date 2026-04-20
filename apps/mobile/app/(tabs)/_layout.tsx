import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { Home, Calendar, Bell, Settings } from "lucide-react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/constants/theme";
import { api } from "@/src/lib/api";

export default function TabLayout() {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const token = await getToken();
      return api.caregivers.me(token!);
    },
    enabled: !!isSignedIn,
  });

  useEffect(() => {
    if (profile && (!profile.seniors || profile.seniors.length === 0)) {
      router.replace("/(onboarding)/step1");
    }
  }, [profile]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: 28,
          paddingTop: 8,
          height: 88,
        },
        tabBarActiveTintColor: COLORS.sage,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.dashboard"),
          tabBarIcon: ({ color, focused }) => (
            <View
              style={
                focused
                  ? {
                      backgroundColor: COLORS.beige,
                      borderRadius: 12,
                      padding: 6,
                    }
                  : { padding: 6 }
              }
            >
              <Home size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t("tabs.schedule"),
          tabBarIcon: ({ color, focused }) => (
            <View
              style={
                focused
                  ? {
                      backgroundColor: COLORS.beige,
                      borderRadius: 12,
                      padding: 6,
                    }
                  : { padding: 6 }
              }
            >
              <Calendar size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: t("tabs.reminders"),
          tabBarIcon: ({ color, focused }) => (
            <View
              style={
                focused
                  ? {
                      backgroundColor: COLORS.beige,
                      borderRadius: 12,
                      padding: 6,
                    }
                  : { padding: 6 }
              }
            >
              <Bell size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings"),
          tabBarIcon: ({ color, focused }) => (
            <View
              style={
                focused
                  ? {
                      backgroundColor: COLORS.beige,
                      borderRadius: 12,
                      padding: 6,
                    }
                  : { padding: 6 }
              }
            >
              <Settings size={22} color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
