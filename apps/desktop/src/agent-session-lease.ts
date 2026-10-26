/**
 * agent-session-lease.ts
 *
 * Finds the explicit lease that belongs to the same agent session as a
 * short-lived helper process, so that helper (e.g. a Claude Code hook) can
 * speak through that session's pet instead of the default pet.
 *
 * An agent such as Claude Code spawns both its long-lived MCP server (which
 * holds the lease) and its hooks. The MCP server's parent is the agent
 * process; the hook has that same agent process somewhere in its PPID chain
 * (usually behind a shell). Matching on that shared ancestor ties the hook to
 * its own session even when several sessions run side by side.
 *
 * Pure: no Electron, filesystem, or logging imports. The parent-PID lookup is
 * injected so tests can supply a fake process tree.
 */

export interface AgentSessionLeaseCandidate {
  readonly leaseId: string;
  readonly actualTargetPetId: string;
  readonly clientPid?: number;
}

const maxAncestorDepth = 10;

export async function findAgentSessionLease<T extends AgentSessionLeaseCandidate>(
  helperPid: number,
  explicitLeases: readonly T[],
  getParent: (pid: number) => Promise<number | null>,
): Promise<T | null> {
  const helperAncestors = await collectAncestors(helperPid, getParent);
  if (helperAncestors.length === 0) return null;

  const leasesByAgentPid = new Map<number, T>();
  for (const lease of explicitLeases) {
    if (lease.clientPid === undefined || lease.clientPid === helperPid) continue;

    const agentPid = await getParent(lease.clientPid);
    if (agentPid !== null && !leasesByAgentPid.has(agentPid)) leasesByAgentPid.set(agentPid, lease);
  }

  // Nearest ancestor wins: an agent started from another agent's shell has both
  // agents above its hooks, and the hooks belong to the inner one.
  for (const ancestor of helperAncestors) {
    const lease = leasesByAgentPid.get(ancestor);
    if (lease) return lease;
  }

  return null;
}

/** Ancestors of `pid`, nearest first. */
async function collectAncestors(pid: number, getParent: (pid: number) => Promise<number | null>): Promise<number[]> {
  const ancestors: number[] = [];
  let current = pid;

  for (let depth = 0; depth < maxAncestorDepth; depth++) {
    const parent = await getParent(current);
    // PID 1 (launchd/init) adopts orphans; treating it as a shared ancestor
    // would tie unrelated sessions together.
    if (parent === null || parent <= 1) break;
    if (ancestors.includes(parent)) break;

    ancestors.push(parent);
    current = parent;
  }

  return ancestors;
}
