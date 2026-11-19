import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { getProfile, updateProfile } from '../services/studentService';

export default function StudentProfileScreen() {
  const { user, logout, setUser } = useAuth();
  const [profile, setProfile] = useState(user);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = await getProfile();
      if (p) {
        setProfile(p);
        setName(p.name || '');
        setPhone(p.phone || '');
        setUser(p);
      }
    } catch (e) {
      setError(e?.message || 'Failed to load profile.');
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onSave = async () => {
    setError(''); setSuccess('');
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Name is required.'); return; }
    const trimmedPhone = phone.trim();
    if (trimmedPhone && (trimmedPhone.length < 7 || trimmedPhone.length > 20)) { setError('Phone number must be 7-20 characters.'); return; }
    setSaving(true);
    try {
      const updated = await updateProfile({ name: trimmedName, phone: trimmedPhone });
      if (updated) {
        setProfile(updated);
        setUser(updated);
        setSuccess('Profile updated successfully.');
      }
    } catch (e) {
      setError(e?.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  const onLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        setLoggingOut(true);
        try {
          await logout();
        } finally {
          setLoggingOut(false);
        }
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Manage your account details.</Text>

        {loading ? <ActivityIndicator color={colors.primaryNavy} style={{ marginBottom: 12 }} /> : null}

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.readonly}><Text style={styles.readonlyText}>{profile?.email || user?.email || '—'}</Text></View>
          <Text style={styles.hint}>Email is displayed for your account and cannot be changed here.</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.mutedText} />

          <Text style={styles.label}>Phone (optional)</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor={colors.mutedText} keyboardType="phone-pad" />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}

          <Pressable style={[styles.button, saving && styles.disabled]} onPress={onSave} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Save changes</Text>}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Session</Text>
          <Text style={styles.muted}>Your session is stored securely on this device. You can log out anytime.</Text>
          <Pressable style={[styles.logoutButton, loggingOut && styles.disabled]} onPress={onLogout} disabled={loggingOut}>
            {loggingOut ? <ActivityIndicator color={colors.error} /> : <Text style={styles.logoutText}>Logout</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.warmWhite },
  content: { padding: 16, paddingBottom: 28 },
  title: { fontSize: 24, fontWeight: '700', color: colors.primaryNavy },
  subtitle: { fontSize: 13, color: colors.mutedText, marginTop: 4, marginBottom: 14 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.bodyText, marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.bodyText, backgroundColor: colors.warmWhite },
  readonly: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: colors.softGrey },
  readonlyText: { color: colors.bodyText },
  hint: { fontSize: 12, color: colors.mutedText, marginTop: 4 },
  error: { color: colors.error, marginTop: 10 },
  success: { color: colors.success, marginTop: 10, fontWeight: '600' },
  button: { backgroundColor: colors.primaryNavy, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  buttonText: { color: colors.white, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.primaryNavy, marginBottom: 6 },
  muted: { fontSize: 13, color: colors.mutedText, lineHeight: 18 },
  logoutButton: { marginTop: 12, borderWidth: 1, borderColor: colors.error, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#FDECEC' },
  logoutText: { color: colors.error, fontWeight: '700' },
  disabled: { opacity: 0.7 },
});
