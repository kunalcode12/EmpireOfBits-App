import { useEffect, useState } from 'react';
import { useGame } from '../store/GameContext';
import type { ColorPreference, TimeControl } from '../websockets/gameSocket';

export const useMatchmaking = (timeControl: TimeControl | null, colorPreference: ColorPreference | null) => {
  const game = useGame();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (game.phase !== 'matchmaking') {
      setElapsed(0);
      return undefined;
    }
    const id = setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => clearInterval(id);
  }, [game.phase]);

  const retry = async () => {
    if (timeControl && colorPreference) {
      setElapsed(0);
      await game.startMatchmaking(timeControl, colorPreference);
    }
  };

  return {
    elapsed,
    searching: game.phase === 'matchmaking',
    message: game.toast,
    retry,
    cancel: game.cancelMatchmaking,
  };
};
