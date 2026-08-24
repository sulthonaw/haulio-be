import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('telemetry_events')
@Index(['deviceId', 'sequence'], { unique: true })
@Index(['truckId', 'observedAt'])
export class TelemetryEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'device_id' })
  deviceId: string;

  @Column({ name: 'truck_id' })
  truckId: string;

  @Column({ type: 'timestamptz', name: 'observed_at' })
  observedAt: Date;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

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

  @Column({ type: 'varchar', nullable: true })
  topic: string | null;

  @Column({ default: false })
  replayed: boolean;

  @Column({ type: 'boolean', name: 'ds_accepted', nullable: true })
  dsAccepted: boolean | null;

  @Column({ type: 'integer', name: 'ds_status', nullable: true })
  dsStatus: number | null;

  @Column({ type: 'varchar', name: 'ds_reason', nullable: true })
  dsReason: string | null;
}
