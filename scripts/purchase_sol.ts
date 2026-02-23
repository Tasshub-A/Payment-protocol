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
      new BN(1_000_000_00), // 1 SOL in lamports
      1500 // fee percentage
    )
    .accounts({
      buyer: $.userPk.publicKey,
      creator: new PublicKey("9jdZCoouyfcw4vitGxGcGq9Ayxb9nX3FPrn5nAwfGkTp"),
      platform: new PublicKey("6mDrkCKLzMuDDJr4A1vWHRnGEbDwW4a1mJg2RyioaCAT"),
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
