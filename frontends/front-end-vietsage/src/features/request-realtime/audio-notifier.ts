"use client";

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let sharedAudioContext: AudioContext | null = null;
let unlockAttempted = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!sharedAudioContext) {
    const audioWindow = window as AudioWindow;
    const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) return null;
    sharedAudioContext = new AudioContextCtor();
  }

  if (!unlockAttempted) {
    unlockAttempted = true;
    const unlock = () => {
      if (sharedAudioContext && sharedAudioContext.state === "suspended") {
        void sharedAudioContext.resume();
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
  }

  if (sharedAudioContext.state === "suspended") {
    void sharedAudioContext.resume();
  }

  return sharedAudioContext;
}

export function playRequestAlertSound(isUrgent = false) {
  const context = getAudioContext();
  if (!context) return;

  const startAt = context.currentTime;
  const pattern = isUrgent
    ? [740, 1040, 740, 1040, 620, 980, 620, 980]
    : [520, 660, 780];

  pattern.forEach((frequency, index) => {
    const offset = index * (isUrgent ? 0.22 : 0.16);
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = isUrgent ? "square" : "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt + offset);

    gain.gain.setValueAtTime(0.0001, startAt + offset);
    gain.gain.exponentialRampToValueAtTime(isUrgent ? 0.16 : 0.12, startAt + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + (isUrgent ? 0.18 : 0.14));

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + (isUrgent ? 0.19 : 0.15));
  });
}

export function playMessageAlertSound() {
  const context = getAudioContext();
  if (!context) return;

  const startAt = context.currentTime;
  const pattern = [587.33, 880]; // D5 -> A5 pleasant pop/ding

  pattern.forEach((frequency, index) => {
    const offset = index * 0.12;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt + offset);

    gain.gain.setValueAtTime(0.0001, startAt + offset);
    gain.gain.exponentialRampToValueAtTime(0.14, startAt + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.10);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + 0.11);
  });
}
