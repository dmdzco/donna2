import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Calendar, ChevronDown } from "lucide-react-native";
import { COLORS } from "@/src/constants/theme";

type DatePickerFieldProps = {
  label?: string;
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  helperText?: string;
  accessibilityLabel?: string;
  testID?: string;
};

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === tomorrow.getTime()) return "Tomorrow";

  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DatePickerField({
  label = "Date",
  value,
  onChange,
  helperText,
  accessibilityLabel = "Select date",
  testID,
}: DatePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerValue = useMemo(() => dateFromIso(value), [value]);

  const handlePickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (event.type === "dismissed" || !selectedDate) return;
    onChange(toIsoDate(selectedDate));
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
          <Calendar size={16} color={COLORS.muted} style={{ marginRight: 8 }} />
          <Text className="text-[15px] text-charcoal">
            {formatDisplayDate(value)}
          </Text>
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
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={new Date()}
            onChange={handlePickerChange}
          />
          {Platform.OS === "ios" ? (
            <Pressable
              onPress={() => setShowPicker(false)}
              className="items-center py-3 border-t border-charcoal/10"
              accessibilityRole="button"
              accessibilityLabel="Done selecting date"
            >
              <Text className="text-[15px] font-semibold text-sage">Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
