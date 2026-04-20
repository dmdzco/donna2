import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { ChevronDown, Clock } from "lucide-react-native";
import { COLORS } from "@/src/constants/theme";
import {
  dateFromTimeString,
  formatTimeFromDate,
} from "@/src/lib/timezone";

type TimePickerFieldProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  accessibilityLabel?: string;
  testID?: string;
};

export function TimePickerField({
  label = "Time",
  value,
  onChange,
  helperText,
  accessibilityLabel = "Select time",
  testID,
}: TimePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerValue = useMemo(() => dateFromTimeString(value), [value]);

  const handlePickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (event.type === "dismissed" || !selectedDate) return;
    onChange(formatTimeFromDate(selectedDate));
  };

  return (
    <View>
      <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
        {label}
      </Text>
      <Pressable
        onPress={() => setShowPicker(true)}
        className="w-full bg-white px-4 py-3.5 rounded-2xl border border-charcoal/10 flex-row items-center justify-between"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        <View className="flex-row items-center">
          <Clock size={16} color={COLORS.muted} style={{ marginRight: 8 }} />
          <Text className="text-[15px] text-charcoal">{value}</Text>
        </View>
        <ChevronDown size={18} color={COLORS.muted} />
      </Pressable>
      {helperText ? (
        <Text className="text-[12px] text-muted mt-1.5">{helperText}</Text>
      ) : null}

      {showPicker ? (
        <View className="mt-2 rounded-2xl border border-charcoal/10 bg-white overflow-hidden">
          <DateTimePicker
            value={pickerValue}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minuteInterval={1}
            onChange={handlePickerChange}
          />
          {Platform.OS === "ios" ? (
            <Pressable
              onPress={() => setShowPicker(false)}
              className="items-center py-3 border-t border-charcoal/10"
              accessibilityRole="button"
              accessibilityLabel="Done selecting time"
            >
              <Text className="text-[15px] font-semibold text-sage">Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
