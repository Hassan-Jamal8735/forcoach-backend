// Deep links back into the mobile app (production scheme, plus Expo Go's
// schemes for testing). Anything else is rejected so these redirect params
// can never be used to bounce users to an arbitrary site.
const ALLOWED_PREFIXES = ['forcoach://', 'exp://', 'exps://'];

export function isAllowedAppReturnUrl(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    url.length < 500 &&
    ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix))
  );
}

export function withQuery(url: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return `${url}${url.includes('?') ? '&' : '?'}${qs}`;
}
