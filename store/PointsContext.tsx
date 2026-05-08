import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { getUserPoints, updateUserPoints } from '../api/authApi';
import { useAuth } from './AuthContext';

interface PointsContextValue {
  points: number | null;
  pointsLoading: boolean;
  refreshPoints: () => Promise<void>;
  applyPointsDelta: (delta: number) => Promise<number>;
  setPoints: (value: number | null) => void;
}

const PointsContext = createContext<PointsContextValue | null>(null);

export function PointsProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [points, setPointsState] = useState<number | null>(null);
  const [pointsLoading, setPointsLoading] = useState(false);

  const setPoints = useCallback((value: number | null) => {
    setPointsState(value);
  }, []);

  const refreshPoints = useCallback(async () => {
    if (!auth.user) {
      setPointsState(null);
      return;
    }
    setPointsLoading(true);
    try {
      const latest = await getUserPoints();
      setPointsState(latest);
    } catch (err) {
      console.log('Points fetch failed:', err);
    } finally {
      setPointsLoading(false);
    }
  }, [auth.user]);

  const applyPointsDelta = useCallback(async (delta: number) => {
    const response = await updateUserPoints(delta);
    setPointsState(response.points);
    return response.points;
  }, []);

  useEffect(() => {
    void refreshPoints();
  }, [auth.user?.id, refreshPoints]);

  return (
    <PointsContext.Provider
      value={{ points, pointsLoading, refreshPoints, applyPointsDelta, setPoints }}
    >
      {children}
    </PointsContext.Provider>
  );
}

export function usePoints() {
  const ctx = useContext(PointsContext);
  if (!ctx) throw new Error('usePoints must be used within PointsProvider');
  return ctx;
}
