# IOUFi Reputation System Explanation

The reputation system in IOUFi is designed to reward positive contributions to the ecosystem while providing mechanisms to resist Sybil attacks (reputation farming) between collaborating accounts. The core logic is implemented across two main contracts: `IOUNFT.sol` (managing state and business logic) and `ReputationLedger.sol` (managing balances and decay).

## 1. Reputation Bases (Raw Base)
When an IOU is minted, a "raw" reputation base is assigned to both the creator and the fulfiller. The base depends on the type of IOU:
- **Social IOU** (0 Collateral):
  - Creator Base: `10`
  - Fulfiller Base: `8`
- **Bounty IOU** (>0 Collateral):
  - Creator Base: `8`
  - Fulfiller Base: `10`

This distinction provides slight incentives depending on whether the interaction is purely social or backed by financial collateral.

## 2. Sybil Resistance (Decay Mechanism)
To prevent two accounts from constantly trading IOUs back and forth to farm reputation, a decay mechanism is applied when the IOU is accepted and the reputation bases are frozen (`_freezeRepBase`).

- **Interaction Tracking:** The `ReputationLedger` tracks interactions between any two addresses. Every time they interact, a `decayLevel` increases.
- **Decayed Amount Calculation:** The raw base is right-shifted by the `decayLevel` (`adjusted = base >> level`), effectively halving the reputation yield for every recent interaction. It caps at a maximum shift of 8. If the value decays to `0` but the base was `>0`, it defaults to `1`.
- **Recovery:** The `decayLevel` recovers over time. For every 10 days (`DECAY_WINDOW`) that pass without an interaction between the two addresses, the `decayLevel` is reduced by 1.

## 3. Pre-Awarded Reputation
When a fulfiller accepts an IOU, the creator is "pre-awarded" a portion of their reputation early. Specifically, the creator immediately receives `50%` of their decayed reputation base (`decayedCreatorRepBase * 5 / 10`).

## 4. Settlement and Ratings
When an active IOU is completed and settled (or closed via a close request), the creator provides a rating which determines the final reputation payout for both parties.

The payout scales depending on the rating (applied to the **decayed** reputation bases):
- **Great (Rating = 2):**
  - Creator gets: `50%` of their decayed base.
  - Fulfiller gets: `100%` of their decayed base.
- **Neutral (Rating = 1):**
  - Creator gets: `30%` of their decayed base.
  - Fulfiller gets: `60%` of their decayed base.
- **Bad (Rating = 0):**
  - Creator gets: `10%` of their decayed base.
  - Fulfiller gets: `0`. Additionally, the fulfiller is **slashed** by `1` reputation point. The IOU is marked as an `unhappyClose`.

## 5. Ledger Balances and Voting Power
The `ReputationLedger` maintains three distinct values for each user:
1. `currentRep`: The user's active, usable reputation balance.
2. `lifetimeRep`: A continuously increasing counter of all reputation ever earned (never decreases).
3. `lockedRep`: Reputation that is currently locked by the DAO (e.g., for voting or creating proposals).

**Voting Power:** A user's voting power in the DAO is calculated as `currentRep - lockedRep`.
