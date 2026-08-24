import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsGateway } from '../events/events.gateway';
import { DsTelemetryForwarderService } from './ds-telemetry-forwarder.service';
import { TelematicsDevice } from './telematics-device.entity';
import { TelemetryEvent } from './telemetry-event.entity';
import { hasValidSignature } from './telemetry.security';
import {
  DeviceMapping,
  IngestResult,
  NumericMap,
  TelematicsPayload,
} from './telemetry.types';
import { TruckState } from './truck-state.entity';

const TOPIC_PREFIX = 'haulio/v1/telemetry';

@Injectable()
export class TelemetryService {
  constructor(
    private readonly configService: ConfigService,
    private readonly dsForwarder: DsTelemetryForwarderService,
    private readonly eventsGateway: EventsGateway,
    @InjectRepository(TelematicsDevice)
    private readonly deviceRepository: Repository<TelematicsDevice>,
    @InjectRepository(TelemetryEvent)
    private readonly eventRepository: Repository<TelemetryEvent>,
    @InjectRepository(TruckState)
    private readonly stateRepository: Repository<TruckState>,
  ) {}

  async ingestMqtt(topic: string, input: unknown): Promise<IngestResult> {
    try {
      const payload = this.parsePayload(input);
      const mapping = this.deviceMapping(payload.device_id);
      if (!mapping || mapping.truck_id !== payload.truck_id) {
        return {
          accepted: false,
          duplicate: false,
          reason: 'device is not authorized for this truck',
        };
      }
      if (
        !hasValidSignature(input as Record<string, unknown>, mapping.secret)
      ) {
        return {
          accepted: false,
          duplicate: false,
          reason: 'invalid device signature',
        };
      }
      if (topic !== `${this.topicPrefix()}/${payload.device_id}`) {
        return {
          accepted: false,
          duplicate: false,
          reason: 'MQTT topic does not match device identity',
        };
      }

      const observedAt = new Date(payload.timestamp);
      await this.ensureDevice(mapping, observedAt);
      const currentState = await this.stateRepository.findOne({
        where: { truckId: payload.truck_id },
      });
      if (currentState && payload.sequence <= currentState.sequence) {
        return { accepted: true, duplicate: true, truck_id: payload.truck_id };
      }

      const event = await this.eventRepository.save(
        this.eventRepository.create({
          deviceId: payload.device_id,
          truckId: payload.truck_id,
          observedAt,
          lat: payload.lat,
          lon: payload.lon,
          speedKph: payload.speed_kph,
          heading: payload.heading,
          gpsAccuracyM: payload.gps_accuracy_m,
          cargoStatus: payload.cargo_status,
          fuelPct: payload.fuel_pct,
          sequence: payload.sequence,
          cargoWeightKg: payload.cargo_weight_kg ?? null,
          can: payload.can ?? null,
          imu: payload.imu ?? null,
          health: payload.health ?? null,
          topic,
          replayed: Date.now() - observedAt.getTime() > 120_000,
          dsAccepted: null,
          dsStatus: null,
          dsReason: null,
        }),
      );
      const state = await this.stateRepository.save(
        this.stateRepository.create({
          ...(currentState ?? {}),
          truckId: payload.truck_id,
          deviceId: payload.device_id,
          observedAt,
          lat: payload.lat,
          lon: payload.lon,
          speedKph: payload.speed_kph,
          heading: payload.heading,
          gpsAccuracyM: payload.gps_accuracy_m,
          cargoStatus: payload.cargo_status,
          fuelPct: payload.fuel_pct,
          sequence: payload.sequence,
          cargoWeightKg: payload.cargo_weight_kg ?? null,
          can: payload.can ?? null,
          imu: payload.imu ?? null,
          health: payload.health ?? null,
        }),
      );
      const ds = await this.dsForwarder.forward(payload);
      event.dsAccepted = ds.accepted;
      event.dsStatus = ds.status;
      event.dsReason = ds.reason ?? null;
      await this.eventRepository.save(event);
      this.eventsGateway.emitTelemetry({
        truck_id: state.truckId,
        device_id: state.deviceId,
        observed_at: state.observedAt.toISOString(),
        lat: state.lat,
        lon: state.lon,
        speed_kph: state.speedKph,
        cargo_status: state.cargoStatus,
        fuel_pct: state.fuelPct,
        cargo_weight_kg: state.cargoWeightKg,
        ds_accepted: ds.accepted,
        ds_status: ds.status,
      });
      return {
        accepted: true,
        duplicate: false,
        truck_id: payload.truck_id,
        ds_status: ds.status,
        reason: ds.reason,
      };
    } catch (error) {
      return {
        accepted: false,
        duplicate: false,
        reason:
          error instanceof Error ? error.message : 'invalid telemetry payload',
      };
    }
  }

  status(): { enabled: boolean; topic: string; mapped_devices: number } {
    return {
      enabled: this.configService.get<string>('MQTT_ENABLED') === 'true',
      topic: `${this.topicPrefix()}/+`,
      mapped_devices: this.deviceMappings().size,
    };
  }

