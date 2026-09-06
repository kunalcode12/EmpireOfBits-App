// ─── Txtr — audio façade ─────────────────────────────────────────────────────
// The web build (extraFiles/js/audio.js) synthesised everything with WebAudio:
// a living engine drone plus punchy arcade SFX. React Native has no WebAudio and
// this project ships no audio package, so every cue is mapped to expo-haptics
// instead and the drone is simply absent.
//
// The method names mirror the web AudioManager (minus its typing cues, which
// this port has no use for) so that when a real audio layer is added later, only
// the bodies here change.

import * as Haptics from 'expo-haptics';

import type { SfxCue } from './engine';

const MIN_GAP_MS = 32; // guards against haptic spam during coin chains

class TxtrAudio {
  private muted = false;
  private lastAny = 0;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Web build resumed the AudioContext here; kept so call sites are unchanged. */
  async arm(): Promise<void> {
    /* no audio context to resume */
  }

  /** Engine drone — no procedural audio available; kept for API parity. */
  updateEngine(_speed: number, _active = true): void {
    /* intentionally silent */
  }

  private impact(style: Haptics.ImpactFeedbackStyle): void {
    if (this.muted) return;
    const now = Date.now();
    if (now - this.lastAny < MIN_GAP_MS) return;
    this.lastAny = now;
    Haptics.impactAsync(style).catch(() => {});
  }

  private notify(type: Haptics.NotificationFeedbackType): void {
    if (this.muted) return;
    const now = Date.now();
    if (now - this.lastAny < MIN_GAP_MS) return;
    this.lastAny = now;
    Haptics.notificationAsync(type).catch(() => {});
  }

  /* --- SFX --------------------------------------------------------------- */
  laneShift(): void {
    this.impact(Haptics.ImpactFeedbackStyle.Light);
  }

  coin(): void {
    this.impact(Haptics.ImpactFeedbackStyle.Light);
  }

  combo(_level: number): void {
    this.notify(Haptics.NotificationFeedbackType.Success);
  }

  nearMiss(): void {
    this.impact(Haptics.ImpactFeedbackStyle.Medium);
  }

  powerup(): void {
    this.impact(Haptics.ImpactFeedbackStyle.Light);
  }

  shieldBreak(): void {
    this.impact(Haptics.ImpactFeedbackStyle.Medium);
  }

  achievement(): void {
    this.notify(Haptics.NotificationFeedbackType.Success);
  }

  uiClick(): void {
    this.impact(Haptics.ImpactFeedbackStyle.Light);
  }

  uiBack(): void {
    this.impact(Haptics.ImpactFeedbackStyle.Light);
  }

  purchase(): void {
    this.impact(Haptics.ImpactFeedbackStyle.Light);
  }

  denied(): void {
    this.notify(Haptics.NotificationFeedbackType.Warning);
  }

  crash(): void {
    if (this.muted) return;
    this.lastAny = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }

  /** Dispatcher used when draining engine events. */
  play(cue: SfxCue, level?: number): void {
    switch (cue) {
      case 'laneShift':
        return this.laneShift();
      case 'coin':
        return this.coin();
      case 'combo':
        return this.combo(level ?? 0);
      case 'nearMiss':
        return this.nearMiss();
      case 'powerup':
        return this.powerup();
      case 'shieldBreak':
        return this.shieldBreak();
      case 'achievement':
        return this.achievement();
      case 'uiClick':
        return this.uiClick();
      case 'uiBack':
        return this.uiBack();
      case 'purchase':
        return this.purchase();
      case 'denied':
        return this.denied();
      case 'crash':
        return this.crash();
      default:
        return undefined;
    }
  }
}

export const txtrAudio = new TxtrAudio();
