import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { colors } from '../theme/colors';

export default function EmptyState({ title = 'Nothing here yet', message, actionLabel, onAction }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable style={styles.button} onPress={onAction}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, paddingHorizontal: 16 },
  title: { fontSize: 17, fontWeight: '700', color: colors.primaryNavy, marginBottom: 6, textAlign: 'center' },
  message: { fontSize: 14, color: colors.mutedText, textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  button: { backgroundColor: colors.primaryNavy, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  buttonText: { color: colors.white, fontWeight: '600' },
});
