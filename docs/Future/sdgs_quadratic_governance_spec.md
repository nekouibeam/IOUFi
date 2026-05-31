# Future Extension: SDGs DAO Quadratic Governance Proposal

## 1. Purpose

This document describes a future governance direction for the IOUFi project: a periodic SDGs activity DAO flow that combines proposal admission, quadratic voting, finalist approval, and treasury execution.

This is **not** the current production design. It is a forward-looking governance model that can be referenced in reports as a possible next-stage extension after the current reputation and DAO groundwork.

## 2. Design Goals

The proposed model tries to achieve four goals:

1. Allow every eligible account to participate in proposing SDGs activities.
2. Use quadratic voting so that influence grows with spend, but marginal cost rises rapidly.
3. Separate candidate selection from final approval to reduce noise from large proposal sets.
4. Keep treasury execution controlled and auditable.

The model assumes the DAO runs in repeated periods, for example once per campaign, quarter, or event cycle.

## 3. High-Level Flow

The governance cycle is divided into four stages:

1. Proposal stage
2. Election stage
3. Approval stage
4. Execution stage

Each stage has a clear start and end time, and the contract should reject actions that do not match the current stage.

### Stage 1: Proposal Stage

During the proposal window, every account with `currentRep > 0` may submit an SDGs activity proposal.

A proposal should at least include:

- proposer address
- activity title or description
- requested budget
- target recipient or beneficiary account
- optional execution payload or metadata

This stage is intended to collect a broad set of candidate ideas without requiring voting power at submission time.

### Stage 2: Election Stage

After the proposal window closes, the DAO enters the quadratic election stage.

In this stage:

- `currentRep` becomes the voting budget for the cycle.
- Each account may allocate vote units across one or more proposals.
- If an account allocates `n` vote units to a proposal, the actual cost is `n^2` rep.
- The spent rep is tracked as locked reputation until the cycle ends.

This stage is the core quadratic voting mechanism.

Important implication: the contract must store how many units each voter allocated to each proposal, not just whether they voted yes or no.

### Stage 3: Approval Stage

When the election stage ends, only the proposal with the highest vote-unit total enters the approval stage.

In this stage:

- all `lockedRep` is reset to zero for the cycle
- every account with `rep > 0` may cast a final yes/no vote on the finalist proposal
- if `yes > no`, the proposal passes
- if `no > yes`, the activity is rejected for this cycle

This stage acts as a final legitimacy check and simplifies execution by narrowing to one selected proposal.

### Stage 4: Execution Stage

If the finalist proposal passes, the DAO proceeds to execution.

The intended behavior is:

- transfer the approved budget from Treasury to the designated account
- optionally attach execution metadata or call data for the SDGs activity
- mark the proposal as executed and archive the cycle result

You noted that automated funding can be left unimplemented for now; that is acceptable for a staged rollout.

## 4. Required Data Model Changes

The current DAO contract is not enough for this flow. The future design would need new state concepts:

### 4.1 Cycle / Round State

The DAO needs a cycle identifier and stage state, for example:

- `cycleId`
- `stage`
- `proposalStartTs`
- `proposalEndTs`
- `electionEndTs`
- `approvalEndTs`

Without a cycle boundary, it is difficult to tell which proposals belong to which activity period.

### 4.2 Proposal State

Each proposal should store:

- proposer
- budget request
- recipient
- metadata
- total quadratic vote units received
- final approval tally
- execution status
- cycle association

### 4.3 Vote State

The DAO must store per-voter, per-proposal allocation data such as:

- vote units allocated
- rep cost consumed
- whether the allocation has been finalized
- whether the allocation has been unlocked

A simple `hasVoted` boolean is not sufficient for quadratic voting.

### 4.4 Reputation Accounting

`lockedRep` can remain the accounting mechanism for unused budget that has been committed in the cycle.

However, the contract must distinguish between:

- total current rep
- rep available to spend in the current cycle
- rep locked by quadratic allocations
- rep released after cycle close