  private async ensureDevice(
    mapping: DeviceMapping,
    observedAt: Date,
  ): Promise<TelematicsDevice> {
    let device = await this.deviceRepository.findOne({
      where: { deviceId: mapping.device_id },
    });
    if (!device) {
      device = this.deviceRepository.create({
        deviceId: mapping.device_id,
        truckId: mapping.truck_id,
        enabled: true,
        lastSeenAt: observedAt,
      });
    }
    if (!device.enabled || device.truckId !== mapping.truck_id) {
      throw new Error('device registration is disabled or mismatched');
    }
    device.lastSeenAt = observedAt;
    return this.deviceRepository.save(device);
  }

  private parsePayload(input: unknown): TelematicsPayload {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('telemetry payload must be a JSON object');
    }
    const value = input as Record<string, unknown>;
    const timestamp = this.stringField(value, 'timestamp');
    const observedAt = new Date(timestamp);
    if (Number.isNaN(observedAt.getTime()))
      throw new Error('timestamp must be ISO-8601');
    if (observedAt.getTime() > Date.now() + 10 * 60 * 1000) {
      throw new Error('timestamp is more than ten minutes in the future');
    }
    const payload: TelematicsPayload = {
      device_id: this.stringField(value, 'device_id'),
      truck_id: this.stringField(value, 'truck_id'),
      timestamp,
      lat: this.numberField(value, 'lat', -11.5, 6.5),
      lon: this.numberField(value, 'lon', 94, 142),
      speed_kph: this.numberField(value, 'speed_kph', 0, 130),
      heading: this.numberField(value, 'heading', 0, 360),
      gps_accuracy_m: this.numberField(value, 'gps_accuracy_m', 0, 1_000),
      cargo_status: this.stringField(value, 'cargo_status'),
      fuel_pct: this.numberField(value, 'fuel_pct', 0, 100),
      sequence: this.integerField(value, 'sequence', 1),
      signature: this.stringField(value, 'signature'),
      cargo_weight_kg: this.optionalNumber(
        value,
        'cargo_weight_kg',
        0,
        100_000,
      ),
      can: this.optionalNumericMap(value, 'can'),
      imu: this.optionalNumericMap(value, 'imu'),
      health: this.optionalNumericMap(value, 'health'),
    };
    return Object.fromEntries(
      Object.entries(payload).filter(([, child]) => child !== undefined),
    ) as TelematicsPayload;
  }

  private deviceMapping(deviceId: string): DeviceMapping | undefined {
    return this.deviceMappings().get(deviceId);
  }

  private deviceMappings(): Map<string, DeviceMapping> {
    const raw = this.configService.get<string>('IOT_DEVICE_MAPPINGS') ?? '[]';
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Map();
      const mappings = parsed.filter(
        (item): item is DeviceMapping =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as DeviceMapping).device_id === 'string' &&
          typeof (item as DeviceMapping).truck_id === 'string' &&
          typeof (item as DeviceMapping).secret === 'string',
      );
      return new Map(mappings.map((mapping) => [mapping.device_id, mapping]));
    } catch {
      return new Map();
    }
  }

  private topicPrefix(): string {
    return (
      this.configService.get<string>('MQTT_TOPIC_PREFIX') ?? TOPIC_PREFIX
    ).replace(/\/+$/, '');
  }

  private stringField(value: Record<string, unknown>, key: string): string {
    const child = value[key];
    if (typeof child !== 'string' || !child.trim())
      throw new Error(`${key} is required`);
    return child;
  }

  private numberField(
    value: Record<string, unknown>,
    key: string,
    min: number,
    max: number,
  ): number {
    const child = Number(value[key]);
    if (!Number.isFinite(child) || child < min || child > max) {
      throw new Error(`${key} must be between ${min} and ${max}`);
    }
    return child;
  }

  private integerField(
    value: Record<string, unknown>,
    key: string,
    min: number,
  ): number {
    const child = this.numberField(value, key, min, Number.MAX_SAFE_INTEGER);
    if (!Number.isInteger(child)) throw new Error(`${key} must be an integer`);
    return child;
  }

  private optionalNumber(
    value: Record<string, unknown>,
    key: string,
    min: number,
    max: number,
  ): number | undefined {
    return value[key] === undefined
      ? undefined
      : this.numberField(value, key, min, max);
  }

  private optionalNumericMap(
    value: Record<string, unknown>,
    key: string,
  ): NumericMap | undefined {
    const child = value[key];
    if (child === undefined) return undefined;
    if (!child || typeof child !== 'object' || Array.isArray(child)) {
      throw new Error(`${key} must be an object of numeric readings`);
    }
    const result: NumericMap = {};
    for (const [name, reading] of Object.entries(
      child as Record<string, unknown>,
    )) {
      const number = Number(reading);
      if (!Number.isFinite(number))
        throw new Error(`${key}.${name} must be numeric`);
      result[name] = number;
    }
    return result;
  }
}
