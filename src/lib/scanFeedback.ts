// Feedback (haptic + audio) for scan events.
// Created lazily so AudioContext init doesn't break SSR or run before any user gesture.

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

function beep(freq: number, durationMs: number) {
  const c = ctx();
  if (!c) return;
  // iOS Safari: AudioContext may be in "suspended" state until user gesture.
  if (c.state === "suspended") c.resume().catch(() => {});
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = freq;
  osc.type = "sine";
  gain.gain.value = 0.15;
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + durationMs / 1000);
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // no-op
  }
}

export function scanFeedbackSuccess() {
  vibrate(80);
  beep(880, 120);
}

export function scanFeedbackError() {
  vibrate([60, 40, 60]);
  beep(220, 200);
}
