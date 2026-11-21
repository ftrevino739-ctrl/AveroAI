BEGIN;
DO $$
DECLARE
  test_user_id uuid := '10000000-0000-4000-8000-000000000001';
  test_request_id uuid := '20000000-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO app_users (id, email, status)
  VALUES (test_user_id, 'provider-usage-migration-test@example.invalid', 'active');
  INSERT INTO usage_reservations (
    request_id, user_id, model_id, reserved_credits, status, expires_at
  ) VALUES (
    test_request_id, test_user_id, 'community/migration-test', 0, 'unmetered', now() + interval '5 minutes'
  );
  INSERT INTO provider_usage_reports (
    id, request_id, node_id, model_id, input_tokens, output_tokens, source,
    trust_class, transport_signature_verified, report_signature, reported_at_ms
  ) VALUES (
    '30000000-0000-4000-8000-000000000001', test_request_id,
    'gpu-node-migration-test', 'community/migration-test', 100, 50,
    'openai_compatible_runtime', 'provider_self_reported', true,
    repeat('a', 64), (extract(epoch FROM now()) * 1000)::bigint
  );
  BEGIN
    UPDATE provider_usage_reports SET input_tokens = 0 WHERE request_id = test_request_id;
    RAISE EXCEPTION 'Expected provider usage report append-only trigger to reject UPDATE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%provider_usage_reports is append-only%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM provider_usage_reports WHERE request_id = test_request_id;
    RAISE EXCEPTION 'Expected provider usage report append-only trigger to reject DELETE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%provider_usage_reports is append-only%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
