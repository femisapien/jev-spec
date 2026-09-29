import assert from 'node:assert/strict';
import { after, before, describe, test as it } from 'node:test';
import { extractGitDiff, listChangedPaths, parseNameStatus } from '../src/context/git-diff.js';
import { createTempGitRepo, type TempGitRepo } from './git-test-utils.js';
import { expect } from './test-utils.js';

describe('extractGitDiff against a real git repository', () => {
  let repo: TempGitRepo;

  before(async () => {
    repo = await createTempGitRepo();
    await repo.write('src/a.ts', 'export const a = 1;\n');
    repo.git('add', '-A');
    repo.git('commit', '--quiet', '-m', 'init');

    repo.git('checkout', '--quiet', '-b', 'feature');
    await repo.write('src/a.ts', 'export const a = 1;\nexport const b = 2;\n');
    repo.git('commit', '--quiet', '-am', 'add b');
  });

  after(async () => {
    await repo.cleanup();
  });

  it('REQ-GIT-03: reads a revision range as a revision and returns the files changed in it', async () => {
    const diff = await extractGitDiff({ diffRange: 'main...HEAD' }, repo.dir);

    expect(diff.changedPaths).toEqual(['src/a.ts']);
    expect(diff.files[0].formattedDiff).toContain('+export const b = 2;');
  });

  it('returns staged changes', async () => {
    await repo.write('src/staged.ts', 'export const staged = true;\n');
    repo.git('add', 'src/staged.ts');

    const diff = await extractGitDiff({ staged: true }, repo.dir);

    expect(diff.changedPaths).toEqual(['src/staged.ts']);
    expect(diff.files[0].status).toBe('added');

    repo.git('reset', '--quiet', 'src/staged.ts');
  });

  it('lists a staged non-ASCII name as it is on disk, not as git quotes it', async () => {
    repo.git('config', 'core.quotePath', 'true');
    await repo.write('src/日本.ts', 'export const x = 1;\n');
    repo.git('add', 'src/日本.ts');

    expect(await listChangedPaths({ staged: true }, repo.dir)).toEqual(['src/日本.ts']);

    repo.git('reset', '--quiet', 'src/日本.ts');
  });

  it('names a non-ASCII file as it is on disk, not as git quotes it', async () => {
    repo.git('config', 'core.quotePath', 'true');
    await repo.write('src/日本.ts', 'export const x = 1;\n');
    repo.git('add', 'src/日本.ts');

    const diff = await extractGitDiff({ staged: true }, repo.dir);

    expect(diff.changedPaths).toEqual(['src/日本.ts']);
    expect(diff.files.map((file) => [file.relativePath, file.status])).toEqual([
      ['src/日本.ts', 'added'],
    ]);
    expect(diff.files[0].formattedDiff).toContain('+export const x = 1;');

    repo.git('reset', '--quiet', 'src/日本.ts');
  });

  it('lists both paths of a renamed file', async () => {
    repo.git('mv', 'src/a.ts', 'src/renamed.ts');

    const diff = await extractGitDiff({ staged: true }, repo.dir);

    expect(diff.changedPaths).toEqual(['src/a.ts', 'src/renamed.ts']);
    expect(diff.files.map((file) => [file.previousPath, file.relativePath, file.status])).toEqual([
      ['src/a.ts', 'src/renamed.ts', 'renamed'],
    ]);

    repo.git('reset', '--quiet', '--hard', 'HEAD');
  });

  it('fails when git cannot produce the patch instead of returning part of it', async () => {
    await assert.rejects(
      () => extractGitDiff({ diffRange: 'no-such-branch...HEAD' }, repo.dir),
      /Failed to run git diff/
    );
  });

  it('fails when git cannot run the diff instead of reporting no change', async () => {
    await assert.rejects(
      () => listChangedPaths({ diffRange: 'no-such-branch...HEAD' }, repo.dir),
      /Failed to run git diff/
    );
  });
});

describe('parseNameStatus', () => {
  it('returns nothing for an empty diff', () => {
    expect(parseNameStatus('')).toEqual([]);
  });

  it('returns both paths of a rename and of a copy', () => {
    expect(
      parseNameStatus('M\0src/a.ts\0R100\0src/old.ts\0lib/new.ts\0C75\0src/b.ts\0src/c.ts\0')
    ).toEqual(['src/a.ts', 'src/old.ts', 'lib/new.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('keeps a path with spaces, tabs and newlines intact', () => {
    expect(parseNameStatus('A\0src/a b\tc\nd.ts\0')).toEqual(['src/a b\tc\nd.ts']);
  });

  it('REQ-DIFF-04: throws on output it cannot read', () => {
    for (const output of [
      'M\0src/a.ts',
      'M src/a.ts\n',
      'X\0src/a.ts\0',
      'M\0\0',
      'R100\0src/old.ts\0',
      '\0',
    ]) {
      assert.throws(
        () => parseNameStatus(output),
        /git diff --name-status/,
        JSON.stringify(output)
      );
    }
  });
});
