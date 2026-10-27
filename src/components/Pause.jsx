export default function Pause({ onResume, onMenu }) {
  return (
    <section className="screen-overlay modal-overlay">
      <div className="modal-card">
        <h2>PAUSE</h2>
        <button className="primary-button" type="button" onClick={onResume}>REPRENDRE</button>
        <button className="dark-button" type="button" onClick={onMenu}>MENU</button>
      </div>
    </section>
  );
}
