import * as fs from 'node:fs/promises';
import { loadConfig } from '../../config.js';
import { assertInsideRoot } from '../../context/path-security.js';
import { runChecks, UncheckedTargetsError } from '../../runner/engine.js';
import {
  formatMarkdownErrorReport,
  formatMarkdownReport,
  formatTerminalReport,
} from '../../runner/reporter.js';
import type { ErrorReport } from '../../types.js';

export interface CheckCliOptions {
  readonly config?: string;
  readonly target?: string;
  readonly format?: 'terminal' | 'markdown' | 'json';
  readonly output?: string;
  readonly staged?: boolean;
  readonly diff?: string | boolean;
  /** Forces the offline mock evaluator regardless of the configuration file. */
  readonly mock?: boolean;
  /** Validates configuration, spec parsing and file matching without evaluating anything. */
  readonly dryRun?: boolean;
  readonly cwd?: string;
}

function resolveGitDiffOptions(options: CheckCliOptions) {
  if (options.staged) {
    return { staged: true as const };
  }
  if (options.diff !== undefined) {
    if (options.diff === true || options.diff === '') {
      return { diffRange: 'HEAD' };
    }
    return { diffRange: String(options.diff) };
  }
  return undefined;
}

async function writeReport(outputText: string, outputPath: string | undefined): Promise<void> {
  if (outputPath) {
    await fs.writeFile(outputPath, `${outputText}\n`, 'utf-8');
  } else {
    console.log(outputText);
  }
}

/** The terminal format reports an error on stderr only; json and markdown also get a report. */
async function reportError(
  error: unknown,
  format: CheckCliOptions['format'],
  outputPath: string | undefined
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n[jev-spec error] ${message}`);
  if (format !== 'json' && format !== 'markdown') {
    return;
  }
  const report: ErrorReport = {
    passed: false,
    error: message,
    uncheckedTargets: error instanceof UncheckedTargetsError ? error.targets : [],
  };
  try {
    await writeReport(
      format === 'json' ? JSON.stringify(report, null, 2) : formatMarkdownErrorReport(report),
      outputPath
    );
  } catch (writeError: unknown) {
    const writeMessage = writeError instanceof Error ? writeError.message : String(writeError);
    console.error(`[jev-spec error] The report could not be written: ${writeMessage}`);
  }
}

export async function checkCommand(options: CheckCliOptions = {}): Promise<number> {
  let outputPath: string | undefined;
  try {
    const cwd = options.cwd ?? process.cwd();
    // Validate the report destination up front so a bad path never costs an evaluation.
    outputPath = options.output ? await assertInsideRoot(cwd, options.output) : undefined;

    const loadedConfig = await loadConfig(options.config, cwd);
    const config = options.mock
      ? { ...loadedConfig, client: { ...loadedConfig.client, mock: true } }
      : loadedConfig;

    const result = await runChecks(config, {
      cwd,
      target: options.target,
      gitDiff: resolveGitDiffOptions(options),
      dryRun: options.dryRun,
    });

    const format = options.format ?? 'terminal';
    let outputText: string;

    if (format === 'json') {
      outputText = JSON.stringify(result, null, 2);
    } else if (format === 'markdown') {
      outputText = formatMarkdownReport(result);
    } else {
      outputText = formatTerminalReport(result);
    }

    await writeReport(outputText, outputPath);

    return result.passed ? 0 : 1;
  } catch (error: unknown) {
    await reportError(error, options.format, outputPath);
    // Every error is a 2. Exit code 1 is reserved for a violated assertion.
    return 2;
  }
}
