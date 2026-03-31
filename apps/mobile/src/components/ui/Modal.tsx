import {
  Modal as RNModal,
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { X } from "lucide-react-native";
import { COLORS } from "@/src/constants/theme";

type ModalProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  variant?: "bottom-sheet" | "centered";
};

export function Modal({
  visible,
  onClose,
  title,
  children,
  variant = "bottom-sheet",
}: ModalProps) {
  if (variant === "centered") {
    return (
      <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
            {title && (
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-[20px] font-semibold text-charcoal">{title}</Text>
                <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
                  <X size={20} color={COLORS.muted} />
                </Pressable>
              </View>
            )}
            {children}
          </View>
        </View>
      </RNModal>
    );
  }

  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <Pressable className="flex-1 bg-black/40" onPress={onClose} />
        <View className="bg-white rounded-t-4xl max-h-[85%]">
          {title && (
            <View className="flex-row items-center justify-between px-6 pt-6 pb-3">
              <Text className="text-[20px] font-semibold text-charcoal">{title}</Text>
              <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
                <X size={20} color={COLORS.muted} />
              </Pressable>
            </View>
          )}
          <ScrollView className="px-6 pb-8">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}
