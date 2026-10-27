const STORAGE_KEY = 'lomeRunner.v1';
const DEFAULT_DATA = { bestScore: 0, soundEnabled: true };

export function loadScoreData() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_DATA };
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_DATA };
    return {
      bestScore: Number.isFinite(parsed.bestScore) && parsed.bestScore >= 0 ? parsed.bestScore : 0,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
    };
  } catch {
    return { ...DEFAULT_DATA };
  }
}

export function saveScoreData(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      bestScore: Math.max(0, Math.floor(data.bestScore ?? 0)),
      soundEnabled: Boolean(data.soundEnabled),
    }));
  } catch {
    // Le jeu reste utilisable si le stockage est indisponible.
  }
}
