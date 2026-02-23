import * as anchor from "@coral-xyz/anchor";
import { getKeypairFromEnvironment } from "@solana-developers/helpers";
import "dotenv/config";
import { SoftwareTool } from "../target/types/software_tool";
import idl from "../target/idl/software_tool.json";
import fs from "fs";
import path from "path";

class Helper {
  get userPk() {
    return getKeypairFromEnvironment("DEPLOYER");
  }

  get userWallet() {
    return new anchor.Wallet(this.userPk);
  }

  get connection() {
    // return new anchor.web3.Connection(
    //   "https://mainnet.helius-rpc.com/?api-key=8c35cca2-a444-41f7-9b3b-d113f4938c82"
    // );
    return new anchor.web3.Connection("https://api.devnet.solana.com");
  }

  get provider() {
    return new anchor.AnchorProvider(this.connection, this.userWallet);
  }

  get program() {
    return new anchor.Program<SoftwareTool>(idl as SoftwareTool, this.provider);
  }
}

export const helper = new Helper();
