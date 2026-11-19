import React, { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

export default function StudentHomePlaceholderScreen() {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const onLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
    } catch (error) {
      // logout() clears local session in finally; show message if server call failed but still handled.
      setLogoutError(error?.message || 'Logout completed locally, but the server could not be reached.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor={colors.warmWhite} />
      <View style={styles.content}>
        <Text style={styles.title}>Student Home</Text>
        <Text style={styles.subtitle}>Foundation checkpoint placeholder</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Signed in</Text>
          <Text style={styles.cardText}>{user?.name || 'Student'}</Text>
          <Text style={styles.cardMuted}>{user?.email || ''}</Text>
          <Text style={styles.note}>
            Navigation, secure token storage, and authentication services are initialized. Home, search, details,
            reviews, favourites, and profile screens will be implemented in later checkpoints.
          </Text>
        </View>

        {logoutError ? <Text style={styles.error}>{logoutError}</Text> : null}

        <Pressable style={[styles.button, isLoggingOut ? styles.buttonDisabled : null]} onPress={onLogout} disabled={isLoggingOut}>
          {isLoggingOut ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Logout</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.warmWhite },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', color: colors.primaryNavy, marginBottom: 4 },
  subtitle: { fontSize: 15, color: colors.goldenOrange, fontWeight: '600', marginBottom: 20 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.primaryNavy, marginBottom: 6 },
  cardText: { fontSize: 18, fontWeight: '600', color: colors.bodyText },
  cardMuted: { fontSize: 14, color: colors.mutedText, marginTop: 2, marginBottom: 12 },
  note: { fontSize: 13, lineHeight: 19, color: colors.bodyText },
  error: { color: colors.error, marginBottom: 12 },
  button: {
    backgroundColor: colors.primaryNavy,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '600' },
});
