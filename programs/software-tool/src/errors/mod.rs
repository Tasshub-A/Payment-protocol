use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Overflow in arithmetic.")]
    Overflow,
    #[msg("Underflow in arithmetic.")]
    Underflow,
    #[msg("Transfer failed")]
    TransferFailed,
    #[msg("Invalid Token Account Owner")]
    InvalidTokenOwner,
    #[msg("Invalid Token Mint")]
    InvalidTokenMint,
    #[msg("Unsupported SPL Token")]
    UnsupportedSplToken,
    #[msg("Fee basis points exceeds maximum allowed")]
    FeeBpsExceedsMaximum,
}
