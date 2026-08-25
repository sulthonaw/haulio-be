import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelematicsDevice } from '../telemetry/telematics-device.entity';
import { TelemetryEvent } from '../telemetry/telemetry-event.entity';
import { TruckState } from '../telemetry/truck-state.entity';
import { GoogleRoutesService } from './google-routes.service';

type TrafficLevel = 'jammed' | 'slow' | 'free';
type RecommendationStatus = 'proposed' | 'accepted' | 'rejected';

type Hub = {
  name: string;
  lat: number;
  lon: number;
};

const HUBS: readonly Hub[] = [
  { name: 'Banda Aceh', lat: 5.5483, lon: 95.3238 },
  { name: 'Medan', lat: 3.5952, lon: 98.6722 },
  { name: 'Pekanbaru', lat: 0.5071, lon: 101.4478 },
  { name: 'Padang', lat: -0.9471, lon: 100.4172 },
  { name: 'Batam', lat: 1.1301, lon: 104.0529 },
  { name: 'Bandar Lampung', lat: -5.3971, lon: 105.2668 },
  { name: 'Palembang', lat: -2.9909, lon: 104.7566 },
  { name: 'Jakarta', lat: -6.2088, lon: 106.8456 },
  { name: 'Cilegon', lat: -6.0164, lon: 106.0558 },
  { name: 'Bandung', lat: -6.9175, lon: 107.6191 },
  { name: 'Cirebon', lat: -6.732, lon: 108.5523 },
  { name: 'Semarang', lat: -6.9667, lon: 110.4167 },
  { name: 'Yogyakarta', lat: -7.7956, lon: 110.3695 },
  { name: 'Surabaya', lat: -7.2575, lon: 112.7521 },
  { name: 'Denpasar', lat: -8.65, lon: 115.2167 },
  { name: 'Mataram', lat: -8.5833, lon: 116.1167 },
  { name: 'Pontianak', lat: -0.0263, lon: 109.3425 },
  { name: 'Banjarmasin', lat: -3.3186, lon: 114.5944 },
  { name: 'Balikpapan', lat: -1.2379, lon: 116.8529 },
  { name: 'Samarinda', lat: -0.5022, lon: 117.1536 },
  { name: 'Palu', lat: -0.9003, lon: 119.877 },
  { name: 'Makassar', lat: -5.1477, lon: 119.4327 },
  { name: 'Kendari', lat: -3.9985, lon: 122.5129 },
  { name: 'Manado', lat: 1.4748, lon: 124.8421 },
  { name: 'Gorontalo', lat: 0.5435, lon: 123.0568 },
  { name: 'Ambon', lat: -3.6547, lon: 128.1906 },
  { name: 'Sorong', lat: -0.8762, lon: 131.2558 },
  { name: 'Jayapura', lat: -2.5916, lon: 140.669 },
  { name: 'Kupang', lat: -10.1772, lon: 123.607 },
  { name: 'Ternate', lat: 0.79, lon: 127.384 },
];

@Injectable()
export class LocalOperationsService {
  private readonly decisions = new Map<string, RecommendationStatus>();

  constructor(
    @InjectRepository(TruckState)
    private readonly stateRepository: Repository<TruckState>,
    @InjectRepository(TelemetryEvent)
    private readonly eventRepository: Repository<TelemetryEvent>,
    @InjectRepository(TelematicsDevice)
    private readonly deviceRepository: Repository<TelematicsDevice>,
    private readonly googleRoutesService: GoogleRoutesService,
  ) {}

  async metrics() {
    const states = await this.states();
    const recommendations = this.recommendationsFor(states);
    const atRisk = states.filter(
      (state) => this.emptyReturnRisk(state).probability >= 0.6,
    ).length;
    return {
      fleet_total: states.length,
      fleet_at_empty_risk: atRisk,
      open_orders: recommendations.filter(
        (recommendation) => recommendation.status !== 'rejected',
      ).length,
      recommendation_count: recommendations.length,
      recoverable_margin_idr: recommendations.reduce(
        (total, recommendation) => total + recommendation.expected_margin_idr,
        0,
      ),
      google_routes_configured: false,
    };
  }

