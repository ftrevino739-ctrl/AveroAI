BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS usage_reservations_request_model_uidx
  ON usage_reservations (request_id, model_id);

CREATE TABLE IF NOT EXISTS provider_usage_reports (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  node_id text NOT NULL CHECK (length(node_id) BETWEEN 3 AND 80),
  model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 200),
  input_tokens bigint NOT NULL CHECK (input_tokens BETWEEN 0 AND 1000000000),
  output_tokens bigint NOT NULL CHECK (output_tokens BETWEEN 0 AND 1000000000),
  source text NOT NULL CHECK (source = 'openai_compatible_runtime'),
  trust_class text NOT NULL CHECK (trust_class = 'provider_self_reported'),
  transport_signature_verified boolean NOT NULL DEFAULT true CHECK (transport_signature_verified = true),
  report_signature text NOT NULL CHECK (report_signature ~ '^[a-f0-9]{64}$'),
  reported_at_ms bigint NOT NULL CHECK (reported_at_ms > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_usage_reports_reservation_fk
    FOREIGN KEY (request_id, model_id)
    REFERENCES usage_reservations (request_id, model_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS provider_usage_reports_model_reported_idx
  ON provider_usage_reports (model_id, reported_at_ms DESC);
CREATE INDEX IF NOT EXISTS provider_usage_reports_node_reported_idx
  ON provider_usage_reports (node_id, reported_at_ms DESC);

CREATE OR REPLACE FUNCTION reject_provider_usage_report_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'provider_usage_reports is append-only';
END;
$$;

DROP TRIGGER IF EXISTS provider_usage_reports_no_update ON provider_usage_reports;
CREATE TRIGGER provider_usage_reports_no_update
  BEFORE UPDATE OR DELETE ON provider_usage_reports
  FOR EACH ROW EXECUTE FUNCTION reject_provider_usage_report_mutation();
COMMIT;
