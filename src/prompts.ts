import type { Role } from './roles.js';

export interface WrapOptions {
  /** For reviewer/researcher: the temporary worktree they're isolated in. */
  worktreePath?: string;
  /** Original project path (the boss's actual repo). */
  originPath?: string;
  /** For consultant: recent transcript text to prepend as context. */
  recentTranscripts?: string;
}

export function wrapPrompt(
  role: Role,
  userPrompt: string,
  opts: WrapOptions = {},
): string {
  switch (role) {
    case 'boss':
      return userPrompt;

    case 'reviewer':
      return banner(
        'reviewer',
        [
          `You are the reviewer. The boss has handed you a plan, diff, or piece of code to audit.`,
          `Your job: read the local files, check the boss's reasoning, search official docs, and report findings or gaps.`,
          `You may NOT write production code, and you may NOT modify the boss's tracked files.`,
          opts.worktreePath
            ? `You are running in an isolated git worktree at ${opts.worktreePath} — any changes you make here will be DISCARDED on exit, so the boss's repo at ${opts.originPath ?? '(origin)'} is not affected. You may freely create temporary scratch files inside this worktree to help your analysis.`
            : `Treat the project as read-only.`,
          `When you need community sources, prior art on the web, or third-party project code, say so in your report and recommend invoking the researcher rather than guessing.`,
        ],
        userPrompt,
      );

    case 'researcher':
      return banner(
        'researcher',
        [
          `You are the researcher. Your scope is the OUTSIDE world: community projects, blog posts, alternative implementations, prior art, comparable libraries — everything beyond this repo's local files and the official docs of the immediate dependencies.`,
          `Local file reading, codebase audits, and reading the official docs of the project's own stack are the reviewer's job, not yours. If a question is purely about the local repo, say so and stop.`,
          `You may NOT modify any files in the boss's project.`,
          opts.worktreePath
            ? `You are running in an isolated git worktree at ${opts.worktreePath} — any changes you make will be DISCARDED on exit. The boss's repo at ${opts.originPath ?? '(origin)'} is not affected.`
            : ``,
        ].filter(Boolean),
        userPrompt,
      );

    case 'consultant': {
      const ctx = opts.recentTranscripts?.trim();
      return banner(
        'consultant',
        [
          `You are the consultant. The user is asking you a question directly — the boss is busy writing code and must not be interrupted.`,
          `Answer the user's question clearly and concisely. You are NOT writing code into this project; you are explaining, comparing, or recommending.`,
          `Your current working directory is a dedicated session dir, separate from the boss's repo, so your conversation memory is isolated. The actual project lives at the path in the env var \`WIB_PROJECT_ROOT\` — read from it if needed, but do not modify it.`,
          ctx
            ? `Below is recent activity from boss / reviewer / researcher in this project, for your context. Use it only if relevant to the user's question.`
            : `(No recent boss/reviewer/researcher activity has been recorded yet for this project.)`,
        ],
        userPrompt,
        ctx
          ? `--- Recent project activity ---\n${ctx}\n--- End of activity ---`
          : undefined,
      );
    }
  }
}

function banner(
  role: Role,
  bullets: string[],
  userPrompt: string,
  extraContext?: string,
): string {
  const parts = [
    `[who-is-boss / role=${role}]`,
    ...bullets.map((b) => b),
    ``,
  ];
  if (extraContext) {
    parts.push(extraContext, '');
  }
  parts.push('--- User request ---', userPrompt);
  return parts.join('\n');
}
