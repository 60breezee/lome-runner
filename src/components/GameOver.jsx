export default function GameOver({ result, bestScore, isNewRecord, onReplay, onMenu }) {
  return (
    <section className="screen-overlay modal-overlay game-over-overlay">
      <div className="modal-card game-over-card">
        <h2>COLLISION !</h2>
        <p>Distance parcourue</p>
        <strong className="final-distance">{result.distance.toLocaleString('fr-FR')} m</strong>
        <div className="result-row">
          <div className="result-box coins-result"><small>Pièces</small><strong>{result.coins}</strong></div>
          <div className="result-box record-result"><small>{isNewRecord ? 'Nouveau record !' : 'Record'}</small><strong>{bestScore.toLocaleString('fr-FR')} m</strong></div>
        </div>
        <button className="primary-button" type="button" onClick={onReplay}>REJOUER</button>
        <button className="dark-button" type="button" onClick={onMenu}>Menu</button>
      </div>
    </section>
  );
}
