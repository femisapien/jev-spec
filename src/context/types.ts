export interface GitDiffOptions {
  readonly staged?: boolean;
  readonly diffRange?: string;
}

export interface ParsedDiffHunk {
  readonly startLine: number;
  readonly lineCount: number;
  readonly content: string;
}

export interface ParsedDiffFile {
  /** The path after the change: the new path of a renamed or copied file. */
  readonly relativePath: string;
  /** Renamed or copied file only: the path before the change. */
  readonly previousPath?: string;
  readonly status: 'modified' | 'added' | 'deleted' | 'renamed';
  readonly hunks: readonly ParsedDiffHunk[];
  readonly formattedDiff: string;
}

export interface GitDiffResult {
  readonly files: readonly ParsedDiffFile[];
  readonly rawDiff: string;
  /** Every path the diff touches, including the old path of a renamed or copied file. */
  readonly changedPaths: readonly string[];
}

export interface CodeExtractionOptions {
  readonly cwd?: string;
  readonly gitDiff?: GitDiffOptions;
  readonly maxTotalChars?: number;
}