  async fleet() {
    const states = await this.states();
    return { fleet: states.map((state) => this.truck(state)) };
  }

  async recommendations() {
    return { recommendations: this.recommendationsFor(await this.states()) };
  }

  async regions() {
    const states = await this.states();
    const logsByTruck = await this.logCounts();
    const buckets = new Map<
      string,
      { hub: Hub; truckCount: number; logCount: number; traffic: Record<TrafficLevel, number> }
    >();

    for (const state of states) {
      const hub = this.nearestHub(state.lat, state.lon);
      const bucket = buckets.get(hub.name) ?? {
        hub,
        truckCount: 0,
        logCount: 0,
        traffic: { jammed: 0, slow: 0, free: 0 },
      };
      bucket.truckCount += 1;
      bucket.logCount += logsByTruck.get(state.truckId) ?? 0;
      bucket.traffic[this.traffic(state).level] += 1;
      buckets.set(hub.name, bucket);
    }

    const activityScores = [...buckets.values()].map(
      (bucket) =>
        bucket.truckCount +
        bucket.logCount / 6 +
        bucket.traffic.jammed * 1.5 +
        bucket.traffic.slow * 0.5,
    );
    const maximumActivity = Math.max(1, ...activityScores);

    return {
      type: 'FeatureCollection' as const,
      features: [...buckets.values()].map((bucket) => {
        const score =
          bucket.truckCount +
          bucket.logCount / 6 +
          bucket.traffic.jammed * 1.5 +
          bucket.traffic.slow * 0.5;
        const activity = Number((score / maximumActivity).toFixed(3));
        return {
          type: 'Feature' as const,
          properties: {
            name: bucket.hub.name,
            truck_count: bucket.truckCount,
            log_count: bucket.logCount,
            activity,
            activity_level:
              activity >= 0.66 ? 'high' : activity >= 0.3 ? 'medium' : 'low',
            traffic: bucket.traffic,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [bucket.hub.lon, bucket.hub.lat],
          },
        };
      }),
      meta: {
        boundary_source: 'Derived local demo operating areas',
        color_metric: 'active truck and telemetry-log density',
      },
    };
  }

