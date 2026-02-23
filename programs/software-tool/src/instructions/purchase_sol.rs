use std::u64;

use crate::errors::ErrorCode;
use crate::types::CurrencyType;
use crate::{constants, types::PurchaseEvent};
use anchor_lang::{prelude::*, system_program};

#[derive(Accounts)]
pub struct PurchaseSol<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: we do not read or write the data of this account
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,

    /// CHECK: we do not read or write the data of this account
    #[account(mut)]
    pub platform: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/**
 * Handler for purchasing content using SOL. It validates the fee basis points, calculates the fee and creator amounts,
 */
pub fn handler(
    ctx: Context<PurchaseSol>,
    content_id: String,
    purchase_id: String,
    amount: u64,
    fee_bps: u16,
) -> Result<()> {
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

    send_sol(
        buyer.to_account_info(),
        creator.to_account_info(),
        creator_amount,
        ctx.accounts.system_program.to_account_info(),
    )?;

    send_sol(
        buyer.to_account_info(),
        platform.to_account_info(),
        fee_amount,
        ctx.accounts.system_program.to_account_info(),
    )?;

    let clock = Clock::get()?;

    emit!(PurchaseEvent {
        content_id,
        purchase_id,
        buyer: buyer.key(),
        creator: creator.key(),
        platform: platform.key(),
        mint: None,
        currency_type: CurrencyType::SOL,
        decimals: 9,
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
 * Helper function to send SOL from one account to another using the system program.
 */
fn send_sol<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    amount: u64,
    sys_program: AccountInfo<'info>,
) -> Result<()> {
    let cpi_context = CpiContext::new(sys_program, system_program::Transfer { from, to });

    let res = system_program::transfer(cpi_context, amount);

    if res.is_ok() {
        return Ok(());
    } else {
        return Err(ErrorCode::TransferFailed.into());
    }
}
