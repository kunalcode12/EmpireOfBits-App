import { io } from 'socket.io-client';

type IsoTimestamp = string;

export type SessionStartedEvent = {
  sessionId: string;
  timestamp?: IsoTimestamp;
};

export type CountdownEvent = {
  sessionId: string;
  secondsRemaining: number;
  phase: string;
  timestamp: IsoTimestamp;
};

export type ArenaToggledEvent = {
  sessionId: string;
  arenaActive: boolean;
  timestamp?: IsoTimestamp;
};

export type BoostActivatedEvent = {
  type: 'boost_activated';
  sessionId: string;
  actorId: string;
  actorName: string;
  username: string;
  amount: number;
  totalPoints: number;
  timestamp: IsoTimestamp;
};

export type ImmediateItemDropEvent = {
  type: 'immediate_item_drop';
  sessionId: string;
  itemId: string;
  itemName: string;
  targetActorId: string;
  targetActorName: string;
  purchaserUsername: string;
  cost: number;
  inputMode: string;
  content: string | null;
  timestamp: IsoTimestamp;
};

export type EventTriggeredEvent = {
  sessionId: string;
  eventId: string;
  name: string;
  targetActorId?: string;
  targetActorName?: string;
  isFinal: boolean;
  triggeredBy: string;
  timestamp: IsoTimestamp;
};

export type SessionEndedReason = 'time_expired' | 'final_event' | 'manual_stop' | 'cancelled';

export type SessionEndedEvent = {
  sessionId: string;
  reason: SessionEndedReason;
  winnerActorId?: string;
  winnerActorName?: string;
  finalScores: Record<string, number>;
  timestamp: IsoTimestamp;
};

export type PackageUnlockedEvent = {
  type: 'package_unlocked';
  sessionId: string;
  packageId: string;
  packageName: string;
  actorId: string;
  actorName: string;
  unlockedAtPoints: number;
  threshold: number;
  timestamp: IsoTimestamp;
};

export type OverlayVariant = {
  id: string;
  name: string;
};

export type OverlayChangedEvent = {
  sessionId: string;
  variantId: string;
  variant: OverlayVariant;
  changedBy: string;
  isLocked: boolean;
  timestamp: IsoTimestamp;
};

export function connectToSession(token: string, sessionId: string) {
  const websocketUrl =
    process.env.EXPO_PUBLIC_WEBSOCKET_URL ?? process.env.NEXT_PUBLIC_WEBSOCKET_URL;

  if (!websocketUrl) {
    throw new Error('Missing EXPO_PUBLIC_WEBSOCKET_URL in environment');
  }

  const socket = io(websocketUrl, {
    transports: ['websocket'],
    auth: { token },
  });

  socket.on('connect', () => {
    socket.emit('join_session', { sessionId });
  });

  socket.on('connect_error', (error: Error) => {
    console.error('WebSocket connect error:', error.message);
  });

  socket.on('disconnect', (reason: string) => {
    console.log('WebSocket disconnected:', reason);
  });

  // Primary events
  socket.on('session_started', (d: SessionStartedEvent) => console.log('Session started:', d.sessionId));
  socket.on('countdown', (d: CountdownEvent) => console.log('Countdown:', d.secondsRemaining, d.phase));
  socket.on('arena_toggled', (d: ArenaToggledEvent) => console.log('Arena:', d.arenaActive));
  socket.on('boost_activated', (d: BoostActivatedEvent) => console.log('Boost:', d.actorName, '+', d.amount, 'points=', d.totalPoints));
  socket.on('immediate_item_drop', (d: ImmediateItemDropEvent) => console.log('Drop:', d.itemName, '->', d.targetActorName, 'by', d.purchaserUsername));
  socket.on('event_triggered', (d: EventTriggeredEvent) => console.log('Event:', d.name, 'target=', d.targetActorName ?? d.targetActorId ?? 'global'));
  socket.on('session_ended', (d: SessionEndedEvent) => console.log('Game over:', d.reason, d.winnerActorName, d.finalScores));
  socket.on('package_unlocked', (d: PackageUnlockedEvent) => console.log('Unlocked:', d.packageName, 'for', d.actorName, '@', d.threshold));
  socket.on('overlay_changed', (d: OverlayChangedEvent) => console.log('Overlay:', d.variant.name, 'locked=', d.isLocked));

  // Legacy aliases
  socket.on('game_start', (d: SessionStartedEvent) => console.log('Session started (legacy):', d.sessionId));
  socket.on('game_completed', (d: SessionEndedEvent) => console.log('Game over (legacy):', d.reason, d.finalScores));
  socket.on('countdown_update', (d: CountdownEvent) => console.log('Countdown (legacy):', d.secondsRemaining, d.phase));
  socket.on('player_boost_activated', (d: BoostActivatedEvent) => console.log('Boost (legacy):', d.actorName, '+', d.amount));
  socket.on('package_drop', (d: ImmediateItemDropEvent) => console.log('Drop (legacy):', d.itemName, '->', d.targetActorName));

  return socket;
}