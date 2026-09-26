import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ManifestStatus = 'failed' | 'pending' | 'skipped_duplicate' | 'succeeded';

export interface ManifestEntry {
  recordedAt: string;
  url: string;
  sourceProductId?: string;
  status: ManifestStatus;
  attempts: number;
  httpStatus?: number;
  latencyMs?: number;
  errorCode?: string;
  payloadChecksum?: string;
}

export interface FailureEntry {
  recordedAt: string;
  url: string;
  sourceProductId?: string;
  attempts: number;
  httpStatus?: number;
  errorCode: string;
  message: string;
  stopRun: boolean;
}

export interface RunSummary {
  runId: string;
  source: string;
  startedAt: string;
  finishedAt: string;
  discovered: number;
  requested: number;
  succeeded: number;
  failed: number;
  duplicates: number;
  uniqueProducts: number;
  stoppedReason: string | null;
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

export function appendManifest(filePath: string, entry: ManifestEntry): Promise<void> {
  return appendJsonLine(filePath, entry);
}

export function appendFailure(filePath: string, entry: FailureEntry): Promise<void> {
  return appendJsonLine(filePath, entry);
}

export async function ensureJsonLineFile(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, '', 'utf8');
}

export async function loadManifest(filePath: string): Promise<ManifestEntry[]> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  return content
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as ManifestEntry;
      } catch (error) {
        throw new Error(`Invalid manifest.jsonl at line ${index + 1}`, { cause: error });
      }
    });
}

export function latestManifestByUrl(entries: ManifestEntry[]): Map<string, ManifestEntry> {
  const latest = new Map<string, ManifestEntry>();
  for (const entry of entries) latest.set(entry.url, entry);
  return latest;
}

export function buildRunSummary(options: {
  runId: string;
  source: string;
  startedAt: string;
  finishedAt: string;
  discovered: number;
  manifest: ManifestEntry[];
  uniqueProducts: number;
  stoppedReason: string | null;
}): RunSummary {
  const terminal = [...latestManifestByUrl(options.manifest).values()].filter(
    (entry) => entry.status !== 'pending',
  );
  return {
    runId: options.runId,
    source: options.source,
    startedAt: options.startedAt,
    finishedAt: options.finishedAt,
    discovered: options.discovered,
    requested: terminal.length,
    succeeded: options.uniqueProducts,
    failed: terminal.filter((entry) => entry.status === 'failed').length,
    duplicates: terminal.filter((entry) => entry.status === 'skipped_duplicate').length,
    uniqueProducts: options.uniqueProducts,
    stoppedReason: options.stoppedReason,
  };
}

export async function writeRunSummary(filePath: string, summary: RunSummary): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}
