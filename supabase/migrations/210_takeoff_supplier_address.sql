-- =============================================================================
-- 210 — Supplier pickup / branch address (Hub review HUB 019, 20 Oct 2026)
--
-- Office staff add and edit a supplier from the order, including the pickup / branch address the order form uses.
-- Additive, one statement, safe to re-run. (The Procurement page already reads suppliers.address, so this also fixes
-- that read on the live database, where the column was missing.) The app works before this is pasted — the address
-- just isn't saved until then.
-- =============================================================================
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address text;

NOTIFY pgrst, 'reload schema';
