export type ApiUrlOptions = {
  publicBaseUrl?: string;
  serverBaseUrl?: string;
  fallbackBaseUrl?: string;
  isServer?: boolean;
};

export function joinApiUrl(baseUrl: string | undefined, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = baseUrl?.trim().replace(/\/+$/, "");
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function resolveApiUrl(path: string, options: ApiUrlOptions = {}): string {
  const publicBase = options.publicBaseUrl?.trim();
  if (publicBase) return joinApiUrl(publicBase, path);

  if (options.isServer) {
    const serverBase = options.serverBaseUrl?.trim() || options.fallbackBaseUrl;
    return joinApiUrl(serverBase, path);
  }

  return joinApiUrl(undefined, path);
}

export function resolveApiBaseUrl(configuredBaseUrl: string | undefined, fallbackBaseUrl: string): string {
  return (configuredBaseUrl?.trim() || fallbackBaseUrl).replace(/\/+$/, "");
}
