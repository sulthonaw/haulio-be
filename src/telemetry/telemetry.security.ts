import { createHmac, timingSafeEqual } from 'node:crypto';

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        // Match Python json.dumps(sort_keys=True): deterministic Unicode code-point order.
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
}

export function canonicalTelemetry(payload: Record<string, unknown>): string {
  const unsignedPayload = { ...payload };
  delete unsignedPayload.signature;
  return JSON.stringify(sortValue(unsignedPayload));
}

export function signTelemetry(
  payload: Record<string, unknown>,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(canonicalTelemetry(payload))
    .digest('hex');
}

export function hasValidSignature(
  payload: Record<string, unknown>,
  secret: string,
): boolean {
  const provided =
    typeof payload.signature === 'string' ? payload.signature : '';
  const expected = signTelemetry(payload, secret);
  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}
