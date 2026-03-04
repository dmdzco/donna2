import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';

const CONFETTI_COLORS = ['#4A5D4F', '#E8A0A0', '#F2F0E9', '#FFD700', '#87CEEB', '#DDA0DD'];

function ConfettiPiece({ color, delay, startX }: { color: string; delay: number; startX: number }) {
  const translateY = useRef(new Animated.Value(-20)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(translateY, {
          toValue: 750,
          duration: 2600,
          easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: (Math.random() - 0.5) * 180,
          duration: 2600,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, { toValue: 1, duration: 2600, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(1900),
          Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: startX,
        width: 10,
        height: 10,
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ translateY }, { translateX }, { rotate: spin }],
        opacity,
      }}
    />
  );
}

export default function OnboardingSuccess() {
  const router = useRouter();

  const confettiPieces = Array.from({ length: 45 }).map((_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: Math.random() * 700,
    startX: Math.random() * 380,
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, pointerEvents: 'box-none' }}>
        {confettiPieces.map((p) => (
          <ConfettiPiece key={p.id} color={p.color} delay={p.delay} startX={p.startX} />
        ))}

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View
            style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 32,
            }}
          >
            <Text style={{ fontSize: 46 }}>✨</Text>
          </View>

          <Text
            style={{
              fontSize: 36,
              fontWeight: '800',
              color: colors.textPrimary,
              textAlign: 'center',
              marginBottom: 16,
              lineHeight: 44,
            }}
          >
            You're all set!
          </Text>
          <Text
            style={{
              fontSize: 17,
              color: colors.textSecondary,
              textAlign: 'center',
              lineHeight: 26,
              marginBottom: 52,
            }}
          >
            Donna is ready to start calling your loved one. You'll receive a summary after every conversation.
          </Text>

          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 18,
              paddingVertical: 18,
              paddingHorizontal: 52,
              opacity: pressed ? 0.8 : 1,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 6,
            })}
          >
            <Text style={{ color: colors.white, fontSize: 18, fontWeight: '700' }}>Go to Dashboard</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
