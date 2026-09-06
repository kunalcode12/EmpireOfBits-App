import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LEADERBOARD_SHOWN, TXTR } from '../../../lib/txtr/constants';
import { ACHIEVEMENTS, CARS, DIFFICULTIES } from '../../../lib/txtr/content';
import { formatNum } from '../../../lib/txtr/format';
import type { TxtrProfile } from '../../../lib/txtr/profile';
import { BackButton, CartoonPanel, PanelTitle, ScreenScrim } from './Panel';

interface TrophiesOverlayProps {
  profile: TxtrProfile;
  points: number | null;
  landscape: boolean;
  insets: { top: number; bottom: number };
  fontFamily?: string;
  onBack: () => void;
}

export default function TrophiesOverlay({
  profile,
  points,
  landscape,
  insets,
  fontFamily,
  onBack,
}: TrophiesOverlayProps) {
  const ff = fontFamily ? { fontFamily } : null;
  const board = [...profile.leaderboard].sort((a, b) => b.s - a.s).slice(0, LEADERBOARD_SHOWN);
  const s = profile.stats;
  const rows: [string, string][] = [
    ['Total runs', String(s.runs)],
    ['Best score', formatNum(profile.best)],
    ['Points balance', points === null ? '—' : formatNum(points)],
    ['Lifetime coins', formatNum(s.totalCoins)],
    ['Top speed', `${Math.round(s.topMph)} mph`],
    ['Best multiplier', `x${(s.bestMult || 1).toFixed(1)}`],
    ['Longest drive', `${formatNum(Math.round(s.bestDistance))} m`],
    ['Cars owned', `${profile.ownedCars.length} / ${CARS.length}`],
  ];

  const leaderboard = (
    <View style={landscape ? styles.col : null}>
      <Text style={[styles.section, ff]} allowFontScaling={false}>
        Leaderboard
      </Text>
      {board.length === 0 ? (
        <View style={[styles.lbRow, styles.lbEmpty]}>
          <Text style={styles.lbEmptyText} allowFontScaling={false}>
            No runs yet — go drive!
          </Text>
        </View>
      ) : (
        board.map((entry, i) => (
          <View key={`${entry.t}-${i}`} style={styles.lbRow}>
            <View style={styles.rank}>
              <Text style={styles.rankText} allowFontScaling={false}>
                {i + 1}
              </Text>
            </View>
            <Text style={[styles.lbScore, ff]} allowFontScaling={false}>
              {formatNum(entry.s)}
            </Text>
            <Text style={styles.lbMeta} allowFontScaling={false}>
              {entry.d === 1 ? 'Daily · ' : ''}
              {DIFFICULTIES[entry.m]?.name ?? entry.m}
            </Text>
          </View>
        ))
      )}
    </View>
  );

  const achievements = (
    <View style={landscape ? styles.col : null}>
      <Text style={[styles.section, ff]} allowFontScaling={false}>
        Achievements
      </Text>
      {ACHIEVEMENTS.map((a) => {
        const got = profile.achievements.includes(a.id);
        return (
          <View key={a.id} style={[styles.ach, got && styles.achGot]}>
            <Text style={styles.achIcon} allowFontScaling={false}>
              {got ? '🏆' : '🔒'}
            </Text>
            <View style={styles.achBody}>
              <Text style={[styles.achName, ff]} allowFontScaling={false}>
                {a.name}
              </Text>
              <Text style={styles.achDesc} allowFontScaling={false}>
                {a.desc}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  const stats = (
    <View style={landscape ? styles.col : null}>
      <Text style={[styles.section, ff]} allowFontScaling={false}>
        Lifetime Stats
      </Text>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.statRow}>
          <Text style={styles.statKey} allowFontScaling={false}>
            {k}
          </Text>
          <Text style={[styles.statValue, ff]} allowFontScaling={false}>
            {v}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <ScreenScrim insets={insets}>
      <CartoonPanel wide landscape={landscape}>
        <View style={styles.head}>
          <BackButton onPress={onBack} />
          <PanelTitle fontFamily={fontFamily} style={styles.headTitle}>
            Trophies
          </PanelTitle>
        </View>

        {landscape ? (
          // The web build's three-column trophy layout, which only collapsed on
          // narrow screens — landscape finally has room for it again.
          <View style={styles.cols}>
            {leaderboard}
            {achievements}
            {stats}
          </View>
        ) : (
          <>
            {leaderboard}
            {achievements}
            {stats}
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
    gap: 12,
    marginBottom: 12,
  },
  headTitle: {
    flex: 1,
    marginBottom: 0,
    textAlign: 'left',
  },
  cols: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  col: {
    flex: 1,
  },
  section: {
    fontSize: 17,
    fontWeight: '900',
    color: TXTR.ink,
    marginTop: 10,
    marginBottom: 10,
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TXTR.paper2,
    borderWidth: 2.5,
    borderColor: TXTR.ink,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 7,
  },
  lbEmpty: {
    justifyContent: 'center',
  },
  lbEmptyText: {
    color: '#888888',
    fontWeight: '700',
    fontSize: 13,
  },
  rank: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TXTR.yellow,
    borderWidth: 2,
    borderColor: TXTR.ink,
    borderRadius: 6,
  },
  rankText: {
    fontSize: 11,
    fontWeight: '900',
    color: TXTR.ink,
  },
  lbScore: {
    fontSize: 16,
    fontWeight: '900',
    color: TXTR.ink,
  },
  lbMeta: {
    marginLeft: 'auto',
    fontSize: 11.5,
    color: '#888888',
    fontWeight: '700',
  },
  ach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: TXTR.paper2,
    borderWidth: 2.5,
    borderColor: TXTR.ink,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    opacity: 0.55,
  },
  achGot: {
    opacity: 1,
    backgroundColor: '#fffbe6',
  },
  achIcon: {
    fontSize: 20,
  },
  achBody: {
    flex: 1,
  },
  achName: {
    fontSize: 14,
    fontWeight: '900',
    color: TXTR.ink,
  },
  achDesc: {
    fontSize: 11.5,
    color: '#777777',
    fontWeight: '600',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderBottomColor: 'rgba(27,27,43,0.15)',
  },
  statKey: {
    color: '#666666',
    fontSize: 13,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
    color: TXTR.ink,
  },
});
