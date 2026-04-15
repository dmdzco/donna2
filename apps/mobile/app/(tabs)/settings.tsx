import { useState } from "react";
import { Alert, View, Text, Pressable, ScrollView, DevSettings } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import {
  Heart,
  User,
  Bell,
  HelpCircle,
  ChevronRight,
  LogOut,
  Trash2,
} from "lucide-react-native";
import { COLORS } from "@/src/constants/theme";
import { Modal } from "@/src/components/ui/Modal";
import { Button } from "@/src/components/ui/Button";
import { api, getErrorMessage } from "@/src/lib/api";
import { useStableIdempotencyKey } from "@/src/hooks/useStableIdempotencyKey";

type SettingsRow = {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  route: string;
};

const PROFILE_ROWS: SettingsRow[] = [
  {
    icon: <Heart size={18} color={COLORS.accentPink} />,
    iconBg: "bg-pink-100",
    title: "Loved One Profile",
    subtitle: "Name, interests, and preferences",
    route: "/settings/loved-one",
  },
  {
    icon: <User size={18} color={COLORS.sage} />,
    iconBg: "bg-sage/10",
    title: "Caregiver Profile",
    subtitle: "Your account information",
    route: "/settings/caregiver",
  },
];

const PREFERENCE_ROWS: SettingsRow[] = [
  {
    icon: <Bell size={18} color={COLORS.sage} />,
    iconBg: "bg-sage/10",
    title: "Notification Preferences",
    subtitle: "Manage alerts and summaries",
    route: "/settings/notifications",
  },
  {
    icon: <HelpCircle size={18} color={COLORS.sage} />,
    iconBg: "bg-sage/10",
    title: "Help Center",
    subtitle: "FAQ, feedback, and support",
    route: "/settings/help",
  },
];

