import { DASHBOARD_HTML } from "./dashboard.js";

const MAX_BODY_BYTES = 8192;
const ONLINE_WINDOW_MS = 15 * 1000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,48}$/;
const BOOT_ID_PATTERN = /^[A-Fa-f0-9]{8,32}$/;

const API_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "x-content-type-options": "nosniff",
};

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...API_HEADERS, ...extraHeaders },
  });
}

function apiError(status, code, message, details) {
  return json(
    {
      ok: false,
      error: code,
      message,
      ...(details ? { details } : {}),
    },
    status,
  );
}

function readNumber(input, key, min, max, errors, options = {}) {
  const value = input[key];
  if (value === null || value === undefined) {
    if (options.required) errors.push(`${key} es obligatorio`);
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${key} debe ser numerico o null`);
    return null;
  }
  if (value < min || value > max) {
    errors.push(`${key} debe estar entre ${min} y ${max}`);
    return null;
  }
  return value;
}

function readBoolean(input, key, errors) {
  if (typeof input[key] !== "boolean") {
    errors.push(`sensors.${key} debe ser booleano`);
    return false;
  }
  return input[key];
}

export function validateTelemetry(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["El cuerpo debe ser un objeto JSON"] };
  }

  const deviceId = typeof input.deviceId === "string" ? input.deviceId.trim() : "";
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    errors.push("deviceId solo admite letras, numeros, _ y -, con maximo 48 caracteres");
  }

  const bootId = typeof input.bootId === "string" ? input.bootId.trim() : "";
  if (!BOOT_ID_PATTERN.test(bootId)) {
    errors.push("bootId debe contener entre 8 y 32 caracteres hexadecimales");
  }

  const firmwareVersion =
    typeof input.firmwareVersion === "string" ? input.firmwareVersion.trim().slice(0, 32) : "";
  if (!firmwareVersion) errors.push("firmwareVersion es obligatorio");

  const sequence = readNumber(input, "sequence", 0, 4294967295, errors, { required: true });
  const uptimeSeconds = readNumber(input, "uptimeSeconds", 0, 4294967295, errors, {
    required: true,
  });
  const wifiRssi = readNumber(input, "wifiRssi", -127, 0, errors, { required: true });
  const temperatureC = readNumber(input, "temperatureC", -80, 100, errors);
  const temperatureBmpC = readNumber(input, "temperatureBmpC", -80, 100, errors);
  const humidityPct = readNumber(input, "humidityPct", 0, 100, errors);
  const pressureHpa = readNumber(input, "pressureHpa", 300, 1200, errors);
  const lightLux = readNumber(input, "lightLux", 0, 200000, errors);

  if (!Number.isInteger(sequence)) errors.push("sequence debe ser entero");
  if (!Number.isInteger(uptimeSeconds)) errors.push("uptimeSeconds debe ser entero");
  if (!Number.isInteger(wifiRssi)) errors.push("wifiRssi debe ser entero");

  const sensors =
    input.sensors && typeof input.sensors === "object" && !Array.isArray(input.sensors)
      ? input.sensors
      : null;

  if (!sensors) errors.push("sensors es obligatorio");
  const sensorStatus = {
    dht22: sensors ? readBoolean(sensors, "dht22", errors) : false,
    bmp280: sensors ? readBoolean(sensors, "bmp280", errors) : false,
    bh1750: sensors ? readBoolean(sensors, "bh1750", errors) : false,
    oled: sensors ? readBoolean(sensors, "oled", errors) : false,
  };

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      deviceId,
      bootId: bootId.toUpperCase(),
      firmwareVersion,
      sequence,
      uptimeSeconds,
      wifiRssi,
      temperatureC,
      temperatureBmpC,
      humidityPct,
      pressureHpa,
      lightLux,
      sensors: sensorStatus,
    },
  };
}

async function secureEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function isAuthorized(request, env) {
  if (!env.DEVICE_TOKEN) return false;
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  return secureEqual(authorization.slice(7), env.DEVICE_TOKEN);
}

async function parseJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, "payload_too_large", "Cuerpo demasiado grande") };
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, "payload_too_large", "Cuerpo demasiado grande") };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, response: apiError(400, "invalid_json", "El JSON no es valido") };
  }
}

async function ingestTelemetry(request, env) {
  if (!(await isAuthorized(request, env))) {
    return apiError(401, "unauthorized", "Token de dispositivo invalido");
  }

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const validated = validateTelemetry(parsed.value);
  if (!validated.ok) {
    return apiError(422, "validation_error", "La telemetria no es valida", validated.errors);
  }

  const data = validated.value;
  const receivedAtMs = Date.now();
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO telemetry (
      device_id, boot_id, sequence, received_at_ms, firmware_version,
      uptime_seconds, wifi_rssi, temperature_c, temperature_bmp_c,
      humidity_pct, pressure_hpa, light_lux,
      dht22_ok, bmp280_ok, bh1750_ok, oled_ok
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
      ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
    )`,
  )
    .bind(
      data.deviceId,
      data.bootId,
      data.sequence,
      receivedAtMs,
      data.firmwareVersion,
      data.uptimeSeconds,
      data.wifiRssi,
      data.temperatureC,
      data.temperatureBmpC,
      data.humidityPct,
      data.pressureHpa,
      data.lightLux,
      data.sensors.dht22 ? 1 : 0,
      data.sensors.bmp280 ? 1 : 0,
      data.sensors.bh1750 ? 1 : 0,
      data.sensors.oled ? 1 : 0,
    )
    .run();

  const inserted = Number(result.meta?.changes || 0) > 0;
  return json(
    {
      ok: true,
      accepted: inserted,
      duplicate: !inserted,
      receivedAt: new Date(receivedAtMs).toISOString(),
    },
    inserted ? 201 : 200,
  );
}

