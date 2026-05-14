// Shared regex constants for transaction-description pattern matching. Kept in
// one place so the spend calculator, refund detector, and wash-pair detector
// can't drift out of sync — a real risk before, since each had its own copy.

export const REFUND_KEYWORDS = /\brefund\b|\breversal\b|\breversed\b|merchandise return/i;

// Bank-fee/rebate wash signals: a positive entry pairing with a same-day
// same-amount negative entry on the same card. The keyword set is broader
// than REFUND because BMO etc. also use "rebate" for SC plan reimbursements.
export const WASH_REVERSAL_KEYWORDS = /\brebate\b|\brefund\b|\breversal\b|\breversed\b/i;
