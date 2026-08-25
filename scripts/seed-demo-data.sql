-- Local demo telemetry seed. It only creates/updates identifiers prefixed
-- DEMO-, so re-running it does not remove or alter non-demo fleet data.
BEGIN;

CREATE TEMP TABLE demo_seed_trucks ON COMMIT DROP AS
WITH regions(region_no, city, latitude, longitude) AS (
  VALUES
    (1, 'Banda Aceh', 5.5483::double precision, 95.3238::double precision),
    (2, 'Medan', 3.5952, 98.6722),
    (3, 'Pekanbaru', 0.5071, 101.4478),
    (4, 'Padang', -0.9471, 100.4172),
    (5, 'Batam', 1.1301, 104.0529),
    (6, 'Bandar Lampung', -5.3971, 105.2668),
    (7, 'Palembang', -2.9909, 104.7566),
    (8, 'Jakarta', -6.2088, 106.8456),
    (9, 'Cilegon', -6.0164, 106.0558),
    (10, 'Bandung', -6.9175, 107.6191),
    (11, 'Cirebon', -6.7320, 108.5523),
    (12, 'Semarang', -6.9667, 110.4167),
    (13, 'Yogyakarta', -7.7956, 110.3695),
    (14, 'Surabaya', -7.2575, 112.7521),
    (15, 'Denpasar', -8.6500, 115.2167),
    (16, 'Mataram', -8.5833, 116.1167),
    (17, 'Pontianak', -0.0263, 109.3425),
    (18, 'Banjarmasin', -3.3186, 114.5944),
    (19, 'Balikpapan', -1.2379, 116.8529),
    (20, 'Samarinda', -0.5022, 117.1536),
    (21, 'Palu', -0.9003, 119.8770),
    (22, 'Makassar', -5.1477, 119.4327),
    (23, 'Kendari', -3.9985, 122.5129),
    (24, 'Manado', 1.4748, 124.8421),
    (25, 'Gorontalo', 0.5435, 123.0568),
    (26, 'Ambon', -3.6547, 128.1906),
    (27, 'Sorong', -0.8762, 131.2558),
    (28, 'Jayapura', -2.5916, 140.6690),
    (29, 'Kupang', -10.1772, 123.6070),
    (30, 'Ternate', 0.7900, 127.3840)
)
SELECT
  truck_no,
  city,
  format('DEMO-TRK-%s', lpad(truck_no::text, 3, '0')) AS truck_id,
  format('DEMO-IOT-%s', lpad(truck_no::text, 3, '0')) AS device_id,
  latitude + ((((truck_no * 7) % 9) - 4)::double precision * 0.0045) AS lat,
  longitude + ((((truck_no * 11) % 9) - 4)::double precision * 0.0055) AS lon,
  CASE WHEN truck_no % 12 = 0 THEN 0.0 ELSE (18 + ((truck_no * 17) % 68))::double precision END AS speed_kph,
  ((truck_no * 47) % 360)::double precision AS heading,
  (5 + (truck_no % 12))::double precision AS gps_accuracy_m,
  CASE WHEN truck_no % 8 = 0 THEN 'empty_return' WHEN truck_no % 8 = 1 THEN 'loading' ELSE 'loaded' END AS cargo_status,
  (30 + ((truck_no * 13) % 65))::double precision AS fuel_pct,
  CASE WHEN truck_no % 8 IN (0, 1) THEN 0.0 ELSE (4000 + ((truck_no * 791) % 18000))::double precision END AS cargo_weight_kg
FROM generate_series(1, 300) AS truck_no
JOIN regions ON regions.region_no = ((truck_no - 1) % 30) + 1;

