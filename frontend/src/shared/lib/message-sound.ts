function resolveIncomingMessageSoundUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  if (base === '/' || base === '') {
    return '/sounds/incoming-message.mp3'
  }
  return `${base.replace(/\/$/, '')}/sounds/incoming-message.mp3`
}

export const INCOMING_MESSAGE_SOUND_URL = resolveIncomingMessageSoundUrl()

let audioEl: HTMLAudioElement | null = null
let gestureBound = false

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio(INCOMING_MESSAGE_SOUND_URL)
    audioEl.preload = 'auto'
  }
  return audioEl
}


function bindGestureOnce() {
  if (gestureBound) return
  gestureBound = true
  const unlock = () => {
    const a = getAudio()
    a.muted = true
    void a
      .play()
      .then(() => {
        a.pause()
        a.currentTime = 0
        a.muted = false
        document.removeEventListener('pointerdown', unlock)
        document.removeEventListener('click', unlock)
      })
      .catch(() => {
        a.muted = false
      })
  }
  document.addEventListener('pointerdown', unlock, { passive: true })
  document.addEventListener('click', unlock, { passive: true })
}

export function playIncomingMessageSound() {
  bindGestureOnce()
  const a = new Audio(INCOMING_MESSAGE_SOUND_URL)
  a.volume = 1
  void a.play().catch(() => {
    /* нет жеста по странице или файл недоступен по URL */
  })
}