  async routeOptions(recommendationId: string) {
    const states = await this.states();
    const recommendation = this.recommendationsFor(states).find(
      (candidate) => candidate.id === recommendationId,
    );
    if (!recommendation) {
      throw new NotFoundException('Recommendation was not found');
    }
    const state = states.find(
      (candidate) => candidate.truckId === recommendation.truck_id,
    );
    if (!state) throw new NotFoundException('Truck state was not found');

    const currentHubIndex = this.nearestHubIndex(state.lat, state.lon);
    const pickup = HUBS[(currentHubIndex + 1) % HUBS.length];
    const dropoff = HUBS[(currentHubIndex + 3) % HUBS.length];
    const traffic = this.traffic(state);
    const directDistance = Math.max(
      20,
      this.distanceKm(state.lat, state.lon, pickup.lat, pickup.lon) +
        this.distanceKm(pickup.lat, pickup.lon, dropoff.lat, dropoff.lon),
    );
    const staticEta = Math.round((directDistance / 52) * 60);
    const midpoint: [number, number] = [
      (state.lon + pickup.lon) / 2,
      (state.lat + pickup.lat) / 2,
    ];
    const current: [number, number] = [state.lon, state.lat];
    const pickupPoint: [number, number] = [pickup.lon, pickup.lat];
    const dropoffPoint: [number, number] = [dropoff.lon, dropoff.lat];
    const primaryGoogleRoutes = await this.googleRoutesService.trafficAwareRoutes(
      { lat: state.lat, lon: state.lon },
      { lat: dropoff.lat, lon: dropoff.lon },
      [{ lat: pickup.lat, lon: pickup.lon }],
    );
    const googleRoutes = primaryGoogleRoutes ? [...primaryGoogleRoutes] : [];
    if (googleRoutes.length < 3) {
      const tollAvoidanceRoutes = await this.googleRoutesService.trafficAwareRoutes(
        { lat: state.lat, lon: state.lon },
        { lat: dropoff.lat, lon: dropoff.lon },
        [{ lat: pickup.lat, lon: pickup.lon }],
        { avoidTolls: true },
      );
      this.appendDistinctGoogleRoutes(googleRoutes, tollAvoidanceRoutes ?? []);
    }
    if (googleRoutes.length < 3) {
      const transferHub = HUBS[(currentHubIndex + 2) % HUBS.length];
      const hubTransferRoutes = await this.googleRoutesService.trafficAwareRoutes(
        { lat: state.lat, lon: state.lon },
        { lat: dropoff.lat, lon: dropoff.lon },
        [
          { lat: pickup.lat, lon: pickup.lon },
          { lat: transferHub.lat, lon: transferHub.lon },
        ],
      );
      this.appendDistinctGoogleRoutes(googleRoutes, hubTransferRoutes ?? []);
    }

    if (googleRoutes.length) {
      return {
        plan_id: recommendation.id,
        truck_id: state.truckId,
        route_source: 'Google Routes API · traffic-aware on demand',
        routes: googleRoutes.slice(0, 3).map((route, index) => ({
          id: `${recommendation.id}-google-${index + 1}`,
          rank: index + 1,
          kind:
            index === 0
              ? ('recommended' as const)
              : index === 1
                ? ('alternative' as const)
                : ('fallback' as const),
          label:
            index === 0
              ? 'Recommended traffic-aware route'
              : index === 1
                ? 'Alternative traffic-aware route'
                : 'Fallback traffic-aware route',
          coordinates: route.coordinates,
          distance_km: route.distanceKm,
          static_eta_min: route.staticEtaMin,
          eta_p50_min: route.etaP50Min,
          eta_p90_min: route.etaP90Min,
          traffic: this.trafficForLevel(route.trafficLevel),
        })),
        stops: [
          { kind: 'current', name: `Current position · ${this.nearestHub(state.lat, state.lon).name}`, lat: state.lat, lon: state.lon },
          { kind: 'pickup', name: `Hub pickup · ${pickup.name}`, lat: pickup.lat, lon: pickup.lon, cargo: recommendation.cargo_summary },
          { kind: 'dropoff', name: `Hub delivery · ${dropoff.name}`, lat: dropoff.lat, lon: dropoff.lon },
        ],
        traffic_disclaimer:
          'Live travel time and road geometry come from Google Routes on demand; dispatcher approval is still required.',
      };
    }

    return {
      plan_id: recommendation.id,
      truck_id: state.truckId,
      route_source: 'Mock live-traffic corridor — dispatcher confirmation required',
      routes: [
        {
          id: `${recommendation.id}-primary`,
          rank: 1,
          kind: 'recommended' as const,
          label: 'Recommended corridor',
          coordinates: [current, midpoint, pickupPoint, dropoffPoint],
          distance_km: Math.round(directDistance),
          static_eta_min: staticEta,
          eta_p50_min: staticEta + this.trafficDelay(traffic.level),
          eta_p90_min: staticEta + this.trafficDelay(traffic.level) + 35,
          traffic,
        },
        {
          id: `${recommendation.id}-alternative`,
          rank: 2,
          kind: 'alternative' as const,
          label: 'Alternative corridor',
          coordinates: [
            current,
            [midpoint[0] + 0.32, midpoint[1] - 0.2],
            pickupPoint,
            dropoffPoint,
          ],
          distance_km: Math.round(directDistance * 1.12),
          static_eta_min: Math.round(staticEta * 1.15),
          eta_p50_min: Math.round(staticEta * 1.18),
          eta_p90_min: Math.round(staticEta * 1.18) + 40,
          traffic: this.trafficForLevel('slow'),
        },
        {
          id: `${recommendation.id}-fallback`,
          rank: 3,
          kind: 'fallback' as const,
          label: 'Fallback corridor',
          coordinates: [
            current,
            [midpoint[0] - 0.28, midpoint[1] + 0.24],
            pickupPoint,
            dropoffPoint,
          ],
          distance_km: Math.round(directDistance * 1.23),
          static_eta_min: Math.round(staticEta * 1.28),
          eta_p50_min: Math.round(staticEta * 1.32),
          eta_p90_min: Math.round(staticEta * 1.32) + 50,
          traffic: this.trafficForLevel('free'),
        },
      ],
      stops: [
        { kind: 'current', name: `Current position · ${this.nearestHub(state.lat, state.lon).name}`, lat: state.lat, lon: state.lon },
        { kind: 'pickup', name: `Return cargo pickup · ${pickup.name}`, lat: pickup.lat, lon: pickup.lon, cargo: recommendation.cargo_summary },
        { kind: 'dropoff', name: `Delivery · ${dropoff.name}`, lat: dropoff.lat, lon: dropoff.lon },
      ],
      traffic_disclaimer:
        'Traffic colours and movement are simulated from local demo telemetry, not live Google traffic.',
    };
  }

