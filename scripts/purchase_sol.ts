import { BN } from "bn.js";
import "dotenv/config";
import { helper } from "./helper";
import { PublicKey } from "@solana/web3.js";

const $ = helper;

// npx esrun scripts/purchase_sol.ts
const main = async () => {
  const tx = await $.program.methods
    .purchaseWithSol(
      "content_id_123",
      "purchase_id_123",
      new BN(1_000_000_00), // 0.1 SOL in lamports
      1400, // fee percentage
      100, // referrer fee percentage
    )
    .accounts({
      buyer: $.userPk.publicKey,
      creator: new PublicKey("9jdZCoouyfcw4vitGxGcGq9Ayxb9nX3FPrn5nAwfGkTp"),
      platform: new PublicKey("6mDrkCKLzMuDDJr4A1vWHRnGEbDwW4a1mJg2RyioaCAT"),
      referrer: new PublicKey("3QfzoJ4KwCeqskuwA9pXQf3FzfkCPA6C5s5yKyq1o8Tx"),
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
