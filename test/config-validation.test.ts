import assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, test as it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ConfigValidationError, validateConfig } from '../src/config-validation.js';
import { choice, noul, score } from '../src/dsl.js';
import type {
  EvaluationInput,
  EvaluationOutput,
  JevEvaluator,
} from '../src/evaluator/jev-evaluator.js';
import { runChecks } from '../src/runner/engine.js';
import type { JevSpecConfig, TargetConfig } from '../src/types.js';
import { OWN_CODE_PATH, OWN_SPEC_PATH, sampleConfig } from './own-project.js';
import { expect } from './test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, '../..');

const baseTarget = {
  specPath: OWN_SPEC_PATH,
  codePaths: [OWN_CODE_PATH],
  rubrics: {
    satisfiesRequirements: noul('Does the code satisfy the requirements?'),
    securityPosture: choice('Security posture', { secure: 'ok', insecure: 'not ok' }),
    completeness: score('Completeness', ['Stub', 'Partial', 'Complete']),
  },
  assertions: {},
};

/** Builds a single-target config; loosely typed on purpose to model hand-written JS configs. */
function configWith(targetOverrides: Record<string, unknown>): JevSpecConfig {
  return { targets: { auth: { ...baseTarget, ...targetOverrides } as unknown as TargetConfig } };
}

function issuesOf(config: JevSpecConfig): readonly string[] {
  try {
    validateConfig(config);
  } catch (error: unknown) {
    assert.ok(error instanceof ConfigValidationError, `unexpected error: ${String(error)}`);
    return error.issues;
  }
  return [];
}