## 5. Suggested Contract Behavior

A future implementation should ideally expose functions similar to the following behavior model:

- `startCycle(...)`
- `submitProposal(...)`
- `allocateVotes(proposalId, units)`
- `closeElection()`
- `startApproval(proposalId)`
- `castFinalVote(proposalId, support)`
- `closeApproval()`
- `executeApprovedProposal()`

This is only a conceptual API sketch. The exact interface can be simplified if needed, but the stage boundaries should remain explicit.

## 6. Why the Current Contract Cannot Be Extended Directly

The existing `SDGsDAO` contract is a simple weighted DAO:

- one address may vote once per proposal
- voting weight is linear and comes from `getVotingPower()`
- proposal execution is based on `votesFor > votesAgainst`
- there is no cycle concept
- there is no vote allocation or quadratic cost logic

This means the current contract can serve as a base for governance wiring, but not as the final structure for the proposed flow.

## 7. Main Risks and Constraints

### 7.1 No Snapshot Risk

If voting power is read live during the cycle, accounts could gain or lose rep mid-cycle and affect fairness.

A robust design should snapshot relevant voting power at cycle start.

### 7.2 Complexity Risk

The proposed design introduces two voting phases plus stage transitions.

This increases:

- contract complexity
- testing burden
- UI complexity
- audit surface

### 7.3 Locked Rep Lifecycle Risk

If rep is locked for quadratic voting, the contract must guarantee correct unlock behavior at stage transitions.

A missed unlock could trap user reputation permanently.

### 7.4 Proposal Explosion Risk

Because every positive-rep account may submit proposals, the proposal set could become too large.

A pruning rule, submission fee, or minimum reputation threshold may be required.

### 7.5 Governance Manipulation Risk

Quadratic voting reduces but does not eliminate manipulation.

Potential issues include:

- sybil behavior
- rep concentration
- proposal flooding
- strategic vote splitting across multiple proposals

### 7.6 Treasury Safety Risk

Automated execution must be protected by strict access control and replay protection.

Treasury transfers should only happen after the approved cycle is finalized.

## 8. Recommended Safeguards

For a future implementation, the following safeguards are recommended:

1. Snapshot voting power at cycle start.
2. Use explicit stage transitions with timestamps or block numbers.
3. Store cycle-specific proposal and vote records.
4. Require automatic unlock of all locked reputation when the cycle ends.
5. Limit proposal count per cycle or require a minimum rep threshold.
6. Keep execution separate from approval to reduce the chance of accidental fund release.
7. Add tests for stage misuse, double voting, unlock failures, and edge cases around zero-rep accounts.

## 9. Recommended Development Order

If this direction is ever implemented, the safest order is:

1. Add cycle and stage state to the DAO.
2. Implement proposal submission rules and cycle scoping.
3. Implement quadratic vote allocation and rep locking.
4. Implement finalist selection and final approval.
5. Add treasury execution.
6. Add frontend support for stage-aware proposal and vote flows.
7. Add indexer/API support for proposal lists, stage status, and cycle history.

## 10. MVP Scope Recommendation

If the project ever returns to this idea, the best MVP is not the full design above.

A smaller first version would be:

- one active cycle at a time
- proposal stage and one voting stage only
- quadratic vote allocation on-chain
- no finalist approval stage yet
- manual treasury execution by the DAO owner or authorized executor

This smaller scope would validate the governance mechanics before introducing the more complex two-stage voting model.

## 11. Conclusion

The proposed SDGs DAO flow is conceptually sound and suitable as a future governance extension.

Its biggest strengths are:

- better participation structure
- stronger anti-whale behavior than linear voting
- clearer period-based governance
- more meaningful linkage between rep and governance

Its biggest weaknesses are:

- significantly higher implementation complexity
- need for snapshots and cycle state
- higher testing and audit cost

For reporting purposes, this can be described as a promising but non-trivial future direction that should be implemented only after the current reputation and DAO foundation is stable.
