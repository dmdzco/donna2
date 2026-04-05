import { Platform, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  children: React.ReactNode;
  edges?: ("top" | "bottom" | "left" | "right")[];
};

export function ScreenWrapper({ children, edges = ["top"] }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={edges}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          {children}
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
