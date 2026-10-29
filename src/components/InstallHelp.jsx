export default function InstallHelp({ onBack }) {
  return (
    <section className="screen-overlay modal-overlay">
      <div className="modal-card install-card">
        <h2>INSTALLER L'APPLI</h2>
        <p>Joue en plein écran, même sans connexion, directement depuis ton écran d'accueil.</p>
        <ol className="install-steps">
          <li>
            Touche le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut) dans la barre de Safari.
          </li>
          <li>
            Choisis <strong>Sur l'écran d'accueil</strong>.
          </li>
          <li>
            Touche <strong>Ajouter</strong> : l'icône Lomé Runner apparaît avec tes applis.
          </li>
        </ol>
        <button className="dark-button" type="button" onClick={onBack}>COMPRIS</button>
      </div>
    </section>
  );
}
