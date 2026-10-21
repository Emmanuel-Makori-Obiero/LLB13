export type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
  resultIndex: number;
};

export function appendSpeechTranscript(current: string, event: SpeechResultEvent): string {
  let transcript = "";
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    transcript += event.results[index]?.[0]?.transcript ?? "";
  }
  const spoken = transcript.trim();
  if (!spoken) return current;
  return `${current}${current.trim() ? " " : ""}${spoken}`;
}

export function dictationErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Allow microphone and speech-recognition access in your browser, then try again. You can still type your answer.";
  }
  if (error === "language-not-supported") {
    return "This browser does not support English (Kenya) speech recognition. Typing your answer is still available.";
  }
  if (error === "no-speech") return "No speech was detected. Try speaking again or type your answer.";
  if (error === "network") return "The speech service could not connect. Check your connection or type your answer.";
  return "Speech recognition stopped. You can retry or type your answer.";
}
