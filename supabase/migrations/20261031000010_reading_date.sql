-- The date the meter was actually read (chosen by whoever reports the reading).
alter table public.readings add column read_on date;
update public.readings set read_on = (submitted_at at time zone 'Asia/Jerusalem')::date;
alter table public.readings
  alter column read_on set not null,
  alter column read_on set default ((now() at time zone 'Asia/Jerusalem')::date);
