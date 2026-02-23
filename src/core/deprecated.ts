const seen = new Set<string>();

export const DEPRECATION_REMOVAL_VERSION = '3.2.0';

export function warnDeprecated(api: string): void {
  if (seen.has(api)) return;
  seen.add(api);

  console.warn(`[Deprecated] ${api} is Deprecated and will be removed in ${DEPRECATION_REMOVAL_VERSION}.`);
}
