import { MotionConfig } from 'framer-motion';
import ScopaApp from './games/scopa/ScopaApp';
import BriscolaApp from './games/briscola/BriscolaApp';
import { LanguageProvider } from './i18n/LanguageContext';

const game = import.meta.env.VITE_GAME;

/**
 * In desktop-site mode the whole app is CSS-zoomed by --dmode-scale.
 * framer-motion can't see that scale (it's on <body>, not a motion
 * ancestor), so card drag applies a screen-pixel delta to the card's
 * zoomed local space and the card moves ~scale× too fast. framer-
 * motion's transformPagePoint hook lets us pre-divide the pointer
 * coordinates by the live scale so drag (and the drop point) track 1:1
 * again. Identity / no-op for every normal user (no dmode class).
 */
function transformPagePoint(point: { x: number; y: number }) {
  const html = document.documentElement;
  if (!html.classList.contains('dmode')) return point;
  const scale =
    parseFloat(getComputedStyle(html).getPropertyValue('--dmode-scale')) || 1;
  return scale > 0 ? { x: point.x / scale, y: point.y / scale } : point;
}

function App() {
  return (
    <LanguageProvider>
      <MotionConfig transformPagePoint={transformPagePoint}>
        {game === 'briscola' ? <BriscolaApp /> : <ScopaApp />}
      </MotionConfig>
    </LanguageProvider>
  );
}

export default App;
