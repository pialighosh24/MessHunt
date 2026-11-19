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
  const name = values.name.trim();
  const email = values.email.trim();
  const phone = values.phone.trim();
  if (!name) errors.name = 'Name is required';
  if (!email) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';
  if (phone && (phone.length < 7 || phone.length > 20)) errors.phone = 'Phone number must be 7-20 characters';
  if (!values.password) errors.password = 'Password is required';
  else if (values.password.length < 6) errors.password = 'Password must be at least 6 characters';
  if (!values.confirmPassword) errors.confirmPassword = 'Please confirm your password';
  else if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

export default function StudentRegisterScreen({ navigation }) {
  const { register } = useAuth();
  const { width } = useWindowDimensions();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const logoSize = Math.min(Math.max(width * 0.16, 52), 68);

  const clearFieldError = (field) => {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    if (submitError) setSubmitError('');
  };

  const onSubmit = async () => {
    const values = { name, email, phone, password, confirmPassword };
    const errors = validate(values);
    setFieldErrors(errors);
    setSubmitError('');
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      // Backend-required fields: name, email, password. Phone is optional (sent only if provided).
      // confirmPassword is client-side only and is not sent to the backend.
      const payload = { name: name.trim(), email: email.trim(), password };
      if (phone.trim()) payload.phone = phone.trim();
      await register(payload);
      // Auth state change will move to authenticated area (existing session/navigation behavior).
    } catch (error) {
      if (error && Array.isArray(error.errors) && error.errors.length > 0) {
        const mapped = {};
        error.errors.forEach((e) => {
          if (e && e.field) mapped[e.field] = e.message || 'Invalid value';
        });
        setFieldErrors((prev) => ({ ...prev, ...mapped }));
      }
      setSubmitError(error?.message || 'Registration failed. Please try again.');
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
            <Text style={styles.heading}>Create your account</Text>
            <Text style={styles.subheading}>
              Join Mess Hunt to discover, compare, and review student mess accommodations.
            </Text>
          </View>

          <View style={styles.card}>
            {submitError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerTitle}>Unable to create account</Text>
                <Text style={styles.errorBannerText}>{submitError}</Text>
              </View>
            ) : null}

            <Field label="Full name" error={fieldErrors.name}>
              <TextInput
                style={[styles.input, fieldErrors.name ? styles.inputError : null]}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  clearFieldError('name');
                }}
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="name"
                textContentType="name"
                placeholder="Your full name"
                placeholderTextColor={colors.mutedText}
                editable={!isSubmitting}
                accessibilityLabel="Full name"
              />
            </Field>

            <Field label="Email address" error={fieldErrors.email}>
              <TextInput
                style={[styles.input, fieldErrors.email ? styles.inputError : null]}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  clearFieldError('email');
                }}
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
            </Field>

            <Field label="Phone number (optional)" error={fieldErrors.phone} helper="If provided, use 7-20 characters.">
              <TextInput
                style={[styles.input, fieldErrors.phone ? styles.inputError : null]}
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  clearFieldError('phone');
                }}
                autoComplete="tel"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="Phone number"
                placeholderTextColor={colors.mutedText}
                editable={!isSubmitting}
                accessibilityLabel="Phone number optional"
              />
            </Field>

            <Field
              label="Password"
              error={fieldErrors.password}
              helper={!fieldErrors.password ? 'Must be at least 6 characters.' : undefined}
            >
              <View style={[styles.passwordRow, fieldErrors.password ? styles.inputError : null]}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    clearFieldError('password');
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password-new"
                  textContentType={Platform.OS === 'ios' ? 'newPassword' : 'password'}
                  placeholder="Create a password"
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
            </Field>

            <Field label="Confirm password" error={fieldErrors.confirmPassword}>
              <View style={[styles.passwordRow, fieldErrors.confirmPassword ? styles.inputError : null]}>
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={(v) => {
                    setConfirmPassword(v);
                    clearFieldError('confirmPassword');
                  }}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password-new"
                  textContentType={Platform.OS === 'ios' ? 'newPassword' : 'password'}
                  placeholder="Re-enter your password"
                  placeholderTextColor={colors.mutedText}
                  editable={!isSubmitting}
                  accessibilityLabel="Confirm password"
                />
                <Pressable
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  disabled={isSubmitting}
                  hitSlop={8}
                >
                  <Text style={styles.toggleText}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
            </Field>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                isSubmitting && styles.buttonDisabled,
                pressed && !isSubmitting && styles.buttonPressed,
              ]}
              onPress={onSubmit}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              {isSubmitting ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.white} />
                  <Text style={styles.buttonText}>Creating account...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Pressable
              onPress={() => navigation.navigate('StudentLogin')}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Go to login"
              style={styles.linkPressable}
              hitSlop={6}
            >
              <Text style={styles.linkText}>Login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, error, helper, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {helper ? <Text style={styles.helperText}>{helper}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
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
    marginBottom: 18,
    paddingTop: 8,
  },
  logoWrap: {
    backgroundColor: colors.lightCream,
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
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
    maxWidth: 360,
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
  field: { marginBottom: 15 },
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
  helperText: { color: colors.mutedText, fontSize: 12, marginTop: 6, lineHeight: 16 },
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
