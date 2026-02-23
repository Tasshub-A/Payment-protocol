use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod types;

use instructions::*;

declare_id!("9svVtb2TeXLDu7zy5XYni3FieghQu3KA7Q564VSb2H8w");

#[program]
pub mod software_tool {

    use super::*;

    /**
     * Purchase content using SOL.
     * The buyer pays the specified amount in SOL, which is split between the creator and the platform
     * based on the provided fee basis points (fee_bps).
     * The creator receives the amount minus the fee, while the platform receives the fee amount.
     */
    pub fn purchase_with_sol(
        ctx: Context<PurchaseSol>,
        content_id: String,
        purchase_id: String,
        amount: u64,
        fee_bps: u16,
    ) -> Result<()> {
        instructions::purchase_sol::handler(ctx, content_id, purchase_id, amount, fee_bps)
    }

    /**
     * Purchase content using an SPL token.
     * The buyer pays the specified amount in the SPL token, which is split between the creator and the platform
     * based on the provided fee basis points (fee_bps). The creator receives the amount minus the fee,
     * while the platform receives the fee amount.
     */
    pub fn purchase_with_token(
        ctx: Context<PurchaseSpl>,
        content_id: String,
        purchase_id: String,
        amount: u64,
        fee_bps: u16,
    ) -> Result<()> {
        instructions::purchase_spl::handler(ctx, content_id, purchase_id, amount, fee_bps)
    }
}
