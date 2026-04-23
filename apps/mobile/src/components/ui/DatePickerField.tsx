import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Calendar, ChevronDown, X } from "lucide-react-native";
import { COLORS } from "@/src/constants/theme";

type DatePickerFieldProps = {
  label?: string;
  value?: string; // Defaults to "YYYY-MM-DD"; callers can override parse/format behavior.
  onChange: (value: string) => void;
  helperText?: string;
  accessibilityLabel?: string;
  testID?: string;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  initialDate?: Date;
  formatValue?: (value: string) => string;
  parseValue?: (value: string) => Date | null;
  serializeDate?: (date: Date) => string;
  doneLabel?: string;
  onClear?: () => void;
  clearLabel?: string;
};

function formatDisplayDate(isoDate: string): string {
  const d = dateFromIso(isoDate);
  if (!d) return isoDate;

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

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

function dateFromIso(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    !isValidDate(date) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampDate(d: Date, minimumDate?: Date, maximumDate?: Date): Date {
  let date = new Date(d);
  if (minimumDate && date < minimumDate) date = new Date(minimumDate);
  if (maximumDate && date > maximumDate) date = new Date(maximumDate);
  return date;
}

export function DatePickerField({
  label = "Date",
  value,
  onChange,
  helperText,
  accessibilityLabel = "Select date",
  testID,
  placeholder = "Select date",
  minimumDate,
  maximumDate,
  initialDate,
  formatValue = formatDisplayDate,
  parseValue = dateFromIso,
  serializeDate = toIsoDate,
  doneLabel = "Done",
  onClear,
  clearLabel = "Clear date",
}: DatePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const fallbackMinimumDate = useMemo(() => new Date(), []);
  const effectiveMinimumDate = minimumDate ?? fallbackMinimumDate;
  const selectedDate = useMemo(
    () => (value ? parseValue(value) : null),
    [parseValue, value],
  );
  const pickerValue = useMemo(
    () =>
      clampDate(
        selectedDate ?? initialDate ?? new Date(),
        effectiveMinimumDate,
        maximumDate,
      ),
    [effectiveMinimumDate, initialDate, maximumDate, selectedDate],
  );
  const displayText = value ? formatValue(value) : placeholder;

  const handlePickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (event.type === "dismissed" || !selectedDate) return;
    onChange(serializeDate(selectedDate));
  };

  return (
    <View>
      <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => setShowPicker(true)}
          className="flex-1 bg-white px-4 py-3.5 rounded-2xl border border-charcoal/10 flex-row items-center justify-between"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          testID={testID}
        >
          <View className="flex-1 flex-row items-center mr-3">
            <Calendar
              size={16}
              color={COLORS.muted}
              style={{ marginRight: 8 }}
            />
            <Text
              className={`text-[15px] ${
                value ? "text-charcoal" : "text-muted"
              }`}
              numberOfLines={1}
            >
              {displayText}
            </Text>
          </View>
          <ChevronDown size={18} color={COLORS.muted} />
        </Pressable>
        {value && onClear ? (
          <Pressable
            onPress={onClear}
            className="bg-white rounded-2xl border border-charcoal/10 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
            style={{ width: 50, height: 50 }}
          >
            <X size={18} color={COLORS.muted} />
          </Pressable>
        ) : null}
      </View>
      {helperText ? (
        <Text className="text-[12px] text-muted mt-1.5">{helperText}</Text>
      ) : null}

      {showPicker ? (
        <View className="mt-2 rounded-2xl border border-charcoal/10 bg-white overflow-hidden">
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={effectiveMinimumDate}
            maximumDate={maximumDate}
            onChange={handlePickerChange}
          />
          {Platform.OS === "ios" ? (
            <Pressable
              onPress={() => setShowPicker(false)}
              className="items-center py-3 border-t border-charcoal/10"
              accessibilityRole="button"
              accessibilityLabel={doneLabel}
            >
              <Text className="text-[15px] font-semibold text-sage">
                {doneLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