  async liveTraffic(recommendationId: string) {
    await this.ensureRecommendation(recommendationId);
    return {
      available: false,
      notice:
        'Live Google traffic is not queried for seeded demo routes. Use it only as an on-demand dispatcher confirmation.',
    };
  }

  async decide(recommendationId: string, body: unknown) {
    await this.ensureRecommendation(recommendationId);
    const action =
      body && typeof body === 'object' && 'action' in body
        ? (body as { action?: unknown }).action
        : undefined;
    if (action !== 'accept' && action !== 'reject') {
      throw new BadRequestException('action must be accept or reject');
    }
    const status = action === 'accept' ? 'accepted' : 'rejected';
    this.decisions.set(recommendationId, status);
    return { id: recommendationId, status };
  }

  async simulateTelemetryTick() {
    const states = await this.stateRepository.find({
      where: { truckId: 'DEMO-TRK-001' },
    });
    const demoStates = states.length
      ? await this.stateRepository
          .createQueryBuilder('state')
          .where('state.truck_id LIKE :prefix', { prefix: 'DEMO-TRK-%' })
          .orderBy('state.truck_id', 'ASC')
          .getMany()
      : [];
    const observedAt = new Date();
    const events: TelemetryEvent[] = [];

    for (const state of demoStates) {
      const truckNumber = this.truckNumber(state.truckId);
      const heading = (state.heading + ((truckNumber % 7) - 3) * 2 + 360) % 360;
      const distanceStep = state.speedKph === 0 ? 0 : 0.003 + (state.speedKph / 13000);
      const headingRadians = (heading * Math.PI) / 180;
      state.lat += Math.cos(headingRadians) * distanceStep;
      state.lon += Math.sin(headingRadians) * distanceStep;
      state.heading = heading;
      state.speedKph = Math.max(
        0,
        Math.min(105, state.speedKph + ((truckNumber % 5) - 2) * 1.7),
      );
      state.fuelPct = Math.max(5, state.fuelPct - 0.15);
      state.sequence += 1;
      state.observedAt = observedAt;
      state.health = {
        ...(state.health ?? {}),
        signal_rsrp_dbm: -82 - (truckNumber % 20),
        device_uptime_h: 120 + truckNumber * 2 + state.sequence / 20,
      };
      events.push(
        this.eventRepository.create({
          deviceId: state.deviceId,
          truckId: state.truckId,
          observedAt,
          lat: state.lat,
          lon: state.lon,
          speedKph: state.speedKph,
          heading: state.heading,
          gpsAccuracyM: state.gpsAccuracyM,
          cargoStatus: state.cargoStatus,
          fuelPct: state.fuelPct,
          sequence: state.sequence,
          cargoWeightKg: state.cargoWeightKg,
          can: state.can,
          imu: state.imu,
          health: state.health,
          topic: `haulio/v1/telemetry/${state.deviceId}`,
          replayed: false,
          dsAccepted: null,
          dsStatus: null,
          dsReason: 'Local seeded-demo update; not sent to the frozen DS policy.',
        }),
      );
    }

    if (demoStates.length) {
      await this.eventRepository.manager.transaction(async (manager) => {
        await manager.getRepository(TelemetryEvent).save(events);
        await manager.getRepository(TruckState).save(demoStates);
        await manager
          .getRepository(TelematicsDevice)
          .createQueryBuilder()
          .update()
          .set({ lastSeenAt: observedAt })
          .where('device_id LIKE :prefix', { prefix: 'DEMO-IOT-%' })
          .execute();
      });
    }

    const highlightedState =
      demoStates.find(
        (state) =>
          state.truckId === 'DEMO-TRK-072' &&
          state.cargoStatus === 'empty_return',
      ) ??
      demoStates.find((state) => state.cargoStatus === 'empty_return') ??
      demoStates.find((state) => state.cargoStatus === 'loading');

    return {
      events: demoStates.map((state) => ({
        accepted: true,
        truck_id: state.truckId,
        sequence: state.sequence,
      })),
      source: 'local seeded-demo telemetry',
      ds_sent: false,
      highlight_plan_id: highlightedState
        ? `DEMO-REC-${highlightedState.truckId}`
        : null,
    };
  }

