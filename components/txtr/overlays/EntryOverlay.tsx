import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { TXTR } from '../../../lib/txtr/constants';
import { formatNum } from '../../../lib/txtr/format';
import OutlinedText from '../OutlinedText';
import { BigButton, CartoonPanel, GhostButton, Row, ScreenScrim } from './Panel';

// ─── Entry / retry gate ──────────────────────────────────────────────────────
// A run costs points. This is the in-game till: it shows the fee against the
// live backend balance, charges on confirm, and turns into an "out of points"
// notice (with a way back to the arcade, where points can be bought) when the
// balance will not cover it.

interface EntryOverlayProps {
  cost: number;
  /** Live backend balance; null while it is still being fetched. */
  balance: number | null;
  loading: boolean;
  charging: boolean;
  error: string | null;
  /** Copy tweak: a retry reads differently from a first run. */
  retry: boolean;
  landscape: boolean;
  insets: { top: number; bottom: number };
  fontFamily?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onExit: () => void;
}

export default function EntryOverlay({
  cost,
  balance,
  loading,
  charging,
  error,
  retry,
  landscape,
  insets,
  fontFamily,
  onConfirm,
  onCancel,
  onExit,
}: EntryOverlayProps) {
  const ff = fontFamily ? { fontFamily } : null;
  const known = balance !== null;
  const short = known && balance < cost;
  const after = known ? Math.max(0, balance - cost) : null;

  return (
    <ScreenScrim insets={insets}>
      <CartoonPanel small landscape={landscape} scroll={false}>
        <OutlinedText
          color={short ? TXTR.red : TXTR.yellow}
          outline={3}
          containerStyle={styles.center}
          style={[styles.title, ff]}
        >
          {short ? 'OUT OF POINTS' : retry ? 'RUN IT BACK?' : 'START A RUN?'}
        </OutlinedText>

        <View style={styles.ticket}>
          <View style={styles.ticketRow}>
            <Text style={styles.ticketLabel} allowFontScaling={false}>
              Entry fee
            </Text>
            <Text style={[styles.ticketValue, styles.ticketCost, ff]} allowFontScaling={false}>
              −{formatNum(cost)}
            </Text>
          </View>
          <View style={styles.dashes} />
          <View style={styles.ticketRow}>
            <Text style={styles.ticketLabel} allowFontScaling={false}>
              Your points
            </Text>
            {loading && !known ? (
              <ActivityIndicator size="small" color={TXTR.ink} />
            ) : (
              <Text style={[styles.ticketValue, ff]} allowFontScaling={false}>
                {known ? formatNum(balance) : '—'}
              </Text>
            )}
          </View>
          {!short && (
            <View style={styles.ticketRow}>
              <Text style={styles.ticketLabel} allowFontScaling={false}>
                After
              </Text>
              <Text style={[styles.ticketValue, styles.ticketAfter, ff]} allowFontScaling={false}>
                {after === null ? '—' : formatNum(after)}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.note, short && styles.noteBad]} allowFontScaling={false}>
          {error
            ? error
            : short
              ? `You need ${formatNum(cost - (balance ?? 0))} more. Buy points back in the arcade.`
              : 'Coins you collect are paid back as points when the run ends.'}
        </Text>

        {short ? (
          <>
            <BigButton
              label="GO TO ARCADE"
              onPress={onExit}
              color={TXTR.red}
              fontFamily={fontFamily}
            />
            <Row>
              <GhostButton label="Close" onPress={onCancel} fontFamily={fontFamily} />
            </Row>
          </>
        ) : (
          <>
            <BigButton
              label={charging ? 'CHARGING…' : `PLAY · ${formatNum(cost)}`}
              onPress={onConfirm}
              color={TXTR.red}
              fontFamily={fontFamily}
              disabled={charging || loading || !known}
            />
            <Row>
              <GhostButton
                label="Cancel"
                onPress={onCancel}
                fontFamily={fontFamily}
                disabled={charging}
              />
              <GhostButton
                label="Arcade"
                onPress={onExit}
                fontFamily={fontFamily}
                disabled={charging}
              />
            </Row>
          </>
        )}
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
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    textAlign: 'center',
  },
  ticket: {
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: TXTR.paper2,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#777777',
  },
  ticketValue: {
    fontSize: 19,
    fontWeight: '900',
    color: TXTR.ink,
  },
  ticketCost: {
    color: TXTR.red,
  },
  ticketAfter: {
    color: TXTR.greenDark,
  },
  dashes: {
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderBottomColor: 'rgba(27,27,43,0.2)',
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: '#777777',
    textAlign: 'center',
    marginBottom: 12,
  },
  noteBad: {
    color: TXTR.redDark,
  },
});
