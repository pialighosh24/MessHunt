import React from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';

export default function LoadingScreen({
  message = 'Loading...',
  error,
  onRetry,
  retryLabel = 'Retry',
  secondaryActionLabel,
  onSecondaryAction,
}) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor={colors.warmWhite} />
      <View style={styles.content}>
        {!error ? <ActivityIndicator size="large" color={colors.primaryNavy} /> : null}
        <Text style={styles.title}>Mess Hunt</Text>
        <Text style={styles.tagline}>Find Your Perfect Mess</Text>
        <Text style={[styles.message, error ? styles.errorText : null]}>
          {error ? error.message || 'Something went wrong while restoring your session.' : message}
        </Text>
        {error && onRetry ? (
          <Pressable style={styles.button} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.buttonText}>{retryLabel}</Text>
          </Pressable>
        ) : null}
        {error && secondaryActionLabel && onSecondaryAction ? (
          <Pressable style={styles.secondaryButton} onPress={onSecondaryAction} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>{secondaryActionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.warmWhite,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primaryNavy,
    marginTop: 16,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.goldenOrange,
    marginTop: 4,
    marginBottom: 16,
  },
  message: {
    fontSize: 14,
    color: colors.bodyText,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  errorText: {
    color: colors.error,
  },
  button: {
    marginTop: 16,
    backgroundColor: colors.primaryNavy,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.white,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: colors.primaryNavy,
    fontWeight: '600',
  },
});
