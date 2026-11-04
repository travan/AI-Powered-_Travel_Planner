-- Consolidate only unambiguous exact city names. Keep conflicting data for review.
create table if not exists public.city_reconciliation_report (
  original_slug text primary key, canonical_slug text not null,
  status text not null check(status in ('merged','conflict')),
  detail text not null, updated_at timestamptz not null default now()
);
alter table public.city_reconciliation_report enable row level security;
revoke all on public.city_reconciliation_report from public;
do $$
declare duplicate record; reference record;
begin
  for duplicate in
    select d.slug as old_slug, min(c.slug) as canonical_slug
    from public.cities d join public.cities c on d.slug<>c.slug
      and c.slug in ('ha-noi','ho-chi-minh-city','da-nang','hoi-an','hue','nha-trang','da-lat','phu-quoc','sa-pa','ha-long','ninh-binh')
      and (d.country='' or d.country=c.country)
      and (d.lat is null or abs(d.lat-c.lat)<0.3)
      and (d.lon is null or abs(d.lon-c.lon)<0.3)
      and (lower(d.name->>'en') in (lower(c.name->>'en'),lower(c.name->>'vi'))
        or lower(d.name->>'vi') in (lower(c.name->>'en'),lower(c.name->>'vi')))
    where d.slug not in ('ha-noi','ho-chi-minh-city','da-nang','hoi-an','hue','nha-trang','da-lat','phu-quoc','sa-pa','ha-long','ninh-binh')
    group by d.slug having count(*)=1
  loop
    begin
      for reference in
        select n.nspname as schema_name,t.relname as table_name,a.attname as column_name
        from pg_constraint con join pg_class t on t.oid=con.conrelid
        join pg_namespace n on n.oid=t.relnamespace
        join pg_attribute a on a.attrelid=t.oid and a.attnum=con.conkey[1]
        where con.contype='f' and con.confrelid='public.cities'::regclass and array_length(con.conkey,1)=1
      loop
        execute format('update %I.%I set %I=$1 where %I=$2',reference.schema_name,reference.table_name,reference.column_name,reference.column_name)
          using duplicate.canonical_slug,duplicate.old_slug;
      end loop;
      update public.cities set aliases=array_append(aliases,duplicate.old_slug)
        where slug=duplicate.canonical_slug and not duplicate.old_slug=any(aliases);
      delete from public.cities where slug=duplicate.old_slug;
      insert into public.city_reconciliation_report values(duplicate.old_slug,duplicate.canonical_slug,'merged','All relational references moved; saved plan snapshots resolve through aliases.',now())
        on conflict(original_slug) do update set status=excluded.status,detail=excluded.detail,updated_at=now();
    exception when unique_violation or foreign_key_violation then
      -- The subtransaction rolls back every reference update for this city.
      insert into public.city_reconciliation_report values(duplicate.old_slug,duplicate.canonical_slug,'conflict','Related catalog records conflict; preserved for manual review.',now())
        on conflict(original_slug) do update set status=excluded.status,detail=excluded.detail,updated_at=now();
    end;
  end loop;
end $$;
