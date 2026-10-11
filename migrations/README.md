# Database setup and migration order

These scripts are ordered by their numeric prefix.

1. `0001_reconstructed_development_baseline.sql`
2. `0002_account_foundation.sql`
3. `0003_account_transactions_and_transfers.sql`

`0001` is only a reconstructed baseline for a new, empty local development
database. It was derived from the backend access paths at commit `7a91c362`.
It is not authoritative DDL for Railway or any production/shared database.
Its plain `CREATE TABLE` statements intentionally fail if any target table
already exists; they must not conceal an incompatible schema behind
`IF NOT EXISTS`.

`0002` is the Phase 3A.1 additive account schema. It has been exercised on
MySQL 8.4 against the reconstructed baseline. Before applying it elsewhere,
privately verify the target `users.id` type, engine, collation, constraint and
index names, migration tracking convention, and existing account-related
objects. MySQL DDL may implicitly commit; never run it against a shared or
production database without a reviewed rollout and recovery plan.

`0002` also uses a plain `CREATE TABLE` so an existing `accounts` table fails
loudly instead of being accepted without structural validation. A successful
`CREATE TABLE` still proves only that the table was absent; it does not verify
the rest of a target database or make these scripts a production migration
system. The `schema_migrations` inserts are bookkeeping for this reconstructed
development sequence, not checksum or schema-drift enforcement.

If an earlier development copy of either script was already applied, these
text changes do not alter that database. Do not re-run or mark the revised file
as newly applied. Compare the live schema explicitly (for example with
`SHOW CREATE TABLE`), record the actual migration state, and use a reviewed
forward migration for any discrepancy. Production needs its authoritative
baseline, migration history/checksums, preflight schema checks, backup and
rollback procedure; this reconstructed baseline is not a substitute.

The baseline intentionally retains the globally unique `sms_hash` behavior
from `utils/migration_sms_import.sql`. It does not apply the unapproved
per-user SMS-hash proposal.

`0003` is the Phase 3A.3 additive schema adding optional `account_id` foreign
key association on `transactions`, creating the atomic `transfers` ledger table
with user-isolated concurrency and uniqueness guards, and establishing the
auditable `account_adjustments` ledger table.

Runtime application credentials are intentionally insufficient to apply
these scripts. Schema setup must use a separately controlled migration/admin
identity, after which the API runs with its least-privilege account.
