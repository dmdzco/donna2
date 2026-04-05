import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { useEffect } from "react";

type ToggleProps = {
  value: boolean;
  onToggle: (value: boolean) => void;
  accessibilityLabel?: string;
};

export function Toggle({ value, onToggle, accessibilityLabel }: ToggleProps) {
  const offset = useSharedValue(value ? 20 : 0);

  useEffect(() => {
    offset.value = withTiming(value ? 20 : 0, { duration: 200 });
  }, [value]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <Pressable
      onPress={() => onToggle(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      className={`w-12 h-7 rounded-full justify-center px-0.5 ${value ? "bg-sage" : "bg-gray-300"}`}
    >
      <Animated.View style={thumbStyle} className="w-6 h-6 rounded-full bg-white shadow-sm" />
    </Pressable>
  );
}
