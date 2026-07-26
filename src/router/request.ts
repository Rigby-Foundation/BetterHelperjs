/**
 * The slice of an incoming HTTP request that routes need in order to handle a
 * mutation. Deliberately small and transport-agnostic: the Node site server
 * builds one of these, but so can a Bun/Deno/worker handler.
 */
export interface RouteRequest {
  method: string;
  headers: Record<string, string>;
  /** Raw request body, exactly as received. */
  body: string;
  /**
   * Fields from a `application/x-www-form-urlencoded` body, or the query string
   * of a JSON body's top level when it is a flat object.
   *
   * `multipart/form-data` is not parsed — read `body` yourself for uploads.
   */
  formData: Record<string, string | string[]>;
  /** Parsed body when the Content-Type is JSON, otherwise `undefined`. */
  json?: unknown;
}

export const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isMutationMethod(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}

function lowercaseHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key of Object.keys(headers)) {
    const value = headers[key];
    if (value == null) continue;
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }

  return result;
}

export function parseFormData(body: string): Record<string, string | string[]> {
  const params = new URLSearchParams(body);
  const result: Record<string, string | string[]> = {};

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    result[key] = values.length > 1 ? values : values[0];
  }

  return result;
}

export function createRouteRequest(
  method: string,
  headers: Record<string, string | string[] | undefined> = {},
  body = ''
): RouteRequest {
  const normalizedHeaders = lowercaseHeaders(headers);
  const contentType = normalizedHeaders['content-type'] ?? '';

  let formData: Record<string, string | string[]> = {};
  let json: unknown;

  if (body) {
    if (contentType.includes('application/json')) {
      try {
        json = JSON.parse(body);
      } catch {
        json = undefined;
      }

      if (json && typeof json === 'object' && !Array.isArray(json)) {
        for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
          if (value == null) continue;
          formData[key] = Array.isArray(value) ? value.map(String) : String(value);
        }
      }
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType === '') {
      formData = parseFormData(body);
    }
  }

  return {
    method: method.toUpperCase(),
    headers: normalizedHeaders,
    body,
    formData,
    json,
  };
}
