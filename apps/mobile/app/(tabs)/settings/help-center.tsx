import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, MessageCircle, BookOpen, Info, Mail } from 'lucide-react-native';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../../constants/colors';

interface HelpRowProps {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  onPress: () => void;
}

function HelpRow({ icon, label, subtitle, onPress }: HelpRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: colors.textPrimary }}>{label}</Text>
        {subtitle ? <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 64 }} />;
}

export default function HelpCenter() {
  const router = useRouter();

  const helpItems = [
    {
      icon: <BookOpen size={18} color={colors.primary} />,
      label: 'How Donna Works',
      subtitle: 'Learn about AI-powered calls',
      onPress: () => Linking.openURL('https://donna.ai/how-it-works'),
    },
    {
      icon: <MessageCircle size={18} color={colors.primary} />,
      label: 'Frequently Asked Questions',
      subtitle: 'Get quick answers',
      onPress: () => Linking.openURL('https://donna.ai/faq'),
    },
  ];

  const feedbackItems = [
    {
      icon: <Mail size={18} color={colors.primary} />,
      label: 'Contact Support',
      subtitle: 'hello@donna.ai',
      onPress: () => Linking.openURL('mailto:hello@donna.ai'),
    },
    {
      icon: <MessageCircle size={18} color={colors.primary} />,
      label: 'Send Feedback',
      subtitle: 'Help us improve Donna',
      onPress: () => Linking.openURL('mailto:feedback@donna.ai'),
    },
  ];

  const aboutItems = [
    {
      icon: <Info size={18} color={colors.primary} />,
      label: 'About Donna',
      subtitle: 'Version 1.0.0',
      onPress: () => Linking.openURL('https://donna.ai'),
    },
    {
      icon: <BookOpen size={18} color={colors.primary} />,
      label: 'Privacy Policy',
      onPress: () => Linking.openURL('https://donna.ai/privacy'),
    },
    {
      icon: <BookOpen size={18} color={colors.primary} />,
      label: 'Terms of Service',
      onPress: () => Linking.openURL('https://donna.ai/terms'),
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginLeft: 12 }}>
          Help Center
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {/* Help */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 20, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Help
        </Text>
        <View style={{ backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
          {helpItems.map((item, i) => (
            <View key={item.label}>
              <HelpRow {...item} />
              {i < helpItems.length - 1 && <Divider />}
            </View>
          ))}
        </View>

        {/* Feedback */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Feedback
        </Text>
        <View style={{ backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
          {feedbackItems.map((item, i) => (
            <View key={item.label}>
              <HelpRow {...item} />
              {i < feedbackItems.length - 1 && <Divider />}
            </View>
          ))}
        </View>

        {/* About */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          About
        </Text>
        <View style={{ backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' }}>
          {aboutItems.map((item, i) => (
            <View key={item.label}>
              <HelpRow {...item} />
              {i < aboutItems.length - 1 && <Divider />}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
