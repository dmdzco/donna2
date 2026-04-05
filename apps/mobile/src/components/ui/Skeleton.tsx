import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";

type Props = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
};

export function Skeleton({ width = "100%", height = 20, borderRadius = 8, className = "" }: Props) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      className={`bg-beige ${className}`}
      style={[
        { width: typeof width === "number" ? width : undefined, height, borderRadius },
        typeof width === "string" ? { width: width as any } : {},
        animatedStyle,
      ]}
    />
  );
}
