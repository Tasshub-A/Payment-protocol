# Software Tool – Solana Anchor Payment Program

**Software Tool** is a minimal, non-custodial Solana program built with Anchor that enables atomic payments between a buyer, a creator, and a platform.

The program is intentionally designed as a **neutral software utility**:
- No owner
- No admin
- No custody
- No stored balances
- No upgrade control (after authority burn)

It performs **direct, atomic transfers** and emits structured events for off-chain indexing.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Program Design Principles](#program-structure)
- [Instructions](#instructions)
  - [purchase_with_sol](#purchase_with_sol)
  - [purchase_with_token](#purchase_with_token)
- [Fee Logic](#fee-logic)
- [Event Model](#event-model)
- [Security & Legal Constraints](#security--legal-constraints)
- [What We Explicitly Do NOT Support](#what-we-explicitly-do-not-support)
- [Testing](#testing)
- [Upgrade & Deployment Policy](#deployment-policy)

---

## Architecture Overview

The program acts purely as a **stateless payment router**.

It does not:
- Store funds
- Store configuration
- Store privileged addresses
- Maintain internal balances

All wallets are passed dynamically at runtime.

```mermaid
graph TD
    Buyer((Buyer))
    Creator((Creator))
    Platform((Platform))
    Program[Software Tool Program]

    Buyer -- SOL / SPL --> Program
    Program -- Creator Share --> Creator
    Program -- Platform Fee --> Platform
    Program -- Emit Event --> Indexer
````

### Key Properties

* **Atomic Execution** — both transfers succeed or both fail.
* **Zero Program Balance** — the program must never retain funds.
* **Runtime-configurable fee** — passed per transaction.
* **No privileged authority** — no owner, no pause, no blacklist.

---

## Program Structure

Program ID:

```
9svVtb2TeXLDu7zy5XYni3FieghQu3KA7Q564VSb2H8w
```

Main entrypoints:

```rust
purchase_with_sol(...)
purchase_with_token(...)
```

---

# Instructions

---

## purchase_with_sol

Allows a buyer to purchase content using native SOL.

### Accounts

* `buyer` (Signer, mutable)
* `creator` (UncheckedAccount, mutable)
* `platform` (UncheckedAccount, mutable)
* `system_program`

### Flow

1. Validate `fee_bps <= MAX_FEE_BPS`
2. Compute:

   * `fee_amount`
   * `creator_amount`
3. Transfer SOL:

   * buyer → creator
   * buyer → platform
4. Emit `PurchaseEvent`

### SOL Transfer Logic

Uses CPI to:

Solana System Program

Both transfers occur within the same instruction context.

If either transfer fails → entire transaction fails.

---

## purchase_with_token

Allows a buyer to purchase content using an SPL token (e.g., USDC).

### Accounts

* `buyer` (Signer)
* `creator`
* `platform`
* `mint`
* `buyer_token_account`
* `creator_token_account`
* `platform_token_account`
* `token_program`
* `associated_token_program`
* `system_program`

### Anchor Account Constraints

The program enforces:

* `buyer_token_account.owner == buyer`
* `buyer_token_account.mint == mint`
* `creator_token_account.owner == creator`
* `platform_token_account.owner == platform`

All constraints are enforced at the Anchor level.

### Token Transfers

Uses CPI into:

SPL Token Program

Two atomic transfers:

* buyer → creator (creator_amount)
* buyer → platform (platform_fee)

If either fails → transaction reverts.

---

# Fee Logic

The fee is passed as:

```
fee_bps: u16
```

Where:

```
10000 BPS = 100%
```

### Hard Cap

```
MAX_FEE_BPS = 3000 (30%)
```

This prevents abusive fee configurations.

The program does **not store** fee configuration.

Each platform can define its own fee model externally.

### Safe Arithmetic

All math uses:

* `checked_mul`
* `checked_div`
* `checked_sub`

Prevents:

* Overflow
* Underflow

---

# Event Model

Each purchase emits:

```rust
PurchaseEvent {
    content_id: String,
    purchase_id: String,
    buyer: Pubkey,
    creator: Pubkey,
    platform: Pubkey,
    mint: Option<Pubkey>,
    currency_type: CurrencyType,
    decimals: u8,
    amount: u64,
    creator_amount: u64,
    platform_fee: u64,
    fee_bps: u16,
    slot: u64,
    timestamp: i64,
}
```

### Why Events Matter

Events are the only source of:

* Purchase indexing
* Idempotency tracking
* Backend accounting
* Revenue analytics

The program itself stores no state.

---

# Critical Design Constraints (Non-Negotiable)

The program intentionally does NOT include:

### ❌ No Owner / Admin

No stored `Pubkey` with special privileges.

### ❌ No Pause Function

Payments cannot be stopped.

### ❌ No Blacklist

No wallet filtering.

### ❌ No Stored Fee

Fee is provided per transaction.

### ❌ No Withdraw

Program never holds funds.

### ❌ No Escrow

No custody at any time.

### ❌ No PDAs Holding Funds

No program-owned treasury accounts.

### ❌ No Upgradeability After Stabilization

Upgrade authority must be burned after audit and mainnet validation.

If changes are needed → deploy a new program.

---

# Zero Balance Guarantee

After every transaction:

* Program SOL balance must remain zero (excluding rent-exempt edge cases)
* No token accounts owned by the program
* No PDAs storing funds

---

# Testing

Build and run tests:

```bash
anchor build
anchor test
```

### Important Note (SPL Tests)

SPL tests currently require commenting out:

```rust
require!(
    constants::SUPPORTED_SPL_TOKEN == mint.key(),
    ErrorCode::UnsupportedSplToken
);
```

Reason:

* Local test mint differs from production-supported mint constant.

---

# Security Considerations

* All transfers are direct wallet-to-wallet.
* No intermediate custody.
* All arithmetic is checked.
* Account ownership is validated.
* Token mint consistency is enforced.
* Transaction atomicity guaranteed by Solana runtime.

Built on:

Solana
Anchor

---

# Deployment Policy

1. Deploy program.
2. Thorough testing (local + devnet).
3. External security audit.
4. Stabilization period.
5. **Burn upgrade authority permanently.**

After burn:

* No one (including deployer) can modify behavior.
* Any update requires a new program deployment.

---

# What This Program Is

* A stateless payment router
* A neutral software tool
* A deterministic atomic transfer executor
* An event emitter for off-chain indexing

# What This Program Is NOT

* Not an escrow
* Not a custody solution
* Not a marketplace
* Not a dispute layer
* Not upgrade-controlled infrastructure
