import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';

export default function Landing() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Hero image */}
      <View style={{ flex: 1, position: 'relative' }}>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&q=80' }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
        />
        {/* Gradient overlay */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
        />

        {/* Content */}
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 28, paddingBottom: 52 }}>
          {/* Logo / Brand */}
          <View style={{ marginBottom: 12 }}>
            <Text
              style={{
                fontSize: 56,
                color: colors.white,
                fontStyle: 'italic',
                fontFamily: 'serif',
                letterSpacing: -1,
              }}
            >
              Donna
            </Text>
          </View>

          <Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)', marginBottom: 36, lineHeight: 26 }}>
            A caring AI companion that calls your loved one — so they're never alone.
          </Text>

          {/* Get Started */}
          <Pressable
            onPress={() => router.push('/create-account')}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: 'center',
              marginBottom: 14,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: colors.white, fontSize: 17, fontWeight: '600' }}>Get Started</Text>
          </Pressable>

          {/* Sign In */}
          <Pressable
            onPress={() => router.push('/create-account')}
            style={({ pressed }) => ({
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: 'center',
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.7)',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ color: colors.white, fontSize: 17, fontWeight: '500' }}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
