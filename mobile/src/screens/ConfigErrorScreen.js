import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';

export default function ConfigErrorScreen({ message }) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor={colors.warmWhite} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Mess Hunt</Text>
        <Text style={styles.tagline}>Find Your Perfect Mess</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>API configuration required</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.steps}>
            <Text style={styles.stepTitle}>How to fix (local demo):</Text>
            <Text style={styles.step}>1. Start the backend in local-demo mode on your computer.</Text>
            <Text style={styles.step}>2. Find your computer's LAN IPv4 address (same Wi-Fi as your phone).</Text>
            <Text style={styles.step}>3. In <Text style={styles.code}>mobile/.env</Text>, set:</Text>
            <Text style={styles.codeBlock}>EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:5000/api</Text>
            <Text style={styles.step}>4. Restart Expo with cache cleared: <Text style={styles.code}>npx expo start -c</Text></Text>
            <Text style={styles.step}>5. Open the app in Expo Go again.</Text>
          </View>
          <Text style={styles.note}>Do not use localhost on a physical phone. Use the actual LAN IP of the computer running the backend.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.warmWhite },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '700', color: colors.primaryNavy, textAlign: 'center' },
  tagline: { fontSize: 16, fontWeight: '600', color: colors.goldenOrange, textAlign: 'center', marginBottom: 20 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 18 },
  heading: { fontSize: 18, fontWeight: '700', color: colors.primaryNavy, marginBottom: 8 },
  message: { fontSize: 14, color: colors.error, lineHeight: 20, marginBottom: 14 },
  steps: { backgroundColor: colors.lightCream, borderRadius: 12, padding: 12 },
  stepTitle: { fontSize: 14, fontWeight: '700', color: colors.bodyText, marginBottom: 6 },
  step: { fontSize: 13, color: colors.bodyText, lineHeight: 19, marginBottom: 4 },
  code: { fontWeight: '700', color: colors.primaryNavy },
  codeBlock: { fontSize: 12, color: colors.primaryNavy, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, marginVertical: 6 },
  note: { fontSize: 12, color: colors.mutedText, marginTop: 12, lineHeight: 18 },
});
