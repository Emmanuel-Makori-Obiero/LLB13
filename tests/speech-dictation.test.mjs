import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSpeechTranscript, dictationErrorMessage } from '../src/lib/speechDictation.ts';

test('dictation appends recognized text after existing typed content', () => {
  const event = { resultIndex: 0, results: [[{ transcript: 'The claimant proves duty.' }]] };
  assert.equal(appendSpeechTranscript('My opening:', event), 'My opening: The claimant proves duty.');
});

test('dictation only appends results from the current result index', () => {
  const event = { resultIndex: 1, results: [[{ transcript: 'already handled' }], [{ transcript: 'The statute applies.' }]] };
  assert.equal(appendSpeechTranscript('', event), 'The statute applies.');
});

test('empty recognition results do not change the draft', () => {
  assert.equal(appendSpeechTranscript('Keep this draft', { resultIndex: 0, results: [[{ transcript: '  ' }]] }), 'Keep this draft');
});

test('dictation errors explain microphone permission and missing speech', () => {
  assert.match(dictationErrorMessage('not-allowed'), /Allow microphone/);
  assert.match(dictationErrorMessage('no-speech'), /No speech was detected/);
  assert.match(dictationErrorMessage('language-not-supported'), /English \(Kenya\)/);
});