  private async states(): Promise<TruckState[]> {
    return this.stateRepository.find({ order: { truckId: 'ASC' } });
  }

  private truck(state: TruckState) {
    const risk = this.emptyReturnRisk(state);
    const traffic = this.traffic(state);
    const hub = this.nearestHub(state.lat, state.lon);
    const capacity = state.cargoWeightKg && state.cargoWeightKg > 18000 ? 24000 : 16000;
    const anomaly = this.anomaly(state);
    const etaMinutes = 45 + (this.truckNumber(state.truckId) % 210);
    return {
      id: state.truckId,
      name: `Haulio ${state.truckId.replace('DEMO-', '')}`,
      vehicle_type: capacity === 24000 ? 'Tronton box' : 'Engkel box',
      capacity_kg: capacity,
      fuel_pct: Number(state.fuelPct.toFixed(1)),
      status: state.cargoStatus,
      position: { name: hub.name, lat: state.lat, lon: state.lon },
      traffic,
      empty_return_risk: risk,
      eta: { eta_min: etaMinutes, label: this.duration(etaMinutes) },
      anomaly,
    };
  }

  private recommendationsFor(states: TruckState[]) {
    return states
      .filter((state) => ['empty_return', 'loading'].includes(state.cargoStatus))
      .map((state) => {
        const truckNumber = this.truckNumber(state.truckId);
        const hub = this.nearestHub(state.lat, state.lon);
        const destination = HUBS[(this.nearestHubIndex(state.lat, state.lon) + 3) % HUBS.length];
        const id = `DEMO-REC-${state.truckId}`;
        const status =
          this.decisions.get(id) ?? (truckNumber === 1 ? 'accepted' : 'proposed');
        const distance = 120 + ((truckNumber * 23) % 540);
        const margin = 1200000 + ((truckNumber * 131000) % 3800000);
        return {
          id,
          truck_id: state.truckId,
          truck_name: `Haulio ${state.truckId.replace('DEMO-', '')}`,
          order_ids: [`DEMO-ORD-${String(truckNumber).padStart(3, '0')}`],
          cargo_summary:
            state.cargoStatus === 'loading'
              ? `Pallet FMCG · ${hub.name} to ${destination.name}`
              : `Dry cargo backhaul · ${hub.name} to ${destination.name}`,
          is_multi_hop: truckNumber % 4 === 0,
          capacity_pct: Math.min(92, 45 + (truckNumber % 43)),
          expected_empty_location: hub.name,
          eta_final_delivery_min: Math.round((distance / 50) * 60),
          distance_km: distance,
          expected_margin_idr: margin,
          margin_pct: 18 + (truckNumber % 13),
          minimum_viable_quote_idr: Math.round(margin * 2.1),
          suggested_quote_idr: Math.round(margin * 2.48),
          confidence: Number((0.72 + (truckNumber % 18) / 100).toFixed(2)),
          explanation: [
            `Detected ${state.cargoStatus.replace('_', ' ')} state from latest telemetry.`,
            `Capacity and fuel are compatible with the ${destination.name} corridor.`,
            'Demo recommendation — dispatcher approval is required.',
          ],
          status,
        };
      });
  }

  private async ensureRecommendation(recommendationId: string): Promise<void> {
    const exists = this.recommendationsFor(await this.states()).some(
      (recommendation) => recommendation.id === recommendationId,
    );
    if (!exists) throw new NotFoundException('Recommendation was not found');
  }

