-- How each kind of meter is connected, per property: separate meters, a main meter with sub-meters (the difference to the
-- landlord's household or shared by the units), one shared meter divided by percentage or head-count, or the renter
-- paying the supplier directly. The defaults keep what every property did before: main meter, difference to the landlord.

alter table public.tariffs
  add column electricity_layout     text not null default 'main_sub' check (electricity_layout in ('separate', 'main_sub', 'shared', 'direct')),
  add column electricity_difference text not null default 'landlord' check (electricity_difference in ('landlord', 'units')),
  add column electricity_split      text not null default 'heads' check (electricity_split in ('percent', 'heads')),
  add column water_layout           text not null default 'main_sub' check (water_layout in ('separate', 'main_sub', 'shared', 'direct')),
  add column water_difference       text not null default 'landlord' check (water_difference in ('landlord', 'units')),
  add column water_split            text not null default 'heads' check (water_split in ('percent', 'heads'));

-- the weights of a shared meter: people living in the unit, and its share in percent per kind (the rest stays with the landlord)
alter table public.units
  add column occupants           smallint not null default 1 check (occupants >= 0),
  add column electricity_percent numeric(5, 2) check (electricity_percent between 0 and 100),
  add column water_percent       numeric(5, 2) check (water_percent between 0 and 100);
