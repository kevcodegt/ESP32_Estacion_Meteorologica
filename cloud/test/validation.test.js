import assert from "node:assert/strict";
import test from "node:test";
import { validateTelemetry } from "../src/index.js";

const validPayload = {
  schemaVersion: 1,
  deviceId: "estacion-meteorologica-01",
  bootId: "A1B2C3D4",
  firmwareVersion: "1.0.0",
  sequence: 42,
  uptimeSeconds: 3600,
  wifiRssi: -61,
  temperatureC: 23.4,
  temperatureBmpC: 23.8,
  humidityPct: 58.2,
  pressureHpa: 1012.7,
  lightLux: 1340,
  sensors: {
    dht22: true,
    bmp280: true,
    bh1750: true,
    oled: true,
  },
};

test("accepts a complete telemetry payload", () => {
  const result = validateTelemetry(validPayload);
  assert.equal(result.ok, true);
  assert.equal(result.value.deviceId, validPayload.deviceId);
  assert.equal(result.value.bootId, validPayload.bootId);
});

test("accepts null readings when a sensor reports failure", () => {
  const result = validateTelemetry({
    ...validPayload,
    humidityPct: null,
    temperatureC: null,
    sensors: { ...validPayload.sensors, dht22: false },
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.humidityPct, null);
  assert.equal(result.value.sensors.dht22, false);
});

test("rejects impossible ranges and malformed identifiers", () => {
  const result = validateTelemetry({
    ...validPayload,
    deviceId: "../otro",
    humidityPct: 140,
    wifiRssi: 20,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /deviceId/);
  assert.match(result.errors.join(" "), /humidityPct/);
  assert.match(result.errors.join(" "), /wifiRssi/);
});
