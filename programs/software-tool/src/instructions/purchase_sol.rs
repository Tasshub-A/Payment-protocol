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

    /// CHECK: Optional referrer, gets part of the fee if provided
    #[account(mut)]
    pub referrer: Option<UncheckedAccount<'info>>,

    pub system_program: Program<'info, System>,
}

/**
 * Handler for purchasing content using SOL. It validates the fee basis points,
 * calculates the fee and creator amounts. If a referrer is provided, a fixed
 * portion of the fee (REFERRER_FEE_BPS) is sent to referrer, and the rest to platform.
 */
pub fn handler(
    ctx: Context<PurchaseSol>,
    content_id: String,
    purchase_id: String,
    amount: u64,
    fee_bps: u16,
    referrer_fee_bps: u16,
) -> Result<()> {
    if (fee_bps as u64) > constants::MAX_FEE_BPS
        || (referrer_fee_bps as u64) > constants::MAX_REFERRER_FEE_BPS
    {
        return Err(ErrorCode::FeeBpsExceedsMaximum.into());
    }

    let buyer = &ctx.accounts.buyer;
    let creator = &ctx.accounts.creator;
    let platform = &ctx.accounts.platform;
    let referrer_opt = ctx.accounts.referrer.as_ref();
    let sys = ctx.accounts.system_program.to_account_info();

    let mut referrer_fee_amount: u64 = 0;

    /*
     * If a referrer is provided, calculate the referrer fee and send it to the referrer
     */
    if let Some(referrer) = referrer_opt {
        /*
         * Calculate the referrer fee amount and send it to the referrer.
         * The referrer fee is a portion of the total fee defined by referrer_fee_bps.
         */
        referrer_fee_amount = apply_fee_and_send(
            amount,
            referrer_fee_bps as u64,
            buyer.to_account_info(),
            referrer.to_account_info(),
            sys.clone(),
        )?;
    }

    /*
     * Calculate the platform fee amount and send it to the platform.
     * The platform fee is a portion of the total fee defined by fee_bps,
     */
    let platform_fee_amount: u64 = apply_fee_and_send(
        amount,
        fee_bps as u64,
        buyer.to_account_info(),
        platform.to_account_info(),
        sys.clone(),
    )?;

    /*
     * Calculate the creator amount by subtracting the platform fee and referrer fee from the total amount.
     */
    let creator_amount = amount
        .checked_sub(platform_fee_amount)
        .ok_or(ErrorCode::Underflow)?
        .checked_sub(referrer_fee_amount)
        .ok_or(ErrorCode::Underflow)?;

    send_sol(
        buyer.to_account_info(),
        creator.to_account_info(),
        creator_amount,
        sys.clone(),
    )?;

    let clock = Clock::get()?;

    emit!(PurchaseEvent {
        content_id,
        purchase_id,
        buyer: buyer.key(),
        creator: creator.key(),
        platform: platform.key(),
        referrer: referrer_opt.map(|r| r.key()),
        mint: None,
        currency_type: CurrencyType::SOL,
        decimals: 9,
        amount,
        creator_amount,
        platform_fee: platform_fee_amount,
        referrer_fee: referrer_fee_amount,
        fee_bps,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/*
 * Helper function to calculate the fee amount based on the provided basis points (bps) and send it to the recipient.
 */
fn apply_fee_and_send<'info>(
    amount: u64,
    bps: u64,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
) -> Result<u64> {
    if bps == 0 {
        return Ok(0);
    }

    let fee_amount = amount
        .checked_mul(bps)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(constants::BPS_DENOMINATOR)
        .ok_or(ErrorCode::Underflow)?;

    if fee_amount > 0 {
        send_sol(from, to, fee_amount, system_program)?;
    }

    Ok(fee_amount)
}

/*
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
        Ok(())
    } else {
        Err(ErrorCode::TransferFailed.into())
    }
}
