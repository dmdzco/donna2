import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import { ArrowLeft, ChevronDown } from "lucide-react-native";
import { COLORS, RELATIONSHIP_OPTIONS } from "@/src/constants/theme";
import { Input } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";
import { Modal } from "@/src/components/ui/Modal";

export default function CaregiverProfileScreen() {
  const router = useRouter();
  const { user } = useUser();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [showRelationshipPicker, setShowRelationshipPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pre-fill from Clerk user data
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setEmail(user.primaryEmailAddress?.emailAddress ?? "");
      setPhone(user.primaryPhoneNumber?.phoneNumber ?? "");
      // Relationship is stored in unsafeMetadata
      const meta = user.unsafeMetadata as Record<string, unknown>;
      setRelationship((meta?.relationship as string) ?? "");
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        unsafeMetadata: {
          ...user.unsafeMetadata,
          relationship,
        },
      });
      Alert.alert("Saved", "Profile updated successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Error", "Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = () => {
    Alert.alert(
      "Change Password",
      "A password reset link will be sent to your email address.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send Link",
          onPress: async () => {
            try {
              if (user?.primaryEmailAddress) {
                await user.primaryEmailAddress.prepareVerification({
                  strategy: "email_code",
                });
                Alert.alert(
                  "Email Sent",
                  "Check your email for the password reset link."
                );
              }
            } catch {
              Alert.alert(
                "Note",
                "Please use the Clerk account portal to change your password."
              );
            }
          },
        },
      ]
    );
  };

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
            Caregiver Profile
          </Text>
        </View>

        {/* Scrollable Form */}
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 mt-4">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input
                  label="First Name"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                />
              </View>
              <View className="flex-1">
                <Input
                  label="Last Name"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                />
              </View>
            </View>

            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={false}
              className="opacity-60"
            />

            <Input
              label="Phone Number"
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 (555) 000-0000"
              keyboardType="phone-pad"
            />

            {/* Relationship Dropdown */}
            <View className="w-full">
              <Text className="text-[13px] font-medium text-muted mb-1.5 uppercase tracking-wider">
                Relationship
              </Text>
              <Pressable
                onPress={() => setShowRelationshipPicker(true)}
                className="w-full bg-white px-4 py-3.5 rounded-2xl border border-charcoal/10 flex-row items-center justify-between"
                accessibilityRole="button"
                accessibilityLabel="Select relationship"
                style={{ minHeight: 48 }}
              >
                <Text
                  className={`text-[15px] ${
                    relationship ? "text-charcoal" : "text-muted"
                  }`}
                >
                  {relationship || "Select relationship"}
                </Text>
                <ChevronDown size={18} color={COLORS.muted} />
              </Pressable>
            </View>
          </View>

          {/* Change Password */}
          <View className="mt-8">
            <Button
              title="Change Password"
              variant="secondary"
              onPress={handleChangePassword}
            />
          </View>
        </ScrollView>

        {/* Fixed Save Button */}
        <View className="absolute bottom-0 left-0 right-0 bg-cream border-t border-charcoal/5 px-6 py-4 pb-8">
          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={saving}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Relationship Picker Modal */}
      <Modal
        visible={showRelationshipPicker}
        onClose={() => setShowRelationshipPicker(false)}
        title="Select Relationship"
      >
        <View className="py-2">
          {RELATIONSHIP_OPTIONS.map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                setRelationship(option);
                setShowRelationshipPicker(false);
              }}
              className={`py-3.5 px-2 rounded-xl ${
                relationship === option ? "bg-sage/10" : ""
              }`}
              accessibilityRole="button"
              accessibilityLabel={option}
              style={{ minHeight: 48 }}
            >
              <Text
                className={`text-[15px] ${
                  relationship === option
                    ? "text-sage font-medium"
                    : "text-charcoal"
                }`}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
