-- Custom trade categories (used in Subcontractors + app-wide dropdowns)
CREATE TABLE IF NOT EXISTS public.custom_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  colour text DEFAULT '#1B3A5C',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anon custom_trades" ON public.custom_trades;
CREATE POLICY "Allow all anon custom_trades" ON public.custom_trades FOR ALL USING (true) WITH CHECK (true);
