# Proposal: scope SMS-hash uniqueness to each user

**Status:** Draft for review only. This proposal has not been run against any
production or shared database.

The proposed forward DDL and aggregate preflight/rollback checks were exercised
only on an explicitly constructed disposable MySQL 8.4.11 fixture. That fixture
is not authoritative core-table DDL and does not establish production-schema
compatibility.

## Finding and intended invariant

`utils/migration_sms_import.sql` adds `uq_transaction_sms_hash` as a globally
unique key on `transactions.sms_hash`. The application lookup scopes duplicate
checks by `user_id` and `sms_hash`, and SMS-import race handling recognizes the
index name. The intended invariant is:

```text
UNIQUE (user_id, sms_hash)
```

Retain the index name `uq_transaction_sms_hash` so the existing duplicate-race
classifier can continue recognizing the MySQL duplicate-key error. Verify the
actual driver/server error shape in an isolated disposable database before
rollout.

## Source of truth and limitations

The repository does **not** contain authoritative core-table DDL for
`transactions` or `users`, nor a migration history/state table. The available
SQL only adds SMS-import columns/indexes and defines `budgets`. Therefore this
proposal cannot establish the production table definition, engine, column
types/nullability/collation, foreign keys, or whether the SMS migration has
already run. Do not infer production compatibility from these files or from a
test fixture.

Before any real change, an authorized DBA must privately verify the full live
DDL, server version, table engine, relevant column definitions, and exact
index/constraint state. Do not put row values, SMS hashes, or user identifiers
in migration output, review artifacts, or logs.

## Aggregate-only, read-only preflight

Run only on a specifically approved target. These queries return aggregate
counts and index metadata checks; they do not return row-level identifiers or
hashes. `DATABASE()` scopes the metadata checks without printing the schema
name.

```sql
-- Confirm exactly one target table exists and whether it uses InnoDB.
SELECT
  COUNT(*) AS target_table_count,
  COALESCE(SUM(ENGINE = 'InnoDB'), 0) AS innodb_table_count
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'transactions';

-- Confirm the required columns exist without returning column names/values.
SELECT
  COALESCE(SUM(COLUMN_NAME = 'user_id'), 0) AS user_id_column_count,
  COALESCE(SUM(COLUMN_NAME = 'sms_hash'), 0) AS sms_hash_column_count
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'transactions';

-- Inspect the named index by aggregate key-part counts only.
SELECT
  COUNT(*) AS index_part_count,
  COALESCE(SUM(NON_UNIQUE = 0), 0) AS unique_part_count,
  COALESCE(SUM(SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'sms_hash'), 0)
    AS global_key_first_part_count,
  COALESCE(SUM(SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'user_id'), 0)
    AS user_key_first_part_count,
  COALESCE(SUM(SEQ_IN_INDEX = 2 AND COLUMN_NAME = 'sms_hash'), 0)
    AS hash_key_second_part_count
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'transactions'
  AND INDEX_NAME = 'uq_transaction_sms_hash';

-- Count same-user duplicate groups. Proceed only when this returns zero.
SELECT COUNT(*) AS same_user_duplicate_group_count
FROM (
  SELECT user_id, sms_hash
  FROM transactions
  WHERE sms_hash IS NOT NULL
  GROUP BY user_id, sms_hash
  HAVING COUNT(*) > 1
) AS duplicate_groups;

-- Count repeated hashes across different users; these are allowed by the
-- intended invariant and must not be deleted or merged.
SELECT COUNT(*) AS cross_user_repeat_group_count
FROM (
  SELECT sms_hash
  FROM transactions
  WHERE sms_hash IS NOT NULL
  GROUP BY sms_hash
  HAVING COUNT(DISTINCT user_id) > 1
) AS repeated_groups;

-- Non-NULL hashes without an owner cannot be safely scoped.
SELECT COUNT(*) AS hashed_rows_without_user_count
FROM transactions
WHERE sms_hash IS NOT NULL
  AND user_id IS NULL;
```

The metadata counts do not replace private DBA review of the actual column
definitions, foreign keys, collation, server version, and migration state.
Stop if the table/index state differs from the reviewed plan, if same-user
duplicate groups exist, or if hashed rows have no owner. Do not print
identifiers or raw values when investigating an exception.

## Proposed forward DDL (not executed)

Test the exact DDL on a disposable clone with the same MySQL version, engine,
and relevant schema details. MySQL DDL can implicitly commit, take locks, and
fail to roll back transactionally; confirm operational and online-DDL behavior
for the target version before planning a maintenance window.

Only when the current named index is confirmed to be the expected global key
and the aggregate preflight is clean:

```sql
ALTER TABLE transactions
  DROP INDEX uq_transaction_sms_hash,
  ADD UNIQUE INDEX uq_transaction_sms_hash (user_id, sms_hash);
```

Do not run this statement against production or a shared database as part of
this proposal or its review. Do not delete or merge any records. After an
approved change, privately verify the index definition and test that one
user's repeated hash is rejected while another user's same hash is accepted.
Confirm the application reports/skips the same-user duplicate race.

## Rollback considerations and proposed DDL (not executed)

Restoring global uniqueness is impossible while different users have rows with
the same non-NULL hash. The rollback preflight returns only the number of
conflicting groups:

```sql
SELECT COUNT(*) AS global_duplicate_group_count
FROM (
  SELECT sms_hash
  FROM transactions
  WHERE sms_hash IS NOT NULL
  GROUP BY sms_hash
  HAVING COUNT(*) > 1
) AS duplicate_groups;
```

If the result is nonzero, stop. Do not delete, merge, or reassign transactions.
Escalate for an explicit data-reconciliation decision or use the approved,
verified backup/recovery procedure. Even when the result is zero, first verify
that the live composite index still matches the reviewed definition and test
the reverse DDL on the disposable clone:

```sql
ALTER TABLE transactions
  DROP INDEX uq_transaction_sms_hash,
  ADD UNIQUE INDEX uq_transaction_sms_hash (sms_hash);
```

Because DDL is not generally transactionally reversible, a verified backup
and recovery plan is required before either operation. No real/shared database
is to be modified during proposal testing.
