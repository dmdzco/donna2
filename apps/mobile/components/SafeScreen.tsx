import React from 'react';
import { SafeAreaView, ScrollView, View, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';

interface SafeScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  className?: string;
}

export function SafeScreen({ children, scroll = false, style, className }: SafeScreenProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>{children}</View>
  );

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {content}
    </SafeAreaView>
  );
}
