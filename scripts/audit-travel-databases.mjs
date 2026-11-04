// Read-only metadata and aggregate account audit. Never logs URLs, emails, hashes or tokens.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { rootCertificates } from "node:tls";
import { pathToFileURL } from "node:url";
const require = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
);
const { Client } = require("pg");
const dotenv = require("dotenv");
export async function audit(client, schema) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema");
  await client.query("begin read only");
  try {
    await client.query(`set local search_path to ${schema},extensions,public`);
    const columns = await client.query(
      `select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema=$1 and table_name <> 'schema_migrations' order by table_name,ordinal_position`,
      [schema],
    );
    const constraints = await client.query(
      `select c.relname as table_name,p.conname,p.contype,pg_get_constraintdef(p.oid) as definition from pg_constraint p join pg_class c on c.oid=p.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relname <> 'schema_migrations' order by c.relname,p.conname`,
      [schema],
    );
    const indexes = await client.query(
      `select tablename,indexname,indexdef from pg_indexes where schemaname=$1 and tablename <> 'schema_migrations' order by tablename,indexname`,
      [schema],
    );
    const rls = await client.query(
      `select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relkind='r' and c.relname <> 'schema_migrations' order by c.relname`,
      [schema],
    );
    const grants = await client.query(
      `select table_name,grantee,privilege_type from information_schema.table_privileges where table_schema=$1 order by table_name,grantee,privilege_type`,
      [schema],
    );
    const policies = await client.query(
      `select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname=$1 order by tablename,policyname`,
      [schema],
    );
    const tableNames = new Set(columns.rows.map((c) => c.table_name));
    const accounts =
      tableNames.has("users") && tableNames.has("auth_identities")
        ? await client.query(`select count(*)::int as total,
      count(*) filter(where u.password_hash is not null)::int as with_password,
      count(*) filter(where u.password_hash is null and g.linked)::int as google_only,
      count(*) filter(where u.password_hash is not null and g.linked)::int as linked,
      count(*) filter(where u.password_hash is null and not g.linked)::int as missing_signin_method,
      count(*) filter(where u.provider='google' and not g.linked)::int as google_identity_missing
      from users u cross join lateral(select exists(select 1 from auth_identities i where i.user_id=u.id and i.provider='google') as linked) g`)
        : { rows: [{ status: "auth_schema_incomplete" }] };
    const duplicates = await client.query(
      `select count(*)::int as groups from (select lower(trim(email::text)) from users group by lower(trim(email::text)) having count(*)>1) d`,
    );
    const migrations = await client.query(
      `select name,to_jsonb(m)->>'checksum' as checksum from schema_migrations m order by name`,
    );
    const versions = tableNames.has("catalog_versions")
      ? await client.query(
          `select name,version from catalog_versions order by name`,
        )
      : { rows: [] };
    const catalog = await client.query(
      `select slug,name,country,timezone,currency,lat,lon,aliases from cities order by slug`,
    );
    const cityDuplicates = await client.query(
      `select count(*)::int as groups from (select lower(name->>'en'),country from cities group by lower(name->>'en'),country having count(*)>1) d`,
    );
    const canonical = await client.query(
      `select count(*)::int as incomplete from cities where nullif(trim(name->>'en'),'') is null or country='' or lat is null or lon is null`,
    );
    return {
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
      rls: rls.rows,
      grants: grants.rows,
      policies: policies.rows,
      migrations: migrations.rows,
      catalog_versions: versions.rows,
      catalog: catalog.rows,
      accounts: {
        ...accounts.rows[0],
        duplicate_email_groups: duplicates.rows[0].groups,
      },
      city_audit: {
        duplicate_name_groups: cityDuplicates.rows[0].groups,
        ...canonical.rows[0],
      },
    };
  } finally {
    await client.query("rollback");
  }
}
export function logicalSnapshot(value) {
  // Compare structure, not environment-specific owner or backend role names.
  return JSON.stringify({
    columns: value.columns,
    constraints: value.constraints,
    indexes: value.indexes,
    migrations: value.migrations,
    catalog_versions: value.catalog_versions,
    catalog: value.catalog,
  })
    .replaceAll("travel_cloud.", "app.")
    .replaceAll("public.", "app.");
}
async function main() {
  const local = dotenv.parse(
    await readFile(new URL("../.env", import.meta.url), "utf8"),
  );
  let cloud = {};
  try {
    cloud = dotenv.parse(
      await readFile(
        new URL("../.env.cloudflare.local", import.meta.url),
        "utf8",
      ),
    );
  } catch {}
  const targets = [
    {
      name: "local",
      url:
        process.env.AUDIT_LOCAL_URL ||
        local.POSTGRES_ADMIN_URL ||
        local.POSTGRES_URL,
      schema: "public",
    },
    {
      name: "cloud",
      url: process.env.AUDIT_CLOUD_URL || cloud.SUPABASE_DATABASE_URL,
      schema: "travel_cloud",
    },
  ];
  const results = [];
  for (const t of targets) {
    if (!t.url) {
      console.log(JSON.stringify({ target: t.name, status: "not_configured" }));
      continue;
    }
    const remote = !["localhost", "127.0.0.1"].includes(
      new URL(t.url).hostname,
    );
    const ca = remote
      ? await readFile(
          new URL("../apps/server/cloudflare/supabase-ca.crt", import.meta.url),
          "utf8",
        )
      : undefined;
    const client = new Client({
      connectionString: t.url,
      ssl: remote
        ? { ca: [...rootCertificates, ca], rejectUnauthorized: true }
        : undefined,
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      const result = await audit(client, t.schema);
      results.push(result);
      console.log(
        JSON.stringify({ target: t.name, status: "ok", ...result }, null, 2),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          target: t.name,
          status: "failed",
          code: /^[0-9A-Z_]+$/.test(error.code ?? "")
            ? error.code
            : "AUDIT_FAILED",
        }),
      );
      process.exitCode = 1;
    } finally {
      await client.end().catch(() => {});
    }
  }
  if (results.length === 2) {
    const equal = logicalSnapshot(results[0]) === logicalSnapshot(results[1]);
    console.log(JSON.stringify({ logical_schema_and_catalog_equal: equal }));
    if (!equal) process.exitCode = 1;
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
