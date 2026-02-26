use std::u64;

use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CurrencyType {
    SOL,
    SPL,
}

#[event]
pub struct PurchaseEvent {
    pub content_id: String,
    pub purchase_id: String,
    pub buyer: Pubkey,
    pub creator: Pubkey,
    pub platform: Pubkey,
    pub referrer: Option<Pubkey>,
    pub mint: Option<Pubkey>,
    pub currency_type: CurrencyType,
    pub decimals: u8,
    pub amount: u64,
    pub creator_amount: u64,
    pub platform_fee: u64,
    pub referrer_fee: u64,
    pub fee_bps: u16,
    pub slot: u64,
    pub timestamp: i64,
}
