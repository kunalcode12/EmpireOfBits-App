import { useEffect, useMemo, useState } from 'react';
import type { Color } from '../utils/chessHelpers';

export const formatClock = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const useTimer = (initialSeconds: number, active: boolean, onExpire?: () => void) => {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => setSeconds(initialSeconds), [initialSeconds]);

  useEffect(() => {
    if (!active || seconds <= 0) return undefined;
    const id = setInterval(() => {
      setSeconds((current) => {
        const next = Math.max(0, current - 1);
        if (next === 0) onExpire?.();
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [active, onExpire, seconds]);

  return useMemo(() => ({ seconds, label: formatClock(seconds), warning: seconds <= 10 }), [seconds]);
};

export const useClockLabels = (timers: { white: number; black: number }, playerColor: Color | null) => {
  const own = playerColor === 'b' ? timers.black : timers.white;
  const opponent = playerColor === 'b' ? timers.white : timers.black;
  return {
    own: formatClock(own),
    opponent: formatClock(opponent),
    ownWarning: own <= 10,
    opponentWarning: opponent <= 10,
  };
};
