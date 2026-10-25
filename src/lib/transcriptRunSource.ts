export type TranscriptRunSource = {
  kind: "generated_notes" | "original_transcript";
  text: string;
};

export function selectTranscriptRunSource(
  notesOverride: string | undefined,
  readOriginalTranscript: () => string,
): TranscriptRunSource {
  if (notesOverride !== undefined) {
    return { kind: "generated_notes", text: notesOverride };
  }
  return { kind: "original_transcript", text: readOriginalTranscript() };
}
