import { useEffect, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type KeyboardAwareFooterProps = {
  children: React.ReactNode;
};

export function KeyboardAwareFooter({ children }: KeyboardAwareFooterProps) {
  const insets = useSafeAreaInsets();
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardOffset(
        Math.max(0, event.endCoordinates.height - insets.bottom),
      );
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardOffset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  return (
    <View
      className="absolute left-0 right-0 bg-cream border-t border-charcoal/10 px-6 pt-4 pb-8"
      style={{ bottom: keyboardOffset }}
    >
      {children}
    </View>
  );
}
