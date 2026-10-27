export default function MainMenu({ bestScore, onPlay, onInstructions, soundEnabled, onToggleSound }) {
  return (
    <section className="screen-overlay menu-screen">
      <span className="eyebrow">LOMÉ · TOGO</span>
      <h1>
        LOMÉ
        <strong>RUNNER</strong>
      </h1>
      <p className="tagline">Cours. Esquive. Bats ton record.</p>
      <div className="menu-actions">
        <p className="pill">Meilleur score : {bestScore.toLocaleString('fr-FR')} m</p>
        <button className="primary-button" type="button" onClick={onPlay}>JOUER</button>
        <div className="button-row">
          <button className="light-button" type="button" onClick={onInstructions}>Instructions</button>
          <button className="light-button sound-button" type="button" aria-label={soundEnabled ? 'Son activé' : 'Son désactivé'} onClick={onToggleSound}>
            {soundEnabled ? 'Son' : 'Muet'}
          </button>
        </div>
      </div>
    </section>
  );
}
