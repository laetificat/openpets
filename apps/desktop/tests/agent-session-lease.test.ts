import assert from "node:assert/strict";

import { findAgentSessionLease } from "../src/agent-session-lease.js";

// Two Claude sessions side by side, each with its own MCP server lease:
//   claude 100 → mcp 101 (pet "robot"),  hook: sh 102 → node 103
//   claude 200 → mcp 201 (pet "meowbyte"), hook: node 203 (no shell)
// An orphaned MCP server (601) was adopted by PID 1.
const parents = new Map<number, number>([
  [100, 50],
  [101, 100],
  [102, 100],
  [103, 102],
  [200, 50],
  [201, 200],
  [203, 200],
  [601, 1],
  [700, 1],
]);
const getParent = async (pid: number) => parents.get(pid) ?? null;

const leases = [
  { leaseId: "lease-robot", actualTargetPetId: "robot", clientPid: 101 },
  { leaseId: "lease-meowbyte", actualTargetPetId: "meowbyte", clientPid: 201 },
  { leaseId: "lease-orphan", actualTargetPetId: "orphan", clientPid: 601 },
];

// Each hook resolves to its own session's pet, also behind a shell.
assert.equal((await findAgentSessionLease(103, leases, getParent))?.actualTargetPetId, "robot");
assert.equal((await findAgentSessionLease(203, leases, getParent))?.actualTargetPetId, "meowbyte");

// A process outside any agent session (only PID 1 above it) matches nothing,
// even though the orphaned lease's parent is PID 1 as well.
assert.equal(await findAgentSessionLease(700, leases, getParent), null);
