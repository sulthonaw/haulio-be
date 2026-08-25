# Haulio Backend (NestJS operations gateway + Socket.io + PostgreSQL)

Project backend dibangun menggunakan **NestJS**, **Socket.io** (real-time communication), dan **PostgreSQL** (TypeORM). Untuk aplikasi hackathon ini, backend juga menjadi gateway loopback yang meneruskan endpoint operasi ke service data-science Python. Dilengkapi dengan konfigurasi **Docker** multi-stage dan **GitHub Actions CI/CD** untuk lingkungan Staging dan Production.

---

## Daftar Isi
- [Prasyarat](#prasyarat)
- [Struktur Lingkungan (Environment Variables)](#struktur-lingkungan-environment-variables)
- [1. Menjalankan di Lingkungan Lokal (Lokal / Development)](#1-menjalankan-di-lingkungan-lokal-lokal--development)
  - [Opsi A: Menjalankan tanpa Docker](#opsi-a-menjalankan-tanpa-docker)
  - [Opsi B: Menjalankan dengan Docker Compose](#opsi-b-menjalankan-dengan-docker-compose)
- [2. Menjalankan di Lingkungan Staging](#2-menjalankan-di-lingkungan-staging)
- [3. Menjalankan di Lingkungan Production](#3-menjalankan-di-lingkungan-production)
- [4. Dokumentasi API REST & Real-time (Socket.io)](#4-dokumentasi-api-rest--real-time-socketio)
- [5. CI/CD (GitHub Actions)](#5-cicd-github-actions)

---

## Prasyarat
Pastikan Anda sudah menginstal aplikasi berikut di komputer Anda:
- [Node.js](https://nodejs.org/) (versi >= 20, disarankan 24)
- [Docker](https://www.docker.com/) & Docker Compose
- [PostgreSQL](https://www.postgresql.org/) (jika ingin menjalankan database lokal tanpa Docker)

---

## Struktur Lingkungan (Environment Variables)
Kami menyediakan template environment untuk setiap environment:
- `.env.development` - Digunakan untuk lokal development.
- `.env.staging` - Digunakan untuk staging environment.
- `.env.production` - Digunakan untuk production environment.

Konfigurasi utama di dalam file `.env.*`:
```env
NODE_ENV=development/staging/production
HOST=127.0.0.1
PORT=3001
CORS_ORIGIN=http://127.0.0.1:3000
DS_API_URL=http://127.0.0.1:8080/api/v1
DS_IOT_SHARED_SECRET=same-value-as-the-DS-IOT_SHARED_SECRET

# disabled until a broker and authorized per-device mapping are configured
MQTT_ENABLED=false
MQTT_URL=mqtts://broker.example.com:8883
MQTT_TOPIC_PREFIX=haulio/v1/telemetry
IOT_DEVICE_MAPPINGS=[{"device_id":"gw-trk-01","truck_id":"TRK-01","secret":"per-device-secret"}]

# PostgreSQL Config
DB_HOST=localhost (atau service-name di compose)
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=haulio_db
DB_SYNCHRONIZE=true (pastikan false di production!)
```

`HOST` defaults to loopback for a host-run development server. Set it to
`0.0.0.0` only inside the local-demo container network; the frontend Compose
file supplies this value without exposing the backend beyond loopback on the
host.

---

## 1. Menjalankan di Lingkungan Lokal (Lokal / Development)

### Opsi A: Menjalankan tanpa Docker

1. **Salin Environment File**
   Salin `.env.example` menjadi `.env.development`:
   ```bash
   cp .env.example .env.development
   ```
   *Sesuaikan konfigurasi database `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, dan `DB_DATABASE` dengan PostgreSQL lokal Anda.*

2. **Instal Dependensi**
   ```bash
   npm install
   ```

3. **Jalankan Aplikasi dalam Mode Dev (Watch Mode)**
   ```bash
   npm run start:dev
   ```
   Aplikasi akan berjalan di `http://127.0.0.1:3001/api` dan WebSocket Server di `ws://127.0.0.1:3001`.

---

### Opsi B: Menjalankan dengan Docker Compose

Untuk mempermudah setup database Postgres dan aplikasi NestJS secara bersamaan, jalankan menggunakan Docker Compose development:

1. **Salin Environment File**
   ```bash
   cp .env.example .env.development
   ```

2. **Jalankan Docker Compose**
   ```bash
   docker compose up --build
   ```
   *Perintah ini akan menyalakan container PostgreSQL (`haulio_postgres_dev`) dan container API (`haulio_api_dev`) dalam watch mode (live-reload aktif).*

3. **Mematikan Container**
   ```bash
   docker compose down
   ```

---

## 2. Menjalankan di Lingkungan Staging

Staging menggunakan Docker target `runner` yang sangat efisien dan aman (menghapus devDependencies dan menggunakan user non-root).

1. **Salin/Buat Staging Env**
   ```bash
   cp .env.staging .env.staging
   ```

2. **Jalankan Docker Compose Staging**
   ```bash
   docker compose -f docker-compose.staging.yml up --build -d
   ```
   *Flags `-d` akan menjalankan container di background.*
   - Port REST API & WebSocket: `http://localhost:3000`
   - Port Database Staging: `localhost:5433` (diekspos di 5433 agar tidak bentrok dengan dev)

3. **Menghentikan Staging**
   ```bash
   docker compose -f docker-compose.staging.yml down
   ```

---

## 3. Menjalankan di Lingkungan Production

Production menggunakan build target `runner` yang teroptimasi penuh serta menonaktifkan fitur sinkronisasi otomatis database (`DB_SYNCHRONIZE=false`) untuk mencegah hilangnya data secara tidak sengaja.

1. **Buat Production Env**
   Pastikan file `.env.production` sudah diisi dengan kredensial database yang aman.

2. **Jalankan Docker Compose Production**
   ```bash
   docker compose -f docker-compose.prod.yml up --build -d
   ```
   - Port REST API & WebSocket: `http://localhost:80` (port HTTP default, atau ubah mapping port di `docker-compose.prod.yml`)
   - Port Database Prod: `localhost:5434`

3. **Menghentikan Production**
   ```bash
   docker compose -f docker-compose.prod.yml down
   ```

---

## 4. Dokumentasi API REST & Real-time (Socket.io)

### Gateway operasi hackathon

Frontend Next.js memanggil gateway ini secara server-side, sehingga browser hanya
mengakses `http://127.0.0.1:3000/api/v1/*`. Gateway meneruskan endpoint operasi
yang diketahui ke `DS_API_URL`; kredensial Google Routes tetap berada di service
data-science dan tidak diteruskan ke browser.

```text
FE (127.0.0.1:3000) -> Nest gateway (127.0.0.1:3001/api/v1) -> DS (127.0.0.1:8080/api/v1)
```

Endpoint gateway mencakup health, metrics, fleet, orders, regions,
recommendations, route options, live traffic, telemetry, simulation tick, dan
dispatcher decision. Endpoint di luar kontrak tersebut tidak diproxy.

Untuk menjalankan seluruh stack secara lokal:

```bash
# Terminal 1: DS
cd ../compfest-aic-2026-ds
python3 run.py

# Terminal 2: Nest gateway and local Postgres
cd ../haulio-be
docker compose up -d postgres
npm ci
npm run start:dev

# Terminal 3: frontend
cd ../compfest-aic-2026-fe
cp .env.local.example .env.local # only if .env.local does not exist
npm run dev -- --hostname 127.0.0.1
```

### IoT telemetry gateway

Devices publish an MQTT 5 JSON event at QoS 1 on a device-specific topic:

```text
IoT gateway -> MQTT broker -> NestJS validation + PostgreSQL -> signed DS telemetry -> Socket.io
haulio/v1/telemetry/{device_id}
```

The gateway normalizes/validates GNSS (`lat`, `lon`, `speed_kph`, `heading`,
`gps_accuracy_m`), cargo weight, CAN/J1939 readings, optional IMU readings and
device-health readings. It authorizes `device_id` against `truck_id` using the
server-only `IOT_DEVICE_MAPPINGS` JSON, verifies the device HMAC, enforces
monotonic sequence numbers, stores the immutable event and latest truck state,
and emits `telemetry` / `truck_state` Socket.io events. A late but valid event
is stored as `replayed` for the gateway's store-and-forward buffer.

Set `DS_IOT_SHARED_SECRET` to the same value as the DS service's
`IOT_SHARED_SECRET`; it is a separate server-to-server credential and must not
be placed on a device. The backend re-signs the normalized payload before
calling the loopback DS API.

For a local broker only, start the loopback-bound Mosquitto service and set
`MQTT_ENABLED=true` plus a non-empty, per-device mapping in
`.env.development`:

```bash
docker compose up -d postgres mosquitto
```

The included broker permits anonymous `mqtt://` traffic solely on `127.0.0.1`.
Production configuration is refused unless `MQTT_URL` uses `mqtts://`; use a
hardened broker with per-device authentication, topic ACLs, credential rotation
and preferably mTLS. Never expose the DS telemetry endpoint directly to
devices.

### HTTP REST Endpoints

1. **Simpan Pesan Baru (Menyimpan ke DB & Broadcast ke Socket.io)**
   - **Method**: `POST`
   - **URL**: `http://localhost:3000/api/messages`
   - **Body (JSON)**:
     ```json
     {
       "sender": "John Doe",
       "text": "Hello World!"
     }
     ```
   - **Response (JSON)**:
     ```json
     {
       "id": "e3f8955f-8b9a-41e9-86bd-303c62ea1c5d",
       "sender": "John Doe",
       "text": "Hello World!",
       "createdAt": "2026-08-24T07:49:03.000Z"
     }
     ```

2. **Ambil Riwayat Pesan**
   - **Method**: `GET`
   - **URL**: `http://localhost:3000/api/messages`
   - **Response**: Mengembalikan daftar 50 pesan terbaru dari database.

---

### WebSocket (Socket.io) Events

Gunakan Socket.io client untuk terhubung ke `ws://localhost:3000` (atau port web Anda).

1. **Mengirim Pesan (`message` event)**
   - **Payload**:
     ```json
     {
       "sender": "Alice",
       "text": "Hello via Sockets!",
       "room": "room-1" // Opsional, kirim ke room tertentu jika ada
     }
     ```
   - **Handler**: Pesan akan disimpan secara otomatis ke PostgreSQL, lalu di-broadcast ke seluruh client yang terhubung (atau ke room tertentu).

2. **Bergabung ke Room (`joinRoom` event)**
   - **Payload**: `"nama-room"` (contoh: `"room-1"`)
   - **Response**: Client akan menerima event `joinedRoom` jika berhasil join.

3. **Keluar dari Room (`leaveRoom` event)**
   - **Payload**: `"nama-room"`
   - **Response**: Client akan menerima event `leftRoom`.

---

## 5. CI/CD (GitHub Actions)

Alur kerja CI/CD otomatis dikonfigurasi menggunakan GitHub Actions:
- **Staging Pipeline (`.github/workflows/cd-staging.yml`)**:
  - Berjalan setiap ada push/PR ke branch `develop`.
  - Menjalankan unit tests (`npm run test`) dan linter.
  - Membangun Docker image staging menggunakan target `runner`.
- **Production Pipeline (`.github/workflows/cd-production.yml`)**:
  - Berjalan setiap ada push/PR ke branch `main`.
  - Menjalankan unit tests, membangun Docker image production, dan siap dideploy ke container registry Anda.
