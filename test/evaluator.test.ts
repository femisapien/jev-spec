import { after, describe, test as it } from 'node:test';
import { choice, noul, score } from '../src/dsl.js';
import {
  createJevEvaluator,
  JevSpecConfigurationError,
  LiveJevEvaluator,
  MockJevEvaluator,
  resolveApiKey,
  type SystemOneClient,
} from '../src/evaluator/jev-evaluator.js';
import { assertRubric } from '../src/runner/assertion-runner.js';
import type { AnyAssertion, AnyRubric } from '../src/types.js';
import { expect } from './test-utils.js';

describe('Jev evaluator', () => {
  const originalApiKey = process.env.TYPESAFE_AI_API_KEY;
  const originalTypesafeKey = process.env.TYPESAFE_API_KEY;

  after(() => {
    if (originalApiKey === undefined) {
      delete process.env.TYPESAFE_AI_API_KEY;
    } else {
      process.env.TYPESAFE_AI_API_KEY = originalApiKey;
    }
    if (originalTypesafeKey === undefined) {
      delete process.env.TYPESAFE_API_KEY;
    } else {
      process.env.TYPESAFE_API_KEY = originalTypesafeKey;
    }
  });

  it('resolves API key from TYPESAFE_AI_API_KEY and TYPESAFE_API_KEY', () => {
    delete process.env.TYPESAFE_AI_API_KEY;
    process.env.TYPESAFE_API_KEY = 'from-typesafe-key';
    expect(resolveApiKey()).toBe('from-typesafe-key');

    process.env.TYPESAFE_AI_API_KEY = 'from-ai-key';
    expect(resolveApiKey()).toBe('from-ai-key');
  });

  it('falls back to the environment when client.apiKey is empty', () => {
    process.env.TYPESAFE_AI_API_KEY = 'from-ai-key';
    expect(resolveApiKey({ apiKey: '' })).toBe('from-ai-key');
    expect(resolveApiKey({ apiKey: '   ' })).toBe('from-ai-key');
  });

  it('uses mock evaluator only when mock flag is explicitly set', () => {
    delete process.env.TYPESAFE_AI_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    expect(createJevEvaluator({ mock: true })).toBeInstanceOf(MockJevEvaluator);
  });

  it('throws when API key is missing and mock mode is not enabled', () => {
    delete process.env.TYPESAFE_AI_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      createJevEvaluator({});
      throw new Error('expected createJevEvaluator to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(JevSpecConfigurationError);
      expect((error as Error).message).toContain('API key is required');
    }
  });

  it('uses live evaluator when API key is present', () => {
    expect(createJevEvaluator({ apiKey: 'test-key' })).toBeInstanceOf(LiveJevEvaluator);
  });

  it('evaluates noul, choice, and score rubrics in parallel via mock', async () => {
    const evaluator = new MockJevEvaluator();
    const { answers } = await evaluator.evaluate({
      specContext: 'REQ-01: verify tokens',
      codeContext:
        'export function verifyToken(token: string) { return token.startsWith("valid"); }',
      rubrics: {
        satisfies: noul('Does the implementation satisfy the specification?'),
        posture: choice('Security posture', {
          secure: 'Secure handling',
          insecure: 'Insecure handling',
        }),
        completeness: score('Completeness', ['Stub', 'Partial', 'Complete']),
      },
    });

    expect(answers.satisfies.type).toBe('noul');
    expect(answers.posture.type).toBe('choice');
    expect(answers.completeness.type).toBe('score');
  });
});

