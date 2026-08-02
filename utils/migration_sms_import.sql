-- Database Migration: Add SMS import columns to transactions table

ALTER TABLE transactions
  ADD COLUMN sms_hash VARCHAR(64) NULL,
  ADD COLUMN sender VARCHAR(50) NULL,
  ADD COLUMN bank VARCHAR(50) NULL,
  ADD COLUMN reference_number VARCHAR(100) NULL,
  ADD COLUMN source ENUM('manual', 'sms') NOT NULL DEFAULT 'manual',
  ADD CONSTRAINT uq_transaction_sms_hash UNIQUE (sms_hash);
