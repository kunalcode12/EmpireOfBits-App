// Privy / crypto polyfills — must load before Expo Router entry.
import 'fast-text-encoding';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

global.Buffer = Buffer;

import '@ethersproject/shims';
import 'expo-router/entry';
