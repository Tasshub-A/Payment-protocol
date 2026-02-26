import { expect } from "chai";
import { BN } from "bn.js";
import {
  program,
  anchor,
  provider,
  getAssociatedTokenAddressSync,
  createMint,
  createAccount,
  mintTo,
  createFixedMint,
  PublicKey,
} from "../../helper";
import { Keypair } from "@solana/web3.js";

import dotenv from "dotenv";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
dotenv.config();

describe("purchase_spl", () => {
  const FEE_TOO_HIGH = 3001; // > MAX_FEE_BPS (30%)
  const REFERRER_FEE_TOO_HIGH = 501; // > MAX_REFERRER_FEE_BPS (5%)

  const LOCALNET_USDC_MINT_PUBKEY = new PublicKey(
    "2fhsSHuFFLhaFBA4mj6DFsGQemFnHq2ayyBqRVQ8TXZT"
  );

  const secretEnv = process.env.LOCALNET_USDC_MINT_SECRET;
  if (!secretEnv) {
    throw new Error("LOCALNET_USDC_MINT_SECRET is not set");
  }
  const LOCALNET_USDC_MINT_SECRET = Uint8Array.from(JSON.parse(secretEnv));
  const mintKeypair = Keypair.fromSecretKey(LOCALNET_USDC_MINT_SECRET);

  let conn: anchor.web3.Connection;
  let payer: anchor.web3.Signer;
  let buyer: anchor.web3.PublicKey;
  let creator: anchor.web3.PublicKey;
  let platform: anchor.web3.PublicKey;
  let referrer: anchor.web3.PublicKey;

  before(async () => {
    conn = provider.connection;
    payer = (provider.wallet as anchor.Wallet).payer;
    buyer = payer.publicKey;
    creator = anchor.web3.Keypair.generate().publicKey;
    platform = anchor.web3.Keypair.generate().publicKey;
    referrer = anchor.web3.Keypair.generate().publicKey;

    const info = await conn.getAccountInfo(LOCALNET_USDC_MINT_PUBKEY);
    if (!info) {
      if (!mintKeypair.publicKey.equals(LOCALNET_USDC_MINT_PUBKEY)) {
        throw new Error("Mint keypair pubkey != LOCALNET_USDC_MINT_PUBKEY");
      }
      await createFixedMint(conn, payer as Keypair, mintKeypair, 6, buyer);
    }

    const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
      conn,
      payer as Keypair,
      LOCALNET_USDC_MINT_PUBKEY,
      buyer
    );

    await mintTo(
      conn,
      payer as Keypair,
      LOCALNET_USDC_MINT_PUBKEY,
      buyerTokenAccount.address,
      buyer,
      1_000_000_000
    );
  });

  async function setupMintAndAccounts() {
    const mint = LOCALNET_USDC_MINT_PUBKEY;

    const buyerTokenAccount = getAssociatedTokenAddressSync(mint, buyer);
    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator);
    const platformTokenAccount = getAssociatedTokenAddressSync(mint, platform);

    return {
      mint,
      buyerTokenAccount: buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
    };
  }

  async function getAllBalances(
    buyerTokenAccount: anchor.web3.PublicKey,
    creatorTokenAccount: anchor.web3.PublicKey,
    platformTokenAccount: anchor.web3.PublicKey,
    referrerTokenAccount?: anchor.web3.PublicKey
  ) {
    const buyer = (await conn.getTokenAccountBalance(buyerTokenAccount)).value
      .amount;

    const creatorInfo = await conn.getAccountInfo(creatorTokenAccount);
    const platformInfo = await conn.getAccountInfo(platformTokenAccount);

    const creator =
      creatorInfo?.data &&
      creatorInfo.owner.equals(anchor.utils.token.TOKEN_PROGRAM_ID)
        ? (await conn.getTokenAccountBalance(creatorTokenAccount)).value.amount
        : "0";

    const platform =
      platformInfo?.data &&
      platformInfo.owner.equals(anchor.utils.token.TOKEN_PROGRAM_ID)
        ? (await conn.getTokenAccountBalance(platformTokenAccount)).value.amount
        : "0";

    let referrer = "0";
    if (referrerTokenAccount) {
      const referrerInfo = await conn.getAccountInfo(referrerTokenAccount);
      referrer =
        referrerInfo?.data &&
        referrerInfo.owner.equals(anchor.utils.token.TOKEN_PROGRAM_ID)
          ? (await conn.getTokenAccountBalance(referrerTokenAccount)).value
              .amount
          : "0";
    }

    return { buyer, creator, platform, referrer };
  }

  function expectBalancesUnchanged(
    before: { buyer: string; creator: string; platform: string },
    after: { buyer: string; creator: string; platform: string }
  ) {
    expect(after.buyer).to.eq(before.buyer);
    expect(after.creator).to.eq(before.creator);
    expect(after.platform).to.eq(before.platform);
  }

  it("purchases content with SPL token and splits fee correctly", async () => {
    const {
      mint,
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
    } = await setupMintAndAccounts();

    const amount = new BN(100_000_000);
    const feeBps = 1500;
    const referrerFeeBps = 0;

    const contentId = "content-spl-1";
    const purchaseId = "purchase-spl-1";

    const buyerBefore = (await conn.getTokenAccountBalance(buyerTokenAccount))
      .value.amount;

    await program.methods
      .purchaseWithToken(contentId, purchaseId, amount, feeBps, referrerFeeBps)
      .accounts({
        buyer,
        creator,
        platform,
        referrer: null,
        mint,
        buyerTokenAccount,
        creatorTokenAccount,
        platformTokenAccount,
        referrerTokenAccount: null,
      })
      .rpc();

    const buyerAfter = (await conn.getTokenAccountBalance(buyerTokenAccount))
      .value.amount;
    const creatorAfterBalance = (
      await conn.getTokenAccountBalance(creatorTokenAccount)
    ).value.amount;
    const platformAfterBalance = (
      await conn.getTokenAccountBalance(platformTokenAccount)
    ).value.amount;

    const feeAmount = amount.muln(feeBps).divn(10_000).toNumber();
    const creatorAmount = Number(amount) - feeAmount;

    expect(BigInt(buyerBefore) - BigInt(buyerAfter)).to.eq(
      BigInt(amount.toString())
    );
    expect(BigInt(creatorAfterBalance)).to.eq(BigInt(creatorAmount));
    expect(BigInt(platformAfterBalance)).to.eq(BigInt(feeAmount));
  });

  it("fails if fee_bps exceeds MAX_FEE_BPS", async () => {
    const {
      mint,
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
    } = await setupMintAndAccounts();

    const amount = new BN(100_000_000);

    try {
      await program.methods
        .purchaseWithToken("cid", "pid", amount, FEE_TOO_HIGH, 0)
        .accounts({
          buyer,
          creator,
          platform,
          referrer: null,
          mint,
          buyerTokenAccount,
          creatorTokenAccount,
          platformTokenAccount,
          referrerTokenAccount: null,
        })
        .rpc();
      expect.fail("Instruction should have failed with FeeBpsExceedsMaximum");
    } catch (err: any) {
      const msg = err.toString() || "";
      expect(msg).to.include("FeeBpsExceedsMaximum");
    }
  });

  it("fails if referrer_fee_bps exceeds MAX_REFERRER_FEE_BPS", async () => {
    const {
      mint,
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
    } = await setupMintAndAccounts();

    const amount = new BN(100_000_000);

    try {
      await program.methods
        .purchaseWithToken("cid", "pid", amount, 0, REFERRER_FEE_TOO_HIGH)
        .accounts({
          buyer,
          creator,
          platform,
          referrer: null,
          mint,
          buyerTokenAccount,
          creatorTokenAccount,
          platformTokenAccount,
          referrerTokenAccount: null,
        })
        .rpc();
      expect.fail("Instruction should have failed with FeeBpsExceedsMaximum");
    } catch (err: any) {
      const msg = err.toString() || "";
      expect(msg).to.include("FeeBpsExceedsMaximum");
    }
  });

  it("is atomic: if platform transfer fails, creator transfer is also rolled back", async () => {
    const {
      mint,
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
    } = await setupMintAndAccounts();

    const amount = new BN(100_000_000);
    const feeBps = 1500;
    const referrerFeeBps = 0;

    const contentId = "content-spl-atomic";
    const purchaseId = "purchase-spl-atomic";

    const before = await getAllBalances(
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount
    );

    const wrongMint = await createMint(conn, payer, buyer, null, 6);
    const wrongPlatformTokenAccount = await createAccount(
      conn,
      payer,
      wrongMint,
      platform
    );

    try {
      await program.methods
        .purchaseWithToken(
          contentId,
          purchaseId,
          amount,
          feeBps,
          referrerFeeBps
        )
        .accounts({
          buyer,
          creator,
          platform,
          referrer: null,
          mint,
          buyerTokenAccount,
          creatorTokenAccount,
          platformTokenAccount: wrongPlatformTokenAccount,
          referrerTokenAccount: null,
        })
        .rpc();
      expect.fail(
        "Instruction should have failed due to InvalidTokenMint/InvalidTokenOwner"
      );
    } catch (err: any) {
      const msg = err.toString() || "";
      expect(msg.includes("ConstraintTokenMint")).to.be.true;
    }

    const after = await getAllBalances(
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount
    );

    expectBalancesUnchanged(before, after);
  });

  it("fails with Overflow when SPL fee calculation overflows u64", async () => {
    const {
      mint,
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
    } = await setupMintAndAccounts();

    const amount = new BN("18446744073709551615");
    const feeBps = 3000;
    const referrerFeeBps = 0;

    const contentId = "content-spl-overflow";
    const purchaseId = "purchase-spl-overflow";

    const before = await getAllBalances(
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount
    );

    try {
      await program.methods
        .purchaseWithToken(
          contentId,
          purchaseId,
          amount,
          feeBps,
          referrerFeeBps
        )
        .accounts({
          buyer,
          creator,
          platform,
          referrer: null,
          mint,
          buyerTokenAccount,
          creatorTokenAccount,
          platformTokenAccount,
          referrerTokenAccount: null,
        })
        .rpc();
      expect.fail("Instruction should have failed with Overflow");
    } catch (err: any) {
      const msg = err.toString() || "";
      expect(msg).to.include("Overflow");
    }

    const after = await getAllBalances(
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount
    );

    expectBalancesUnchanged(before, after);
  });

  it("should revert with unsupported token mint", async () => {
    const unsupportedMint = await createMint(conn, payer, buyer, null, 6);

    const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
      conn,
      payer as Keypair,
      unsupportedMint,
      buyer
    );

    const creatorTokenAccount = getAssociatedTokenAddressSync(
      unsupportedMint,
      creator
    );
    const platformTokenAccount = getAssociatedTokenAddressSync(
      unsupportedMint,
      platform
    );

    try {
      await program.methods
        .purchaseWithToken("cid", "pid", new BN(100), 500, 0)
        .accounts({
          buyer,
          creator,
          platform,
          referrer: null,
          mint: unsupportedMint,
          buyerTokenAccount: buyerTokenAccount.address,
          creatorTokenAccount,
          platformTokenAccount,
          referrerTokenAccount: null,
        })
        .rpc();
      expect.fail("Instruction should have failed with UnsupportedSplToken");
    } catch (err: any) {
      const msg = err.toString() || "";
      expect(msg).to.include("UnsupportedSplToken");
    }
  });

  it("purchases content with SPL token and splits fee correctly with referrer", async () => {
    const {
      mint,
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
    } = await setupMintAndAccounts();

    const referrerTokenAccount = getAssociatedTokenAddressSync(mint, referrer);

    const amount = new BN(100_000_000);
    const feeBps = 1400;
    const referrerFeeBps = 100;

    const contentId = "content-spl-ref-1";
    const purchaseId = "purchase-spl-ref-1";

    const before = await getAllBalances(
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
      referrerTokenAccount
    );

    await program.methods
      .purchaseWithToken(contentId, purchaseId, amount, feeBps, referrerFeeBps)
      .accounts({
        buyer,
        creator,
        platform,
        referrer,
        mint,
        buyerTokenAccount,
        creatorTokenAccount,
        platformTokenAccount,
        referrerTokenAccount,
      })
      .rpc();

    const after = await getAllBalances(
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
      referrerTokenAccount
    );

    const totalFeeAmount = amount
      .muln(feeBps + referrerFeeBps)
      .divn(10_000)
      .toNumber();

    const creatorAmount = Number(amount) - totalFeeAmount;
    const platformFeeAmount = amount.muln(feeBps).divn(10_000).toNumber();

    const referrerFeeAmount = amount
      .muln(referrerFeeBps)
      .divn(10_000)
      .toNumber();

    expect(BigInt(before.buyer) - BigInt(after.buyer)).to.eq(
      BigInt(amount.toString())
    );

    expect(BigInt(after.creator) - BigInt(before.creator)).to.eq(
      BigInt(creatorAmount)
    );

    expect(BigInt(after.platform) - BigInt(before.platform)).to.eq(
      BigInt(platformFeeAmount)
    );

    expect(BigInt(after.referrer) - BigInt(before.referrer)).to.eq(
      BigInt(referrerFeeAmount)
    );
  });

  it("if fees are zero, creator receives full amount", async () => {
    const {
      mint,
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
    } = await setupMintAndAccounts();

    const amount = new BN(100_000_000);
    const feeBps = 0;
    const referrerFeeBps = 0;

    const contentId = "content-spl-no-fee";
    const purchaseId = "purchase-spl-no-fee";

    const before = await getAllBalances(
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount
    );

    await program.methods
      .purchaseWithToken(contentId, purchaseId, amount, feeBps, referrerFeeBps)
      .accounts({
        buyer,
        creator,
        platform,
        referrer: null,
        mint,
        buyerTokenAccount,
        creatorTokenAccount,
        platformTokenAccount,
        referrerTokenAccount: null,
      })
      .rpc();

    const after = await getAllBalances(
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount
    );

    expect(BigInt(before.buyer) - BigInt(after.buyer)).to.eq(
      BigInt(amount.toString())
    );

    expect(BigInt(after.creator) - BigInt(before.creator)).to.eq(
      BigInt(amount.toString())
    );

    expect(BigInt(after.platform) - BigInt(before.platform)).to.eq(BigInt(0));
  });
});
