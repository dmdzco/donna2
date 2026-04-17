import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react-native";
import { COLORS } from "@/src/constants/theme";
import { INTERESTS } from "@/src/constants/interests";
import { Input } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";
import { useCurrentSenior, useSenior, useUpdateSenior } from "@/src/hooks";
import { getErrorMessage } from "@/src/lib/api";

function sanitizePhoneInput(value: string): string {
  return value.replace(/[^\d+\-\s()]/g, "").slice(0, 20);
}

export default function LovedOneProfileScreen() {
  const router = useRouter();
  const { seniorId } = useCurrentSenior();
  const { data: senior, isLoading } = useSenior(seniorId);
  const updateSenior = useUpdateSenior(seniorId);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [interestDetails, setInterestDetails] = useState<
    Record<string, string>
  >({});
  const [expandedInterest, setExpandedInterest] = useState<string | null>(null);
  const [additionalTopics, setAdditionalTopics] = useState("");
  const [topicsToAvoid, setTopicsToAvoid] = useState("");
  const [donnaLanguage, setDonnaLanguage] = useState<"en" | "es">("en");

  // Pre-fill form when senior data loads
  useEffect(() => {
    if (senior) {
      setName(senior.name ?? "");
      setPhone(senior.phone ?? "");
      setCity(senior.city ?? "");
      setState(senior.state ?? "");
      setZipCode(senior.zipCode ?? "");
      setSelectedInterests(senior.interests ?? []);
      const family = senior.familyInfo as Record<string, unknown> | undefined;
      setInterestDetails(
        (family?.interestDetails as Record<string, string>) ?? {}
      );
      setAdditionalTopics(senior.additionalInfo ?? "");
      setTopicsToAvoid((family?.topicsToAvoid as string) ?? "");
      setDonnaLanguage((family?.donnaLanguage as "en" | "es") ?? "en");
    }
  }, [senior]);

  const toggleInterest = (interestId: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interestId)
        ? prev.filter((id) => id !== interestId)
        : [...prev, interestId]
    );
  };

  const toggleExpanded = (interestId: string) => {
    setExpandedInterest((prev) => (prev === interestId ? null : interestId));
  };

  const handleSave = async () => {
    try {
      await updateSenior.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
        interests: selectedInterests,
        additionalInfo: additionalTopics.trim() || undefined,
        familyInfo: {
          interestDetails,
          topicsToAvoid: topicsToAvoid.trim(),
          donnaLanguage,
        } as unknown as Record<string, string>,
      });
      router.replace("/(tabs)/settings");
    } catch (error) {
      Alert.alert(
        "Couldn't Save",
        getErrorMessage(
          error,
          "We couldn't save this profile. Your changes are still here. Please try again.",
          "save",
        ),
      );
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-cream items-center justify-center">
        <Text className="text-muted">Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-2">
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center gap-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ minHeight: 48 }}
          >
            <ArrowLeft size={20} color={COLORS.charcoal} />
            <Text className="text-[15px] text-charcoal">Back</Text>
          </Pressable>
          <Text className="text-[28px] font-semibold text-charcoal mt-4">
            Loved One Profile
          </Text>
        </View>

        {/* Scrollable Form */}
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 200 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Basic Info */}
          <View className="gap-4 mt-4">
            <Input
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Their full name"
              testID="loved-one-name-input"
            />
            <Input
              label="Phone Number"
              value={phone}
              onChangeText={(value) => setPhone(sanitizePhoneInput(value))}
              placeholder="+1 (555) 000-0000"
              keyboardType="phone-pad"
              maxLength={20}
              testID="loved-one-phone-input"
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input
                  label="City"
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  testID="loved-one-city-input"
                />
              </View>
              <View className="w-20">
                <Input
                  label="State"
                  value={state}
                  onChangeText={setState}
                  placeholder="TX"
                  maxLength={2}
                  autoCapitalize="characters"
                  testID="loved-one-state-input"
                />
              </View>
              <View className="w-24">
                <Input
                  label="ZIP"
                  value={zipCode}
                  onChangeText={setZipCode}
                  placeholder="75001"
                  keyboardType="number-pad"
                  maxLength={5}
                  testID="loved-one-zip-input"
                />
              </View>
            </View>
          </View>

          {/* Interests Accordion */}
          <View className="mt-8">
            <Text className="text-[13px] font-medium text-muted uppercase tracking-wider mb-3">
              Interests
            </Text>
            <View className="bg-white rounded-2xl border border-charcoal/10 overflow-hidden">
              {INTERESTS.map((interest, index) => {
                const isSelected = selectedInterests.includes(interest.id);
                const isExpanded = expandedInterest === interest.id;
                const showSeparator = index < INTERESTS.length - 1;

                return (
                  <View key={interest.id}>
                    <Pressable
                      onPress={() => {
                        if (!isSelected) {
                          toggleInterest(interest.id);
                        }
                        toggleExpanded(interest.id);
                      }}
                      className="flex-row items-center px-4 py-3.5"
                      accessibilityRole="button"
                      accessibilityLabel={`${interest.label}${isSelected ? ", selected" : ""}`}
                      style={{ minHeight: 48 }}
                    >
                      <View
                        className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${
                          isSelected ? "bg-sage/10" : "bg-gray-100"
                        }`}
                      >
                        <Text className="text-[14px]">
                          {isSelected ? "✓" : ""}
                        </Text>
                      </View>
                      <Text
                        className={`flex-1 text-[15px] ${
                          isSelected
                            ? "text-charcoal font-medium"
                            : "text-muted"
                        }`}
                      >
                        {interest.label}
                      </Text>
                      {isExpanded ? (
                        <ChevronUp size={18} color={COLORS.muted} />
                      ) : (
                        <ChevronDown size={18} color={COLORS.muted} />
                      )}
                    </Pressable>

                    {/* Expanded Detail Input */}
                    {isExpanded && (
                      <View className="px-4 pb-3.5">
                        <Text className="text-[13px] text-muted mb-2">
                          {interest.question}
                        </Text>
                        <TextInput
                          className="bg-beige px-4 py-3 rounded-xl text-[15px] text-charcoal border border-charcoal/5"
                          placeholder={interest.placeholder}
                          placeholderTextColor={COLORS.muted}
                          value={interestDetails[interest.id] ?? ""}
                          onChangeText={(text) =>
                            setInterestDetails((prev) => ({
                              ...prev,
                              [interest.id]: text,
                            }))
                          }
                          onFocus={() => {
                            if (!isSelected) {
                              toggleInterest(interest.id);
                            }
                          }}
                          multiline
                        />
                      </View>
                    )}

                    {showSeparator && <View className="h-px bg-charcoal/5 ml-16" />}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Additional Topics */}
          <View className="mt-6">
            <Input
              label="Additional Topics"
              value={additionalTopics}
              onChangeText={setAdditionalTopics}
              placeholder="Other things they enjoy talking about..."
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
          </View>

          {/* Topics to Avoid */}
          <View className="mt-4">
            <Input
              label="Topics to Avoid"
              value={topicsToAvoid}
              onChangeText={setTopicsToAvoid}
              placeholder="Sensitive topics Donna should steer away from..."
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
          </View>

          {/* Donna Language */}
          <View className="mt-8">
            <Text className="text-[13px] font-medium text-muted uppercase tracking-wider mb-3">
              Donna's Language
            </Text>
            <Text className="text-[14px] text-muted mb-3">
              What language should Donna speak in when calling{" "}
              {name || "your loved one"}?
            </Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setDonnaLanguage("en")}
                className={`flex-1 flex-row items-center justify-center py-3 rounded-xl border-2 ${
                  donnaLanguage === "en"
                    ? "border-sage bg-sage/5"
                    : "border-charcoal/10 bg-white"
                }`}
                accessibilityRole="radio"
                accessibilityState={{ selected: donnaLanguage === "en" }}
                accessibilityLabel="English"
                style={{ minHeight: 48 }}
              >
                <Text className="text-[16px] mr-2">{"\ud83c\uddfa\ud83c\uddf8"}</Text>
                <Text
                  className={`text-[15px] font-medium ${
                    donnaLanguage === "en" ? "text-sage" : "text-charcoal"
                  }`}
                >
                  English
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDonnaLanguage("es")}
                className={`flex-1 flex-row items-center justify-center py-3 rounded-xl border-2 ${
                  donnaLanguage === "es"
                    ? "border-sage bg-sage/5"
                    : "border-charcoal/10 bg-white"
                }`}
                accessibilityRole="radio"
                accessibilityState={{ selected: donnaLanguage === "es" }}
                accessibilityLabel="Spanish"
                style={{ minHeight: 48 }}
              >
                <Text className="text-[16px] mr-2">{"\ud83c\uddf2\ud83c\uddfd"}</Text>
                <Text
                  className={`text-[15px] font-medium ${
                    donnaLanguage === "es" ? "text-sage" : "text-charcoal"
                  }`}
                >
                  Spanish
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Fixed Save Button */}
        <View className="absolute bottom-0 left-0 right-0 bg-cream border-t border-charcoal/5 px-6 py-4 pb-8">
          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={updateSenior.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