describe('malformed answers from the API', () => {
  const noulRubric = noul('Does the code satisfy the requirement?');
  const choiceRubric = choice('Security posture', { secure: 'ok', insecure: 'not ok' });
  const scoreRubric = score('Completeness', ['Stub', 'Partial', 'Complete']);

  /** Whether the assertion passes when the API returns `raw` as the answer of the rubric. */
  async function passes(
    rubric: AnyRubric,
    raw: Record<string, unknown>,
    assertion: AnyAssertion
  ): Promise<boolean> {
    const client: SystemOneClient = {
      systemOne: async () => ({ model: 'jev-test', answers: { r: raw } }),
    };
    const { answers } = await new LiveJevEvaluator({}, client).evaluate({
      specContext: 'spec',
      codeContext: 'code',
      rubrics: { r: rubric },
    });
    return assertRubric('r', rubric, answers.r, assertion).passed;
  }

  const choiceAnswer = (confidence: unknown) => ({
    type: 'choice',
    choice: 'secure',
    confidence,
    probabilities: { secure: 0.9, insecure: 0.1 },
  });
  const scoreAnswer = (value: unknown, confidence: unknown = 0.9) => ({
    type: 'score',
    score: value,
    confidence,
    legend: { '0': 'Stub', '1': 'Partial', '2': 'Complete' },
    probabilities: { '0': 0.05, '1': 0.05, '2': 0.9 },
  });

  it('passes well-formed answers that meet their assertions', async () => {
    expect(await passes(noulRubric, { type: 'noul', noul: 0.95 }, { minProbability: 0.9 })).toBe(
      true
    );
    expect(await passes(choiceRubric, choiceAnswer(0.95), { minConfidence: 0.9 })).toBe(true);
    expect(await passes(scoreRubric, scoreAnswer(2), { minScore: 1.5, minConfidence: 0.8 })).toBe(
      true
    );
  });

  it('REQ-API-01: fails an assertion when the API returns null or a string instead of a number', async () => {
    expect(await passes(noulRubric, { type: 'noul', noul: null }, { maxProbability: 0.1 })).toBe(
      false
    );
    expect(await passes(noulRubric, { type: 'noul', noul: '0.99' }, { minProbability: 0.9 })).toBe(
      false
    );
    expect(await passes(choiceRubric, choiceAnswer('0.99'), { minConfidence: 0.9 })).toBe(false);
    expect(await passes(scoreRubric, scoreAnswer(null), { maxScore: 0.5 })).toBe(false);
    expect(await passes(scoreRubric, scoreAnswer('2'), { minScore: 1.5 })).toBe(false);
    expect(await passes(scoreRubric, scoreAnswer(2, '0.99'), { minConfidence: 0.9 })).toBe(false);
  });

  it('REQ-API-02: fails an assertion when the API returns a choice that is not a string', async () => {
    const numbered = choice('Tier', { '1': 'first', '2': 'second' });
    const answer = (label: unknown) => ({
      type: 'choice',
      choice: label,
      confidence: 0.95,
      probabilities: { '1': 0.95, '2': 0.05 },
    });
    expect(await passes(numbered, answer('1'), { blockedChoices: ['2'] })).toBe(true);
    expect(await passes(numbered, answer(1), { blockedChoices: ['2'] })).toBe(false);
    expect(await passes(choiceRubric, answer(null), { blockedChoices: ['insecure'] })).toBe(false);
    expect(await passes(choiceRubric, answer(['secure']), { allowedChoices: ['secure'] })).toBe(
      false
    );
  });

  it('REQ-ANSWER-01: fails an assertion when a probability or a confidence lies outside 0 to 1', async () => {
    expect(await passes(noulRubric, { type: 'noul', noul: 2 }, { minProbability: 0.9 })).toBe(
      false
    );
    expect(await passes(noulRubric, { type: 'noul', noul: -1 }, { maxProbability: 0.1 })).toBe(
      false
    );
    expect(await passes(choiceRubric, choiceAnswer(1.5), { minConfidence: 0.9 })).toBe(false);
    expect(await passes(scoreRubric, scoreAnswer(2, 1.5), { minConfidence: 0.9 })).toBe(false);
  });

  it('REQ-ANSWER-01: fails an assertion when a score lies outside 0 to the top level', async () => {
    expect(await passes(scoreRubric, scoreAnswer(3), { minScore: 1.5 })).toBe(false);
    expect(await passes(scoreRubric, scoreAnswer(-1), { maxScore: 0.5 })).toBe(false);
  });
});
