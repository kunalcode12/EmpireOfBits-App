import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../constants/theme';
import { useAuth } from '../store/AuthContext';
import { useGame } from '../store/GameContext';
import type { ColorPreference, TimeControl } from '../websockets/gameSocket';

// Elder Futhark rune mappings for "EMPIRE OF BITS"
const RUNE_MAP: Record<string, string> = {
  E: 'ᛖ', M: 'ᛗ', P: 'ᛈ', I: 'ᛁ', R: 'ᚱ',
  O: 'ᛟ', F: 'ᚠ', B: 'ᛒ', T: 'ᛏ', S: 'ᛊ',
  ' ': '  ',
};

const EMPIRE_RUNES = 'EMPIRE OF BITS'
  .split('')
  .map((c) => RUNE_MAP[c] ?? c)
  .join('');

const RUNE_LINE = `${EMPIRE_RUNES}   ᛉ   ${EMPIRE_RUNES}   ✦   ${EMPIRE_RUNES}   ᚷ   `;

// Row configs — opacity deliberately low so text sits ghostly behind UI
const ROW_CONFIGS = [
  { opacity: 0.13, size: 20, offset: 0 },
  { opacity: 0.09, size: 17, offset: -44 },
  { opacity: 0.15, size: 23, offset: 18 },
  { opacity: 0.10, size: 18, offset: -22 },
  { opacity: 0.12, size: 21, offset: 36 },
  { opacity: 0.08, size: 16, offset: -10 },
  { opacity: 0.14, size: 22, offset: 8 },
  { opacity: 0.09, size: 19, offset: -38 },
  { opacity: 0.13, size: 20, offset: 26 },
  { opacity: 0.10, size: 17, offset: -16 },
  { opacity: 0.15, size: 24, offset: 42 },
  { opacity: 0.08, size: 18, offset: -6 },
  { opacity: 0.12, size: 21, offset: 14 },
  { opacity: 0.09, size: 16, offset: -30 },
  { opacity: 0.14, size: 20, offset: 22 },
  { opacity: 0.10, size: 23, offset: -48 },
];

