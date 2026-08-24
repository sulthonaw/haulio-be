export type NumericMap = Record<string, number>;

export interface TelematicsPayload {
  device_id: string;
  truck_id: string;
  timestamp: string;
  lat: number;
  lon: number;
  speed_kph: number;
  heading: number;
  gps_accuracy_m: number;
  cargo_status: string;
  fuel_pct: number;
  sequence: number;
  signature: string;
  cargo_weight_kg?: number;
  can?: NumericMap;
  imu?: NumericMap;
  health?: NumericMap;
}

export interface DeviceMapping {
  device_id: string;
  truck_id: string;
  secret: string;
}

export interface IngestResult {
  accepted: boolean;
  duplicate: boolean;
  truck_id?: string;
  ds_status?: number;
  reason?: string;
}
