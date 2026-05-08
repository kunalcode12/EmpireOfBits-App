import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getUserProfile, requestOtp, verifyOtp } from '../lib/vorldAuth';
import {
  clearReactiveSessionKeepStreamUrl,
  loadReactiveSnapshot,
  saveReactiveEnabled,
  saveReactiveSession,
  saveReactiveStreamUrl,
  type ReactiveVorldProfile,
  type ReactiveVorldUser,
} from '../utils/reactiveStorageHelper';

const TWITCH_URL_REGEX = /^https:\/\/(?:www\.)?twitch\.tv\/[a-zA-Z0-9_]{3,25}\/?$/;

const PINK = '#FF006E';
const CYAN = '#22d3ee';
const AMBER = '#FFB800';
const INK = '#f5f5f5';
const DIM = '#94a3b8';
const MUTED = '#6b7280';

type Step = 0 | 1 | 2;

interface Props {
  onChange?: () => void;
}

export function ReactiveIdentityPanel({ onChange }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [vorldUser, setVorldUser] = useState<ReactiveVorldUser | null>(null);
  const [profile, setProfile] = useState<ReactiveVorldProfile | null>(null);
  const [streamUrl, setStreamUrl] = useState<string>('');

  const [step, setStep] = useState<Step>(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [twitch, setTwitch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disablingOpen, setDisablingOpen] = useState(false);
  const [refreshingProfile, setRefreshingProfile] = useState(false);

  useEffect(() => {
    void (async () => {
      const snap = await loadReactiveSnapshot();
      const live = Boolean(snap.enabled && snap.accessToken && snap.user);
      setEnabled(live);
      setAccessToken(snap.accessToken);
      setVorldUser(snap.user);
      setProfile(snap.profile);
      if (snap.streamUrl) {
        setStreamUrl(snap.streamUrl);
        setTwitch(snap.streamUrl);
      }
      setHydrated(true);
    })();
  }, []);

  const twitchValid = TWITCH_URL_REGEX.test(twitch.trim());

  const handleSendOtp = useCallback(async () => {
    if (busy) return;
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await requestOtp(trimmed);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send OTP.');
    } finally {
      setBusy(false);
    }
  }, [busy, email]);

  const handleVerifyOtp = useCallback(async () => {
    if (busy || otp.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(email.trim(), otp);
      let profilePayload: ReactiveVorldProfile | null = null;
      try {
        profilePayload = await getUserProfile(result.accessToken);
      } catch {
        // non-fatal
      }
      await saveReactiveSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user as ReactiveVorldUser,
        profile: profilePayload,
      });
      setAccessToken(result.accessToken);
      setVorldUser(result.user as ReactiveVorldUser);
      setProfile(profilePayload);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setBusy(false);
    }
  }, [busy, email, otp]);

  const handleLink = useCallback(async () => {
    if (busy) return;
    const trimmed = twitch.trim();
    if (!trimmed || !TWITCH_URL_REGEX.test(trimmed)) {
      setError('Format: https://twitch.tv/accountname');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveReactiveStreamUrl(trimmed);
      await saveReactiveEnabled(true);
      setStreamUrl(trimmed);
      setEnabled(true);
      setStep(0);
      setOtp('');
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }, [busy, onChange, twitch]);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    try {
      await clearReactiveSessionKeepStreamUrl();
      setEnabled(false);
      setAccessToken(null);
      setVorldUser(null);
      setProfile(null);
      setStep(0);
      setEmail('');
      setOtp('');
      setDisablingOpen(false);
      onChange?.();
    } finally {
      setBusy(false);
    }
  }, [onChange]);

  const handleRefreshProfile = useCallback(async () => {
    if (!accessToken || refreshingProfile) return;
    setRefreshingProfile(true);
    setError(null);
    try {
      const fresh = await getUserProfile(accessToken);
      setProfile(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile refresh failed.');
    } finally {
      setRefreshingProfile(false);
    }
  }, [accessToken, refreshingProfile]);

  if (!hydrated) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={PINK} />
      </View>
    );
  }

  if (enabled) {
    const handleMatch = streamUrl.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    const handle = handleMatch ? handleMatch[1] : null;
    const profileEmail =
      (typeof profile?.email === 'string' ? (profile.email as string) : null) ??
      vorldUser?.email ??
      '--';
    const userIdLike =
      (typeof profile?.id === 'string' ? (profile.id as string) : null) ??
      (typeof vorldUser?.id === 'string' ? (vorldUser.id as string) : null);
    const profileEntries = profile
      ? Object.entries(profile).filter(
          ([k, v]) =>
            !['id', 'email'].includes(k) &&
            (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'),
        )
      : [];

    return (
      <View style={styles.wrap}>
        <View style={styles.statusBar}>
          <View style={styles.statusDot} />
          <Text style={styles.statusBarText}>VORLD IDENTITY · LIVE</Text>
          <MaterialCommunityIcons name="twitch" size={16} color={PINK} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>
              {(profileEmail[0] ?? 'V').toUpperCase()}
            </Text>
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroName} numberOfLines={1}>
              {handle ? `@${handle}` : 'Vorld User'}
            </Text>
            <Text style={styles.heroEmail} numberOfLines={1}>{profileEmail}</Text>
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroBadge}>
                <View style={styles.heroBadgeDot} />
                <Text style={styles.heroBadgeText}>REACTIVE</Text>
              </View>
            </View>
          </View>
        </View>

        <Section title="STREAM IDENTITY" accent={PINK}>
          <Row label="PLATFORM" value="Twitch" />
          <Row label="HANDLE" value={handle ? `@${handle}` : '--'} highlight={PINK} />
          <Row label="URL" value={streamUrl || '--'} mono dim />
        </Section>

        <Section
          title="VORLD PROFILE"
          accent={CYAN}
          right={
            <Pressable onPress={() => void handleRefreshProfile()} disabled={refreshingProfile} style={styles.sectionAction}>
              {refreshingProfile ? (
                <ActivityIndicator size="small" color={CYAN} />
              ) : (
                <>
                  <MaterialCommunityIcons name="refresh" size={11} color={CYAN} />
                  <Text style={styles.sectionActionText}>SYNC</Text>
                </>
              )}
            </Pressable>
          }
        >
          {userIdLike ? <Row label="ID" value={`${userIdLike.slice(0, 24)}…`} mono dim /> : null}
          <Row label="EMAIL" value={profileEmail} mono />
          {profileEntries.slice(0, 8).map(([k, v]) => (
            <Row key={k} label={k.toUpperCase()} value={String(v)} />
          ))}
          {profileEntries.length === 0 && !userIdLike ? (
            <Text style={styles.emptyHint}>No extra profile fields returned.</Text>
          ) : null}
        </Section>

        <Section title="SESSION TOKEN" accent={AMBER}>
          <Row
            label="ACCESS"
            value={accessToken ? `${accessToken.slice(0, 18)}…${accessToken.slice(-6)}` : '--'}
            mono
            dim
          />
        </Section>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {disablingOpen ? (
          <View style={styles.disableCard}>
            <Text style={styles.disableTitle}>Disable Reactive?</Text>
            <Text style={styles.disableHint}>
              Vorld access token & user are cleared. Stream URL stays remembered for next time.
            </Text>
            <View style={styles.disableButtons}>
              <Pressable
                style={[styles.disableBtn, styles.disableBtnCancel]}
                onPress={() => setDisablingOpen(false)}
                disabled={busy}
              >
                <Text style={styles.disableBtnCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                style={[styles.disableBtn, styles.disableBtnConfirm]}
                onPress={() => void handleDisable()}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={PINK} size="small" />
                ) : (
                  <Text style={styles.disableBtnConfirmText}>DISABLE</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.disableTrigger} onPress={() => setDisablingOpen(true)}>
            <MaterialCommunityIcons name="logout-variant" size={13} color={DIM} />
            <Text style={styles.disableTriggerText}>Disable Reactive Identity</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.heroPanel}>
        <View style={styles.heroPanelGlow} pointerEvents="none" />
        <View style={styles.heroPanelIconWrap}>
          <MaterialCommunityIcons name="broadcast" size={26} color={PINK} />
        </View>
        <Text style={styles.heroPanelTitle}>VORLD IDENTITY</Text>
        <Text style={styles.heroPanelHint}>
          Link your Vorld account to enable reactive sessions across Empire of Bits.
        </Text>
      </View>

      <View style={styles.steps}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.stepDot, i <= step && styles.stepDotActive, i === step && styles.stepDotCurrent]}
          />
        ))}
      </View>

      {step === 0 ? (
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <MaterialCommunityIcons name="email-outline" size={18} color={CYAN} />
            <Text style={styles.formTitle}>STEP 01 / EMAIL</Text>
          </View>
          <Text style={styles.fieldLabel}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="player@arcade.gg"
            placeholderTextColor={MUTED}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[
              styles.cta,
              { borderColor: CYAN, shadowColor: CYAN },
              (!email.trim() || busy) && styles.ctaDisabled,
            ]}
            disabled={!email.trim() || busy}
            onPress={() => void handleSendOtp()}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.ctaText}>SEND CODE</Text>
                <MaterialCommunityIcons name="send-outline" size={14} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <MaterialCommunityIcons name="shield-key-outline" size={18} color={AMBER} />
            <Text style={styles.formTitle}>STEP 02 / VERIFY</Text>
          </View>
          <Text style={styles.fieldHint}>
            Code sent to <Text style={styles.fieldHintAccent}>{email}</Text>
          </Text>
          <Text style={styles.fieldLabel}>VERIFICATION CODE</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={otp}
            onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, ''))}
            placeholder="• • • • • •"
            placeholderTextColor={MUTED}
            keyboardType="number-pad"
            maxLength={6}
          />
          <View style={styles.dotRow}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={[styles.codeDot, i < otp.length && styles.codeDotFilled]} />
            ))}
          </View>
          <Pressable
            style={[
              styles.cta,
              { borderColor: AMBER, shadowColor: AMBER },
              (otp.length < 4 || busy) && styles.ctaDisabled,
            ]}
            disabled={otp.length < 4 || busy}
            onPress={() => void handleVerifyOtp()}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.ctaText}>VERIFY</Text>
                <MaterialCommunityIcons name="shield-check-outline" size={14} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <MaterialCommunityIcons name="twitch" size={18} color={PINK} />
            <Text style={styles.formTitle}>STEP 03 / STREAM</Text>
          </View>
          <Text style={styles.fieldLabel}>STREAM URL</Text>
          <TextInput
            style={styles.input}
            value={twitch}
            onChangeText={setTwitch}
            placeholder="https://twitch.tv/your_handle"
            placeholderTextColor={MUTED}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldHint}>Format: https://twitch.tv/accountname</Text>
          <Pressable
            style={[
              styles.cta,
              { borderColor: PINK, shadowColor: PINK },
              (!twitch.trim() || !twitchValid || busy) && styles.ctaDisabled,
            ]}
            disabled={!twitch.trim() || !twitchValid || busy}
            onPress={() => void handleLink()}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.ctaText}>LINK ACCOUNT</Text>
                <MaterialCommunityIcons name="link-variant" size={14} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {step > 0 ? (
        <Pressable
          style={styles.backStep}
          onPress={() => setStep((s) => Math.max(0, s - 1) as Step)}
          disabled={busy}
        >
          <MaterialCommunityIcons name="arrow-left" size={12} color={DIM} />
          <Text style={styles.backStepText}>BACK</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Section({
  title,
  accent,
  right,
  children,
}: {
  title: string;
  accent: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
      <View style={styles.sectionInner}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: accent }]}>{title}</Text>
          {right}
        </View>
        <View style={styles.sectionBody}>{children}</View>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  mono,
  dim,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  dim?: boolean;
  highlight?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          mono && styles.rowMono,
          dim && styles.rowDim,
          highlight ? { color: highlight } : undefined,
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  wrap: {
    gap: 14,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,0,110,0.45)',
    backgroundColor: 'rgba(255,0,110,0.08)',
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: PINK,
    shadowColor: PINK,
    shadowOpacity: 0.95,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  statusBarText: {
    color: PINK,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 1.4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,0,110,0.45)',
    backgroundColor: 'rgba(20,8,16,0.92)',
    shadowColor: PINK,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,0,110,0.15)',
    borderWidth: 2,
    borderColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PINK,
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  heroAvatarText: {
    fontFamily: 'PressStart2P',
    fontSize: 22,
    color: '#ffd6e6',
    letterSpacing: 1,
  },
  heroBody: {
    flex: 1,
    gap: 3,
  },
  heroName: {
    color: INK,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  heroEmail: {
    color: DIM,
    fontSize: 11,
    letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,0,110,0.6)',
    backgroundColor: 'rgba(255,0,110,0.10)',
  },
  heroBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: PINK,
  },
  heroBadgeText: {
    color: PINK,
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  section: {
    flexDirection: 'row',
    backgroundColor: 'rgba(8,8,12,0.92)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sectionAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  sectionInner: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 2.5,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.45)',
    backgroundColor: 'rgba(34,211,238,0.08)',
  },
  sectionActionText: {
    color: CYAN,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: '800',
  },
  sectionBody: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  rowLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: DIM,
    fontSize: 10,
    letterSpacing: 1.4,
    minWidth: 78,
  },
  rowValue: {
    flex: 1,
    color: INK,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    letterSpacing: 0.3,
  },
  rowMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
  rowDim: {
    color: '#71717a',
  },
  emptyHint: {
    color: DIM,
    fontSize: 11,
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  disableCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,0,110,0.5)',
    backgroundColor: 'rgba(20,8,16,0.96)',
    gap: 10,
  },
  disableTitle: {
    color: PINK,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  disableHint: {
    color: DIM,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  disableButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  disableBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  disableBtnCancel: {
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  disableBtnCancelText: {
    color: INK,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  disableBtnConfirm: {
    borderColor: 'rgba(255,0,110,0.5)',
    backgroundColor: 'rgba(255,0,110,0.10)',
  },
  disableBtnConfirmText: {
    color: PINK,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  disableTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  disableTriggerText: {
    color: DIM,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // ─── Login flow ─────────────────────────────────────────
  heroPanel: {
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,0,110,0.45)',
    backgroundColor: 'rgba(15,8,12,0.92)',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  heroPanelGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,0,110,0.05)',
  },
  heroPanelIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,0,110,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,0,110,0.5)',
    marginBottom: 6,
  },
  heroPanelTitle: {
    fontFamily: 'PressStart2P',
    fontSize: 14,
    color: '#ffd6e6',
    letterSpacing: 2.5,
    textShadowColor: PINK,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  heroPanelHint: {
    color: DIM,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  steps: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 4,
  },
  stepDot: {
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  stepDotActive: {
    backgroundColor: CYAN,
  },
  stepDotCurrent: {
    shadowColor: CYAN,
    shadowOpacity: 0.95,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  formCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(8,8,12,0.92)',
    gap: 10,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  formTitle: {
    fontFamily: 'PressStart2P',
    fontSize: 11,
    color: INK,
    letterSpacing: 1.5,
  },
  fieldLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: CYAN,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  fieldHint: {
    color: DIM,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fieldHintAccent: {
    color: CYAN,
    fontWeight: '700',
  },
  input: {
    color: INK,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(8,8,12,0.85)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  codeInput: {
    fontSize: 20,
    letterSpacing: 8,
    textAlign: 'center',
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  codeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  codeDotFilled: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: 'rgba(20,20,20,0.95)',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    marginTop: 4,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1.6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  backStep: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backStepText: {
    color: DIM,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 1.4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
