import { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { COLORS } from "@/src/constants/theme";
import { captureBoundaryException } from "@/src/lib/errorReporting";
import i18n from "@/src/i18n";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error?: Error };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    captureBoundaryException(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.cream, padding: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: "600", color: COLORS.charcoal, marginBottom: 8 }}>
            {i18n.t("common.somethingWentWrong")}
          </Text>
          <Text style={{ fontSize: 15, color: COLORS.muted, textAlign: "center", marginBottom: 24 }}>
            {i18n.t("common.unexpectedError")}
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false, error: undefined })}
            style={{
              backgroundColor: COLORS.sage,
              paddingHorizontal: 24,
              paddingVertical: 14,
              borderRadius: 20,
              minHeight: 52,
              alignItems: "center",
              justifyContent: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("common.tryAgain")}
          >
            <Text style={{ color: "white", fontSize: 15, fontWeight: "500" }}>{i18n.t("common.tryAgain")}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
