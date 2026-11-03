-- Generic message for append-only tables (StockMovement, AuditLog)
CREATE OR REPLACE FUNCTION puja_forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable (append-only). Post a reversal instead.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
