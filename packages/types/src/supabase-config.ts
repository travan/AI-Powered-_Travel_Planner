export interface SupabasePublicEnvSpec {
  appName: string;
  urlKeys: readonly string[];
  keyKeys: readonly string[];
}

export interface SupabasePublicConfig {
  url: string;
  key: string;
  urlKey: string;
  keyKey: string;
}

export interface SupabasePublicConfigResolution {
  ok: boolean;
  config: SupabasePublicConfig | null;
  errorMessage: string | null;
}

export interface SupabaseCookieToSet {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

export const WEB_SUPABASE_PUBLIC_ENV_SPEC: SupabasePublicEnvSpec = {
  appName: "web",
  urlKeys: ["NEXT_PUBLIC_SUPABASE_URL"],
  keyKeys: ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
};

export const MOBILE_SUPABASE_PUBLIC_ENV_SPEC: SupabasePublicEnvSpec = {
  appName: "mobile",
  urlKeys: ["EXPO_PUBLIC_SUPABASE_URL"],
  keyKeys: ["EXPO_PUBLIC_SUPABASE_ANON_KEY", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
};

function pickFirstNonEmpty(
  env: Record<string, string | undefined>,
  keys: readonly string[]
): { key: string; value: string } | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return { key, value };
    }
  }

  return null;
}

function isPlaceholder(value: string): boolean {
  return value.toLowerCase().includes("placeholder");
}

function buildMissingEnvMessage(spec: SupabasePublicEnvSpec): string {
  return [
    `Supabase is not configured for ${spec.appName}.`,
    `Set one of [${spec.urlKeys.join(", ")}] for URL and one of [${spec.keyKeys.join(", ")}] for API key.`,
  ].join(" ");
}

function buildPlaceholderEnvMessage(spec: SupabasePublicEnvSpec): string {
  return `Supabase config for ${spec.appName} contains placeholder values. Replace them with real project URL and public key.`;
}

export function resolveSupabasePublicConfig(
  env: Record<string, string | undefined>,
  spec: SupabasePublicEnvSpec
): SupabasePublicConfigResolution {
  const urlCandidate = pickFirstNonEmpty(env, spec.urlKeys);
  const keyCandidate = pickFirstNonEmpty(env, spec.keyKeys);

  if (!urlCandidate || !keyCandidate) {
    return {
      ok: false,
      config: null,
      errorMessage: buildMissingEnvMessage(spec),
    };
  }

  if (isPlaceholder(urlCandidate.value) || isPlaceholder(keyCandidate.value)) {
    return {
      ok: false,
      config: null,
      errorMessage: buildPlaceholderEnvMessage(spec),
    };
  }

  return {
    ok: true,
    config: {
      url: urlCandidate.value,
      key: keyCandidate.value,
      urlKey: urlCandidate.key,
      keyKey: keyCandidate.key,
    },
    errorMessage: null,
  };
}
