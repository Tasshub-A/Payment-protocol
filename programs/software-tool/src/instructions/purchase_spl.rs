use crate::errors::ErrorCode;
use crate::types::CurrencyType;
use crate::{constants, types::PurchaseEvent};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransfer};

#[derive(Accounts)]
pub struct PurchaseSpl<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: we only use the pubkey for events
    #[account()]
    pub creator: UncheckedAccount<'info>,

    /// CHECK: we only use the pubkey for events
    #[account()]
    pub platform: UncheckedAccount<'info>,

    /// SPL token mint (USDC / USDT / any supported SPL)
    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key() @ ErrorCode::InvalidTokenOwner,
        constraint = buyer_token_account.mint == mint.key() @ ErrorCode::InvalidTokenMint,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = creator,
        constraint = creator_token_account.owner == creator.key() @ ErrorCode::InvalidTokenOwner,
        constraint = creator_token_account.mint == mint.key() @ ErrorCode::InvalidTokenMint,
    )]
    pub creator_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = platform,
        constraint = platform_token_account.owner == platform.key() @ ErrorCode::InvalidTokenOwner,
        constraint = platform_token_account.mint == mint.key() @ ErrorCode::InvalidTokenMint,
    )]
    pub platform_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/**
 * Handler for purchasing content using an SPL token. It validates the fee basis points, calculates the fee and creator amounts,
 */
pub fn handler(
    ctx: Context<PurchaseSpl>,
    content_id: String,
    purchase_id: String,
    amount: u64,
    fee_bps: u16,
) -> Result<()> {
    let mint = &ctx.accounts.mint;

    require!(
        constants::SUPPORTED_SPL_TOKEN == mint.key(),
        ErrorCode::UnsupportedSplToken
    );

    if (fee_bps as u64) > constants::MAX_FEE_BPS {
        return Err(ErrorCode::FeeBpsExceedsMaximum.into());
    }

    let buyer = &ctx.accounts.buyer;
    let creator = &ctx.accounts.creator;
    let platform = &ctx.accounts.platform;

    let fee_amount = amount
        .checked_mul(fee_bps as u64)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(constants::BPS_DENOMINATOR)
        .ok_or(ErrorCode::Underflow)?;

    let creator_amount = amount.checked_sub(fee_amount).ok_or(ErrorCode::Underflow)?;

    send_spl(
        &ctx.accounts.token_program,
        &ctx.accounts.buyer_token_account,
        &ctx.accounts.creator_token_account,
        &buyer.to_account_info(),
        creator_amount,
    )?;

    send_spl(
        &ctx.accounts.token_program,
        &ctx.accounts.buyer_token_account,
        &ctx.accounts.platform_token_account,
        &buyer.to_account_info(),
        fee_amount,
    )?;

    let clock = Clock::get()?;

    emit!(PurchaseEvent {
        content_id,
        purchase_id,
        buyer: buyer.key(),
        creator: creator.key(),
        platform: platform.key(),
        mint: Some(mint.key()),
        currency_type: CurrencyType::SPL,
        decimals: mint.decimals,
        amount,
        creator_amount,
        platform_fee: fee_amount,
        fee_bps,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/**
 * Helper function to send SPL tokens from one account to another using the token program.
 */
fn send_spl<'info>(
    token_program: &Program<'info, Token>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = SplTransfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.clone(),
    };

    let cpi_ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts);

    token::transfer(cpi_ctx, amount).map_err(|_| ErrorCode::TransferFailed.into())
}
