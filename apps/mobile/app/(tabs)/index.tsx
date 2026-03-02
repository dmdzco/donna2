import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Phone, ChevronRight, Clock, Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { useApi } from '../../lib/api';

interface Highlight {
  id: string;
  date: string;
  duration: string;
  summary: string;
  status: 'completed' | 'missed';
}

export default function Dashboard() {
  const router = useRouter();
  const { signOut } = useAuth();
  const api = useApi();

  const [lovedOneName, setLovedOneName] = useState('Your Loved One');
  const [nextCall, setNextCall] = useState<{ day: string; time: string } | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [callModalVisible, setCallModalVisible] = useState(false);
  const [calling, setCalling] = useState(false);

  const hours = new Date().getHours();
  const greeting =
    hours < 12 ? 'Good morning' : hours < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    async function load() {
      try {
        const [seniors, convos] = await Promise.all([
          api.getSeniors().catch(() => null),
          api.getConversations().catch(() => null),
        ]);

        if (seniors?.seniors?.[0]?.name) {
          setLovedOneName(seniors.seniors[0].name);
        }
        if (convos?.conversations) {
          setHighlights(
            convos.conversations.slice(0, 5).map((c: any) => ({
              id: c.id,
              date: new Date(c.created_at || c.startedAt).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              }),
              duration: c.duration ? `${Math.round(c.duration / 60)} min` : '--',
              summary: c.summary || 'Call completed',
              status: c.status === 'completed' ? 'completed' : 'missed',
            }))
          );
        }
      } catch (e) {
        // non-fatal
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleInstantCall() {
    setCalling(true);
    try {
      await api.initiateCall({ type: 'instant' });
      setCallModalVisible(false);
    } catch (e) {
      // show error
    } finally {
      setCalling(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary }}>
              {greeting}!
            </Text>
            <Text style={{ fontSize: 15, color: colors.textSecondary, marginTop: 2 }}>
              {lovedOneName}'s companion
            </Text>
          </View>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.white, fontSize: 18, fontWeight: '700' }}>
              {lovedOneName[0]?.toUpperCase() ?? 'D'}
            </Text>
          </View>
        </View>

        {/* Next Call Card */}
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: 20,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Clock size={16} color="rgba(255,255,255,0.7)" />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginLeft: 6 }}>
              NEXT CALL
            </Text>
          </View>
          <Text style={{ color: colors.white, fontSize: 28, fontWeight: '800', marginBottom: 4 }}>
            {nextCall ? `${nextCall.day} at ${nextCall.time}` : 'Schedule a call'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>
            {nextCall ? `Calling ${lovedOneName}` : 'Go to Schedule tab to set up calls'}
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/schedule')}
            style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text style={{ color: colors.white, fontSize: 14, fontWeight: '600' }}>View schedule</Text>
            <ChevronRight size={16} color={colors.white} />
          </Pressable>
        </View>

        {/* Recent Highlights */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Sparkles size={18} color={colors.primary} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginLeft: 8 }}>
            Recent Call Highlights
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : highlights.length === 0 ? (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 24,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
              No calls yet. Once Donna calls {lovedOneName}, you'll see summaries here.
            </Text>
          </View>
        ) : (
          highlights.map((h) => (
            <View
              key={h.id}
              style={{
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{h.date}</Text>
                <View
                  style={{
                    backgroundColor: h.status === 'completed' ? colors.goodBg : colors.missedBg,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: h.status === 'completed' ? colors.goodText : colors.missedText,
                    }}
                  >
                    {h.status === 'completed' ? `✓ ${h.duration}` : 'Missed'}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>{h.summary}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* FAB - Instant Call */}
      <Pressable
        onPress={() => setCallModalVisible(true)}
        style={({ pressed }) => ({
          position: 'absolute',
          bottom: 96,
          right: 20,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: colors.fab,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 6,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Phone size={26} color={colors.white} />
      </Pressable>

      {/* Call Modal */}
      <Modal visible={callModalVisible} transparent animationType="fade">
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
          onPress={() => setCallModalVisible(false)}
        >
          <Pressable
            style={{ backgroundColor: colors.bg, borderRadius: 24, padding: 28 }}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 }}>
              Call {lovedOneName} now?
            </Text>
            <Text style={{ fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 28 }}>
              Donna will call {lovedOneName} right now for a friendly check-in conversation.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setCallModalVisible(false)}
                style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 16 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleInstantCall}
                disabled={calling}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: colors.primary,
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: pressed || calling ? 0.75 : 1,
                })}
              >
                {calling ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={{ color: colors.white, fontWeight: '600', fontSize: 16 }}>Call Now</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
