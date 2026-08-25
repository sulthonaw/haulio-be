import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type LatLon = { lat: number; lon: number };

type GoogleRouteResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    staticDuration?: string;
    polyline?: { encodedPolyline?: string };
  }>;
};

export type TrafficAwareRoute = {
  coordinates: [number, number][];
  distanceKm: number;
  staticEtaMin: number;
  etaP50Min: number;
  etaP90Min: number;
  trafficLevel: 'jammed' | 'slow' | 'free';
};

@Injectable()
export class GoogleRoutesService {
  private readonly logger = new Logger(GoogleRoutesService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; routes: TrafficAwareRoute[] }
  >();

  constructor(private readonly configService: ConfigService) {}

  async trafficAwareRoutes(
    origin: LatLon,
    destination: LatLon,
    intermediates: LatLon[],
    options: { avoidTolls?: boolean } = {},
  ): Promise<TrafficAwareRoute[] | null> {
    const apiKey = this.configService.get<string>('GOOGLE_MAP_API')?.trim();
    if (!apiKey) return null;

    const cacheKey = [origin, ...intermediates, destination]
      .map((point) => `${point.lat.toFixed(3)},${point.lon.toFixed(3)}`)
      .join('|') + (options.avoidTolls ? '|avoid-tolls' : '|standard');
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.routes;

    try {
      const response = await fetch(
        `https://routes.googleapis.com/directions/v2:computeRoutes?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-fieldmask':
              'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline',
          },
          body: JSON.stringify({
            origin: this.waypoint(origin),
            destination: this.waypoint(destination),
            intermediates: intermediates.map((point) => this.waypoint(point)),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
            computeAlternativeRoutes: true,
            languageCode: 'id-ID',
            ...(options.avoidTolls
              ? { routeModifiers: { avoidTolls: true } }
              : {}),
          }),
          cache: 'no-store',
        },
      );
      if (!response.ok) {
        this.logger.warn(`Google Routes request returned ${response.status}`);
        return null;
      }
      const payload = (await response.json()) as GoogleRouteResponse;
      const routes = (payload.routes ?? [])
        .map((route) => this.normalise(route))
        .filter((route): route is TrafficAwareRoute => route !== null);
      if (!routes.length) return null;
      this.cache.set(cacheKey, {
        routes,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      return routes;
    } catch {
      this.logger.warn('Google Routes request failed; using local demo route geometry');
      return null;
    }
  }

  private waypoint(point: LatLon) {
    return {
      location: { latLng: { latitude: point.lat, longitude: point.lon } },
    };
  }

  private normalise(
    route: NonNullable<GoogleRouteResponse['routes']>[number],
  ): TrafficAwareRoute | null {
    const encoded = route.polyline?.encodedPolyline;
    if (!encoded) return null;
    const coordinates = this.decodePolyline(encoded);
    if (coordinates.length < 2) return null;
    const staticEtaMin = this.durationMinutes(route.staticDuration);
    const etaP50Min = this.durationMinutes(route.duration);
    if (!staticEtaMin || !etaP50Min) return null;
    const delay = Math.max(0, etaP50Min - staticEtaMin);
    return {
      coordinates,
      distanceKm: Math.max(1, Math.round((route.distanceMeters ?? 0) / 1000)),
      staticEtaMin,
      etaP50Min,
      etaP90Min: etaP50Min + Math.max(12, Math.round(delay * 1.7 + 12)),
      trafficLevel: delay >= 25 ? 'jammed' : delay >= 10 ? 'slow' : 'free',
    };
  }

  private durationMinutes(value: string | undefined): number {
    const seconds = Number(value?.replace(/s$/, '') ?? 0);
    return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;
  }

  private decodePolyline(encoded: string): [number, number][] {
    const coordinates: [number, number][] = [];
    let index = 0;
    let lat = 0;
    let lon = 0;
    const readValue = () => {
      let value = 0;
      let shift = 0;
      let chunk: number;
      do {
        chunk = encoded.charCodeAt(index++) - 63;
        value |= (chunk & 0x1f) << shift;
        shift += 5;
      } while (chunk >= 0x20 && index < encoded.length);
      return value & 1 ? ~(value >> 1) : value >> 1;
    };
    while (index < encoded.length) {
      lat += readValue();
      lon += readValue();
      coordinates.push([lon / 1e5, lat / 1e5]);
    }
    return coordinates;
  }
}
