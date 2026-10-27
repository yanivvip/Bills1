-- Remember when the landlord last opened an invitation for a renter, and through which channel.
-- This records the landlord's action only; the app cannot know whether a mail or message was actually delivered.

alter table public.contract_renters
  add column invited_at     timestamptz,
  add column invite_channel text check (invite_channel in ('email', 'whatsapp', 'copy'));