function RunicBackground() {
  return (
    <View pointerEvents="none" style={runeStyles.container}>
      {ROW_CONFIGS.map((cfg, i) => (
        <View key={i} style={[runeStyles.row, { marginLeft: cfg.offset }]}>
          <Text
            style={[runeStyles.runeText, { opacity: cfg.opacity, fontSize: cfg.size }]}
            numberOfLines={1}
          >
            {RUNE_LINE}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LobbyScreen() {
  const auth = useAuth();
  const game = useGame();
  const blurTargetRef = useRef<View | null>(null);
  const [timeControl, setTimeControl] = useState<TimeControl | null>('5');
  const [colorPreference, setColorPreference] = useState<ColorPreference | null>('w');
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const ready = Boolean(timeControl && colorPreference);
  const timeLabel = timeControl === '10' ? '10 min' : '5 min';
  const timeIcon = timeControl === '10' ? 'clock-time-five' : 'lightning-bolt';

  return (
    <View style={styles.screen}>
      {/* Runes sit directly on the screen root — nothing covers them */}
      <RunicBackground />

      <View ref={blurTargetRef} style={styles.screenContent}>
        <View style={styles.topContent}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Signed in as</Text>
              <Text style={styles.title}>{auth.user?.username ?? 'Player'}</Text>
            </View>
            <Pressable style={styles.logout} onPress={auth.logout}>
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>
          <View style={styles.section}>
            <View style={styles.options}>
              <Pressable style={[styles.selectorRow, styles.timeRow]} onPress={() => setTimeModalOpen(true)}>
                <View pointerEvents="none" style={styles.timeRowGlowTop} />
                <View pointerEvents="none" style={styles.timeRowGlowBottom} />
                <View style={styles.selectorRowLeft}>
                  <MaterialCommunityIcons name={timeIcon} size={16} color="#f6c849" />
                  <Text style={styles.selectorText}>{timeLabel}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedText} />
              </Pressable>
              <View style={styles.randomRow}>
                <View style={styles.randomDivider} />
                <View style={styles.randomRowLeft}>
                  <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.mutedText} />
                  <Text style={styles.randomText}>vs Random</Text>
                </View>
                <View style={styles.randomDivider} />
              </View>
            </View>
          </View>

          <View style={[styles.section, styles.colorSection]}>
            <View style={styles.colorCard}>
              <View style={styles.colorRow}>
                <Text style={styles.colorLabel}>I Play as</Text>
                <View style={styles.colorButtons}>
                  <Pressable
                    style={[styles.colorButton, styles.whiteButton, colorPreference === 'w' && styles.colorButtonSelected]}
                    onPress={() => setColorPreference('w')}
                  >
                    <MaterialCommunityIcons name="chess-king" size={34} color="#1e1e1e" />
                  </Pressable>
                  <Pressable
                    style={[styles.colorButton, styles.randomButton, colorPreference === 'r' && styles.colorButtonSelected]}
                    onPress={() => setColorPreference('r')}
                  >
                    <View style={styles.randomSplitWrap}>
                      <View style={styles.randomHalfLight} />
                      <View style={styles.randomHalfDark} />
                    </View>
                    <Text style={styles.randomQuestion}>?</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.colorButton, styles.blackButton, colorPreference === 'b' && styles.colorButtonSelected]}
                    onPress={() => setColorPreference('b')}
                  >
                    <MaterialCommunityIcons name="chess-king" size={34} color="#e8e8e8" />
                  </Pressable>
                </View>
              </View>
              <View style={styles.colorDivider} />
            </View>
          </View>

          {game.toast && <Text style={styles.toast}>{game.toast}</Text>}
        </View>
        <View style={styles.playFooter}>
          <Pressable
            disabled={!ready}
            style={[styles.play, !ready && styles.disabled]}
            onPress={() => {
              if (timeControl && colorPreference) void game.startMatchmaking(timeControl, colorPreference);
            }}
          >
            <Text style={styles.playText}>Play</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={timeModalOpen} transparent animationType="fade" onRequestClose={() => setTimeModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <BlurView intensity={45} tint="dark" blurMethod="dimezisBlurView" blurTarget={blurTargetRef} style={styles.modalBlur} />
          <View style={styles.modalScrim} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Time Control</Text>
              <Pressable style={styles.modalClose} onPress={() => setTimeModalOpen(false)}>
                <Text style={styles.modalCloseText}>X</Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.modalOption, timeControl === '5' && styles.modalOptionSelected]}
              onPress={() => {
                setTimeControl('5');
                setTimeModalOpen(false);
              }}
            >
              <MaterialCommunityIcons name="lightning-bolt" size={16} color="#f6c849" />
              <Text style={styles.modalOptionText}>5 min</Text>
            </Pressable>
            <Pressable
              style={[styles.modalOption, timeControl === '10' && styles.modalOptionSelected]}
              onPress={() => {
                setTimeControl('10');
                setTimeModalOpen(false);
              }}
            >
              <MaterialCommunityIcons name="clock-time-five" size={16} color="#9cc8ff" />
              <Text style={styles.modalOptionText}>10 min</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const runeStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  row: {
    overflow: 'hidden',
  },
  runeText: {
    color: '#d4900a',
    fontWeight: '300',
    letterSpacing: 5,
    textShadowColor: '#b86c04',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContent: {
    flex: 1,
  },
  topContent: {
    flex: 1,
    // TRANSPARENT — runes on screen layer show through
    backgroundColor: 'transparent',
    padding: spacing.xl,
    paddingBottom: spacing.md,
  },
  playFooter: {
    // TRANSPARENT — runes show through here too
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
  },
  eyebrow: {
    color: colors.subtleText,
    fontWeight: '800',
    textTransform: 'uppercase',
    fontSize: typography.tiny,
  },
  title: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: '900',
  },
  logout: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  logoutText: {
    color: colors.mutedText,
    fontWeight: '800',
  },
  section: {
    marginBottom: spacing.xl,
  },
  colorSection: {
    marginTop: -6,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  selectorRow: {
    position: 'relative',
    minHeight: 46,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeRow: {
    overflow: 'hidden',
    borderColor: '#4a4642',
    backgroundColor: '#3b3835',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  timeRowGlowTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  timeRowGlowBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '35%',
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  selectorRowSelected: {
    borderColor: colors.accent,
    backgroundColor: '#2f3927',
  },
  selectorRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectorText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: typography.body,
  },
  randomRow: {
    minHeight: 78,
    justifyContent: 'center',
    paddingHorizontal: 0,
    gap: spacing.xl,
    // TRANSPARENT — runes show through the gap between cards
    backgroundColor: 'transparent',
  },
  randomDivider: {
    height: 1,
    marginHorizontal: 0,
    backgroundColor: colors.border,
    opacity: 0.7,
  },
  randomRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  randomText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: typography.body,
  },
  options: {
    gap: spacing.md,
  },
  colorCard: {
    borderRadius: radii.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.lg,
  },
  colorDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 0,
    opacity: 0.8,
  },
  colorRow: {
    minHeight: 54,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  colorLabel: {
    color: colors.mutedText,
    fontSize: typography.body,
    fontWeight: '700',
  },
  colorButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  colorButton: {
    width: 54,
    height: 54,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  colorButtonSelected: {
    borderColor: '#4f682d',
    borderWidth: 3.2,
    shadowColor: '#4f682d',
    shadowOpacity: 0.35,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  whiteButton: {
    backgroundColor: '#f1f1f1',
    borderColor: '#8c8c8c',
  },
  randomButton: {
    borderColor: '#8c8c8c',
    backgroundColor: '#2e2e2e',
  },
  blackButton: {
    backgroundColor: '#080808',
    borderColor: '#2b2b2b',
  },
  randomSplitWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  randomHalfLight: {
    flex: 1,
    backgroundColor: '#f3f3f3',
  },
  randomHalfDark: {
    flex: 1,
    backgroundColor: '#111',
  },
  randomQuestion: {
    color: '#1f1f1f',
    fontSize: 34,
    fontWeight: '900',
    textShadowColor: 'rgba(255,255,255,0.3)',
    textShadowRadius: 1,
  },
  toast: {
    color: colors.warning,
    textAlign: 'center',
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  play: {
    minHeight: 56,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  playText: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    position: 'relative',
  },
  modalBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: typography.body,
    marginBottom: 2,
  },
  modalClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: colors.text,
    fontWeight: '900',
    fontSize: typography.small,
  },
  modalOption: {
    minHeight: 44,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: '#2f3927',
  },
  modalOptionText: {
    color: colors.text,
    fontWeight: '800',
  },
});