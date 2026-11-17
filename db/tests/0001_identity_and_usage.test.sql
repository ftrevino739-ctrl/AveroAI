-- Integration smoke test for migration 0001. Run after applying the schema.
-- All fixtures are rolled back; this test never leaves account data behind.
BEGIN;

INSERT INTO app_users (id, email, status)
VALUES ('00000000-0000-4000-8000-000000000001', 'ci-schema-test@example.invalid', 'active');

INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  decode(repeat('a', 64), 'hex'),
  now() + interval '15 minutes'
);

INSERT INTO account_limits (
  id, user_id, policy_version, period_starts_at, period_ends_at,
  max_requests, max_input_tokens, max_output_tokens, max_credits
)
VALUES (
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  'ci-v1', now(), now() + interval '1 day', 20, 10000, 5000, 100
);

INSERT INTO usage_reservations (
  request_id, user_id, model_id, reserved_credits, status, expires_at
)
VALUES (
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000001',
  'community:test-model', 10, 'reserved', now() + interval '5 minutes'
);

INSERT INTO usage_ledger (
  id, user_id, request_id, idempotency_key, entry_type, model_id,
  input_tokens, output_tokens, credit_delta
)
VALUES (
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004',
  'ci-settlement-0001',
  'usage_debit', 'community:test-model', 120, 80, -10
);

UPDATE usage_reservations
SET status = 'settled',
    settlement_id = '00000000-0000-4000-8000-000000000005',
    updated_at = now()
WHERE request_id = '00000000-0000-4000-8000-000000000004';

DO $$
BEGIN
  BEGIN
    UPDATE usage_ledger
    SET credit_delta = -9
    WHERE id = '00000000-0000-4000-8000-000000000005';
    RAISE EXCEPTION 'append-only trigger did not block UPDATE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'append-only trigger did not block UPDATE' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    DELETE FROM usage_ledger
    WHERE id = '00000000-0000-4000-8000-000000000005';
    RAISE EXCEPTION 'append-only trigger did not block DELETE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'append-only trigger did not block DELETE' THEN
      RAISE;
    END IF;
  END;
END;
$$;

ROLLBACK;
