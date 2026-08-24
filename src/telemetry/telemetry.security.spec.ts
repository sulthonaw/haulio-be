import {
  canonicalTelemetry,
  hasValidSignature,
  signTelemetry,
} from './telemetry.security';

describe('telemetry signing', () => {
  const payload = {
    device_id: 'gw-01',
    truck_id: 'TRK-01',
    timestamp: '2026-08-24T00:00:00Z',
    lat: -6.2,
    lon: 106.8,
    speed_kph: 42,
    heading: 90,
    gps_accuracy_m: 8,
    cargo_status: 'loaded',
    fuel_pct: 61,
    sequence: 17,
    can: { coolant_temp_c: 88, rpm: 1500 },
    health: { signal_dbm: -82 },
  };
  const secret = 'cross-language-test-secret';

  it('uses the canonical representation verified by the Python DS service', () => {
    expect(canonicalTelemetry(payload)).toBe(
      '{"can":{"coolant_temp_c":88,"rpm":1500},"cargo_status":"loaded","device_id":"gw-01","fuel_pct":61,"gps_accuracy_m":8,"heading":90,"health":{"signal_dbm":-82},"lat":-6.2,"lon":106.8,"sequence":17,"speed_kph":42,"timestamp":"2026-08-24T00:00:00Z","truck_id":"TRK-01"}',
    );
    expect(signTelemetry(payload, secret)).toBe(
      'e99df078ac57791c68514892017f27e5f42594a50479761f199b845f0f21e84b',
    );
  });

  it('rejects signatures if a reading changes', () => {
    const signed = { ...payload, signature: signTelemetry(payload, secret) };
    expect(hasValidSignature(signed, secret)).toBe(true);
    expect(hasValidSignature({ ...signed, fuel_pct: 60 }, secret)).toBe(false);
  });
});
