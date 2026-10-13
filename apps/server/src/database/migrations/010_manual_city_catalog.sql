alter table public.cities
  alter column lat drop not null,
  alter column lon drop not null;
