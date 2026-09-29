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

/** One file of a diff: its status letter and path, or old and new path for a rename or a copy. */
interface ChangedFile {
  readonly status: string;
  readonly paths: readonly [string] | readonly [string, string];
}

/** Runs git with the limits every diff command shares, and fails on any error. */
async function runGitDiff(args: readonly string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', ...args], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
      timeout: GIT_DIFF_TIMEOUT_MS,
    });
    return stdout;
  } catch (error: unknown) {
    throw new Error(`Failed to run git diff: ${(error as Error).message ?? String(error)}`);
  }
}

/** The files of a diff in the order git lists them, with paths exactly as they are on disk. */
async function listChangedFiles(selection: string[], cwd: string): Promise<ChangedFile[]> {
  return parseChangedFiles(await runGitDiff(['--name-status', '-z', ...selection], cwd));
}

/**
 * Every path the diff touches, relative to the repository root: both paths of a renamed or copied
 * file, and names that git would quote in its display output, exactly as they are on disk.
 */
export async function listChangedPaths(
  options: GitDiffOptions,
  cwd: string = process.cwd()
): Promise<string[]> {
  return (await listChangedFiles(diffSelection(options), cwd)).flatMap((file) => file.paths);
}

/**
 * Parses the output of `git diff --name-status -z`: a status, then one path, or two for a rename
 * or a copy, each field ended by NUL. Anything else throws, so that a change can never go unseen.
 */
function parseChangedFiles(output: string): ChangedFile[] {
  const fields = output.split('\0');
  if (fields.pop() !== '') {
    throw new Error('Unexpected output from git diff --name-status: it does not end with NUL');
  }

  const files: ChangedFile[] = [];
  for (let i = 0; i < fields.length; ) {
    const status = fields[i++];
    const pathCount = /^[ADMTU]$/.test(status) ? 1 : /^[RC]\d{0,3}$/.test(status) ? 2 : 0;
    if (pathCount === 0) {
      throw new Error(`Unexpected status "${status}" from git diff --name-status`);
    }
    const paths = fields.slice(i, i + pathCount);
    i += pathCount;
    if (paths.length < pathCount || paths.some((changedPath) => !changedPath)) {
      throw new Error(`Missing path after status "${status}" from git diff --name-status`);
    }
    files.push({ status, paths: paths as [string] | [string, string] });
  }
  return files;
}

/** The paths of `git diff --name-status -z` output, both paths of a rename or a copy included. */
export function parseNameStatus(output: string): string[] {
  return parseChangedFiles(output).flatMap((file) => file.paths);
}

/**
 * Runs git diff and returns parsed file hunks. The paths come from `git diff --name-status -z`,
 * like those of a diff run, because the display headers of the patch quote unusual names and show
 * only the new path of a rename.
 */
export async function extractGitDiff(
  options: GitDiffOptions,
  cwd: string = process.cwd(),
  contextLines: number = DEFAULT_CONTEXT_LINES
): Promise<GitDiffResult> {
  const selection = diffSelection(options);
  const [changedFiles, rawDiff] = await Promise.all([
    listChangedFiles(selection, cwd),
    runGitDiff([`--unified=${contextLines}`, ...selection], cwd),
  ]);

  // git lists the files of both outputs in the same order. A difference in count means the two
  // outputs cannot be paired, so no file is named after the wrong patch.
  const chunks = splitDiffChunks(rawDiff);
  if (chunks.length !== changedFiles.length) {
    throw new Error(
      `git diff listed ${changedFiles.length} changed files but printed ${chunks.length} patches`
    );
  }

  return {
    files: chunks.map((chunk, index) => {
      const { paths } = changedFiles[index];
      return {
        ...parseDiffChunk(chunk, paths[paths.length - 1]),
        ...(paths.length === 2 && { previousPath: paths[0] }),
      };
    }),
    rawDiff,
    changedPaths: changedFiles.flatMap((file) => file.paths),
  };
}

function splitDiffChunks(rawDiff: string): string[] {
  return rawDiff.trim() ? rawDiff.split(/^diff --git /m).filter(Boolean) : [];
}

/**
 * Parses unified diff output into structured file entries. The paths are read from the display
 * headers, so a file whose name git quotes is left out; `extractGitDiff` does not rely on them.
 */
export function parseUnifiedDiff(rawDiff: string): ParsedDiffFile[] {
  return splitDiffChunks(rawDiff).flatMap((chunk) => {
    const pathMatch = (chunk.split('\n')[0] ?? '').match(/^a\/(.+?) b\/(.+)$/);
    return pathMatch ? [parseDiffChunk(chunk, pathMatch[2])] : [];
  });
}

function parseDiffChunk(chunk: string, relativePath: string): ParsedDiffFile {
  const lines = chunk.split('\n');
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

  return {
    relativePath,
    status,
    hunks,
    formattedDiff: `diff --git ${chunk}`.trimEnd(),
  };
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