describe('validateConfig', () => {
  it('accepts the sample configuration', () => {
    expect(issuesOf(sampleConfig)).toEqual([]);
  });

  it('rejects a configuration that still uses the former "zones" key', () => {
    const legacy = { zones: { auth: baseTarget } } as unknown as JevSpecConfig;

    expect(issuesOf(legacy)).toEqual(['targets: must declare at least one target']);
  });

  it('accepts a rubric that has no assertion (informational rubric)', () => {
    expect(
      issuesOf(configWith({ assertions: { satisfiesRequirements: { minProbability: 0.85 } } }))
    ).toEqual([]);
  });

  it('REQ-CONFIG-02: rejects an assertion whose key matches no rubric', () => {
    const issues = issuesOf(
      configWith({ assertions: { satisfiesRequirement: { minProbability: 0.85 } } })
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('targets.auth.assertions.satisfiesRequirement');
  });

  it('REQ-CONFIG-04: rejects probability thresholds outside [0, 1]', () => {
    const issues = issuesOf(
      configWith({ assertions: { satisfiesRequirements: { maxProbability: 15 } } })
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('targets.auth.assertions.satisfiesRequirements.maxProbability');
  });

  it('rejects non-numeric thresholds', () => {
    const issues = issuesOf(
      configWith({ assertions: { satisfiesRequirements: { minProbability: '0.85' } } })
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('minProbability');
  });

  it('rejects minProbability greater than maxProbability', () => {
    const issues = issuesOf(
      configWith({
        assertions: { satisfiesRequirements: { minProbability: 0.9, maxProbability: 0.2 } },
      })
    );

    expect(issues).toHaveLength(1);
  });

  it('REQ-CONFIG-03: rejects assertion options that do not belong to the rubric type', () => {
    const issues = issuesOf(
      configWith({ assertions: { satisfiesRequirements: { allowedChoices: ['secure'] } } })
    );

    expect(issues.some((issue) => issue.includes('allowedChoices'))).toBe(true);
  });

  it('rejects an assertion that sets no threshold at all', () => {
    const issues = issuesOf(configWith({ assertions: { satisfiesRequirements: {} } }));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('targets.auth.assertions.satisfiesRequirements');
  });

  it('rejects allowedChoices and blockedChoices that are not options of the rubric', () => {
    const issues = issuesOf(
      configWith({
        assertions: { securityPosture: { allowedChoices: ['secur'], blockedChoices: ['unsafe'] } },
      })
    );

    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('"secur"');
    expect(issues[1]).toContain('"unsafe"');
  });

  it('REQ-CONFIG-04: rejects score thresholds outside the rubric scale', () => {
    const issues = issuesOf(configWith({ assertions: { completeness: { minScore: 5 } } }));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('targets.auth.assertions.completeness.minScore');
  });

  it('REQ-CONFIG-04: rejects a confidence threshold outside [0, 1]', () => {
    const issues = issuesOf(
      configWith({ assertions: { completeness: { minScore: 1, minConfidence: 70 } } })
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('minConfidence');
  });

  it('rejects targets with a missing specPath, no include pattern, or no rubrics', () => {
    expect(issuesOf(configWith({ specPath: '' })).some((issue) => issue.includes('specPath'))).toBe(
      true
    );
    expect(
      issuesOf(configWith({ codePaths: ['!src/**/*.test.ts'] })).some((issue) =>
        issue.includes('codePaths')
      )
    ).toBe(true);
    expect(issuesOf(configWith({ rubrics: {} })).some((issue) => issue.includes('rubrics'))).toBe(
      true
    );
  });

  it('rejects malformed rubrics', () => {
    const issues = issuesOf(
      configWith({
        rubrics: {
          noQuestion: { type: 'noul', question: '' },
          oneLevel: { type: 'score', description: 'x', levels: ['only'] },
          oneOption: { type: 'choice', description: 'x', options: { only: 'x' } },
          unknownType: { type: 'rank' },
        },
      })
    );

    expect(issues).toHaveLength(4);
  });

  it('accepts client options of the right type', () => {
    const client = {
      apiKey: 'test-key',
      baseUrl: 'http://127.0.0.1:8080',
      allowCustomBaseUrl: true,
      timeoutMs: 2500,
      mock: false,
      model: 'jev-1.13.0',
    };
    expect(issuesOf({ ...sampleConfig, client })).toEqual([]);
  });

  it('REQ-CONFIG-06: rejects every client option whose value is not of its type', () => {
    const cases: ReadonlyArray<[Record<string, unknown>, string]> = [
      [{ allowCustomBaseUrl: 'false' }, 'client.allowCustomBaseUrl'],
      [{ allowCustomBaseUrl: 1 }, 'client.allowCustomBaseUrl'],
      [{ mock: 'false' }, 'client.mock'],
      [{ mock: 0 }, 'client.mock'],
      [{ baseUrl: 42 }, 'client.baseUrl'],
      [{ baseUrl: 'not a url' }, 'client.baseUrl'],
      [{ baseUrl: 'file:///etc/passwd' }, 'client.baseUrl'],
      [{ timeoutMs: '5000' }, 'client.timeoutMs'],
      [{ timeoutMs: 0 }, 'client.timeoutMs'],
      [{ timeoutMs: -1 }, 'client.timeoutMs'],
      [{ timeoutMs: Number.POSITIVE_INFINITY }, 'client.timeoutMs'],
      [{ timeoutMs: Number.NaN }, 'client.timeoutMs'],
      [{ apiKey: 123 }, 'client.apiKey'],
      [{ apiKey: null }, 'client.apiKey'],
      [{ model: 7 }, 'client.model'],
    ];
    for (const [client, path] of cases) {
      const issues = issuesOf({ ...sampleConfig, client } as unknown as JevSpecConfig);
      expect(
        `${JSON.stringify(client)}: ${issues.some((issue) => issue.startsWith(`${path}:`))}`
      ).toBe(`${JSON.stringify(client)}: true`);
    }
  });

  it('REQ-CONFIG-06: accepts an empty apiKey, which a missing CI secret produces', () => {
    expect(issuesOf({ ...sampleConfig, client: { apiKey: '' } })).toEqual([]);
    expect(issuesOf({ ...sampleConfig, client: { apiKey: '   ' } })).toEqual([]);
  });

  it('REQ-CONFIG-06: rejects a client that is not an object', () => {
    const issues = issuesOf({ ...sampleConfig, client: 'mock' } as unknown as JevSpecConfig);
    expect(issues.some((issue) => issue.startsWith('client:'))).toBe(true);
  });

  it('never repeats the value of an invalid API key in an issue', () => {
    const issues = issuesOf({
      ...sampleConfig,
      client: { apiKey: ['sk-secret-value'] },
    } as unknown as JevSpecConfig);
    expect(issues.some((issue) => issue.startsWith('client.apiKey:'))).toBe(true);
    expect(issues.join('\n').includes('sk-secret-value')).toBe(false);
  });

  it('REQ-CONFIG-01: rejects a configuration without targets', () => {
    expect(issuesOf({ targets: {} })).toHaveLength(1);
  });

  it('REQ-CONFIG-05: reports every issue at once', () => {
    const issues = issuesOf(
      configWith({
        assertions: {
          satisfiesRequirement: { minProbability: 0.85 },
          completeness: { minScore: 9 },
        },
      })
    );

    expect(issues).toHaveLength(2);
  });
});

describe('runChecks configuration gate', () => {
  it('REQ-RUN-01: refuses to evaluate an invalid configuration', async () => {
    const calls: EvaluationInput[] = [];
    const evaluator: JevEvaluator = {
      async evaluate(input): Promise<EvaluationOutput> {
        calls.push(input);
        return { answers: {} };
      },
    };

    await assert.rejects(
      () =>
        runChecks(configWith({ assertions: { satisfiesRequirement: { minProbability: 0.85 } } }), {
          cwd: pkgRoot,
          evaluator,
        }),
      ConfigValidationError
    );
    expect(calls).toHaveLength(0);
  });
});
