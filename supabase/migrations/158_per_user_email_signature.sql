-- 158_per_user_email_signature.sql
-- Signatures are PER ACCOUNT: when Josh sends, it signs as Josh; when Sam sends, as Sam.
-- (Migration 157 made it a single company-wide signature — that was wrong for multi-user sending.)
--
-- Model: each user's signature lives on user_profiles.email_signature (keyed by auth uid).
-- The send picks the SENDING user's signature, falling back to the TEAM DEFAULT
-- (company_profile.email_signature), then the built-in default. Sam's signature is seeded as the
-- team default so unset accounts inherit his.

alter table public.user_profiles
  add column if not exists email_signature jsonb;

comment on column public.user_profiles.email_signature is
  'This user''s personal outbound-email signature (fullName/title/mobile/website/postalAddress/legalDisclaimer). Read server-side by emailSignature.mjs; falls back to company_profile.email_signature (team default).';

-- Seed the TEAM DEFAULT (company_profile.email_signature) with Sam's signature, so accounts that
-- haven't personalised theirs inherit his. Only fills when not already set; ensures a row exists.
update public.company_profile
   set email_signature = jsonb_build_object(
     'fullName', 'Sam Morris',
     'title', 'Director',
     'mobile', '0434 046 399',
     'website', 'https://www.blueleafbuilding.com.au',
     'postalAddress', 'PO Box 3225 Newton, 5074',
     'legalDisclaimer', 'The content of this email is confidential and intended for the recipient specified in message only. It is strictly forbidden to share any part of this message with any third party, without a written consent of the sender. If you received this message by mistake, please reply to this message and follow with its deletion, so that we can ensure such a mistake does not occur in the future.'
   )
 where email_signature is null;

insert into public.company_profile (name, email_signature)
select 'Blue Leaf Building', jsonb_build_object(
     'fullName', 'Sam Morris',
     'title', 'Director',
     'mobile', '0434 046 399',
     'website', 'https://www.blueleafbuilding.com.au',
     'postalAddress', 'PO Box 3225 Newton, 5074',
     'legalDisclaimer', 'The content of this email is confidential and intended for the recipient specified in message only. It is strictly forbidden to share any part of this message with any third party, without a written consent of the sender. If you received this message by mistake, please reply to this message and follow with its deletion, so that we can ensure such a mistake does not occur in the future.'
   )
where not exists (select 1 from public.company_profile);
