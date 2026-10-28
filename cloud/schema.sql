CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  boot_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  received_at_ms INTEGER NOT NULL,
  firmware_version TEXT NOT NULL,
  uptime_seconds INTEGER NOT NULL,
  wifi_rssi INTEGER NOT NULL,
  temperature_c REAL,
  temperature_bmp_c REAL,
  humidity_pct REAL,
  pressure_hpa REAL,
  light_lux REAL,
  dht22_ok INTEGER NOT NULL CHECK (dht22_ok IN (0, 1)),
  bmp280_ok INTEGER NOT NULL CHECK (bmp280_ok IN (0, 1)),
  bh1750_ok INTEGER NOT NULL CHECK (bh1750_ok IN (0, 1)),
  oled_ok INTEGER NOT NULL CHECK (oled_ok IN (0, 1)),
  UNIQUE (device_id, boot_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_device_received
  ON telemetry (device_id, received_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_received
  ON telemetry (received_at_ms);
