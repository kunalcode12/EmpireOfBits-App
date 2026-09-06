import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { TXTR } from '../../../lib/txtr/constants';
import type { Achievement } from '../../../lib/txtr/content';
import { formatNum } from '../../../lib/txtr/format';
import OutlinedText from '../OutlinedText';
import { BigButton, CartoonPanel, GhostButton, HardShadow, Row, ScreenScrim } from './Panel';

export interface GameOverData {
  score: number;
  newBest: boolean;
  coins: number;
  nearMisses: number;
  bestMult: number;
  topMph: number;
  distance: number;
  unlocked: Achievement[];
  /** Whether the coins have been credited to the backend points balance yet. */
  awardState: 'pending' | 'banked' | 'failed';
}

interface GameOverOverlayProps {
  data: GameOverData;
  /** Cost shown on the retry button — a new run is a new entry fee. */
  retryCost: number;
  landscape: boolean;
  insets: { top: number; bottom: number };
  fontFamily?: string;
  onRetry: () => void;
  onExit: () => void;
}

function SummaryItem({
  label,
  value,
  wide,
  landscape,
  fontFamily,
}: {
  label: string;
  value: string;
  wide?: boolean;
  landscape?: boolean;
  fontFamily?: string;
}) {
  return (
    <View style={[styles.sitem, landscape && styles.sitemLand, wide && styles.sitemWide]}>
      <Text style={styles.sitemLabel} allowFontScaling={false}>
        {label}
      </Text>
      <Text
        style={[styles.sitemValue, fontFamily ? { fontFamily } : null]}
        allowFontScaling={false}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export default function GameOverOverlay({
  data,
  retryCost,
  landscape,
  insets,
  fontFamily,
  onRetry,
  onExit,
}: GameOverOverlayProps) {
  const ff = fontFamily ? { fontFamily } : null;
  return (
    <ScreenScrim insets={insets}>
      <CartoonPanel landscape={landscape}>
        <OutlinedText
          color={TXTR.red}
          outline={3}
          containerStyle={styles.center}
          style={[styles.title, landscape && styles.titleLand, ff]}
        >
          {data.newBest ? 'NEW BEST!' : 'WRECKED'}
        </OutlinedText>

        <Text style={[styles.score, landscape && styles.scoreLand, ff]} allowFontScaling={false}>
          {formatNum(data.score)}
        </Text>
        {data.newBest && (
          <View style={styles.newBestWrap}>
            <HardShadow depth={4} radius={999}>
              <View style={styles.newBest}>
                <Text style={styles.newBestText} allowFontScaling={false}>
                  NEW BEST
                </Text>
              </View>
            </HardShadow>
          </View>
        )}

        {/* what the run actually paid out */}
        <View style={styles.payoutWrap}>
          <HardShadow depth={4} radius={14}>
            <View
              style={[
                styles.payout,
                data.awardState === 'failed' && styles.payoutFailed,
                data.coins === 0 && styles.payoutEmpty,
              ]}
            >
              <Text style={styles.payoutLabel} allowFontScaling={false}>
                {data.awardState === 'failed'
                  ? 'COULD NOT BANK — WILL RETRY'
                  : data.awardState === 'pending'
                    ? 'BANKING POINTS…'
                    : data.coins === 0
                      ? 'NO COINS COLLECTED'
                      : 'POINTS EARNED'}
              </Text>
              <View style={styles.payoutValueRow}>
                {data.awardState === 'pending' && (
                  <ActivityIndicator size="small" color={TXTR.ink} />
                )}
                <Text style={[styles.payoutValue, ff]} allowFontScaling={false}>
                  +{formatNum(data.coins)}
                </Text>
              </View>
            </View>
          </HardShadow>
        </View>

        <View style={styles.summary}>
          <SummaryItem label="🪙 Coins" value={formatNum(data.coins)} landscape={landscape} fontFamily={fontFamily} />
          <SummaryItem label="Near misses" value={String(data.nearMisses)} landscape={landscape} fontFamily={fontFamily} />
          <SummaryItem
            label="Best combo"
            value={`x${data.bestMult.toFixed(1)}`}
            landscape={landscape}
            fontFamily={fontFamily}
          />
          <SummaryItem
            label="Top speed"
            value={`${Math.round(data.topMph)} mph`}
            landscape={landscape}
            fontFamily={fontFamily}
          />
          <SummaryItem
            label="Distance"
            value={`${formatNum(Math.round(data.distance))} m`}
            wide
            landscape={landscape}
            fontFamily={fontFamily}
          />
        </View>

        {data.unlocked.length > 0 && (
          <HardShadow depth={4} radius={16} style={styles.unlocksWrap}>
            <View style={styles.unlocks}>
              <Text style={styles.unlockTitle} allowFontScaling={false}>
                UNLOCKED
              </Text>
              {data.unlocked.map((a) => (
                <Text key={a.id} style={styles.unlock} allowFontScaling={false}>
                  🏆 {a.name}
                </Text>
              ))}
            </View>
          </HardShadow>
        )}

        <BigButton
          label={`RETRY · ${formatNum(retryCost)}`}
          onPress={onRetry}
          color={TXTR.red}
          fontFamily={fontFamily}
        />
        <Row>
          <GhostButton label="← Arcade" onPress={onExit} fontFamily={fontFamily} />
        </Row>
      </CartoonPanel>
    </ScreenScrim>
  );
}

const styles = StyleSheet.create({
  center: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '900',
    textAlign: 'center',
  },
  titleLand: {
    fontSize: 28,
    lineHeight: 34,
  },
  score: {
    fontSize: 46,
    lineHeight: 52,
    fontWeight: '900',
    color: TXTR.ink,
    textAlign: 'center',
    marginTop: 6,
  },
  scoreLand: {
    fontSize: 36,
    lineHeight: 42,
    marginTop: 2,
  },
  newBestWrap: {
    alignSelf: 'center',
    marginTop: 6,
  },
  newBest: {
    backgroundColor: TXTR.yellow,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 14,
  },
  newBestText: {
    fontSize: 12,
    fontWeight: '900',
    color: TXTR.ink,
  },
  payoutWrap: {
    marginTop: 12,
  },
  payout: {
    backgroundColor: TXTR.yellow,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  payoutFailed: {
    backgroundColor: '#ffd9dd',
  },
  payoutEmpty: {
    backgroundColor: '#e9edf3',
  },
  payoutLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: TXTR.ink,
  },
  payoutValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payoutValue: {
    fontSize: 22,
    fontWeight: '900',
    color: TXTR.ink,
  },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    marginBottom: 14,
  },
  sitem: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: TXTR.paper2,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  sitemLand: {
    flexBasis: '22%',
  },
  sitemWide: {
    flexBasis: '100%',
  },
  sitemLabel: {
    fontSize: 11.5,
    color: '#777777',
    fontWeight: '700',
  },
  sitemValue: {
    fontSize: 20,
    fontWeight: '900',
    color: TXTR.ink,
  },
  unlocksWrap: {
    marginBottom: 14,
  },
  unlocks: {
    backgroundColor: TXTR.yellow,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 16,
    padding: 12,
  },
  unlockTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: TXTR.ink,
    marginBottom: 6,
  },
  unlock: {
    fontSize: 14,
    fontWeight: '700',
    color: TXTR.ink,
  },
});
