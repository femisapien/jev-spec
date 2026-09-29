import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { listChangedPaths, listStagedFiles, readStagedFile } from './git-diff.js';
import { matchesGlobPatterns, resolveGlobPatterns } from './glob-matcher.js';
import {
  assertInsideRoot,
  MAX_FILE_COUNT,
  MAX_FILE_SIZE_BYTES,
  validateGlobPattern,
} from './path-security.js';
import type { CodeExtractionOptions, GitDiffOptions } from './types.js';

export interface CodeFileContext {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly content: string;
  readonly lineCount: number;
  readonly source: 'file';
}

export interface ExtractedCodeContext {
  readonly files: readonly CodeFileContext[];
  readonly combinedPromptContext: string;
  readonly totalLines: number;
  /** `diff` when a diff decided whether the target is part of the run. The content is always whole files. */
  readonly mode: 'full' | 'diff';
  /** True when the combined context was cut at the character budget. */
  readonly truncated: boolean;
  /** Matched files left out because they are larger than `MAX_FILE_SIZE_BYTES`. */
  readonly oversizedFiles: readonly string[];
  /** Matched files left out because reading them failed, with the error code. */
  readonly unreadableFiles: readonly UnreadableFile[];
  /** Files the target matched. Above `MAX_FILE_COUNT`, none of them is read. */
  readonly matchedFileCount: number;
  /** Diff run only: the changed files that belong to the target. Empty when the target is skipped. */
  readonly changedFiles?: readonly string[];
}

export interface UnreadableFile {
  readonly file: string;
  readonly code: string;
}

export const DEFAULT_MAX_CHARS = 120_000;

interface ReadFiles {
  readonly files: CodeFileContext[];
  readonly oversizedFiles: string[];
  readonly unreadableFiles: UnreadableFile[];
  readonly matchedFileCount: number;
}

function tooManyFiles(matchedFileCount: number): ReadFiles {
  return { files: [], oversizedFiles: [], unreadableFiles: [], matchedFileCount };
}

async function readFileWithinLimits(
  absolutePath: string,
  relativePath: string
): Promise<CodeFileContext | 'oversized' | null> {
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    return null;
  }
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    return 'oversized';
  }

  const content = await fs.readFile(absolutePath, 'utf-8');
  const lines = content.split('\n');
  return {
    relativePath,
    absolutePath,
    content,
    lineCount: lines.length,
    source: 'file',
  };
}

/**
 * Reads the code of a target.
 *
 * In a diff run (`--staged`, `--diff`) the diff only decides whether the target is part of the
 * run: a target none of whose files changed comes back empty and is skipped. A target that was
 * touched is read in full, exactly as in a full run. Rubrics ask about the target as a whole, and
 * what they ask about is usually outside the changed hunks.
 */
export async function extractCodeContext(
  filePatterns: readonly string[],
  options: CodeExtractionOptions = {}
): Promise<ExtractedCodeContext> {
  const cwd = options.cwd ?? process.cwd();
  const maxChars = options.maxTotalChars ?? DEFAULT_MAX_CHARS;

  const gitDiff = options.gitDiff;
  if (gitDiff?.staged || gitDiff?.diffRange) {
    const changedFiles = await changedFilesMatching(filePatterns, cwd, gitDiff);
    if (changedFiles.length === 0) {
      return {
        ...buildExtractedContext(
          { files: [], oversizedFiles: [], unreadableFiles: [], matchedFileCount: 0 },
          'diff',
          maxChars
        ),
        changedFiles,
      };
    }
    // A staged run judges what is about to be committed. After `git add -p` the working tree
    // holds something else.
    const read = gitDiff.staged
      ? await readStagedFiles(filePatterns, cwd)
      : await readMatchingFiles(filePatterns, cwd);
    return { ...buildExtractedContext(read, 'diff', maxChars), changedFiles };
  }

  return buildExtractedContext(await readMatchingFiles(filePatterns, cwd), 'full', maxChars);
}

