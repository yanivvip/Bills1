-- A renter's phone number (optional): bills and reminders open WhatsApp on that number.
alter table public.contract_renters add column phone text;
