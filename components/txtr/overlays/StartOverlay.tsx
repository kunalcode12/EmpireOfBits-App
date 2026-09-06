import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TXTR } from '../../../lib/txtr/constants';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from '../../../lib/txtr/content';
import { formatNum } from '../../../lib/txtr/format';
import type { TxtrProfile } from '../../../lib/txtr/profile';
import OutlinedText from '../OutlinedText';
import {
  BackButton,
  BigButton,
  CartoonPanel,
  GhostButton,
  ModeButton,
  Row,
  ScreenScrim,
} from './Panel';

interface StartOverlayProps {
  profile: TxtrProfile;
  /** Live backend points balance — the game's only currency. */
  points: number | null;
  /** Entry fee shown on the play button when a new run has to be paid for. */
  cost: number;
  /** True while the current entry fee is still unspent. */
  paid: boolean;
  daily: boolean;
  landscape: boolean;
  insets: { top: number; bottom: number };
  fontFamily?: string;
  onPlay: () => void;
  onGarage: () => void;
  onTrophies: () => void;
  onToggleDaily: () => void;
  onSelectDifficulty: (id: DifficultyId) => void;
  onExit: () => void;
}

export default function StartOverlay({
  profile,
  points,
  cost,
  paid,
  daily,
  landscape,
  insets,
  fontFamily,
  onPlay,
  onGarage,
  onTrophies,
  onToggleDaily,
  onSelectDifficulty,
  onExit,
}: StartOverlayProps) {
  const difficulty = DIFFICULTIES[profile.difficulty];
  const ff = fontFamily ? { fontFamily } : null;

  const branding = (
    <>
      <OutlinedText
        color={TXTR.red}
        outline={4}
        dropShadow={10}
        containerStyle={styles.center}
        style={[styles.logo, landscape && styles.logoLand, ff]}
      >
        Txtr
      </OutlinedText>
      <Text style={[styles.tagline, landscape && styles.taglineLand, ff]} allowFontScaling={false}>
        Texting &amp; driving. What could possibly go wrong?
      </Text>
      <View style={styles.foot}>
        <Text style={[styles.footText, ff]} allowFontScaling={false}>
          Best <Text style={styles.footValue}>{formatNum(profile.best)}</Text>
        </Text>
        <Text style={[styles.footText, ff]} allowFontScaling={false}>
          ◈ <Text style={styles.footValue}>{points === null ? '—' : formatNum(points)}</Text>
        </Text>
      </View>
    </>
  );

  const controls = (
    <>
      <View style={styles.modes}>
        {DIFFICULTY_ORDER.map((id) => (
          <ModeButton
            key={id}
            label={DIFFICULTIES[id].name}
            active={profile.difficulty === id}
            onPress={() => onSelectDifficulty(id)}
            fontFamily={fontFamily}
          />
        ))}
      </View>
      <Text style={styles.modeDesc} allowFontScaling={false}>
        {difficulty.label}
      </Text>

      <BigButton
        label={paid ? 'PLAY' : `PLAY · ${formatNum(cost)}`}
        onPress={onPlay}
        color={TXTR.red}
        fontFamily={fontFamily}
      />
      <Text style={styles.feeNote} allowFontScaling={false}>
        {paid
          ? 'Entry paid — coins you collect are paid back as points'
          : `${formatNum(cost)} points per run · coins come back as points`}
      </Text>

      <Row>
        <GhostButton label="🚗 Garage" onPress={onGarage} fontFamily={fontFamily} />
        <GhostButton label="🏆 Trophies" onPress={onTrophies} fontFamily={fontFamily} />
        <GhostButton
          label="📅 Daily"
          trailing={daily ? 'ON' : 'OFF'}
          active={daily}
          onPress={onToggleDaily}
          fontFamily={fontFamily}
        />
      </Row>

      <Text style={styles.hint} allowFontScaling={false}>
        <Text style={styles.hintB}>◀ ▶</Text> steer (or swipe) · hold{' '}
        <Text style={styles.hintB}>GAS</Text> to outrun the pack,{' '}
        <Text style={styles.hintB}>BRAKE</Text> to thread traffic · the faster you go, the sooner it
        arrives
      </Text>
    </>
  );

  return (
    <ScreenScrim insets={insets}>
      <CartoonPanel landscape={landscape}>
        <View style={styles.head}>
          <BackButton onPress={onExit} />
          <Text style={styles.headLabel} allowFontScaling={false}>
            ARCADE
          </Text>
        </View>

        {landscape ? (
          <View style={styles.cols}>
            <View style={styles.colLeft}>{branding}</View>
            <View style={styles.colRight}>{controls}</View>
          </View>
        ) : (
          <>
            {branding}
            <View style={styles.spacer} />
            {controls}
          </>
        )}
      </CartoonPanel>
    </ScreenScrim>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  headLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: TXTR.grey,
  },
  cols: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
  },
  colLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  colRight: {
    // The action column carries the widest content (a three-button row), so it
    // takes the larger share of the panel.
    flex: 1.35,
  },
  spacer: {
    height: 4,
  },
  center: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  logo: {
    fontSize: 60,
    lineHeight: 66,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
  },
  logoLand: {
    fontSize: 52,
    lineHeight: 58,
  },
  tagline: {
    marginTop: 14,
    marginBottom: 18,
    fontSize: 15,
    fontWeight: '600',
    color: '#555555',
    textAlign: 'center',
  },
  taglineLand: {
    marginTop: 10,
    marginBottom: 12,
    fontSize: 13.5,
  },
  modes: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  modeDesc: {
    fontSize: 12,
    color: '#777777',
    textAlign: 'center',
    marginBottom: 14,
    fontWeight: '600',
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 22,
  },
  footText: {
    fontSize: 15,
    fontWeight: '700',
    color: TXTR.ink,
  },
  footValue: {
    color: TXTR.red,
    fontWeight: '900',
  },
  feeNote: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#888888',
    textAlign: 'center',
  },
  hint: {
    marginTop: 14,
    fontSize: 11.5,
    lineHeight: 18,
    color: '#777777',
    textAlign: 'center',
    fontWeight: '600',
  },
  hintB: {
    color: TXTR.ink,
    fontWeight: '900',
  },
});
