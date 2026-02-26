import { BN } from "bn.js";
import "dotenv/config";
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { helper } from "./helper";
import { PublicKey } from "@solana/web3.js";

const $ = helper;

// npx esrun scripts/purchase_spl.ts
const main = async () => {
  const splMint = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"); // USDC mint on devnet
  const buyer = $.userPk.publicKey;
  const creator = new PublicKey("9jdZCoouyfcw4vitGxGcGq9Ayxb9nX3FPrn5nAwfGkTp");
  const platform = new PublicKey(
    "6mDrkCKLzMuDDJr4A1vWHRnGEbDwW4a1mJg2RyioaCAT"
  );

  const referrer = new PublicKey(
    "3QfzoJ4KwCeqskuwA9pXQf3FzfkCPA6C5s5yKyq1o8Tx"
  );

  const buyer_ata = await getAssociatedTokenAddress(splMint, buyer);
  const creator_ata = await getAssociatedTokenAddress(splMint, creator);
  const platform_ata = await getAssociatedTokenAddress(splMint, platform);
  const referrer_ata = await getAssociatedTokenAddress(splMint, referrer);
  const tx = await $.program.methods
    .purchaseWithToken(
      "content_id_123",
      "purchase_id_123",
      new BN(10_000_000), // 10 USDC in lamports
      1400, // fee percentage
      100, // referrer fee percentage
    )
    .accounts({
      buyer,
      creator,
      platform,
      referrer,
      mint: splMint,
      buyerTokenAccount: buyer_ata,
      createtorTokenAccount: creator_ata,
      platformTokenAccount: platform_ata,
      referrerTokenAccount: referrer_ata,
    })
    .rpc();

  console.log(`Transaction: https://solscan.io/tx/${tx}`);

  console.log("Waiting for transaction to be confirmed...");
  await $.connection.confirmTransaction(tx, "finalized");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
