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
} from "../../helper";

describe("purchase_spl", () => {
  const FEE_TOO_HIGH = 3001; // > MAX_FEE_BPS (30%)

  let conn: anchor.web3.Connection;
  let payer: anchor.web3.Signer;
  let buyer: anchor.web3.PublicKey;
  let creator: anchor.web3.PublicKey;
  let platform: anchor.web3.PublicKey;

  beforeEach(async () => {
    conn = provider.connection;
    payer = (provider.wallet as anchor.Wallet).payer;
    buyer = payer.publicKey;
    creator = anchor.web3.Keypair.generate().publicKey;
    platform = anchor.web3.Keypair.generate().publicKey;
  });

  async function setupMintAndAccounts() {
    const mint = await createMint(conn, payer, buyer, null, 6);

    const buyerTokenAccount = await createAccount(conn, payer, mint, buyer);
    await mintTo(conn, payer, mint, buyerTokenAccount, buyer, 1_000_000_000);

    const creatorTokenAccount = getAssociatedTokenAddressSync(mint, creator);
    const platformTokenAccount = getAssociatedTokenAddressSync(mint, platform);

    return {
      mint,
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount,
    };
  }

  async function getAllBalances(
    buyerTokenAccount: anchor.web3.PublicKey,
    creatorTokenAccount: anchor.web3.PublicKey,
    platformTokenAccount: anchor.web3.PublicKey
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

    return { buyer, creator, platform };
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
    const feeBps = 500;

    const contentId = "content-spl-1";
    const purchaseId = "purchase-spl-1";

    const buyerBefore = (await conn.getTokenAccountBalance(buyerTokenAccount))
      .value.amount;

    await program.methods
      .purchaseWithToken(contentId, purchaseId, amount, feeBps)
      .accounts({
        buyer,
        creator,
        platform,
        mint,
        buyerTokenAccount,
        creatorTokenAccount,
        platformTokenAccount,
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
        .purchaseWithToken("cid", "pid", amount, FEE_TOO_HIGH)
        .accounts({
          buyer,
          creator,
          platform,
          mint,
          buyerTokenAccount,
          creatorTokenAccount,
          platformTokenAccount,
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
    const feeBps = 500;

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
        .purchaseWithToken(contentId, purchaseId, amount, feeBps)
        .accounts({
          buyer,
          creator,
          platform,
          mint,
          buyerTokenAccount,
          creatorTokenAccount,
          platformTokenAccount: wrongPlatformTokenAccount,
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

    const contentId = "content-spl-overflow";
    const purchaseId = "purchase-spl-overflow";

    const before = await getAllBalances(
      buyerTokenAccount,
      creatorTokenAccount,
      platformTokenAccount
    );

    try {
      await program.methods
        .purchaseWithToken(contentId, purchaseId, amount, feeBps)
        .accounts({
          buyer,
          creator,
          platform,
          mint,
          buyerTokenAccount,
          creatorTokenAccount,
          platformTokenAccount,
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
});
