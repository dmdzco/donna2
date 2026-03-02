import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { ChevronRight, User, Heart, Bell, HelpCircle, LogOut } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../../constants/colors';

interface RowProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  subtitle: string;
  onPress: () => void;
  destructive?: boolean;
}

function Row({ icon, iconBg, label, subtitle, onPress, destructive }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: destructive ? '#E53E3E' : colors.textPrimary }}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>{subtitle}</Text>
        ) : null}
      </View>
      {!destructive && <ChevronRight size={18} color={colors.textSecondary} />}
    </Pressable>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.white,
        borderRadius: 16,
        marginHorizontal: 20,
        marginBottom: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 1,
      }}
    >
      {children}
    </View>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <Text
      style={{
        fontSize: 13,
        fontWeight: '700',
        color: colors.textSecondary,
        paddingHorizontal: 20,
        marginBottom: 8,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      {title}
    </Text>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 68 }} />;
}

export default function SettingsTab() {
  const router = useRouter();
  const { signOut } = useAuth();

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.textPrimary }}>Settings</Text>
          <Text style={{ fontSize: 14, color: colors.primary, marginTop: 4 }}>
            Manage your account and preferences
          </Text>
        </View>

        {/* Profiles */}
        <SectionLabel title="Profiles" />
        <SectionCard>
          <Row
            icon={<Heart size={18} color="#c0666e" />}
            iconBg="#fde8ea"
            label="Loved One Profile"
            subtitle="Margaret's info"
            onPress={() => router.push('/(tabs)/settings/loved-one')}
          />
          <Divider />
          <Row
            icon={<User size={18} color={colors.primary} />}
            iconBg="#e6ede8"
            label="Caregiver Profile"
            subtitle="Your account info"
            onPress={() => router.push('/(tabs)/settings/caregiver')}
          />
        </SectionCard>

        {/* Preferences — includes Notification Preferences AND Help Center */}
        <SectionLabel title="Preferences" />
        <SectionCard>
          <Row
            icon={<Bell size={18} color={colors.primary} />}
            iconBg="#e6ede8"
            label="Notification Preferences"
            subtitle="Alerts, subscription"
            onPress={() => router.push('/(tabs)/settings/preferences')}
          />
          <Divider />
          <Row
            icon={<HelpCircle size={18} color={colors.primary} />}
            iconBg="#e6ede8"
            label="Help Center"
            subtitle="Help, Feedback, About Donna"
            onPress={() => router.push('/(tabs)/settings/help-center')}
          />
        </SectionCard>

        {/* Account */}
        <SectionLabel title="Account" />
        <SectionCard>
          <Row
            icon={<LogOut size={18} color="#E53E3E" />}
            iconBg="#fdeaea"
            label="Sign Out"
            subtitle=""
            onPress={handleSignOut}
            destructive
          />
        </SectionCard>

        {/* Footer */}
        <Text style={{ textAlign: 'center', color: colors.primary, fontSize: 14, marginTop: 8 }}>
          Donna v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
