import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { signTelemetry } from './telemetry.security';
import { TelematicsPayload } from './telemetry.types';

export interface DsForwardResult {
  accepted: boolean;
  status: number;
  reason?: string;
}

@Injectable()
export class DsTelemetryForwarderService {
  constructor(private readonly configService: ConfigService) {}

  async forward(payload: TelematicsPayload): Promise<DsForwardResult> {
    const secret = this.configService.get<string>('DS_IOT_SHARED_SECRET');
    if (!secret) {
      return {
        accepted: false,
        status: 503,
        reason: 'DS_IOT_SHARED_SECRET is not configured',
      };
    }

    const base =
      this.configService.get<string>('DS_API_URL') ??
      'http://127.0.0.1:8080/api/v1';
    const upstream = new URL(
      'telemetry',
      base.endsWith('/') ? base : `${base}/`,
    );
    const outbound: Record<string, unknown> = {
      device_id: payload.device_id,
      truck_id: payload.truck_id,
      timestamp: payload.timestamp,
      lat: payload.lat,
      lon: payload.lon,
      speed_kph: payload.speed_kph,
      heading: payload.heading,
      gps_accuracy_m: payload.gps_accuracy_m,
      cargo_status: payload.cargo_status,
      fuel_pct: payload.fuel_pct,
      sequence: payload.sequence,
      cargo_weight_kg: payload.cargo_weight_kg,
      can: payload.can,
      imu: payload.imu,
      health: payload.health,
      source: 'haulio_mqtt_gateway',
    };
    Object.keys(outbound).forEach((key) => {
      if (outbound[key] === undefined) delete outbound[key];
    });
    outbound.signature = signTelemetry(outbound, secret);

    try {
      const response = await fetch(upstream, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(outbound),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      const body: unknown = await response.json().catch(() => ({}));
      const result = body as { accepted?: boolean; reason?: string };
      return {
        accepted: response.status === 202 && result.accepted === true,
        status: response.status,
        reason: result.reason,
      };
    } catch {
      return {
        accepted: false,
        status: 502,
        reason: 'DS telemetry endpoint is unavailable',
      };
    }
  }
}
