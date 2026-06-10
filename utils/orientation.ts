import * as ScreenOrientation from 'expo-screen-orientation';

// Small helpers so every Arena screen flips to landscape consistently and we
// only return to portrait when leaving the Arena flow entirely.

export const lockLandscape = () =>
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});

export const lockPortrait = () =>
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
