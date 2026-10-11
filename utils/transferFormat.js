import { formatMinorAsDecimal } from "./money.js";

export const toTransferJson = (row) => row && ({
  id: row.id,
  sourceAccountId: row.source_account_id,
  destinationAccountId: row.destination_account_id,
  sourceAccountName: row.source_account_name ?? null,
  destinationAccountName: row.destination_account_name ?? null,
  amount: formatMinorAsDecimal(row.amount_minor),
  currencyCode: row.currency_code,
  transferDate: row.transfer_date instanceof Date
    ? row.transfer_date.toISOString().slice(0, 10)
    : String(row.transfer_date).slice(0, 10),
  note: row.note ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
