import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertGitRevision, GIT_DIFF_TIMEOUT_MS } from './git-revision.js';
import type { GitDiffOptions, GitDiffResult, ParsedDiffFile, ParsedDiffHunk } from './types.js';

const execFileAsync = promisify(execFile);

const DEFAULT_CONTEXT_LINES = 3;

/** Paths of every file in the git index, relative to `cwd`. */
export async function listStagedFiles(cwd: string = process.cwd()): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '-z'], {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    encoding: 'utf-8',
    timeout: GIT_DIFF_TIMEOUT_MS,
  });
  return stdout.split('\0').filter(Boolean);
}

/**
 * Content of a file as it is staged, or `null` when it is larger than `maxBytes`. The path goes
 * to git as one argument behind a colon, so it can be read neither as an option nor by a shell.
 */
export async function readStagedFile(
  relativePath: string,
  cwd: string,
  maxBytes: number
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['show', `:${relativePath}`], {
      cwd,
      maxBuffer: maxBytes,
      encoding: 'utf-8',
      timeout: GIT_DIFF_TIMEOUT_MS,
    });
    return stdout;
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return null;
    }
    throw error;
  }
}

/** The arguments of `git diff` that choose what it compares. */
function diffSelection(options: GitDiffOptions): string[] {
  if (options.staged) {
    return ['--staged'];
  }
  if (options.diffRange) {
    assertGitRevision(options.diffRange);
    // The revision must precede `--`; anything after it is parsed as a pathspec.
    return ['--end-of-options', options.diffRange, '--'];
  }
  return [];
}

/**
 * Every path the diff touches, relative to the repository root: both paths of a renamed or copied
 * file, and names that git would quote in its display output, exactly as they are on disk.
 */
export async function listChangedPaths(
  options: GitDiffOptions,
  cwd: string = process.cwd()
): Promise<string[]> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      'git',
      ['diff', '--name-status', '-z', ...diffSelection(options)],
      {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf-8',
        timeout: GIT_DIFF_TIMEOUT_MS,
      }
    ));
  } catch (error: unknown) {
    throw new Error(`Failed to run git diff: ${(error as Error).message ?? String(error)}`);
  }
  return parseNameStatus(stdout);
}

/**
 * Parses the output of `git diff --name-status -z`: a status, then one path, or two for a rename
 * or a copy, each field ended by NUL. Anything else throws, so that a change can never go unseen.
 */
export function parseNameStatus(output: string): string[] {
  const fields = output.split('\0');
  if (fields.pop() !== '') {
    throw new Error('Unexpected output from git diff --name-status: it does not end with NUL');
  }

  const paths: string[] = [];
  for (let i = 0; i < fields.length; ) {
    const status = fields[i++];
    const pathCount = /^[ADMTU]$/.test(status) ? 1 : /^[RC]\d{0,3}$/.test(status) ? 2 : 0;
    if (pathCount === 0) {
      throw new Error(`Unexpected status "${status}" from git diff --name-status`);
    }
    for (let n = 0; n < pathCount; n++) {
      const changedPath = fields[i++];
      if (!changedPath) {
        throw new Error(`Missing path after status "${status}" from git diff --name-status`);
      }
      paths.push(changedPath);
    }
  }
  return paths;
}

/**
 * Runs git diff and returns parsed file hunks.
 */
export async function extractGitDiff(
  options: GitDiffOptions,
  cwd: string = process.cwd(),
  contextLines: number = DEFAULT_CONTEXT_LINES
): Promise<GitDiffResult> {
  const args = ['diff', `--unified=${contextLines}`, ...diffSelection(options)];

  let stdout = '';
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
      timeout: GIT_DIFF_TIMEOUT_MS,
    });
    stdout = result.stdout ?? '';
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    if (execError.stdout) {
      stdout = execError.stdout;
    } else {
      throw new Error(`Failed to run git diff: ${execError.message ?? String(error)}`);
    }
  }

  const files = parseUnifiedDiff(stdout);
  return {
    files,
    rawDiff: stdout,
    changedPaths: files.map((file) => file.relativePath),
  };
}

/**
 * Parses unified diff output into structured file entries.
 */
export function parseUnifiedDiff(rawDiff: string): ParsedDiffFile[] {
  if (!rawDiff.trim()) {
    return [];
  }

  const files: ParsedDiffFile[] = [];
  const chunks = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    const header = lines[0] ?? '';
    const pathMatch = header.match(/^a\/(.+?) b\/(.+)$/);
    if (!pathMatch) {
      continue;
    }

    const relativePath = pathMatch[2];
    let status: ParsedDiffFile['status'] = 'modified';
    if (lines.some((line) => line.startsWith('new file mode'))) {
      status = 'added';
    } else if (lines.some((line) => line.startsWith('deleted file mode'))) {
      status = 'deleted';
    } else if (lines.some((line) => line.startsWith('rename from'))) {
      status = 'renamed';
    }

    const hunks: ParsedDiffHunk[] = [];
    let currentHunk: ParsedDiffHunk | null = null;

    for (const line of lines) {
      const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        currentHunk = {
          startLine: Number.parseInt(hunkMatch[2], 10),
          lineCount: 0,
          content: line,
        };
        continue;
      }

      if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        currentHunk = {
          ...currentHunk,
          lineCount: currentHunk.lineCount + 1,
          content: `${currentHunk.content}\n${line}`,
        };
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    files.push({
      relativePath,
      status,
      hunks,
      formattedDiff: `diff --git ${chunk}`.trimEnd(),
    });
  }

  return files;
}

/**
 * Formats parsed diff files into prompt-friendly context.
 */
export function formatDiffContext(files: readonly ParsedDiffFile[]): string {
  if (files.length === 0) {
    return '(no matching diff hunks)';
  }

  return files
    .map((file) => {
      const header = `--- Diff: ${file.relativePath} (${file.status}) ---`;
      const body = file.formattedDiff.replace(/^diff --git /, '');
      return `${header}\n${body}`;
    })
    .join('\n\n');
}
