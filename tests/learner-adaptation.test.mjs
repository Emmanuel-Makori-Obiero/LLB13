import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearnerInstruction, defaultLearningPreference, initialDebateDifficulty, isPersonalizedStudyFeature, materialVisibleToLevel, personalizeMessages, shouldShowAdaptationSurvey } from '../src/lib/learnerAdaptation.ts';

test('UON LLB stage guidance does not fabricate year-by-year subject sequences', () => {
  const text = buildLearnerInstruction({ learnerLevel: 'llb-year-2', learningPreference: 'balanced' });
  assert.match(text, /University of Nairobi/);
  assert.match(text, /does not give a complete authoritative year-by-year unit sequence/);
  assert.match(text, /regional\/international/);
});

test('year and independent preference both shape the learning prompt', () => {
  const guided = buildLearnerInstruction({ learnerLevel: 'llb-year-1', learningPreference: 'guided' });
  const challenge = buildLearnerInstruction({ learnerLevel: 'llb-year-1', learningPreference: 'challenge' });
  assert.match(guided, /small sequenced steps/);
  assert.match(challenge, /graduated hints/);
  assert.notEqual(guided, challenge);
});

test('personalization preserves message history and appends guidance to the final user turn', () => {
  const input = [{ role: 'user', content: 'Explain consideration. Return JSON.' }, { role: 'assistant', content: 'Prior response.' }, { role: 'user', content: 'Now quiz me.' }];
  const output = personalizeMessages(input, { learnerLevel: 'llb-year-1', learningPreference: 'guided' });
  assert.equal(output.length, 3);
  assert.equal(output[0].content, input[0].content);
  assert.equal(output[1].content, input[1].content);
  assert.match(output[2].content, /Now quiz me\./);
  assert.match(output[2].content, /required output format/);
  assert.match(output[2].content, /guided/);
});

test('LLM/PhD receive their own UON research context, not undergraduate year assumptions', () => {
  const llm = buildLearnerInstruction({ learnerLevel: 'masters', learningPreference: 'balanced' });
  const phd = buildLearnerInstruction({ learnerLevel: 'phd', learningPreference: 'challenge' });
  assert.match(llm, /nine taught units/);
  assert.match(llm, /chosen specialization/);
  assert.match(phd, /original scholarly contribution/);
  assert.doesNotMatch(phd, /LLB year 4/);
});

test('unknown or prefer-not-to-say learners are not silently assigned mastery', () => {
  const text = buildLearnerInstruction({ learnerLevel: 'prefer-not-to-say', learningPreference: 'balanced' });
  assert.match(text, /Do not infer level/);
  assert.equal(initialDebateDifficulty('prefer-not-to-say', 'balanced'), 'intermediate');
});

test('survey is shown only to signed-in learners missing a level or support preference', () => {
  assert.equal(shouldShowAdaptationSurvey(false, { learnerLevel: '', learningPreference: '' }), false);
  assert.equal(shouldShowAdaptationSurvey(true, { learnerLevel: 'llb-year-1', learningPreference: '' }), true);
  assert.equal(shouldShowAdaptationSurvey(true, { learnerLevel: 'llb-year-2', learningPreference: 'guided' }), false);
});

test('year selection can be saved without forcing a second form choice', () => {
  assert.equal(defaultLearningPreference(''), 'balanced');
  assert.equal(defaultLearningPreference(undefined), 'balanced');
  assert.equal(defaultLearningPreference('guided'), 'guided');
  assert.equal(defaultLearningPreference('challenge'), 'challenge');
});

test('game difficulty defaults reflect a declared level and remain user-tunable', () => {
  assert.equal(initialDebateDifficulty('llb-year-1', 'balanced'), 'beginner');
  assert.equal(initialDebateDifficulty('llb-year-3', 'balanced'), 'master');
  assert.equal(initialDebateDifficulty('llb-year-2', 'challenge'), 'master');
  assert.equal(initialDebateDifficulty('phd', 'guided'), 'master');
  assert.equal(initialDebateDifficulty('llb-year-4', 'guided'), 'master');
});

test('cohort tags distinguish year-specific items while untagged items stay shared', () => {
  assert.equal(materialVisibleToLevel(['llb-year-1'], 'llb-year-1'), true);
  assert.equal(materialVisibleToLevel(['llb-year-1'], 'llb-year-2'), false);
  assert.equal(materialVisibleToLevel([], 'llb-year-2'), true);
  assert.equal(materialVisibleToLevel(null, 'phd'), true);
});

test('educational AI surfaces are all personalized; counselling, scheduling and extraction stay outside the study layer', () => {
  for (const feature of ['chat', 'quiz', 'flashcards', 'moot', 'choices_game', 'rw_draft', 'rw_citations', 'legal_process', 'arena_training', 'podcast_script', 'video_script', 'quality_check']) assert.equal(isPersonalizedStudyFeature(feature), true, feature);
  for (const feature of ['counsellor', 'personal_timetable_proposal', 'timetable_proposal', 'extract_assignments', 'book_metadata']) assert.equal(isPersonalizedStudyFeature(feature), false, feature);
});
