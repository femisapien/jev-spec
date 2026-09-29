import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test as it } from 'node:test';
import type {
  EvaluationInput,
  EvaluationOutput,
  JevEvaluator,
} from '../src/evaluator/jev-evaluator.js';
import { runChecks } from '../src/runner/engine.js';
import type { AnyTargetConfig, JevSpecConfig } from '../src/types.js';
import { createTempGitRepo, type TempGitRepo } from './git-test-utils.js';
import { expect } from './test-utils.js';

class RecordingEvaluator implements JevEvaluator {
  readonly calls: EvaluationInput[] = [];

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    this.calls.push(input);
    return { answers: { satisfies: { type: 'noul', probability: 0.95 } } };
  }
}

const target = (codePaths: string[]): AnyTargetConfig => ({
  specPath: 'docs/spec.md',
  codePaths,
  rubrics: { satisfies: { type: 'noul', question: 'Does the code export `a`?' } },
  assertions: { satisfies: { minProbability: 0.8 } },
});

const OVER_2_MIB = `// ${'x'.repeat(2 * 1024 * 1024)}\nexport const a = 1;\n`;
const OVER_120K_CHARS = `// ${'x'.repeat(130_000)}\nexport const a = 1;\n`;

describe('code that does not fit in one request', () => {
  let repo: TempGitRepo;
  let evaluator: RecordingEvaluator;

  before(async () => {
    repo = await createTempGitRepo('jev-spec-code-limits-');
    await repo.write(
      'docs/spec.md',
      '# Spec\n\n### REQ-A-01: Export a\n\nThe module exports `a`.\n'
    );
    await repo.write('small/a.ts', 'export const a = 1;\n');
    repo.git('add', '-A');
    repo.git('commit', '--quiet', '-m', 'init');
  });

  beforeEach(() => {
    evaluator = new RecordingEvaluator();
    repo.git('reset', '--quiet', '--hard', 'HEAD');
    repo.git('clean', '--quiet', '-fd');
  });

  after(async () => {
    await repo.cleanup();
  });

  it('REQ-RUN-02: stops a full run that would omit a file over 2 MiB, naming the file', async () => {
    await repo.write('big/huge.ts', OVER_2_MIB);
    await repo.write('big/a.ts', 'export const a = 1;\n');
    const config: JevSpecConfig = { targets: { core: target(['big/**/*.ts']) } };

    await assert.rejects(
      () => runChecks(config, { cwd: repo.dir, evaluator }),
      /core: big\/huge\.ts is larger than the limit of 2 MiB per file/
    );
    expect(evaluator.calls).toHaveLength(0);
  });

  it('REQ-RUN-02: stops a full run whose code would be cut at the character budget', async () => {
    await repo.write('big/a.ts', OVER_120K_CHARS);
    const config: JevSpecConfig = { targets: { core: target(['big/**/*.ts']) } };

    await assert.rejects(
      () => runChecks(config, { cwd: repo.dir, evaluator }),
      /core: the code is longer than the budget of 120,000 characters per target/
    );
    expect(evaluator.calls).toHaveLength(0);
  });

  it('REQ-RUN-02: stops a staged run that would omit a staged file over 2 MiB', async () => {
    await repo.write('small/huge.ts', OVER_2_MIB);
    repo.git('add', 'small/huge.ts');
    const config: JevSpecConfig = { targets: { core: target(['small/**/*.ts']) } };

    await assert.rejects(
      () => runChecks(config, { cwd: repo.dir, evaluator, gitDiff: { staged: true } }),
      /core: small\/huge\.ts is larger than the limit of 2 MiB per file/
    );
    expect(evaluator.calls).toHaveLength(0);
  });

  it('REQ-RUN-02: asks the model nothing, even about a target that fits, and names every problem', async () => {
    await repo.write('big/huge.ts', OVER_2_MIB);
    await repo.write('long/a.ts', OVER_120K_CHARS);
    const config: JevSpecConfig = {
      targets: {
        fits: target(['small/**/*.ts']),
        oversized: target(['big/**/*.ts']),
        long: target(['long/**/*.ts']),
      },
    };

    await assert.rejects(
      () => runChecks(config, { cwd: repo.dir, evaluator }),
      (error: Error) =>
        error.message.includes('oversized: big/huge.ts') &&
        error.message.includes('long: the code is longer') &&
        !error.message.includes('fits:')
    );
    expect(evaluator.calls).toHaveLength(0);
  });

  it('REQ-RUN-02: stops a dry run the same way', async () => {
    await repo.write('big/huge.ts', OVER_2_MIB);
    const config: JevSpecConfig = { targets: { core: target(['big/**/*.ts']) } };

    await assert.rejects(
      () => runChecks(config, { cwd: repo.dir, dryRun: true }),
      /core: big\/huge\.ts is larger than the limit of 2 MiB per file/
    );
  });

  it('does not stop a diff run for an oversized file in a target that is skipped', async () => {
    await repo.write('big/huge.ts', OVER_2_MIB);
    await repo.write('NOTES.md', 'unrelated\n');
    repo.git('add', 'NOTES.md');
    const config: JevSpecConfig = { targets: { core: target(['big/**/*.ts']) } };

    const result = await runChecks(config, {
      cwd: repo.dir,
      evaluator,
      gitDiff: { staged: true },
    });

    expect(result.targets[0].skipped).toBe(true);
    expect(evaluator.calls).toHaveLength(0);
  });
});
