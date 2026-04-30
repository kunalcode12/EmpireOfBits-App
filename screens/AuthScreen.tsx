import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, typography } from '../constants/theme';
import { useAuth } from '../store/AuthContext';

export function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!email.includes('@') || password.length < 6) return false;
    if (mode === 'signup') return username.trim().length >= 3 && password === confirm;
    return true;
  }, [confirm, email, mode, password, username]);

  const submit = async () => {
    setLocalError(null);
    auth.clearError();
    if (!email.includes('@')) {
      setLocalError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'signup') {
      if (username.trim().length < 3) {
        setLocalError('Username must be at least 3 characters.');
        return;
      }
      if (password !== confirm) {
        setLocalError('Passwords do not match.');
        return;
      }
      await auth.register({ name: username.trim(), email: email.trim(), password, chessLevel: 'BEGINNER' });
      return;
    }
    await auth.login({ email: email.trim(), password });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.screen}>
      <Pattern />
      <View style={styles.card}>
        <Text style={styles.brand}>Endgame Online</Text>
        <Text style={styles.subtitle}>Play quick live chess with a clean, dark board.</Text>
        <View style={styles.tabs}>
          <Pressable style={[styles.tab, mode === 'signin' && styles.tabActive]} onPress={() => setMode('signin')}>
            <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>Sign In</Text>
          </Pressable>
          <Pressable style={[styles.tab, mode === 'signup' && styles.tabActive]} onPress={() => setMode('signup')}>
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Sign Up</Text>
          </Pressable>
        </View>
        {mode === 'signup' && <Field value={username} onChangeText={setUsername} placeholder="Username" />}
        <Field value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
        <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
        {mode === 'signup' && <Field value={confirm} onChangeText={setConfirm} placeholder="Confirm password" secureTextEntry />}
        {(localError || auth.error) && <Text style={styles.error}>{localError ?? auth.error}</Text>}
        <Pressable style={[styles.primary, (!canSubmit || auth.loading) && styles.disabled]} disabled={!canSubmit || auth.loading} onPress={submit}>
          {auth.loading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput {...props} placeholderTextColor={colors.subtleText} style={styles.input} />;
}

function Pattern() {
  return (
    <View pointerEvents="none" style={styles.pattern}>
      {Array.from({ length: 48 }).map((_, index) => <View key={index} style={[styles.patternSquare, index % 2 === 0 && styles.patternSquareAlt]} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  pattern: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    flexWrap: 'wrap',
    opacity: 0.08,
  },
  patternSquare: {
    width: '12.5%',
    aspectRatio: 1,
    backgroundColor: colors.boardDark,
  },
  patternSquareAlt: {
    backgroundColor: colors.boardLight,
  },
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  brand: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: typography.body,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    padding: 3,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    minHeight: 42,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    color: colors.mutedText,
    fontWeight: '800',
  },
  tabTextActive: {
    color: colors.text,
  },
  input: {
    minHeight: 50,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  error: {
    color: colors.danger,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  primary: {
    minHeight: 50,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  primaryText: {
    color: colors.text,
    fontWeight: '900',
    fontSize: typography.body,
  },
});
