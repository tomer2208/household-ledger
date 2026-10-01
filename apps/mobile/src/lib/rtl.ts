import { Platform } from 'react-native';

import { isRTL } from './i18n';

// P1-6: layout follows the language through start/end styles (marginStart, paddingEnd, …),
// which react-native-web and native flip by themselves. These cover what doesn't flip.
// Read at render time, never at module load: the language is set by the root layout.

// The web reads textAlign 'left'/'right' literally; native RTL already swaps them.
const webRtl = () => Platform.OS === 'web' && isRTL();
export const textStart = () => (webRtl() ? 'right' : 'left');
export const textEnd = () => (webRtl() ? 'left' : 'right');

// "Go deeper" arrows point the way the text reads (web; a native RTL build is untested).
export const forwardIcon = () => (webRtl() ? 'chevron.left' : 'chevron.right');
export const backIcon = () => (webRtl() ? 'chevron.right' : 'chevron.left');

// Transforms are physical on every platform: a swipe toward the end of the row is
// negative x in English and positive x in Hebrew.
export const towardEnd = (x: number) => (isRTL() ? -x : x);

// Pins a subtree to one direction: the web reads the `dir` attribute, native the style.
export const dirProps = (d: 'ltr' | 'rtl') => (Platform.OS === 'web' ? { dir: d } : { style: { direction: d } }) as object;

// A text line in the app's own direction, whatever script it starts with (web: react-native-web
// otherwise guesses from the first letter). For lines that mix names with UI words.
export const appDirText = () => (Platform.OS === 'web' ? ({ dir: isRTL() ? 'rtl' : 'ltr' } as object) : {});