async function readMatchingFiles(filePatterns: readonly string[], cwd: string): Promise<ReadFiles> {
  return readFiles(await resolveGlobPatterns(filePatterns, cwd), cwd);
}

/**
 * Reads files of the working tree. A file that cannot be read is recorded, never skipped: a check
 * of what is left would pass on code the model never saw.
 */
async function readFiles(relativePaths: readonly string[], cwd: string): Promise<ReadFiles> {
  if (relativePaths.length > MAX_FILE_COUNT) {
    return tooManyFiles(relativePaths.length);
  }

  const read: ReadFiles = {
    files: [],
    oversizedFiles: [],
    unreadableFiles: [],
    matchedFileCount: relativePaths.length,
  };
  for (const relPath of relativePaths) {
    const absolutePath = await assertInsideRoot(cwd, relPath);
    try {
      const fileContext = await readFileWithinLimits(absolutePath, relPath);
      if (fileContext === 'oversized') {
        read.oversizedFiles.push(relPath);
      } else if (fileContext) {
        read.files.push(fileContext);
      }
    } catch (error: unknown) {
      read.unreadableFiles.push({
        file: relPath,
        code: (error as NodeJS.ErrnoException).code ?? String(error),
      });
    }
  }
  return read;
}

/** The files of the target as they are staged in the git index. */
async function readStagedFiles(filePatterns: readonly string[], cwd: string): Promise<ReadFiles> {
  for (const pattern of filePatterns) {
    validateGlobPattern(pattern.startsWith('!') ? pattern.slice(1) : pattern);
  }

  const staged = (await listStagedFiles(cwd)).filter((relativePath) =>
    matchesGlobPatterns(relativePath, filePatterns)
  );
  if (staged.length > MAX_FILE_COUNT) {
    return tooManyFiles(staged.length);
  }

  const files: CodeFileContext[] = [];
  const oversizedFiles: string[] = [];
  for (const relativePath of staged) {
    const content = await readStagedFile(relativePath, cwd, MAX_FILE_SIZE_BYTES);
    if (content === null) {
      oversizedFiles.push(relativePath);
      continue;
    }
    files.push({
      relativePath,
      absolutePath: path.resolve(cwd, relativePath),
      content,
      lineCount: content.split('\n').length,
      source: 'file',
    });
  }
  return { files, oversizedFiles, unreadableFiles: [], matchedFileCount: staged.length };
}

/**
 * The paths of the diff that belong to the target: deleted files, and both the old and the new
 * path of a renamed file, so that code moved out of a target still selects it.
 */
async function changedFilesMatching(
  filePatterns: readonly string[],
  cwd: string,
  gitDiff: GitDiffOptions
): Promise<string[]> {
  const changedPaths = await listChangedPaths(gitDiff, cwd);
  return changedPaths.filter((relativePath) => matchesGlobPatterns(relativePath, filePatterns));
}

function buildExtractedContext(
  { files, oversizedFiles, unreadableFiles, matchedFileCount }: ReadFiles,
  mode: 'full' | 'diff',
  maxChars: number
): ExtractedCodeContext {
  let combinedPromptContext = files
    .map((file) => `--- File: ${file.relativePath} ---\n${file.content}`)
    .join('\n\n');

  const truncated = combinedPromptContext.length > maxChars;
  if (truncated) {
    combinedPromptContext = `${combinedPromptContext.slice(0, maxChars)}\n\n[... truncated for token budget ...]`;
  }

  const totalLines = files.reduce((acc, file) => acc + file.lineCount, 0);

  return {
    files,
    combinedPromptContext,
    totalLines,
    mode,
    truncated,
    oversizedFiles,
    unreadableFiles,
    matchedFileCount,
  };
}

/**
 * Backward-compatible helper for explicit file path lists.
 */
export async function extractCodeFromPaths(
  filePaths: readonly string[],
  cwd: string = process.cwd()
): Promise<ExtractedCodeContext> {
  return buildExtractedContext(await readFiles(filePaths, cwd), 'full', DEFAULT_MAX_CHARS);
}
