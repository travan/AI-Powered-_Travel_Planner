-- Merge only one-to-one bilingual aliases backed by a complete city record.
do $$
declare duplicate record; reference record;
begin
  for duplicate in
    select d.slug as old_slug,min(c.slug) as canonical_slug
    from public.cities d join public.cities c on d.slug<>c.slug and c.country<>'' and c.lat is not null and c.lon is not null and d.lookup_keys && c.lookup_keys
    where d.country='' and d.lat is null and d.lon is null
    group by d.slug having count(*)=1
  loop
    begin
      perform 1 from public.cities where slug=duplicate.old_slug and country='' for update;
      if not found then continue; end if;
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
