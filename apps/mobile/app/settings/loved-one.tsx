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
import { ArrowLeft, ChevronDown, ChevronUp, Dumbbell, Landmark, Music, Film, Vote, Feather, Globe, PawPrint, BookOpen, Flower2, Plane, ChefHat } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/constants/theme";
import { INTERESTS } from "@/src/constants/interests";
import { Input } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";
import { useCurrentSenior, useSenior, useUpdateSenior } from "@/src/hooks";
import { getErrorMessage } from "@/src/lib/api";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  Dumbbell, Landmark, Music, Film, Vote, Feather, Globe, PawPrint, BookOpen, Flower2, Plane, ChefHat,
};

function sanitizePhoneInput(value: string): string {
  return value.replace(/[^\d+\-\s()]/g, "").slice(0, 20);
}

export default function LovedOneProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
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
  const [dateOfBirth, setDateOfBirth] = useState("");
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
      setDateOfBirth((family?.dateOfBirth as string) ?? "");
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
          dateOfBirth: dateOfBirth.trim() || undefined,
          donnaLanguage,
        } as unknown as Record<string, string>,
      });
      router.replace("/(tabs)/settings");
    } catch (error) {
      Alert.alert(
        t("lovedOneProfile.couldntSave"),
        getErrorMessage(
          error,
          t("lovedOneProfile.couldntSaveMessage"),
          "save",
        ),
      );
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-cream items-center justify-center">
        <Text className="text-muted">{t("common.loading")}</Text>
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
            accessibilityLabel={t("common.back")}
            style={{ minHeight: 48 }}
          >
            <ArrowLeft size={20} color={COLORS.charcoal} />
            <Text className="text-[15px] text-charcoal">{t("common.back")}</Text>
          </Pressable>
          <Text className="text-[28px] font-semibold text-charcoal mt-4">
            {t("lovedOneProfile.title")}
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
              label={t("lovedOneProfile.name")}
              value={name}
              onChangeText={setName}
              placeholder={t("lovedOneProfile.namePlaceholder")}
              testID="loved-one-name-input"
            />
            <Input
              label={t("lovedOneProfile.phone")}
              value={phone}
              onChangeText={(value) => setPhone(sanitizePhoneInput(value))}
              placeholder={t("lovedOneProfile.phonePlaceholder")}
              keyboardType="phone-pad"
              maxLength={20}
              testID="loved-one-phone-input"
            />
            <Input
              label={t("lovedOneProfile.dateOfBirth")}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder={t("lovedOneProfile.dateOfBirthPlaceholder")}
              keyboardType="number-pad"
              maxLength={10}
              testID="loved-one-dob-input"
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input
                  label={t("lovedOneProfile.city")}
                  value={city}
                  onChangeText={setCity}
                  placeholder={t("lovedOneProfile.cityPlaceholder")}
                  testID="loved-one-city-input"
                />
              </View>
              <View className="w-20">
                <Input
                  label={t("lovedOneProfile.state")}
                  value={state}
                  onChangeText={setState}
                  placeholder={t("lovedOneProfile.statePlaceholder")}
                  maxLength={2}
                  autoCapitalize="characters"
                  testID="loved-one-state-input"
                />
              </View>
              <View className="w-24">
                <Input
                  label={t("lovedOneProfile.zip")}
                  value={zipCode}
                  onChangeText={setZipCode}
                  placeholder={t("lovedOneProfile.zipPlaceholder")}
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
              {t("lovedOneProfile.interests")}
            </Text>
            <View className="gap-2">
              {INTERESTS.map((interest) => {
                const isSelected = selectedInterests.includes(interest.id);
                const isExpanded = expandedInterest === interest.id;
                const IconComponent = ICON_MAP[interest.icon];

                return (
                  <View
                    key={interest.id}
                    className="rounded-2xl overflow-hidden"
                    style={
                      isSelected
                        ? { backgroundColor: COLORS.sageDark }
                        : {
                            backgroundColor: "#fff",
                            borderWidth: 1,
                            borderColor: "rgba(55,55,55,0.1)",
                          }
                    }
                  >
                    <Pressable
                      onPress={() => {
                        if (!isSelected) {
                          toggleInterest(interest.id);
                        }
                        toggleExpanded(interest.id);
                      }}
                      className="flex-row items-center px-4 py-4"
                      accessibilityRole="button"
                      accessibilityLabel={`${t(`interests.${interest.id}.label`)}${isSelected ? ", selected" : ""}`}
                      style={{ minHeight: 52 }}
                    >
                      {IconComponent && (
                        <IconComponent
                          size={18}
                          color={isSelected ? COLORS.cream : COLORS.muted}
                        />
                      )}
                      <Text
                        className={`flex-1 text-[16px] font-medium ml-3 ${
                          isSelected ? "text-cream" : "text-charcoal"
                        }`}
                      >
                        {t(`interests.${interest.id}.label`)}
                      </Text>
                      {isExpanded ? (
                        <ChevronUp
                          size={18}
                          color={isSelected ? COLORS.cream : COLORS.muted}
                        />
                      ) : (
                        <ChevronDown
                          size={18}
                          color={isSelected ? COLORS.cream : COLORS.muted}
                        />
                      )}
                    </Pressable>

                    {/* Expanded Detail Input */}
                    {isExpanded && (
                      <View className="px-4 pb-4">
                        <Text
                          className={`text-[13px] mb-2 ${
                            isSelected ? "text-cream/80" : "text-muted"
                          }`}
                        >
                          {t(`interests.${interest.id}.question`)}
                        </Text>
                        <TextInput
                          className="px-4 py-3 rounded-xl text-[15px]"
                          style={
                            isSelected
                              ? {
                                  backgroundColor: "rgba(253,252,248,0.15)",
                                  color: COLORS.cream,
                                  borderWidth: 1,
                                  borderColor: "rgba(253,252,248,0.2)",
                                }
                              : {
                                  backgroundColor: COLORS.beige,
                                  color: COLORS.charcoal,
                                  borderWidth: 1,
                                  borderColor: "rgba(55,55,55,0.05)",
                                }
                          }
                          placeholder={t(`interests.${interest.id}.placeholder`)}
                          placeholderTextColor={
                            isSelected ? "rgba(253,252,248,0.5)" : COLORS.muted
                          }
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
                        {/* Remove / Done buttons */}
                        <View className="flex-row gap-2 mt-3">
                          <Pressable
                            onPress={() => {
                              toggleInterest(interest.id);
                              setExpandedInterest(null);
                              setInterestDetails((prev) => {
                                const next = { ...prev };
                                delete next[interest.id];
                                return next;
                              });
                            }}
                            className="flex-1 py-2.5 rounded-xl items-center"
                            style={{
                              backgroundColor: "rgba(253,252,248,0.15)",
                              borderWidth: 1,
                              borderColor: "rgba(253,252,248,0.2)",
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={t("common.delete")}
                          >
                            <Text className="text-cream text-[14px] font-medium">
                              {t("common.delete")}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setExpandedInterest(null)}
                            className="flex-1 py-2.5 rounded-xl items-center bg-white"
                            accessibilityRole="button"
                            accessibilityLabel={t("common.done")}
                          >
                            <Text className="text-charcoal text-[14px] font-medium">
                              {t("common.done")}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Additional Topics */}
          <View className="mt-6">
            <Input
              label={t("lovedOneProfile.additionalTopics")}
              value={additionalTopics}
              onChangeText={setAdditionalTopics}
              placeholder={t("lovedOneProfile.additionalTopicsPlaceholder")}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
          </View>

          {/* Topics to Avoid */}
          <View className="mt-4">
            <Input
              label={t("lovedOneProfile.topicsToAvoid")}
              value={topicsToAvoid}
              onChangeText={setTopicsToAvoid}
              placeholder={t("lovedOneProfile.topicsToAvoidPlaceholder")}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
          </View>

          {/* Donna Language */}
          <View className="mt-8">
            <Text className="text-[13px] font-medium text-muted uppercase tracking-wider mb-3">
              {t("lovedOneProfile.donnaLanguage")}
            </Text>
            <Text className="text-[14px] text-muted mb-3">
              {t("lovedOneProfile.donnaLanguageSubtitle", { name: name || t("settings.lovedOneProfile").toLowerCase() })}
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
                accessibilityLabel={t("lovedOneProfile.english")}
                style={{ minHeight: 48 }}
              >
                <Text className="text-[16px] mr-2">{"\ud83c\uddfa\ud83c\uddf8"}</Text>
                <Text
                  className={`text-[15px] font-medium ${
                    donnaLanguage === "en" ? "text-sage" : "text-charcoal"
                  }`}
                >
                  {t("lovedOneProfile.english")}
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
                accessibilityLabel={t("lovedOneProfile.spanish")}
                style={{ minHeight: 48 }}
              >
                <Text className="text-[16px] mr-2">{"\ud83c\uddf2\ud83c\uddfd"}</Text>
                <Text
                  className={`text-[15px] font-medium ${
                    donnaLanguage === "es" ? "text-sage" : "text-charcoal"
                  }`}
                >
                  {t("lovedOneProfile.spanish")}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Fixed Save Button */}
        <View className="absolute bottom-0 left-0 right-0 bg-cream border-t border-charcoal/5 px-6 py-4 pb-8">
          <Button
            title={t("common.save")}
            onPress={handleSave}
            loading={updateSenior.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
