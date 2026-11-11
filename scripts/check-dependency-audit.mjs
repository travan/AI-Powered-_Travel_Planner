import { readFile } from "node:fs/promises";

const [currentPath, baselinePath] = process.argv.slice(2);

async function readAdvisories(path) {
  const data = JSON.parse(await readFile(path, "utf8"));
  if (!data.metadata?.vulnerabilities || !data.advisories)
    throw new Error("Dependency audit did not return a valid advisory report.");

  const affected = new Map();
  for (const [id, advisory] of Object.entries(data.advisories)) {
    if (!["high", "critical"].includes(advisory.severity)) continue;
    for (const finding of advisory.findings ?? []) {
      for (const path of finding.paths ?? []) {
        affected.set(`${id}:${finding.version}:${path}`, advisory);
      }
    }
  }
  return affected;
}

const current = await readAdvisories(currentPath);
const baseline = baselinePath ? await readAdvisories(baselinePath) : current;
const uniqueAdvisories = (entries) => [...new Set(entries)];
const introduced = uniqueAdvisories(
  [...current]
    .filter(([key]) => !baseline.has(key))
    .map(([, advisory]) => advisory),
);
const inherited = uniqueAdvisories(
  [...current]
    .filter(([key]) => baseline.has(key))
    .map(([, advisory]) => advisory),
);

if (inherited.length) {
  console.log(
    `::warning::${inherited.length} inherited high or critical advisories remain in production dependencies.`,
  );
  for (const advisory of inherited)
    console.log(
      `Inherited: ${advisory.severity} ${advisory.module_name} (${advisory.github_advisory_id ?? advisory.id})`,
    );
}
for (const advisory of introduced)
  console.log(
    `::error::New ${advisory.severity} dependency advisory in ${advisory.module_name} (${advisory.github_advisory_id ?? advisory.id})`,
  );
if (introduced.length) process.exitCode = 1;
