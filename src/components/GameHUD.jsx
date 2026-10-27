export default function GameHUD({ distance, coins, onPause }) {
  return (
    <div className="game-hud">
      <div className="hud-pill distance-pill"><small>DISTANCE</small><strong>{distance.toLocaleString('fr-FR')} m</strong></div>
      <div className="hud-pill coins-pill"><span className="coin-dot" /> <strong>{coins}</strong></div>
      <button className="pause-button" type="button" aria-label="Pause" onClick={onPause}>Ⅱ</button>
    </div>
  );
}
