import { useUiStore } from '../store/uiStore'

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext()
    } catch {
      return null
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

function playTone(
  freq: number,
  type: OscillatorType,
  duration: number,
  gain: number,
  startOffset = 0,
): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.connect(g)
  g.connect(ctx.destination)
  osc.type = type
  osc.frequency.value = freq
  const start = ctx.currentTime + startOffset
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(gain, start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.001, start + duration)
  osc.start(start)
  osc.stop(start + duration)
}

// White noise via buffer
function playNoise(duration: number, gain: number): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const bufferSize = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const g = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1000
  filter.Q.value = 0.5
  source.connect(filter)
  filter.connect(g)
  g.connect(ctx.destination)
  g.gain.setValueAtTime(gain, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  source.start()
  source.stop(ctx.currentTime + duration)
}

export function useSound() {
  const soundMuted = useUiStore((s) => s.soundMuted)

  function guarded(fn: () => void) {
    if (soundMuted) return
    fn()
  }

  return {
    playRoll() {
      guarded(() => playNoise(0.08, 0.3))
    },

    playScore() {
      // C5 → E5 ascending chime
      guarded(() => {
        playTone(523.25, 'sine', 0.15, 0.4, 0)
        playTone(659.25, 'sine', 0.15, 0.4, 0.12)
      })
    },

    playKill() {
      // Descending square wave buzz
      guarded(() => {
        const ctx = getAudioContext()
        if (!ctx) return
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.connect(g)
        g.connect(ctx.destination)
        osc.type = 'square'
        osc.frequency.setValueAtTime(180, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4)
        g.gain.setValueAtTime(0.25, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
        osc.start()
        osc.stop(ctx.currentTime + 0.4)
      })
    },

    playGoOut() {
      // Short sine blip
      guarded(() => playTone(880, 'sine', 0.08, 0.35))
    },

    playPhaseEnd() {
      // C5 → E5 → G5 fanfare
      guarded(() => {
        playTone(523.25, 'triangle', 0.2, 0.35, 0)
        playTone(659.25, 'triangle', 0.2, 0.35, 0.18)
        playTone(783.99, 'triangle', 0.3, 0.4, 0.36)
      })
    },

    playGameEnd() {
      // C5 → E5 → G5 → C6 arpeggio
      guarded(() => {
        playTone(523.25, 'triangle', 0.18, 0.35, 0)
        playTone(659.25, 'triangle', 0.18, 0.35, 0.15)
        playTone(783.99, 'triangle', 0.18, 0.35, 0.3)
        playTone(1046.5, 'triangle', 0.4, 0.45, 0.45)
      })
    },
  }
}
