import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

function validate(values) {
  const errors = {};
  const email = values.email.trim();
  if (!email) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';
  if (!values.password) errors.password = 'Password is required';
  return errors;
}

export default function StudentLoginScreen({ navigation }) {
  const { login } = useAuth();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const logoSize = Math.min(Math.max(width * 0.18, 56), 72);

  const onEmailChange = (value) => {
    setEmail(value);
    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
    if (submitError) setSubmitError('');
  };

  const onPasswordChange = (value) => {
    setPassword(value);
    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
    if (submitError) setSubmitError('');
  };

  const onSubmit = async () => {
    const values = { email, password };
    const errors = validate(values);
    setFieldErrors(errors);
    setSubmitError('');
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      // Navigation to authenticated area is handled by auth state in navigator.
    } catch (error) {
      if (error && Array.isArray(error.errors) && error.errors.length > 0) {
        const mapped = {};
        error.errors.forEach((e) => {
          if (e && e.field) mapped[e.field] = e.message || 'Invalid value';
        });
        setFieldErrors((prev) => ({ ...prev, ...mapped }));
      }
      setSubmitError(error?.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoWrap}>
              <Image
                source={require('../../assets/brand/mess-hunt-logo.jpg')}
                style={{ width: logoSize, height: logoSize, borderRadius: 14 }}
                resizeMode="contain"
                accessible
                accessibilityLabel="Mess Hunt logo"
              />
            </View>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>
              Log in to continue finding and saving your ideal mess accommodation.
            </Text>
          </View>

          <View style={styles.card}>
            {submitError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerTitle}>Unable to log in</Text>
                <Text style={styles.errorBannerText}>{submitError}</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={[styles.input, fieldErrors.email ? styles.inputError : null]}
                value={email}
                onChangeText={onEmailChange}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedText}
                editable={!isSubmitting}
                accessibilityLabel="Email address"
              />
              {fieldErrors.email ? <Text style={styles.errorText}>{fieldErrors.email}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.passwordRow, fieldErrors.password ? styles.inputError : null]}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={onPasswordChange}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  placeholder="Enter your password"
                  placeholderTextColor={colors.mutedText}
                  editable={!isSubmitting}
                  accessibilityLabel="Password"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  disabled={isSubmitting}
                  hitSlop={8}
                >
                  <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              {fieldErrors.password ? <Text style={styles.errorText}>{fieldErrors.password}</Text> : null}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                isSubmitting && styles.buttonDisabled,
                pressed && !isSubmitting && styles.buttonPressed,
              ]}
              onPress={onSubmit}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Login"
            >
              {isSubmitting ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.white} />
                  <Text style={styles.buttonText}>Logging in...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <Pressable
              onPress={() => navigation.navigate('StudentRegister')}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Create an account"
              style={styles.linkPressable}
              hitSlop={6}
            >
              <Text style={styles.linkText}>Create Account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.warmWhite },
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 8,
  },
  logoWrap: {
    backgroundColor: colors.lightCream,
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  heading: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: colors.primaryNavy,
    textAlign: 'center',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.bodyText,
    textAlign: 'center',
    maxWidth: 340,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.deepNavy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  field: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryNavy,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.warmWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 15,
    color: colors.bodyText,
  },
  inputError: { borderColor: colors.error },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warmWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingRight: 6,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 15,
    color: colors.bodyText,
  },
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  togglePressed: {
    backgroundColor: colors.softGrey,
  },
  toggleText: { color: colors.primaryNavy, fontWeight: '600', fontSize: 13 },
  errorText: { color: colors.error, fontSize: 12, marginTop: 6, lineHeight: 16 },
  errorBanner: {
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F3C4C4',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerTitle: {
    color: colors.error,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
  },
  errorBannerText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.primaryNavy,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 52,
  },
  buttonPressed: { opacity: 0.92 },
  buttonDisabled: { opacity: 0.7 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
    flexWrap: 'wrap',
  },
  footerText: {
    color: colors.bodyText,
    fontSize: 14,
  },
  linkPressable: {
    marginLeft: 6,
    paddingVertical: 4,
  },
  linkText: {
    color: colors.primaryNavy,
    fontWeight: '700',
    fontSize: 14,
  },
});
