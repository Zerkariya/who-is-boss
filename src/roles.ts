export const ROLES = ['boss', 'reviewer', 'researcher', 'consultant'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  boss: 'The only agent that writes code. Drives the project and delegates everything else.',
  reviewer: 'Reviews plans, audits code, explains existing code, searches the codebase.',
  researcher: 'Investigates external sources, reads docs, gathers background information.',
  consultant: 'Answers questions and offers a second opinion when the boss is unsure.',
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
