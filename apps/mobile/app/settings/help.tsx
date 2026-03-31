import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Linking,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronRight,
  HelpCircle,
  Sparkles,
  MessageCircle,
  Flag,
  Lightbulb,
  Shield,
  ExternalLink,
} from "lucide-react-native";
import { COLORS } from "@/src/constants/theme";
import { Modal } from "@/src/components/ui/Modal";
import { Button } from "@/src/components/ui/Button";

type HelpRow = {
  icon: React.ReactNode;
  label: string;
  action: () => void;
};

export default function HelpCenterScreen() {
  const router = useRouter();
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitFeedback = async (type: string) => {
    if (!feedbackText.trim()) {
      Alert.alert("Required", "Please enter your message before submitting.");
      return;
    }
    setSubmitting(true);
    // Simulate submission -- in production this would call an API
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSubmitting(false);
    setFeedbackText("");
    setContactModalVisible(false);
    setReportModalVisible(false);
    setSuggestModalVisible(false);
    Alert.alert(
      "Thank You",
      `Your ${type} has been submitted. We'll get back to you soon.`
    );
  };

  const openURL = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "Unable to open the link.")
    );
  };

  const helpRows: HelpRow[] = [
    {
      icon: <HelpCircle size={18} color={COLORS.sage} />,
      label: "FAQ",
      action: () =>
        Alert.alert(
          "FAQ",
          "Frequently asked questions will be available soon. Contact support for any questions in the meantime."
        ),
    },
    {
      icon: <Sparkles size={18} color={COLORS.sage} />,
      label: "What's New",
      action: () =>
        Alert.alert(
          "What's New",
          "Donna v1.0.0\n\n- Daily companion calls\n- Medication reminders\n- Call summaries\n- Notification preferences\n\nMore features coming soon!"
        ),
    },
    {
      icon: <MessageCircle size={18} color={COLORS.sage} />,
      label: "Contact Support",
      action: () => setContactModalVisible(true),
    },
  ];

  const feedbackRows: HelpRow[] = [
    {
      icon: <Flag size={18} color={COLORS.warning} />,
      label: "Report a Problem",
      action: () => setReportModalVisible(true),
    },
    {
      icon: <Lightbulb size={18} color={COLORS.sage} />,
      label: "Make a Suggestion",
      action: () => setSuggestModalVisible(true),
    },
  ];

  const aboutRows: HelpRow[] = [
    {
      icon: <Shield size={18} color={COLORS.sage} />,
      label: "Privacy Policy",
      action: () => openURL("https://getdonna.ai/privacy"),
    },
    {
      icon: <ExternalLink size={18} color={COLORS.sage} />,
      label: "Third Party Services",
      action: () => openURL("https://getdonna.ai/third-party"),
    },
  ];

  function renderSection(title: string, rows: HelpRow[]) {
    return (
      <View className="mb-6">
        <Text className="text-[13px] font-medium text-muted uppercase tracking-wider mb-3">
          {title}
        </Text>
        <View className="bg-white rounded-2xl border border-charcoal/10 px-4">
          {rows.map((row, index) => (
            <View key={row.label}>
              <Pressable
                onPress={row.action}
                className="flex-row items-center py-3.5"
                accessibilityRole="button"
                accessibilityLabel={row.label}
                style={{ minHeight: 48 }}
              >
                <View className="w-9 h-9 rounded-full items-center justify-center bg-sage/10">
                  {row.icon}
                </View>
                <Text className="flex-1 text-[15px] text-charcoal ml-3">
                  {row.label}
                </Text>
                <ChevronRight size={18} color={COLORS.muted} />
              </Pressable>
              {index < rows.length - 1 && (
                <View className="h-px bg-charcoal/5 ml-12" />
              )}
            </View>
          ))}
        </View>
      </View>
    );
  }

  function renderFeedbackModal(
    visible: boolean,
    onClose: () => void,
    title: string,
    placeholder: string,
    type: string
  ) {
    return (
      <Modal visible={visible} onClose={onClose} title={title}>
        <View className="py-2">
          <TextInput
            className="bg-beige px-4 py-3 rounded-xl text-[15px] text-charcoal border border-charcoal/5"
            placeholder={placeholder}
            placeholderTextColor={COLORS.muted}
            value={feedbackText}
            onChangeText={setFeedbackText}
            multiline
            numberOfLines={5}
            style={{ minHeight: 120, textAlignVertical: "top" }}
          />
          <View className="mt-4">
            <Button
              title="Submit"
              onPress={() => handleSubmitFeedback(type)}
              loading={submitting}
            />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream">
      {/* Header */}
      <View className="px-6 pt-4 pb-2">
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center gap-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{ minHeight: 48 }}
        >
          <ArrowLeft size={20} color={COLORS.charcoal} />
          <Text className="text-[15px] text-charcoal">Back</Text>
        </Pressable>
        <Text className="text-[28px] font-semibold text-charcoal mt-4">
          Help Center
        </Text>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mt-4">
          {renderSection("Help", helpRows)}
          {renderSection("Feedback", feedbackRows)}
          {renderSection("About", aboutRows)}
        </View>
      </ScrollView>

      {/* Feedback Modals */}
      {renderFeedbackModal(
        contactModalVisible,
        () => {
          setContactModalVisible(false);
          setFeedbackText("");
        },
        "Contact Support",
        "Describe how we can help you...",
        "message"
      )}
      {renderFeedbackModal(
        reportModalVisible,
        () => {
          setReportModalVisible(false);
          setFeedbackText("");
        },
        "Report a Problem",
        "Describe the issue you're experiencing...",
        "report"
      )}
      {renderFeedbackModal(
        suggestModalVisible,
        () => {
          setSuggestModalVisible(false);
          setFeedbackText("");
        },
        "Make a Suggestion",
        "Tell us your idea for improving Donna...",
        "suggestion"
      )}
    </SafeAreaView>
  );
}
