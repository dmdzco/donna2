import { View, Text } from "react-native";

type ProgressBarProps = {
  current: number;
  total: number;
};

export function ProgressBar({ current, total }: ProgressBarProps) {
  return (
    <View className="w-full">
      <Text className="text-[13px] text-muted mb-2">
        Step {current} of {total}
      </Text>
      <View className="flex-row gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            className={`flex-1 h-1 rounded-full ${i < current ? "bg-sage" : "bg-beige"}`}
          />
        ))}
      </View>
    </View>
  );
}
