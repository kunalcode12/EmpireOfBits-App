import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  useEmbeddedSolanaWallet,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
} from '@privy-io/expo';
import {
  PrivyUIError,
  useLogin,
  useSolanaSignMessage,
} from '@privy-io/expo/ui';
import { useFonts } from 'expo-font';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACCENT = '#FFD700';
const BG = '#05050F';
const SURFACE = '#0E0E1F';
const MUTED = '#A0A0C0';

export function PrivyAuthScreen() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const { isReady, user, error: privyInitError, logout } = usePrivy();
  const { sendCode, loginWithCode, state: otpState } = useLoginWithEmail();
  const { login: loginWithOAuth, state: oauthState } = useLoginWithOAuth();
  const { login: openPrivyLoginUi } = useLogin();
  const { signMessage: solanaSignUi } = useSolanaSignMessage();
  const solanaWallet = useEmbeddedSolanaWallet();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const onSendCode = useCallback(async () => {
    setLocalError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setLocalError('Enter your email address.');
      return;
    }
    setBusy(true);
    try {
      await sendCode({ email: trimmed });
      setCodeSent(true);
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Failed to send code.');
    } finally {
      setBusy(false);
    }
  }, [email, sendCode]);

  const onVerifyCode = useCallback(async () => {
    setLocalError(null);
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setLocalError('Enter the code from your email.');
      return;
    }
    setBusy(true);
    try {
      await loginWithCode({ code: trimmedCode, email: trimmedEmail });
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  }, [code, email, loginWithCode]);

  const onGoogleLogin = useCallback(async () => {
    setLocalError(null);
    try {
      await loginWithOAuth({ provider: 'google' });
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Google sign-in failed.');
    }
  }, [loginWithOAuth]);

  const onPrivyUiLogin = useCallback(async () => {
    setLocalError(null);
    setBusy(true);
    try {
      await openPrivyLoginUi({ loginMethods: ['email', 'google'] });
    } catch (e: unknown) {
      if (e instanceof PrivyUIError) {
        setLocalError(`${e.code}: ${e.message}`);
      } else {
        setLocalError(e instanceof Error ? e.message : 'Privy UI login failed.');
      }
    } finally {
      setBusy(false);
    }
  }, [openPrivyLoginUi]);

  const onHeadlessSolanaSign = useCallback(async () => {
    setLocalError(null);
    setLastSignature(null);
    if (solanaWallet.status !== 'connected' || !solanaWallet.wallets?.[0]) {
      setLocalError('Solana embedded wallet is not ready yet.');
      return;
    }
    setBusy(true);
    try {
      const provider = await solanaWallet.wallets[0].getProvider();
      const result = await provider.request({
        method: 'signMessage',
        params: { message: 'Hello from EobApp (headless Solana sign)' },
      });
      setLastSignature(typeof result === 'string' ? result : JSON.stringify(result));
      Alert.alert('Signed (headless)', 'Message signed with embedded Solana wallet.');
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Headless sign failed.');
    } finally {
      setBusy(false);
    }
  }, [solanaWallet]);

  const onUiSolanaSign = useCallback(async () => {
    setLocalError(null);
    setLastSignature(null);
    setBusy(true);
    try {
      const { signature } = await solanaSignUi({
        message: 'Hello world',
        appearance: {
          title: 'Confirm signature',
          description: 'Empire of Bits — prove wallet control',
          buttonText: 'Sign',
        },
      });
      setLastSignature(signature);
      Alert.alert('Signed (Privy UI)', signature.slice(0, 24) + '…');
    } catch (e: unknown) {
      if (e instanceof PrivyUIError) {
        setLocalError(`${e.code}: ${e.message}`);
      } else {
        setLocalError(e instanceof Error ? e.message : 'Privy UI sign failed.');
      }
    } finally {
      setBusy(false);
    }
  }, [solanaSignUi]);

  const otpBusy =
    otpState.status === 'sending-code' || otpState.status === 'submitting-code';
  const oauthBusy = oauthState.status === 'loading';
  const oauthErrorMessage =
    oauthState.status === 'error' && oauthState.error ? oauthState.error.message : null;
  const authBusy = busy || otpBusy || oauthBusy;

  if (!fontsLoaded) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.caption}>Initializing Privy…</Text>
      </View>
    );
  }

  if (privyInitError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Privy error</Text>
        <Text style={styles.body}>{privyInitError.message}</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => logout()}>
          <Text style={styles.secondaryBtnText}>Reset session</Text>
        </Pressable>
      </View>
    );
  }

  if (user) {
    const solanaStatus = solanaWallet.status;
    const solanaAddress =
      solanaWallet.status === 'connected' && solanaWallet.wallets?.[0]
        ? solanaWallet.wallets[0].address
        : null;

    return (
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Text style={styles.brand}>Empire of Bits</Text>
        <Text style={styles.title}>You're signed in</Text>
        <Text style={styles.subtitle}>
          Embedded Solana wallet and signing are available below. When you're ready, continue to the
          app.
        </Text>

        <Pressable
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.primaryBtnText}>Continue to app</Text>
        </Pressable>

        <Pressable style={styles.linkBtn} onPress={() => logout()}>
          <Text style={styles.linkBtnText}>Log out</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Embedded Solana wallet</Text>
          <Text style={styles.body}>
            Status: <Text style={styles.highlight}>{solanaStatus}</Text>
          </Text>
          {solanaAddress ? (
            <Text style={styles.mono} selectable>
              {solanaAddress}
            </Text>
          ) : (
            <Text style={styles.caption}>
              Wallet provisioning follows your Privy dashboard settings and{' '}
              <Text style={styles.highlight}>createOnLogin</Text> config.
            </Text>
          )}
          <Pressable
            style={[styles.secondaryBtn, (busy || solanaStatus !== 'connected') && styles.btnDisabled]}
            disabled={busy || solanaStatus !== 'connected'}
            onPress={onHeadlessSolanaSign}
          >
            <Text style={styles.secondaryBtnText}>Sign message (headless provider)</Text>
          </Pressable>
          <Pressable style={[styles.secondaryBtn, busy && styles.btnDisabled]} disabled={busy} onPress={onUiSolanaSign}>
            <Text style={styles.secondaryBtnText}>Sign message (Privy modal UI)</Text>
          </Pressable>
          {lastSignature ? (
            <Text style={styles.monoSmall} selectable numberOfLines={3}>
              Last sig: {lastSignature}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>Empire of Bits</Text>
        <Text style={styles.title}>Sign in with Privy</Text>
        <Text style={styles.subtitle}>
          Google, email OTP, and embedded Solana wallet. Enable providers in the Privy Dashboard.
        </Text>

        {(localError || oauthErrorMessage || (otpState.status === 'error' && otpState.error)) ? (
          <Text style={styles.error}>
            {localError ??
              oauthErrorMessage ??
              (otpState.status === 'error' ? otpState.error?.message : null) ??
              'Something went wrong.'}
          </Text>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Continue with Google</Text>
          <Text style={styles.caption}>
            Uses Privy OAuth (enable Google in the Dashboard and configure your app client).
          </Text>
          <Pressable
            style={[styles.googleBtn, authBusy && styles.btnDisabled]}
            disabled={authBusy}
            onPress={onGoogleLogin}
          >
            {oauthBusy ? (
              <ActivityIndicator color="#1a1a2e" />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleBtnText}>Sign in with Google</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or use email</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Email one-time code</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#666"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {!codeSent ? (
            <Pressable
              style={[styles.primaryBtn, authBusy && styles.btnDisabled]}
              disabled={authBusy}
              onPress={onSendCode}
            >
              <Text style={styles.primaryBtnText}>Send code</Text>
            </Pressable>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor="#666"
                keyboardType="number-pad"
              />
              <Pressable
                style={[styles.primaryBtn, authBusy && styles.btnDisabled]}
                disabled={authBusy}
                onPress={onVerifyCode}
              >
                <Text style={styles.primaryBtnText}>Verify & log in</Text>
              </Pressable>
              <Pressable
                style={styles.linkBtn}
                onPress={() => {
                  setCodeSent(false);
                  setCode('');
                  setLocalError(null);
                }}
              >
                <Text style={styles.linkBtnText}>Use a different email</Text>
              </Pressable>
            </>
          )}
        </View>

        <Pressable
          style={[styles.secondaryBtn, authBusy && styles.btnDisabled]}
          disabled={authBusy}
          onPress={onPrivyUiLogin}
        >
          <Text style={styles.secondaryBtnText}>Open Privy login UI (email & Google)</Text>
        </Pressable>

        <Text style={styles.caption}>
          After you log in, your embedded Solana wallet (if enabled) and signing demos appear on the
          next step before entering the app.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  centered: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 14,
  },
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 20,
  },
  brand: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: ACCENT,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 26,
    color: '#fff',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: MUTED,
    lineHeight: 22,
  },
  caption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: '#E8E8F0',
    lineHeight: 22,
  },
  highlight: {
    color: ACCENT,
    fontFamily: 'Inter_600SemiBold',
  },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
    gap: 12,
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  input: {
    fontFamily: 'Inter_400Regular',
    backgroundColor: '#080812',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#0A0A0F',
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.35)',
    backgroundColor: 'transparent',
  },
  secondaryBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: ACCENT,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  googleBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#1a1a2e',
  },
  googleIcon: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: '#4285F4',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dividerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  linkBtn: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  linkBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#8B8BA8',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  error: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#FF6B6B',
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#C8C8E0',
  },
  monoSmall: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#8888A8',
  },
});
