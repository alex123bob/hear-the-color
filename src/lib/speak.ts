// Read text aloud with the browser TTS. Resolves when the speech has finished (or failed / was cancelled),
// so callers can wait for it before starting the next step.
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }
    // Cancel anything still playing before starting
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 1.05

    // Some browsers never fire onend; this length-based fallback keeps the caller from hanging forever
    const timer = window.setTimeout(done, Math.max(5000, text.length * 120 + 3000))
    function done() {
      window.clearTimeout(timer)
      resolve()
    }
    utterance.onend = done
    utterance.onerror = done

    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
