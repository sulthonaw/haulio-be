import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('truck_states')
export class TruckState {
  @PrimaryColumn({ name: 'truck_id' })
  truckId: string;

  @Column({ name: 'device_id' })
  deviceId: string;

  @Column({ type: 'timestamptz', name: 'observed_at' })
  observedAt: Date;

  @Column({ type: 'double precision' })
  lat: number;

  @Column({ type: 'double precision' })
  lon: number;

  @Column({ type: 'double precision', name: 'speed_kph' })
  speedKph: number;

  @Column({ type: 'double precision' })
  heading: number;

  @Column({ type: 'double precision', name: 'gps_accuracy_m' })
  gpsAccuracyM: number;

  @Column({ name: 'cargo_status' })
  cargoStatus: string;

  @Column({ type: 'double precision', name: 'fuel_pct' })
  fuelPct: number;

  @Column({ type: 'integer' })
  sequence: number;

  @Column({ type: 'double precision', name: 'cargo_weight_kg', nullable: true })
  cargoWeightKg: number | null;

  @Column({ type: 'jsonb', nullable: true })
  can: Record<string, number> | null;

  @Column({ type: 'jsonb', nullable: true })
  imu: Record<string, number> | null;

  @Column({ type: 'jsonb', nullable: true })
  health: Record<string, number> | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
