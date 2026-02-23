use anchor_lang::{prelude::Pubkey, pubkey};

pub const SUPPORTED_SPL_TOKEN: Pubkey = pubkey!("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"); // USDC on devnet
// pub const SUPPORTED_SPL_TOKEN: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC on mainnet

pub const BPS_DENOMINATOR: u64 = 10000;
pub const MAX_FEE_BPS: u64 = 3000; // 30% max fee
