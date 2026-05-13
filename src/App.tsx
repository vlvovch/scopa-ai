import ScopaApp from './games/scopa/ScopaApp';
import BriscolaApp from './games/briscola/BriscolaApp';

const game = import.meta.env.VITE_GAME;

function App() {
  return game === 'briscola' ? <BriscolaApp /> : <ScopaApp />;
}

export default App;
