import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import { Phone, Calendar } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { format, differenceInCalendarDays } from "date-fns";
import { COLORS } from "@/src/constants/theme";
import {
  useCurrentSenior,
  useConversations,
  useInitiateCall,
  useSchedule,
} from "@/src/hooks";
import { Button } from "@/src/components/ui";
import { Modal } from "@/src/components/ui";
import { getErrorMessage } from "@/src/lib/api";
import {
  formatTime12h,
  getDatePartsInTimezone,
  parseTimeString,
  resolveSeniorTimezone,
  zonedWallTimeToUtcDate,
} from "@/src/lib/timezone";
import type { Conversation } from "@/src/types";

// --- Next-call computation ---

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateForOffset(
  base: { year: number; month: number; day: number },
  offset: number,
) {
  const date = new Date(Date.UTC(base.year, base.month - 1, base.day + offset));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function localDateMs(parts: { year: number; month: number; day: number }) {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function getNextCallDate(
  scheduleData: { days?: string[]; time?: string } | null | undefined,
  timezone: string,
): Date | null {
  if (!scheduleData?.time) return null;

  const parsed = parseTimeString(scheduleData.time);
  if (!parsed) return null;

  const now = new Date();
  const nowLocal = getDatePartsInTimezone(now, timezone);
  const days = scheduleData.days;

  // Check the next 7 days for a matching day
  for (let offset = 0; offset <= 7; offset++) {
    const localDate = localDateForOffset(nowLocal, offset);
    const localDayIndex = new Date(localDateMs(localDate)).getUTCDay();
    const dayName = DAYS_SHORT[localDayIndex];
    if (days?.length && !days.includes(dayName)) continue;

    const candidate = zonedWallTimeToUtcDate(
      {
        ...localDate,
        hours: parsed.hours,
        minutes: parsed.minutes,
      },
      timezone,
    );
    if (candidate.getTime() > now.getTime()) {
      return candidate;
    }
  }

  return null;
}

function formatNextCall(nextDate: Date | null, timezone: string): string {
  if (!nextDate) return "No calls scheduled";

  const nowLocal = getDatePartsInTimezone(new Date(), timezone);
  const nextLocal = getDatePartsInTimezone(nextDate, timezone);
  const dayDiff = Math.round(
    (localDateMs(nextLocal) - localDateMs(nowLocal)) / (24 * 60 * 60 * 1000),
  );
  const timeStr = formatTime12h(nextLocal.hours, nextLocal.minutes);

  if (dayDiff === 0) return `Today at ${timeStr}`;
  if (dayDiff === 1) return `Tomorrow at ${timeStr}`;
  return `In ${dayDiff} days at ${timeStr}`;
}

// --- Status badge ---

function getCallStatus(conversation: Conversation) {
  const duration = conversation.durationSeconds ?? 0;
  if (
    conversation.status === "completed" ||
    (conversation.endedAt && duration > 10)
  ) {
    return "Answered";
  }
  return "Missed";
}

// --- Component ---

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { senior, seniorId, isLoading: seniorLoading } = useCurrentSenior();
  const {
    data: conversations,
    isLoading: convoLoading,
    refetch: refetchConversations,
  } = useConversations(seniorId);
  const { data: scheduleData, isLoading: scheduleLoading } = useSchedule(seniorId);
  const initiateCall = useInitiateCall();

  const [callModalVisible, setCallModalVisible] = useState(false);
  const [callContext, setCallContext] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const caregiverName = user?.firstName ?? "there";
  const seniorName = senior?.name ?? "your loved one";
  const seniorFirstName = seniorName.split(" ")[0];
  const seniorTimezone = useMemo(() => resolveSeniorTimezone(senior), [senior]);

  console.log("[dashboard] senior:", JSON.stringify({ id: senior?.id, name: senior?.name, phone: senior?.phone }));
  console.log("[dashboard] user:", JSON.stringify({ firstName: user?.firstName }));

  // Resolve schedule: try the schedule endpoint, fall back to senior.preferredCallTimes
  // Handles both legacy shape { days, time } and new ScheduleItem[] from schedule tab
  const resolvedSchedule = useMemo((): { days?: string[]; time?: string } | null => {
    const sd = scheduleData as Record<string, any> | null | undefined;
    const raw = sd?.schedule ?? senior?.preferredCallTimes?.schedule;

    if (!raw) {
      // Top-level legacy shape: { days, time }
      if (sd?.days || sd?.time) return sd as { days?: string[]; time?: string };
      return null;
    }

    // New shape: ScheduleItem[] — find the next applicable call
    if (Array.isArray(raw)) {
      const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const todayIndex = new Date().getDay();

      for (const item of raw as any[]) {
        if (!item.time) continue;

        if (item.frequency === "daily") {
          return { days: dayLabels, time: item.time };
        }
        if (item.frequency === "recurring" && item.recurringDays?.length > 0) {
          return {
            days: (item.recurringDays as number[]).map((d: number) => dayLabels[d]),
            time: item.time,
          };
        }
        // one-time or no frequency — treat as daily
        return { time: item.time };
      }
      return null;
    }

    // Legacy object shape: { days, time }
    if (raw.time || raw.days) {
      return raw as { days?: string[]; time?: string };
    }

    return null;
  }, [scheduleData, senior?.preferredCallTimes]);

  const nextCallDate = useMemo(
    () => getNextCallDate(resolvedSchedule, seniorTimezone),
    [resolvedSchedule, seniorTimezone],
  );
  const nextCallText = useMemo(
    () => formatNextCall(nextCallDate, seniorTimezone),
    [nextCallDate, seniorTimezone],
  );

  const recentConversations = useMemo(
    () => (conversations ?? []).slice(0, 5),
    [conversations]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchConversations();
    setRefreshing(false);
  }, [refetchConversations]);

  const handleOpenCallModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCallModalVisible(true);
  }, []);

  const handleInitiateCall = useCallback(async () => {
    if (!senior?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await initiateCall.mutateAsync(senior.id);
      setCallModalVisible(false);
      setCallContext("");
    } catch {
      // Error is handled by react-query -- could show alert here
    }
  }, [senior?.id, initiateCall]);

  // Loading state
  if (seniorLoading) {
    return (
      <SafeAreaView className="flex-1 bg-cream">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.sage} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.sage}
          />
        }
      >
        {/* Greeting */}
        <View className="px-6 pt-4 pb-2">
          <Text className="text-[28px] font-semibold text-charcoal">
            Hello, {caregiverName}
          </Text>
          <Text className="text-[15px] text-muted mt-1">
            Here's what's happening with {seniorFirstName}
          </Text>
        </View>

        {/* Next Call Card */}
        <Pressable
          className="mx-6 mt-4 rounded-[20px] bg-sage p-6"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 3,
          }}
          onPress={() => router.push("/(tabs)/schedule")}
          accessibilityRole="button"
          accessibilityLabel={`Next call: ${nextCallText}. Tap to view schedule.`}
        >
          <View className="flex-row items-center mb-3">
            <Calendar size={16} color={COLORS.white} />
            <Text className="text-white/70 text-[11px] font-semibold tracking-widest ml-2">
              NEXT CALL
            </Text>
          </View>
          {scheduleLoading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text className="text-white text-[20px] font-semibold">
              {nextCallText}
            </Text>
          )}
        </Pressable>

        {/* Recent Call Highlights */}
        <View className="px-6 mt-8">
          <Text className="text-[20px] font-semibold text-charcoal mb-4">
            Recent Call Highlights
          </Text>

          {convoLoading ? (
            <ActivityIndicator
              size="small"
              color={COLORS.sage}
              style={{ marginTop: 16 }}
            />
          ) : recentConversations.length === 0 ? (
            <View
              className="bg-white rounded-2xl p-6 items-center"
              style={{ borderWidth: 1, borderColor: COLORS.border }}
            >
              <Phone size={32} color={COLORS.muted} />
              <Text className="text-muted text-[15px] mt-3 text-center">
                No recent calls yet.{"\n"}Donna will call {seniorFirstName} at the
                scheduled time.
              </Text>
            </View>
          ) : (
            recentConversations.map((convo) => (
              <CallCard key={convo.id} conversation={convo} />
            ))
          )}
        </View>
      </ScrollView>

      {/* Floating Phone Button */}
      <Pressable
        className="absolute right-6 bottom-28 w-14 h-14 rounded-full items-center justify-center"
        style={{
          backgroundColor: COLORS.accentPink,
          shadowColor: COLORS.accentPink,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 5,
        }}
        onPress={handleOpenCallModal}
        accessibilityRole="button"
        accessibilityLabel={`Call ${seniorFirstName} now`}
      >
        <Phone size={24} color={COLORS.white} />
      </Pressable>

      {/* Instant Call Modal */}
      <Modal
        visible={callModalVisible}
        onClose={() => setCallModalVisible(false)}
        title="Instant Call"
        variant="bottom-sheet"
      >
        <View className="pb-6">
          <Text className="text-muted text-[14px] mb-3">
            Is there any additional context for this call?
          </Text>
          <TextInput
            className="bg-beige rounded-2xl p-4 text-charcoal text-[15px] min-h-[100px]"
            placeholder={`e.g. Remind ${seniorFirstName} about their doctor appointment tomorrow`}
            placeholderTextColor={COLORS.muted}
            multiline
            textAlignVertical="top"
            value={callContext}
            onChangeText={setCallContext}
          />
          <View className="mt-5">
            <Button
              title={`Call ${seniorFirstName} Now`}
              onPress={handleInitiateCall}
              loading={initiateCall.isPending}
              disabled={initiateCall.isPending}
              icon={<Phone size={18} color={COLORS.white} />}
              className="bg-accent-pink"
            />
          </View>
          {initiateCall.isError && (
            <Text className="text-[13px] text-center mt-3" style={{ color: COLORS.destructive }}>
              {getErrorMessage(
                initiateCall.error,
                "Donna couldn't start the call. Please try again in a moment. If this is urgent, call your loved one directly.",
                "call",
              )}
            </Text>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// --- Call Card Sub-component ---

function CallCard({ conversation }: { conversation: Conversation }) {
  const status = getCallStatus(conversation);
  const isAnswered = status === "Answered";

  const dateStr = useMemo(() => {
    try {
      const date = new Date(conversation.startedAt);
      const dayDiff = differenceInCalendarDays(new Date(), date);
      const time = format(date, "h:mm a");
      if (dayDiff === 0) return `Today at ${time}`;
      if (dayDiff === 1) return `Yesterday at ${time}`;
      return format(date, "MMM d") + ` at ${time}`;
    } catch {
      return "Unknown date";
    }
  }, [conversation.startedAt]);

  return (
    <View
      className="bg-white rounded-2xl p-4 mb-3"
      style={{
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
      }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-charcoal text-[14px] font-medium">{dateStr}</Text>
        <View
          className="rounded-full px-3 py-1"
          style={{
            backgroundColor: isAnswered ? COLORS.successBg : COLORS.warningBg,
          }}
        >
          <Text
            className="text-[12px] font-semibold"
            style={{ color: isAnswered ? COLORS.success : COLORS.warning }}
          >
            {status}
          </Text>
        </View>
      </View>
      {conversation.summary ? (
        <Text className="text-muted text-[14px] leading-5" numberOfLines={3}>
          {conversation.summary}
        </Text>
      ) : (
        <Text className="text-muted/60 text-[14px] italic">
          No summary available
        </Text>
      )}
    </View>
  );
}
