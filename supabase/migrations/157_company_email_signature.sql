-- 157_company_email_signature.sql
-- Persist the outbound email signature server-side so it is account-wide, not per-browser.
-- Root cause of the "wrong signature" bug: the signature lived ONLY in browser localStorage
-- (src/lib/rfqSettings.js), so a send from a browser/device that never saved it fell back to the
-- built-in default. Storing it on the single-company config row makes every send path
-- (tender blast, reminders, replies) read the SAME saved signature regardless of who sends.
--
-- Shape matches the client signature object (minus the logo, which already lives in the
-- "branding" storage bucket): { fullName, title, mobile, website, postalAddress, legalDisclaimer }.

alter table public.company_profile
  add column if not exists email_signature jsonb;

comment on column public.company_profile.email_signature is
  'Outbound email signature text fields (fullName/title/mobile/website/postalAddress/legalDisclaimer). Logo lives in the branding storage bucket. Read server-side by server/lib/emailSignature.mjs.';
