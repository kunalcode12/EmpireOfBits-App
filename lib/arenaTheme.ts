// Shared palette for the Arena shop / lobby. A warm "ember & teal armory" look
// — deliberately away from the generic cyan/magenta neon. Warm charcoal base,
// ember-orange primary, teal secondary, brass for credits, bone text.

export const ARENA = {
  bg: '#15110c',
  bgDeep: '#0b0805',
  panel: 'rgba(33,27,19,0.82)',
  panelSolid: '#221b13',
  panelAlt: 'rgba(45,212,191,0.06)',
  line: 'rgba(243,234,214,0.12)',
  ink: '#f4ecd9',
  dim: '#9c8f78',
  ember: '#ff7a33',
  emberDeep: '#e8541b',
  teal: '#2dd4bf',
  tealDeep: '#0f9e8c',
  brass: '#ecb53f',
  rose: '#ff5d7a',
  danger: '#ef5350',
  dark: '#120c06', // text/icon on bright (ember/brass/teal) buttons
} as const;
