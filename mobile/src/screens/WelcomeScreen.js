import React, { useCallback, useRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';

export default function WelcomeScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const isNavigatingRef = useRef(false);
  const isCompactHeight = height < 700;
  const logoSize = Math.min(Math.max(width * 0.38, 132), 176);

  const navigateSafely = useCallback(
    (routeName) => {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      navigation.navigate(routeName);
      // Re-enable after transition; prevents accidental double-taps without blocking normal back navigation later.
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 700);
    },
    [navigation]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="dark" backgroundColor={colors.warmWhite} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isCompactHeight && styles.scrollContentCompact]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Image
              source={require('../../assets/brand/mess-hunt-logo.jpg')}
              style={[styles.logo, { width: logoSize, height: logoSize }]}
              resizeMode="contain"
              accessible
              accessibilityLabel="Mess Hunt logo"
            />
          </View>

          <Text style={styles.title}>Mess Hunt</Text>
          <Text style={styles.tagline}>Find Your Perfect Mess</Text>
          <Text style={styles.description}>
            Discover student-friendly mess accommodations, compare options, and make confident choices with a trusted
            experience.
          </Text>
        </View>

        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Get started</Text>
          <Text style={styles.actionsSubtitle}>Create a student account or log in to continue.</Text>

          <Pressable
            style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.buttonPressed]}
            onPress={() => navigateSafely('StudentRegister')}
            accessibilityRole="button"
            accessibilityLabel="Get started and create a student account"
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
            <Text style={styles.primaryButtonSubtext}>Create Account</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
            onPress={() => navigateSafely('StudentLogin')}
            accessibilityRole="button"
            accessibilityLabel="Login to your student account"
          >
            <Text style={styles.secondaryButtonText}>Login</Text>
          </Pressable>
        </View>

        <Text style={styles.footerNote}>For students looking for the right mess, in the right place.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.warmWhite,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },
  scrollContentCompact: {
    paddingTop: 16,
    paddingBottom: 20,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 12,
  },
  logoWrap: {
    backgroundColor: colors.lightCream,
    borderRadius: 28,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logo: {
    borderRadius: 16,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    color: colors.primaryNavy,
    textAlign: 'center',
    marginBottom: 6,
  },
  tagline: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '600',
    color: colors.goldenOrange,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.bodyText,
    textAlign: 'center',
    maxWidth: 360,
  },
  actionsCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 28,
    shadowColor: colors.deepNavy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  actionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primaryNavy,
    marginBottom: 4,
  },
  actionsSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedText,
    marginBottom: 16,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  primaryButton: {
    backgroundColor: colors.primaryNavy,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  primaryButtonSubtext: {
    color: '#D9E6F5',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  secondaryButton: {
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.primaryNavy,
    fontSize: 16,
    fontWeight: '700',
  },
  footerNote: {
    marginTop: 22,
    textAlign: 'center',
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
});
