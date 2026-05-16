-- Allow RFQs to exist before outbound send (Message-ID threading)

ALTER TABLE public.rfqs DROP CONSTRAINT IF EXISTS rfqs_status_check;
ALTER TABLE public.rfqs
  ADD CONSTRAINT rfqs_status_check CHECK (
    status IN ('queued', 'sent', 'reminded', 'received', 'accepted', 'declined', 'not_required')
  );