  private appendDistinctGoogleRoutes(
    target: Array<{
      coordinates: [number, number][];
      distanceKm: number;
      staticEtaMin: number;
      etaP50Min: number;
      etaP90Min: number;
      trafficLevel: TrafficLevel;
    }>,
    candidates: Array<{
      coordinates: [number, number][];
      distanceKm: number;
      staticEtaMin: number;
      etaP50Min: number;
      etaP90Min: number;
      trafficLevel: TrafficLevel;
    }>,
  ): void {
    for (const candidate of candidates) {
      const duplicate = target.some(
        (existing) =>
          existing.distanceKm === candidate.distanceKm &&
          existing.etaP50Min === candidate.etaP50Min &&
          existing.coordinates.length === candidate.coordinates.length,
      );
      if (!duplicate) target.push(candidate);
      if (target.length >= 3) return;
    }
  }

  private async logCounts(): Promise<Map<string, number>> {
    const rows = await this.eventRepository
      .createQueryBuilder('event')
      .select('event.truck_id', 'truck_id')
      .addSelect('COUNT(*)', 'log_count')
      .groupBy('event.truck_id')
      .getRawMany<{ truck_id: string; log_count: string }>();
    return new Map(rows.map((row) => [row.truck_id, Number(row.log_count)]));
  }

  private traffic(state: TruckState) {
    const truckNumber = this.truckNumber(state.truckId);
    const level: TrafficLevel =
      state.speedKph < 10 || truckNumber % 11 === 0
        ? 'jammed'
        : state.speedKph < 35 || truckNumber % 4 === 0
          ? 'slow'
          : 'free';
    return this.trafficForLevel(level);
  }

  private trafficForLevel(level: TrafficLevel) {
    return {
      level,
      label:
        level === 'jammed'
          ? 'Heavy jam'
          : level === 'slow'
            ? 'Moderate congestion'
            : 'Free flow',
      color: level === 'jammed' ? 'red' : level === 'slow' ? 'yellow' : 'blue',
      source: 'Local demo telemetry heuristic',
    };
  }

  private emptyReturnRisk(state: TruckState) {
    const truckNumber = this.truckNumber(state.truckId);
    const probability =
      state.cargoStatus === 'empty_return'
        ? 0.82 + (truckNumber % 12) / 100
        : state.cargoStatus === 'loading'
          ? 0.56 + (truckNumber % 10) / 100
          : 0.12 + (truckNumber % 15) / 100;
    const level = probability >= 0.75 ? 'high' : probability >= 0.45 ? 'medium' : 'low';
    return {
      probability: Number(probability.toFixed(2)),
      level,
      reasons:
        state.cargoStatus === 'empty_return'
          ? ['No cargo weight is reported.', 'Truck is returning from its last operating area.']
          : state.cargoStatus === 'loading'
            ? ['Cargo load is not yet confirmed.', 'Return-haul candidate is being matched.']
            : ['Active cargo is reported by the latest telemetry event.'],
    };
  }

  private anomaly(state: TruckState) {
    const signals: string[] = [];
    if (state.speedKph === 0 && state.cargoStatus === 'loaded')
      signals.push('Loaded truck is stationary.');
    if (state.gpsAccuracyM > 14) signals.push('GPS accuracy is degraded.');
    if (state.fuelPct < 20) signals.push('Fuel level needs review.');
    const status = signals.length >= 2 ? 'critical' : signals.length ? 'warning' : 'normal';
    return { status, score: Math.min(1, signals.length * 0.42), signals };
  }

  private nearestHub(lat: number, lon: number): Hub {
    return HUBS[this.nearestHubIndex(lat, lon)];
  }

  private nearestHubIndex(lat: number, lon: number): number {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    HUBS.forEach((hub, index) => {
      const distance = (hub.lat - lat) ** 2 + (hub.lon - lon) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  }

  private distanceKm(latA: number, lonA: number, latB: number, lonB: number): number {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const deltaLat = toRadians(latB - latA);
    const deltaLon = toRadians(lonB - lonA);
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(deltaLon / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private trafficDelay(level: TrafficLevel): number {
    return level === 'jammed' ? 42 : level === 'slow' ? 20 : 8;
  }

  private duration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  }

  private truckNumber(truckId: string): number {
    return Number(truckId.match(/(\d+)$/)?.[1] ?? 0);
  }
}
