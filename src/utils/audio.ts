// Web Audio API synthesizer for high-fidelity WinGo lottery sound effects & gentle background music

export const BG_MUSIC_URL = '/assets/aistudio/screen-20261126-195231_93Ols83A_feed08e8.mp3';
const BG_MUSIC_VOLUME = 0.02; // Ultra-soft ambient level (~2%, -34 dB) across desktop & mobile/iOS
const BG_MUSIC_DUCK_VOLUME = 0.006;
const BG_MUSIC_STORAGE_KEY = 'muna_bg_music_enabled';

let audioCtx: AudioContext | null = null;
let isMuted = false;
let isMusicEnabled = (() => {
  try {
    const saved = localStorage.getItem(BG_MUSIC_STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
})();

let bgAudio: HTMLAudioElement | null = null;
let bgMediaSource: MediaElementAudioSourceNode | null = null;
let bgGainNode: GainNode | null = null;
let bgDuckTimer: number | null = null;
let bgInitialized = false;

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
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function setBgVolumeLevel(targetVolume: number) {
  const audio = bgAudio;
  if (!audio) return;
  if (bgGainNode && audioCtx) {
    // Keep native element volume at 1.0 so GainNode alone scales cleanly on both Desktop & iOS
    audio.volume = 1.0;
    try {
      bgGainNode.gain.setTargetAtTime(targetVolume, audioCtx.currentTime, 0.04);
    } catch {
      bgGainNode.gain.value = targetVolume;
    }
  } else {
    audio.volume = targetVolume;
  }
}

function ensureBgAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!bgAudio) {
    bgAudio = new Audio(BG_MUSIC_URL);
    bgAudio.loop = true;
    bgAudio.preload = 'auto';
    bgAudio.volume = BG_MUSIC_VOLUME;
    bgAudio.setAttribute('playsinline', 'true');
  }
  if (!bgMediaSource) {
    try {
      const ctx = getAudioContext();
      if (ctx) {
        bgMediaSource = ctx.createMediaElementSource(bgAudio);
        bgGainNode = ctx.createGain();
        bgGainNode.gain.value = BG_MUSIC_VOLUME;
        bgMediaSource.connect(bgGainNode);
        bgGainNode.connect(ctx.destination);
        bgAudio.volume = 1.0;
      }
    } catch {
      // Fallback to native HTMLAudioElement.volume if Web Audio routing fails
      bgMediaSource = null;
      bgGainNode = null;
      bgAudio.volume = BG_MUSIC_VOLUME;
    }
  }
  return bgAudio;
}

function syncBgMusicPlayback() {
  const audio = ensureBgAudio();
  if (!audio) return;

  const shouldPlay = !isMuted && isMusicEnabled && (typeof document === 'undefined' || !document.hidden);
  if (!shouldPlay) {
    if (!audio.paused) {
      audio.pause();
    }
    return;
  }

  setBgVolumeLevel(BG_MUSIC_VOLUME);
  if (audio.paused) {
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Browser autoplay policy may defer playback until first user gesture
      });
    }
  }
}

function duckBgMusicTemporarily(durationMs = 700) {
  const audio = bgAudio;
  if (!audio || audio.paused || isMuted || !isMusicEnabled) return;
  try {
    setBgVolumeLevel(BG_MUSIC_DUCK_VOLUME);
    if (bgDuckTimer !== null) {
      window.clearTimeout(bgDuckTimer);
    }
    bgDuckTimer = window.setTimeout(() => {
      bgDuckTimer = null;
      if (bgAudio && !isMuted && isMusicEnabled) {
        setBgVolumeLevel(BG_MUSIC_VOLUME);
      }
    }, durationMs);
  } catch {
    // ignore
  }
}

export const soundManager = {
  getMuted: () => isMuted,
  setMuted: (muted: boolean) => {
    isMuted = muted;
    syncBgMusicPlayback();
  },
  toggleMute: () => {
    isMuted = !isMuted;
    syncBgMusicPlayback();
    return isMuted;
  },

  getMusicEnabled: () => isMusicEnabled,
  setMusicEnabled: (enabled: boolean) => {
    isMusicEnabled = enabled;
    try {
      localStorage.setItem(BG_MUSIC_STORAGE_KEY, String(enabled));
    } catch {
      // ignore
    }
    syncBgMusicPlayback();
    return isMusicEnabled;
  },
  toggleMusic: () => {
    const next = !isMusicEnabled;
    isMusicEnabled = next;
    try {
      localStorage.setItem(BG_MUSIC_STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
    syncBgMusicPlayback();
    return next;
  },

  initBackgroundMusic: () => {
    if (typeof window === 'undefined') return () => {};
    ensureBgAudio();

    const tryStartOnGesture = () => {
      if (isMuted || !isMusicEnabled || (typeof document !== 'undefined' && document.hidden)) return;
      getAudioContext();
      const audio = ensureBgAudio();
      if (!audio) return;
      setBgVolumeLevel(BG_MUSIC_VOLUME);
      if (audio.paused) {
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            removeGestureListeners();
          }).catch(() => {
            // Keep listeners until a valid user activation succeeds
          });
        }
      } else {
        removeGestureListeners();
      }
    };

    const handleVisibilityChange = () => {
      syncBgMusicPlayback();
    };

    const removeGestureListeners = () => {
      window.removeEventListener('pointerdown', tryStartOnGesture, true);
      window.removeEventListener('touchstart', tryStartOnGesture, true);
      window.removeEventListener('click', tryStartOnGesture, true);
      window.removeEventListener('keydown', tryStartOnGesture, true);
    };

    if (!bgInitialized) {
      bgInitialized = true;
      syncBgMusicPlayback();
    }

    window.addEventListener('pointerdown', tryStartOnGesture, { capture: true, passive: true });
    window.addEventListener('touchstart', tryStartOnGesture, { capture: true, passive: true });
    window.addEventListener('click', tryStartOnGesture, { capture: true, passive: true });
    window.addEventListener('keydown', tryStartOnGesture, { capture: true, passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      removeGestureListeners();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
    duckBgMusicTemporarily(500);
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
    duckBgMusicTemporarily(850);
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

