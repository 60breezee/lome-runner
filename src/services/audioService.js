let audioContext = null;
let masterGain = null;
let musicTimer = null;
let enabled = true;

function getAudioContext() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.08;
    masterGain.connect(audioContext.destination);
  }
  return audioContext;
}

export function unlockAudio() {
  const context = getAudioContext();
  if (context?.state === 'suspended') context.resume();
}

function tone(frequency, duration, type = 'sine', endFrequency = null) {
  if (!enabled) return;
  const context = getAudioContext();
  if (!context || !masterGain) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, context.currentTime + duration);
  }
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.4, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start();
  oscillator.stop(context.currentTime + duration + 0.02);
}

export function setAudioEnabled(value) {
  enabled = Boolean(value);
  if (!enabled) stopMusic();
}

export function playClick() {
  unlockAudio();
  tone(460, 0.06, 'square');
}

export function playCoin() {
  unlockAudio();
  tone(880, 0.08, 'triangle');
  window.setTimeout(() => tone(1320, 0.08, 'triangle'), 55);
}

export function playJump() {
  unlockAudio();
  tone(420, 0.16, 'triangle', 820);
}

export function playSlide() {
  unlockAudio();
  tone(360, 0.18, 'triangle', 150);
}

export function playLevelUp() {
  unlockAudio();
  [523, 659, 784].forEach((frequency, index) => {
    window.setTimeout(() => tone(frequency, 0.1, 'square'), index * 90);
  });
}

export function playCollision() {
  unlockAudio();
  tone(110, 0.24, 'sawtooth');
}

export function startMusic() {
  if (!enabled || musicTimer) return;
  unlockAudio();
  const notes = [220, 277, 330, 277];
  let index = 0;
  musicTimer = window.setInterval(() => {
    tone(notes[index % notes.length], 0.16, 'triangle');
    index += 1;
  }, 420);
}

export function stopMusic() {
  if (musicTimer) window.clearInterval(musicTimer);
  musicTimer = null;
}
