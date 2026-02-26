import { expect } from "chai";
import { BN } from "bn.js";
import { program, anchor, provider, airdrop } from "../../helper";

const LAMPORTS = anchor.web3.LAMPORTS_PER_SOL;

describe("purchase_sol", () => {
  const FEE_TOO_HIGH = 3001; // > MAX_FEE_BPS (30%)
  const REFERRER_FEE_TOO_HIGH = 501; // > MAX_REFERRER_FEE_BPS (5%)

  let buyer: anchor.web3.PublicKey;
  let creator: anchor.web3.PublicKey;
  let platform: anchor.web3.PublicKey;
  let referrer: anchor.web3.PublicKey;

  beforeEach(async () => {
    buyer = (provider.wallet as anchor.Wallet).publicKey;
    creator = anchor.web3.Keypair.generate().publicKey;
    platform = anchor.web3.Keypair.generate().publicKey;
    referrer = anchor.web3.Keypair.generate().publicKey;

    await airdrop(buyer, 2);
  });

  it("purchases content with SOL and splits fee correctly", async () => {
    const conn = provider.connection;

    const amount = new BN(0.5 * LAMPORTS);
    const feeBps = 1500; // 15%
    const referrerFeeBps = 0;

    const contentId = "content-sol-1";
    const purchaseId = "purchase-sol-1";

    const buyerBefore = await conn.getBalance(buyer);
    const creatorBefore = await conn.getBalance(creator);
    const platformBefore = await conn.getBalance(platform);

    const tx = await program.methods
      .purchaseWithSol(contentId, purchaseId, amount, feeBps, referrerFeeBps)
      .accounts({
        buyer,
        creator,
        platform,
        referrer: null,
      })
      .rpc();

    await conn.confirmTransaction(tx, "confirmed");

    const buyerAfter = await conn.getBalance(buyer);
    const creatorAfter = await conn.getBalance(creator);
    const platformAfter = await conn.getBalance(platform);

    const feeAmount = amount.muln(feeBps).divn(10_000).toNumber();
    const creatorAmount = Number(amount) - feeAmount;

    expect(creatorAfter - creatorBefore).to.eq(creatorAmount);
    expect(platformAfter - platformBefore).to.eq(feeAmount);
    expect(buyerBefore - buyerAfter).to.be.gte(amount.toNumber());
  });

  it("fails if fee_bps exceeds MAX_FEE_BPS", async () => {
    const amount = new BN(0.1 * LAMPORTS);

    try {
      await program.methods
        .purchaseWithSol(
          "content-sol-invalid-fee",
          "purchase-sol-invalid-fee",
          amount,
          FEE_TOO_HIGH,
          0
        )
        .accounts({
          buyer,
          creator,
          platform,
          referrer: null,
        })
        .rpc();
      expect.fail("Instruction should have failed with FeeBpsExceedsMaximum");
    } catch (err: any) {
      const msg = err.toString() || "";
      expect(msg).to.include("FeeBpsExceedsMaximum");
    }
  });

  it("fails if referrer_fee_bps exceeds MAX_REFERRER_FEE_BPS", async () => {
    const amount = new BN(0.1 * LAMPORTS);

    try {
      await program.methods
        .purchaseWithSol(
          "content-sol-invalid-fee",
          "purchase-sol-invalid-fee",
          amount,
          0,
          REFERRER_FEE_TOO_HIGH
        )
        .accounts({
          buyer,
          creator,
          platform,
          referrer: null,
        })
        .rpc();
      expect.fail("Instruction should have failed with FeeBpsExceedsMaximum");
    } catch (err: any) {
      const msg = err.toString() || "";
      expect(msg).to.include("FeeBpsExceedsMaximum");
    }
  });

  it("fails with Overflow when fee calculation overflows u64", async () => {
    const conn = provider.connection;

    const amount = new BN("18446744073709551615");
    const feeBps = 3000; // 30%
    const referrerFeeBps = 0;

    const contentId = "content-sol-overflow";
    const purchaseId = "purchase-sol-overflow";

    const buyerBefore = await conn.getBalance(buyer);
    const creatorBefore = await conn.getBalance(creator);
    const platformBefore = await conn.getBalance(platform);

    try {
      await program.methods
        .purchaseWithSol(contentId, purchaseId, amount, feeBps, referrerFeeBps)
        .accounts({
          buyer,
          creator,
          platform,
          referrer: null,
        })
        .rpc();
      expect.fail("Instruction should have failed with Overflow");
    } catch (err: any) {
      const msg = err.toString() || "";
      expect(msg).to.include("Overflow");
    }

    const buyerAfter = await conn.getBalance(buyer);
    const creatorAfter = await conn.getBalance(creator);
    const platformAfter = await conn.getBalance(platform);

    expect(buyerAfter).to.eq(buyerBefore);
    expect(creatorAfter).to.eq(creatorBefore);
    expect(platformAfter).to.eq(platformBefore);
  });

  it("purchases content with SOL and splits fee correctly with referrer", async () => {
    const conn = provider.connection;

    const amount = new BN(0.5 * LAMPORTS);
    const feeBps = 1400;
    const referrerFeeBps = 100;

    const contentId = "content-sol-with-ref";
    const purchaseId = "purchase-sol-with-ref";

    const buyerBefore = await conn.getBalance(buyer);
    const creatorBefore = await conn.getBalance(creator);
    const platformBefore = await conn.getBalance(platform);
    const referrerBefore = await conn.getBalance(referrer);

    const tx = await program.methods
      .purchaseWithSol(contentId, purchaseId, amount, feeBps, referrerFeeBps)
      .accounts({
        buyer,
        creator,
        platform,
        referrer,
      })
      .rpc();

    await conn.confirmTransaction(tx, "confirmed");

    const buyerAfter = await conn.getBalance(buyer);
    const creatorAfter = await conn.getBalance(creator);
    const platformAfter = await conn.getBalance(platform);
    const referrerAfter = await conn.getBalance(referrer);

    const platformFee = amount.muln(feeBps).divn(10_000).toNumber(); // 15% від amount
    const referrerFee = amount.muln(referrerFeeBps).divn(10_000).toNumber(); // 1% від amount
    const creatorAmount = Number(amount) - platformFee - referrerFee;

    expect(creatorAfter - creatorBefore).to.eq(creatorAmount);
    expect(referrerAfter - referrerBefore).to.eq(referrerFee);
    expect(platformAfter - platformBefore).to.eq(platformFee);
    expect(buyerBefore - buyerAfter).to.be.gte(amount.toNumber());
  });

  it("if fees are zero, creator receives full amount", async () => {
    const conn = provider.connection;

    const amount = new BN(0.5 * LAMPORTS);
    const feeBps = 0;
    const referrerFeeBps = 0;

    const contentId = "content-sol-no-fee";
    const purchaseId = "purchase-sol-no-fee";

    const buyerBefore = await conn.getBalance(buyer);
    const creatorBefore = await conn.getBalance(creator);
    const platformBefore = await conn.getBalance(platform);

    const tx = await program.methods
      .purchaseWithSol(contentId, purchaseId, amount, feeBps, referrerFeeBps)
      .accounts({
        buyer,
        creator,
        platform,
        referrer: null,
      })
      .rpc();

    await conn.confirmTransaction(tx, "confirmed");

    const buyerAfter = await conn.getBalance(buyer);
    const creatorAfter = await conn.getBalance(creator);
    const platformAfter = await conn.getBalance(platform);

    expect(creatorAfter - creatorBefore).to.eq(amount.toNumber());
    expect(platformAfter).to.eq(platformBefore);
    expect(buyerBefore - buyerAfter).to.be.gte(amount.toNumber());
  });
});