function validDeviceQuery(url) {
  const deviceId = (url.searchParams.get("device") || "").trim();
  return DEVICE_ID_PATTERN.test(deviceId) ? deviceId : null;
}

function rowToTelemetry(row) {
  if (!row) return null;
  return {
    deviceId: row.deviceId,
    bootId: row.bootId,
    sequence: row.sequence,
    receivedAt: new Date(row.receivedAtMs).toISOString(),
    receivedAtMs: row.receivedAtMs,
    firmwareVersion: row.firmwareVersion,
    uptimeSeconds: row.uptimeSeconds,
    wifiRssi: row.wifiRssi,
    temperatureC: row.temperatureC,
    temperatureBmpC: row.temperatureBmpC,
    humidityPct: row.humidityPct,
    pressureHpa: row.pressureHpa,
    lightLux: row.lightLux,
    sensors: {
      dht22: Boolean(row.dht22Ok),
      bmp280: Boolean(row.bmp280Ok),
      bh1750: Boolean(row.bh1750Ok),
      oled: Boolean(row.oledOk),
    },
  };
}

const SELECT_FIELDS = `
  device_id AS deviceId,
  boot_id AS bootId,
  sequence,
  received_at_ms AS receivedAtMs,
  firmware_version AS firmwareVersion,
  uptime_seconds AS uptimeSeconds,
  wifi_rssi AS wifiRssi,
  temperature_c AS temperatureC,
  temperature_bmp_c AS temperatureBmpC,
  humidity_pct AS humidityPct,
  pressure_hpa AS pressureHpa,
  light_lux AS lightLux,
  dht22_ok AS dht22Ok,
  bmp280_ok AS bmp280Ok,
  bh1750_ok AS bh1750Ok,
  oled_ok AS oledOk
`;

async function getLatest(url, env) {
  const deviceId = validDeviceQuery(url);
  if (!deviceId) return apiError(400, "invalid_device", "Indica un device valido");

  const row = await env.DB.prepare(
    `SELECT ${SELECT_FIELDS}
     FROM telemetry
     WHERE device_id = ?1
     ORDER BY received_at_ms DESC, id DESC
     LIMIT 1`,
  )
    .bind(deviceId)
    .first();

  if (!row) return apiError(404, "not_found", "Aun no hay datos para este dispositivo");
  const telemetry = rowToTelemetry(row);
  return json({
    ok: true,
    online: Date.now() - telemetry.receivedAtMs <= ONLINE_WINDOW_MS,
    onlineWindowSeconds: ONLINE_WINDOW_MS / 1000,
    data: telemetry,
  });
}

