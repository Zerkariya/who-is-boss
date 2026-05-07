import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Role } from './roles.js';

const TRANSCRIPT_DIR = '.wib/transcripts';

export interface TranscriptEntry {
  timestamp: string;
  role: Role;
  agentName: string;
  prompt: string;
  output: string;
  exitCode: number;
  durationMs: number;
}

export function transcriptDir(projectRoot: string): string {
  return join(projectRoot, TRANSCRIPT_DIR);
}

export function appendTranscript(
  projectRoot: string,
  entry: TranscriptEntry,
): string {
  const dir = transcriptDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  const stamp = entry.timestamp.replace(/[:.]/g, '-');
  const file = join(dir, `${stamp}-${entry.role}.md`);
  writeFileSync(file, formatEntry(entry));
  return file;
}

function formatEntry(e: TranscriptEntry): string {
  return [
    `# ${e.role} (${e.agentName})`,
    `Time: ${e.timestamp}`,
    `Exit: ${e.exitCode}`,
    `Duration: ${e.durationMs}ms`,
    ``,
    `## Prompt`,
    ``,
    e.prompt.trim(),
    ``,
    `## Output`,
    ``,
    e.output.trim() || '(empty)',
    ``,
  ].join('\n');
}

/**
 * Return the most recent N transcript files concatenated as a single string.
 * Used to inject context when the user asks the consultant.
 */
export function recentTranscriptText(
  projectRoot: string,
  n: number,
): string {
  const dir = transcriptDir(projectRoot);
  if (!existsSync(dir)) return '';
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const recent = files.slice(-n);
  if (recent.length === 0) return '';
  return recent
    .map((f) => readFileSync(join(dir, f), 'utf8').trimEnd())
    .join('\n\n---\n\n');
}
