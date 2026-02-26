use anchor_lang::{prelude::Pubkey, pubkey};

pub const USDC_MAINNET: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
pub const USDC_DEVNET: Pubkey = pubkey!("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
pub const USDC_LOCALNET: Pubkey = pubkey!("2fhsSHuFFLhaFBA4mj6DFsGQemFnHq2ayyBqRVQ8TXZT");

// DEPLOY: Comment devnt and localnet USDC when deploying to mainnet
pub const SUPPORTED_SPL_TOKENS: &[Pubkey] = &[
    USDC_MAINNET,
    USDC_DEVNET,
    USDC_LOCALNET
];

pub const BPS_DENOMINATOR: u64 = 10000;
pub const MAX_FEE_BPS: u64 = 3000; // 30% max fee
pub const MAX_REFERRER_FEE_BPS: u64 = 500; // 5% max referrer fee
