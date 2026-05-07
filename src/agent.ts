import { spawn } from 'node:child_process';
import type { AgentSpec } from './config.js';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface RunOptions {
  /** Stream agent stdout/stderr to the parent process as it arrives. */
  stream?: boolean;
}

const DEFAULT_TIMEOUT_SEC = 300;

export async function runAgent(
  spec: AgentSpec,
  prompt: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const args = [...(spec.args ?? [])];
  if ((spec.promptMode ?? 'argv') === 'argv') {
    args.push(prompt);
  }
  const env = { ...process.env, ...(spec.env ?? {}) };
  const timeoutMs = (spec.timeoutSec ?? DEFAULT_TIMEOUT_SEC) * 1000;

  return new Promise((resolvePromise, reject) => {
    const start = Date.now();
    const child = spawn(spec.command, args, {
      cwd: spec.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdout += text;
      if (options.stream) process.stdout.write(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      if (options.stream) process.stderr.write(text);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to spawn "${spec.command}" for agent "${spec.name}": ${err.message}`,
        ),
      );
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      if (timedOut) {
        reject(
          new Error(
            `Agent "${spec.name}" timed out after ${spec.timeoutSec ?? DEFAULT_TIMEOUT_SEC}s`,
          ),
        );
        return;
      }
      resolvePromise({
        stdout,
        stderr,
        exitCode: code ?? (signal ? 128 : 1),
        durationMs,
      });
    });

    if ((spec.promptMode ?? 'argv') === 'stdin') {
      child.stdin.write(prompt);
    }
    child.stdin.end();
  });
}
