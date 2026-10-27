export default function Instructions({ onBack }) {
  return (
    <section className="screen-overlay modal-overlay">
      <div className="modal-card instructions-card">
        <h2>INSTRUCTIONS</h2>
        <p>Change de voie, saute par-dessus les chantiers et glisse sous les portiques. Ça accélère à chaque niveau !</p>
        <p><strong>Ordinateur :</strong> ←/→ ou Q/D pour changer de voie, ↑ ou Espace pour sauter, ↓ ou S pour glisser. Pause : P ou Échap.</p>
        <p><strong>Téléphone :</strong> glisse à gauche/droite, vers le haut pour sauter, vers le bas pour glisser.</p>
        <button className="dark-button" type="button" onClick={onBack}>RETOUR</button>
      </div>
    </section>
  );
}