INSERT INTO telematics_devices (device_id, truck_id, enabled, last_seen_at)
SELECT device_id, truck_id, true, CURRENT_TIMESTAMP
FROM demo_seed_trucks
ON CONFLICT (device_id) DO UPDATE SET
  truck_id = EXCLUDED.truck_id,
  enabled = true,
  last_seen_at = EXCLUDED.last_seen_at,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO telemetry_events (
  device_id, truck_id, observed_at, lat, lon, speed_kph, heading,
  gps_accuracy_m, cargo_status, fuel_pct, sequence, cargo_weight_kg,
  can, imu, health, topic, replayed
)
SELECT
  t.device_id,
  t.truck_id,
  CURRENT_TIMESTAMP - ((3 - sample_no) * INTERVAL '5 minutes'),
  t.lat - ((3 - sample_no)::double precision * 0.006),
  t.lon - ((3 - sample_no)::double precision * 0.007),
  GREATEST(0::double precision, t.speed_kph - ((3 - sample_no)::double precision * 4)),
  MOD((t.heading + ((3 - sample_no)::double precision * 5))::numeric, 360)::double precision,
  t.gps_accuracy_m + ((3 - sample_no)::double precision * 0.5),
  t.cargo_status,
  GREATEST(5::double precision, t.fuel_pct - ((3 - sample_no)::double precision * 0.8)),
  sample_no,
  t.cargo_weight_kg,
  jsonb_build_object(
    'engine_rpm', 900 + (t.speed_kph * 18),
    'engine_load_pct', 20 + (t.truck_no % 70),
    'coolant_temp_c', 78 + (t.truck_no % 12)
  ),
  jsonb_build_object(
    'longitudinal_acceleration_m_s2', ((t.truck_no % 7) - 3) / 10.0,
    'yaw_rate_deg_s', ((t.truck_no % 9) - 4) / 2.0
  ),
  jsonb_build_object(
    'signal_rsrp_dbm', -82 - (t.truck_no % 20),
    'device_uptime_h', 120 + (t.truck_no * 2),
    'battery_voltage', 12.2 + ((t.truck_no % 5) / 10.0)
  ),
  'haulio/v1/telemetry/' || t.device_id,
  false
FROM demo_seed_trucks AS t
CROSS JOIN generate_series(1, 3) AS sample_no
ON CONFLICT (device_id, sequence) DO UPDATE SET
  observed_at = EXCLUDED.observed_at,
  received_at = CURRENT_TIMESTAMP,
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  speed_kph = EXCLUDED.speed_kph,
  heading = EXCLUDED.heading,
  gps_accuracy_m = EXCLUDED.gps_accuracy_m,
  cargo_status = EXCLUDED.cargo_status,
  fuel_pct = EXCLUDED.fuel_pct,
  cargo_weight_kg = EXCLUDED.cargo_weight_kg,
  can = EXCLUDED.can,
  imu = EXCLUDED.imu,
  health = EXCLUDED.health,
  topic = EXCLUDED.topic,
  replayed = false,
  ds_accepted = NULL,
  ds_status = NULL,
  ds_reason = NULL;

INSERT INTO truck_states (
  truck_id, device_id, observed_at, lat, lon, speed_kph, heading,
  gps_accuracy_m, cargo_status, fuel_pct, sequence, cargo_weight_kg,
  can, imu, health, updated_at
)
SELECT
  t.truck_id,
  t.device_id,
  CURRENT_TIMESTAMP,
  t.lat,
  t.lon,
  t.speed_kph,
  t.heading,
  t.gps_accuracy_m,
  t.cargo_status,
  t.fuel_pct,
  3,
  t.cargo_weight_kg,
  jsonb_build_object(
    'engine_rpm', 900 + (t.speed_kph * 18),
    'engine_load_pct', 20 + (t.truck_no % 70),
    'coolant_temp_c', 78 + (t.truck_no % 12)
  ),
  jsonb_build_object(
    'longitudinal_acceleration_m_s2', ((t.truck_no % 7) - 3) / 10.0,
    'yaw_rate_deg_s', ((t.truck_no % 9) - 4) / 2.0
  ),
  jsonb_build_object(
    'signal_rsrp_dbm', -82 - (t.truck_no % 20),
    'device_uptime_h', 120 + (t.truck_no * 2),
    'battery_voltage', 12.2 + ((t.truck_no % 5) / 10.0)
  ),
  CURRENT_TIMESTAMP
FROM demo_seed_trucks AS t
ON CONFLICT (truck_id) DO UPDATE SET
  device_id = EXCLUDED.device_id,
  observed_at = EXCLUDED.observed_at,
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  speed_kph = EXCLUDED.speed_kph,
  heading = EXCLUDED.heading,
  gps_accuracy_m = EXCLUDED.gps_accuracy_m,
  cargo_status = EXCLUDED.cargo_status,
  fuel_pct = EXCLUDED.fuel_pct,
  sequence = EXCLUDED.sequence,
  cargo_weight_kg = EXCLUDED.cargo_weight_kg,
  can = EXCLUDED.can,
  imu = EXCLUDED.imu,
  health = EXCLUDED.health,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

SELECT 'telematics_devices' AS table_name, count(*) AS records FROM telematics_devices
UNION ALL
SELECT 'telemetry_events', count(*) FROM telemetry_events
UNION ALL
SELECT 'truck_states', count(*) FROM truck_states
ORDER BY table_name;
