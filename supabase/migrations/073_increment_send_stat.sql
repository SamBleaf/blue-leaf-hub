-- =============================================================================
-- 073_increment_send_stat.sql — atomic email_sends counter increment (H12)
--
-- crmRoutes.mjs Resend webhook calls rpc("increment_send_stat", ...) to bump the
-- per-send delivery counters, but the function was never created, so the RPC failed
-- silently and delivered/opened/clicked/etc counts never moved (audit H12).
--
-- The function looks up the parent email_send via a recipient's resend_email_id and
-- increments the named counter. p_field is whitelisted (no dynamic SQL) so it's safe to
-- pass straight from the webhook handler.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.increment_send_stat(p_resend_email_id text, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_send_id uuid;
BEGIN
  SELECT email_send_id INTO v_send_id
  FROM email_send_recipients
  WHERE resend_email_id = p_resend_email_id
  LIMIT 1;

  IF v_send_id IS NULL THEN
    RETURN;
  END IF;

  IF p_field = 'delivered_count' THEN
    UPDATE email_sends SET delivered_count    = COALESCE(delivered_count,0)    + 1 WHERE id = v_send_id;
  ELSIF p_field = 'opened_count' THEN
    UPDATE email_sends SET opened_count        = COALESCE(opened_count,0)        + 1 WHERE id = v_send_id;
  ELSIF p_field = 'clicked_count' THEN
    UPDATE email_sends SET clicked_count       = COALESCE(clicked_count,0)       + 1 WHERE id = v_send_id;
  ELSIF p_field = 'bounced_count' THEN
    UPDATE email_sends SET bounced_count       = COALESCE(bounced_count,0)       + 1 WHERE id = v_send_id;
  ELSIF p_field = 'complained_count' THEN
    UPDATE email_sends SET complained_count    = COALESCE(complained_count,0)    + 1 WHERE id = v_send_id;
  ELSIF p_field = 'unsubscribed_count' THEN
    UPDATE email_sends SET unsubscribed_count  = COALESCE(unsubscribed_count,0)  + 1 WHERE id = v_send_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_send_stat(text, text) TO authenticated, service_role, anon;
