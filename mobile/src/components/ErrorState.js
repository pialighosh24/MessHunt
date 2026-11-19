import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { colors } from '../theme/colors';

export default function ErrorState({ message = 'Something went wrong.', onRetry, retryLabel = 'Retry' }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unable to load</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  title: { fontSize: 17, fontWeight: '700', color: colors.error, marginBottom: 6 },
  message: { fontSize: 14, color: colors.bodyText, textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  button: { backgroundColor: colors.primaryNavy, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  buttonText: { color: colors.white, fontWeight: '600' },
});
