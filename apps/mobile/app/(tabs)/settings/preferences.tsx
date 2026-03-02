import { useRouter } from 'expo-router';
import { ArrowLeft, CreditCard } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../../constants/colors';

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, value, onChange }: ToggleRowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14 }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>{label}</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 }}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#E0DFDA', true: colors.primary }}
        thumbColor={colors.white}
      />
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
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 16 }} />;
}

export default function NotificationPreferences() {
  const router = useRouter();
  const [callSummaries, setCallSummaries] = useState(true);
  const [missedCallAlerts, setMissedCallAlerts] = useState(true);
  const [completedCallAlerts, setCompletedCallAlerts] = useState(true);
  const [pauseCalls, setPauseCalls] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={{ marginLeft: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary }}>Preferences</Text>
          <Text style={{ fontSize: 13, color: colors.primary, marginTop: 1 }}>
            Manage notifications and subscription
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Notifications */}
        <SectionLabel title="Notifications" />
        <View
          style={{
            backgroundColor: colors.white,
            borderRadius: 16,
            overflow: 'hidden',
            marginBottom: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          <ToggleRow
            label="Call Summaries"
            description="Receive a summary after each call with Donna"
            value={callSummaries}
            onChange={setCallSummaries}
          />
          <Divider />
          <ToggleRow
            label="Missed Call Alerts"
            description="Get notified when a scheduled call is missed"
            value={missedCallAlerts}
            onChange={setMissedCallAlerts}
          />
          <Divider />
          <ToggleRow
            label="Completed Call Alerts"
            description="Get notified when a call is successfully completed"
            value={completedCallAlerts}
            onChange={setCompletedCallAlerts}
          />
        </View>

        {/* Call Settings */}
        <SectionLabel title="Call Settings" />
        <View
          style={{
            backgroundColor: colors.white,
            borderRadius: 16,
            overflow: 'hidden',
            marginBottom: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          <ToggleRow
            label="Temporarily Pause Calls"
            description="Stop all scheduled calls until you turn this off"
            value={pauseCalls}
            onChange={setPauseCalls}
          />
        </View>

        {/* Subscription */}
        <SectionLabel title="Subscription" />
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              Current Plan
            </Text>
            <CreditCard size={20} color="rgba(255,255,255,0.7)" />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.white, marginBottom: 6 }}>
            Free Trial
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 20 }}>
            14 days remaining · Then $29/month
          </Text>
          <Pressable
            style={({ pressed }) => ({
              backgroundColor: colors.white,
              borderRadius: 12,
              paddingVertical: 13,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>
              Manage Subscription
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Sticky Save Changes button */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 20,
          paddingBottom: 32,
          paddingTop: 12,
          backgroundColor: colors.bg,
        }}
      >
        <Pressable
          style={({ pressed }) => ({
            backgroundColor: colors.primary,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
          onPress={() => router.back()}
        >
          <Text style={{ color: colors.white, fontSize: 17, fontWeight: '700' }}>Save Changes</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