async function getHistory(url, env) {
  const deviceId = validDeviceQuery(url);
  if (!deviceId) return apiError(400, "invalid_device", "Indica un device valido");

  const requestedHours = Number(url.searchParams.get("hours") || 24);
  const requestedLimit = Number(url.searchParams.get("limit") || 1500);
  const hours = Number.isFinite(requestedHours)
    ? Math.min(168, Math.max(1, Math.trunc(requestedHours)))
    : 24;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(2000, Math.max(10, Math.trunc(requestedLimit)))
    : 1500;
  const since = Date.now() - hours * 60 * 60 * 1000;
  const bucketMs = Math.max(1000, Math.ceil((hours * 60 * 60 * 1000) / limit));

  const result = await env.DB.prepare(
    `WITH bucketed AS (
       SELECT CAST(received_at_ms / ?3 AS INTEGER) AS time_bucket,
              MAX(id) AS latest_id
       FROM telemetry
       WHERE device_id = ?1 AND received_at_ms >= ?2
       GROUP BY time_bucket
       ORDER BY time_bucket DESC
       LIMIT ?4
     )
     SELECT ${SELECT_FIELDS}
     FROM telemetry AS t
     INNER JOIN bucketed AS b ON t.id = b.latest_id
     ORDER BY t.received_at_ms ASC, t.id ASC`,
  )
    .bind(deviceId, since, bucketMs, limit)
    .all();

  const data = (result.results || []).map(rowToTelemetry);
  return json({
    ok: true,
    deviceId,
    hours,
    count: data.length,
    sampledEverySeconds: Math.ceil(bucketMs / 1000),
    data,
  });
}

async function getDevices(env) {
  const result = await env.DB.prepare(
    `SELECT ${SELECT_FIELDS}
     FROM telemetry AS t
     WHERE id = (
       SELECT id FROM telemetry
       WHERE device_id = t.device_id
       ORDER BY received_at_ms DESC, id DESC
       LIMIT 1
     )
     ORDER BY received_at_ms DESC`,
  ).all();

  const devices = (result.results || []).map((row) => {
    const latest = rowToTelemetry(row);
    return {
      deviceId: latest.deviceId,
      online: Date.now() - latest.receivedAtMs <= ONLINE_WINDOW_MS,
      lastSeen: latest.receivedAt,
      firmwareVersion: latest.firmwareVersion,
    };
  });
  return json({ ok: true, devices });
}

async function health(env) {
  const result = await env.DB.prepare("SELECT 1 AS ok").first();
  return json({ ok: result?.ok === 1, service: "esp32-weather-cloud" });
}

function dashboard() {
  return new Response(DASHBOARD_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
      "content-security-policy":
        "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}

async function handleRequest(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: API_HEADERS });

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/assets/umg-logo.png") {
    return env.ASSETS.fetch(request);
  }
  if (request.method === "GET" && url.pathname === "/") return dashboard();
  if (request.method === "GET" && url.pathname === "/api/health") return health(env);
  if (request.method === "GET" && url.pathname === "/api/devices") return getDevices(env);
  if (request.method === "GET" && url.pathname === "/api/latest") return getLatest(url, env);
  if (request.method === "GET" && url.pathname === "/api/history") return getHistory(url, env);
  if (request.method === "POST" && url.pathname === "/api/telemetry") {
    return ingestTelemetry(request, env);
  }

  return apiError(404, "not_found", "Ruta no encontrada");
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error("Unhandled worker error", error);
      return apiError(500, "internal_error", "Error interno del servicio");
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      env.DB.prepare("DELETE FROM telemetry WHERE received_at_ms < ?1")
        .bind(Date.now() - RETENTION_MS)
        .run(),
    );
  },
};