function SettingsRowItem({
  row,
  onPress,
  showSeparator,
}: {
  row: SettingsRow;
  onPress: () => void;
  showSeparator: boolean;
}) {
  return (
    <>
      <Pressable
        onPress={onPress}
        className="flex-row items-center py-3.5 px-1"
        accessibilityRole="button"
        accessibilityLabel={row.title}
        style={{ minHeight: 48 }}
      >
        <View
          className={`w-10 h-10 rounded-full items-center justify-center ${row.iconBg}`}
        >
          {row.icon}
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-[15px] font-medium text-charcoal">
            {row.title}
          </Text>
          <Text className="text-[13px] text-muted mt-0.5">{row.subtitle}</Text>
        </View>
        <ChevronRight size={18} color={COLORS.muted} />
      </Pressable>
      {showSeparator && <View className="h-px bg-charcoal/5 ml-14" />}
    </>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut, getToken } = useAuth();
  const queryClient = useQueryClient();
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const deleteAccountIdempotency = useStableIdempotencyKey("account-delete");

  const clearLocalSession = async () => {
    queryClient.clear();

    try {
      await Promise.race([
        signOut(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 3000)
        ),
      ]);
    } catch {
      // Timed out or failed — continue to force-clear below
    }

    try {
      await SecureStore.deleteItemAsync("__clerk_client_jwt");
    } catch {}

    try {
      await Updates.reloadAsync();
    } catch {
      // Updates.reloadAsync() fails in dev builds — use DevSettings reload
      if (__DEV__ && DevSettings?.reload) {
        DevSettings.reload();
      } else {
        setSigningOut(false);
        setDeletingAccount(false);
        setShowSignOutModal(false);
        setShowDeleteAccountModal(false);
        router.replace("/");
      }
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await clearLocalSession();
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Please sign in again before deleting your account.");
      }

      const result = await api.account.delete(token, {
        idempotencyKey: deleteAccountIdempotency.getKey({ action: "delete-account" }),
      });
      deleteAccountIdempotency.reset();
      const message =
        result.message ??
        "Your Donna account and eligible Donna data have been deleted.";

      Alert.alert("Account Deleted", message, [
        { text: "OK", onPress: () => void clearLocalSession() },
      ]);
    } catch (error) {
      setDeletingAccount(false);
      setShowDeleteAccountModal(false);
      Alert.alert(
        "Delete Account Failed",
        getErrorMessage(error, "Please contact support to delete your account.")
      );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="pt-4 pb-6">
          <Text className="text-[28px] font-semibold text-charcoal">
            Settings
          </Text>
          <Text className="text-[15px] text-muted mt-1">
            Manage your account and preferences
          </Text>
        </View>

        {/* Profiles Section */}
        <View className="mb-6">
          <Text className="text-[13px] font-medium text-muted uppercase tracking-wider mb-2">
            Profiles
          </Text>
          <View className="bg-white rounded-2xl border border-charcoal/10 px-4">
            {PROFILE_ROWS.map((row, index) => (
              <SettingsRowItem
                key={row.route}
                row={row}
                onPress={() => router.push(row.route as any)}
                showSeparator={index < PROFILE_ROWS.length - 1}
              />
            ))}
          </View>
        </View>

        {/* Preferences Section */}
        <View className="mb-6">
          <Text className="text-[13px] font-medium text-muted uppercase tracking-wider mb-2">
            Preferences
          </Text>
          <View className="bg-white rounded-2xl border border-charcoal/10 px-4">
            {PREFERENCE_ROWS.map((row, index) => (
              <SettingsRowItem
                key={row.route}
                row={row}
                onPress={() => router.push(row.route as any)}
                showSeparator={index < PREFERENCE_ROWS.length - 1}
              />
            ))}
          </View>
        </View>

        {/* Account Section */}
        <View className="mb-6">
          <Text className="text-[13px] font-medium text-muted uppercase tracking-wider mb-2">
            Account
          </Text>
          <View className="bg-white rounded-2xl border border-charcoal/10 px-4">
            <Pressable
              onPress={() => setShowSignOutModal(true)}
              className="flex-row items-center py-3.5 px-1"
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
              style={{ minHeight: 48 }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center bg-red-50">
                <LogOut size={18} color={COLORS.destructive} />
              </View>
              <Text className="text-[15px] font-medium ml-3" style={{ color: COLORS.destructive }}>
                Sign Out
              </Text>
            </Pressable>
            <View className="h-px bg-charcoal/5 ml-14" />
            <Pressable
              onPress={() => setShowDeleteAccountModal(true)}
              className="flex-row items-center py-3.5 px-1"
              accessibilityRole="button"
              accessibilityLabel="Delete Account"
              style={{ minHeight: 48 }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center bg-red-50">
                <Trash2 size={18} color={COLORS.destructive} />
              </View>
              <Text className="text-[15px] font-medium ml-3" style={{ color: COLORS.destructive }}>
                Delete Account
              </Text>
            </Pressable>
          </View>
        </View>

        {/* App Version */}
        <Text className="text-[13px] text-muted text-center mb-8">
          Donna v1.0.0
        </Text>
      </ScrollView>

      {/* Sign Out Confirmation Modal */}
      <Modal
        visible={showSignOutModal}
        onClose={() => setShowSignOutModal(false)}
        title="Sign Out"
        variant="centered"
      >
        <Text className="text-[15px] text-muted mb-6">
          Are you sure you want to sign out? You'll need to sign in again to
          access your account.
        </Text>
        <View className="gap-3">
          <Button
            title="Sign Out"
            variant="destructive"
            onPress={handleSignOut}
            loading={signingOut}
            testID="sign-out-confirm"
          />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => setShowSignOutModal(false)}
          />
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
        title="Delete Account"
        variant="centered"
      >
        <Text className="text-[15px] text-muted mb-6">
          This deletes your Donna account. If you are the only caregiver for a
          loved one, Donna will also delete their profile, reminders, and call
          history. This cannot be undone.
        </Text>
        <View className="gap-3">
          <Button
            title="Delete Account"
            variant="destructive"
            onPress={handleDeleteAccount}
            loading={deletingAccount}
            testID="delete-account-confirm"
          />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => setShowDeleteAccountModal(false)}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}
