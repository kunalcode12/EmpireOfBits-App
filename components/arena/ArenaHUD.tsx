import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getArenaItemImage } from '../../lib/arenaItemImages';
import { WEAPON_NAME, WEAPON_TO_GUN_ID } from '../../lib/arenaShop';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface ArenaHUDProps {
  selfHp: number;
  selfMaxHp: number;
  opponentHp: number;
  opponentMaxHp: number;
  timeMs: number;
  weapon: string;
  ammo: number;
  selfShield: number;
  selfKills: number;
  opponentKills: number;
}

const WEAPON_ICON: Record<string, string> = {
  blaster: 'flash',
  shotgun: 'pistol',
  rocket: 'rocket-launch',
  smg: 'pistol',
  scatter: 'ammunition',
  laser: 'flash-outline',
  rail: 'crosshairs',
};

const WEAPON_COLOR: Record<string, string> = {
  blaster: '#FFE600',
  shotgun: '#f97316',
  rocket: '#ef4444',
  smg: '#FFE600',
  scatter: '#f97316',
  laser: '#19f0ff',
  rail: '#c084fc',
};

function hpColor(ratio: number): string {
  if (ratio > 0.6) return '#22c55e';
  if (ratio > 0.3) return '#f59e0b';
  return '#ef4444';
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ArenaHUD({
  selfHp,
  selfMaxHp,
  opponentHp,
  opponentMaxHp,
  timeMs,
  weapon,
  ammo,
  selfShield,
  selfKills,
  opponentKills,
}: ArenaHUDProps) {
  const selfRatio = selfHp / selfMaxHp;
  const oppRatio = opponentHp / opponentMaxHp;

  const gunId = WEAPON_TO_GUN_ID[weapon];
  const gunImg = gunId ? getArenaItemImage(gunId) : undefined;
  const wColor = WEAPON_COLOR[weapon] ?? '#FFE600';
  const wName = WEAPON_NAME[weapon] ?? weapon.toUpperCase();

  return (
    <View style={styles.container}>
      {/* Self HP */}
      <View style={styles.hpSection}>
        <Text style={[styles.hpLabel, { color: '#19f0ff' }]}>YOU</Text>
        <View style={styles.hpBarBg}>
          <View style={[styles.hpBarFill, { width: `${selfRatio * 100}%`, backgroundColor: hpColor(selfRatio) }]} />
          <Text style={styles.hpText}>{Math.round(selfHp)}</Text>
        </View>
        <View style={styles.subRow}>
          {selfShield > 0 && (
            <View style={styles.shieldChip}>
              <MaterialCommunityIcons name="shield" size={9} color="#5aa9ff" />
              <Text style={styles.shieldText}>{Math.round(selfShield)}</Text>
            </View>
          )}
          <Text style={styles.killText}>KILLS {selfKills}</Text>
        </View>
      </View>

      {/* Center: timer + weapon */}
      <View style={styles.centerSection}>
        <Text style={styles.timer}>{formatTime(timeMs)}</Text>
        <View style={[styles.weaponChip, { borderColor: wColor }]}>
          {gunImg ? (
            <Image source={gunImg} style={styles.weaponArt} contentFit="contain" />
          ) : (
            <MaterialCommunityIcons name={(WEAPON_ICON[weapon] ?? 'flash') as IconName} size={15} color={wColor} />
          )}
          <Text style={[styles.weaponName, { color: wColor }]} numberOfLines={1}>{wName}</Text>
          <Text style={styles.weaponAmmo}>{ammo < 0 ? '∞' : ammo}</Text>
        </View>
      </View>

      {/* Opponent HP */}
      <View style={styles.hpSection}>
        <Text style={[styles.hpLabel, { color: '#ff2d78' }]}>OPP</Text>
        <View style={styles.hpBarBg}>
          <View style={[styles.hpBarFill, { width: `${oppRatio * 100}%`, backgroundColor: hpColor(oppRatio) }]} />
          <Text style={styles.hpText}>{Math.round(opponentHp)}</Text>
        </View>
        <View style={styles.subRow}>
          <Text style={styles.killText}>KILLS {opponentKills}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(8,6,4,0.72)',
  },
  hpSection: {
    flex: 1,
    alignItems: 'center',
  },
  hpLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  hpBarBg: {
    width: '100%',
    height: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  hpBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  hpText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  shieldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  shieldText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#5aa9ff',
  },
  killText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#b3a594',
    letterSpacing: 0.5,
  },
  centerSection: {
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 3,
  },
  timer: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ecb53f',
  },
  weaponChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: 150,
  },
  weaponArt: {
    width: 22,
    height: 16,
  },
  weaponName: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  weaponAmmo: {
    fontSize: 10,
    fontWeight: '900',
    color: '#f4ecd9',
  },
});
