// Web Audio API synthesizer for high-fidelity WinGo lottery sound effects

let audioCtx: AudioContext | null = null;
let isMuted = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export const soundManager = {
  getMuted: () => isMuted,
  setMuted: (muted: boolean) => {
    isMuted = muted;
  },
  toggleMute: () => {
    isMuted = !isMuted;
    return isMuted;
  },

  playClick: () => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      // Audio might be blocked by browser policy until user interaction
    }
  },

  // Crisp arcade countdown timer beep (5, 4, 3, 2, 1)
  // Short, punchy, electronic stopwatch pip (duration ~0.08s)
  playToom: (countdownNum: number) => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pitch: 950Hz for 5,4,3,2; 1250Hz for 1 (tension build up)
      const freq = countdownNum === 1 ? 1250 : 950;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      // Super crisp, clean electronic pip (80ms)
      gain.gain.setValueAtTime(0.75, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.085);
    } catch {
      // ignore
    }
  },

  // "بڑا ٹوم" (Bada Toom) impact sound on 0 / draw time
  playBadaToom: () => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      // Punchy digital buzzer / impact hit
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(450, now + 0.18);

      gain.gain.setValueAtTime(0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch {
      // ignore
    }
  },

  // Short, sweet, high-quality casino winner chime (duration ~0.35s)
  playWin: () => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      // 3 crisp, bright sparkling chime notes: C6 (1046Hz), E6 (1318Hz), C7 (2093Hz)
      const notes = [1046.5, 1318.51, 2093.0];
      notes.forEach((freq, i) => {
        const noteTime = now + i * 0.07;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteTime);

        // Punchy attack and fast pleasant decay
        gain.gain.setValueAtTime(0.55, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + (i === 2 ? 0.22 : 0.12));

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteTime);
        osc.stop(noteTime + (i === 2 ? 0.25 : 0.14));
      });
    } catch {
      // ignore
    }
  },

  // Short, soft, gentle loss tone (duration ~0.25s)
  playLose: () => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      // 2 gentle, soft descending notes: A4 (440Hz), E4 (330Hz)
      const notes = [440, 329.63];
      notes.forEach((freq, i) => {
        const noteTime = now + i * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.32, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.14);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteTime);
        osc.stop(noteTime + 0.16);
      });
    } catch {
      // ignore
    }
  },

  playCash: () => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now);
      osc.frequency.exponentialRampToValueAtTime(1567.98, now + 0.12);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + 0.28);
    } catch {
      // ignore
    }
  }
};
