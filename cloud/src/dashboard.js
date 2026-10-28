export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#0b2634">
  <link rel="icon" type="image/png" href="/assets/umg-logo.png">
  <title>Estación meteorológica | UMG</title>
  <style>
    :root {
      color-scheme: dark;
      --umg-red: #c62b28;
      --umg-blue: #16709f;
      --umg-gold: #b1832d;
      --umg-ink: #2b2422;
      --umg-white: #ffffff;
      --bg: #071922;
      --panel: rgba(12, 43, 57, .92);
      --panel-2: rgba(17, 58, 76, .78);
      --line: rgba(204, 164, 77, .25);
      --text: #ffffff;
      --muted: #b5cad3;
      --blue-light: #62c2e8;
      --gold-light: #e3b74f;
      --red-light: #ee716e;
      --danger: #ff817e;
      --shadow: 0 24px 70px rgba(0, 0, 0, .28);
    }
    * { box-sizing: border-box; }
    html { background: var(--bg); }
    body {
      margin: 0;
      min-height: 100vh;
      overflow-x: hidden;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 84% 0%, rgba(22, 112, 159, .34), transparent 35rem),
        radial-gradient(circle at 0% 72%, rgba(198, 43, 40, .1), transparent 31rem),
        var(--bg);
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: .24;
      background-image: linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,.022) 1px, transparent 1px);
      background-size: 32px 32px;
      mask-image: linear-gradient(to bottom, black, transparent 80%);
    }
    body::after {
      content: "";
      position: fixed;
      z-index: 10;
      inset: 0 0 auto;
      height: 4px;
      background: linear-gradient(90deg, var(--umg-red) 0 34%, var(--umg-gold) 34% 67%, var(--umg-blue) 67%);
    }
    .shell {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: max(44px, env(safe-area-inset-top)) 0 max(64px, env(safe-area-inset-bottom));
    }
    header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 28px; margin-bottom: 28px; }
    .brand { display: flex; align-items: center; gap: 20px; min-width: 0; }
    .brand-logo-wrap {
      flex: 0 0 112px;
      width: 112px;
      height: 112px;
      padding: 5px;
      border: 1px solid rgba(227, 183, 79, .55);
      border-radius: 50%;
      background: rgba(255, 255, 255, .06);
      box-shadow: 0 18px 45px rgba(0, 0, 0, .28), 0 0 0 5px rgba(177, 131, 45, .08);
    }
    .brand-logo { display: block; width: 100%; height: 100%; object-fit: contain; }
    .eyebrow { color: var(--gold-light); font-size: 12px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
    h1 { margin: 7px 0 0; font-size: clamp(34px, 5vw, 58px); line-height: .98; letter-spacing: -.04em; }
    .subtitle { max-width: 640px; margin: 12px 0 0; color: var(--muted); line-height: 1.55; }
    .toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
    select, button {
      border: 1px solid var(--line);
      border-radius: 12px;
      color: var(--text);
      background: var(--panel);
      min-height: 44px;
      padding: 10px 14px;
      font: inherit;
      cursor: pointer;
      touch-action: manipulation;
      transition: color 180ms ease, border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease;
    }
    select:hover, button:hover { border-color: rgba(227, 183, 79, .65); }
    select:focus-visible, button:focus-visible { outline: 3px solid rgba(227, 183, 79, .48); outline-offset: 3px; }
    button.active { border-color: var(--gold-light); color: var(--umg-ink); background: var(--gold-light); box-shadow: 0 8px 24px rgba(177, 131, 45, .18); }
    .status-strip {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 14px;
      align-items: center;
      padding: 15px 18px;
      margin-bottom: 18px;
      border: 1px solid var(--line);
      border-left: 4px solid var(--umg-gold);
      border-radius: 16px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }
    .dot { width: 11px; height: 11px; border-radius: 50%; background: var(--muted); box-shadow: 0 0 0 5px rgba(181,202,211,.1); }
    .dot.online { background: var(--gold-light); box-shadow: 0 0 0 5px rgba(227,183,79,.12), 0 0 22px rgba(227,183,79,.42); }
    .dot.offline { background: var(--danger); box-shadow: 0 0 0 5px rgba(255,129,126,.12); }
    .status-title { font-weight: 800; }
    .status-meta { color: var(--muted); font-size: 13px; margin-top: 2px; }
    .updated { color: var(--muted); font-size: 13px; text-align: right; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .card {
      position: relative;
      overflow: hidden;
      min-height: 235px;
      padding: 20px;
      border: 1px solid var(--line);
      border-top: 3px solid currentColor;
      border-radius: 20px;
      background: linear-gradient(145deg, var(--panel), var(--panel-2));
      box-shadow: var(--shadow);
    }
    .card::after { content: ""; position: absolute; inset: auto -30px -50px auto; width: 130px; height: 130px; border-radius: 50%; background: currentColor; opacity: .035; }
    .card.temp { color: var(--gold-light); }
    .card.humidity { color: var(--blue-light); }
    .card.pressure { color: var(--umg-white); }
    .card.light { color: var(--red-light); }
    .label { color: var(--muted); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .09em; }
    .value { min-width: 0; margin-top: 13px; color: var(--text); font-size: clamp(32px, 4vw, 50px); font-weight: 800; letter-spacing: -.05em; overflow-wrap: anywhere; }
    .unit { margin-left: 5px; color: currentColor; font-size: 16px; font-weight: 800; letter-spacing: 0; }
    .chart-wrap { position: absolute; left: 14px; right: 14px; bottom: 14px; height: 82px; }
    svg { width: 100%; height: 100%; overflow: visible; }
    .chart-line { fill: none; stroke: currentColor; stroke-width: 2.2; vector-effect: non-scaling-stroke; }
    .chart-base { stroke: rgba(255,255,255,.11); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .range { position: absolute; right: 18px; top: 21px; color: var(--muted); font-size: 11px; }
    .details { display: grid; grid-template-columns: 1.2fr .8fr; gap: 14px; margin-top: 14px; }
    .panel { padding: 20px; border: 1px solid var(--line); border-radius: 20px; background: var(--panel); box-shadow: var(--shadow); }
    h2 { margin: 0 0 16px; font-size: 18px; }
    .sensors { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .sensor { padding: 13px; border-radius: 14px; border: 1px solid var(--line); background: rgba(255,255,255,.025); }
    .sensor-name { color: var(--muted); font-size: 12px; }
    .sensor-state { margin-top: 6px; font-weight: 800; }
    .sensor-state.ok { color: var(--gold-light); }
    .sensor-state.error { color: var(--danger); }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .fact span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 5px; }
    .fact strong { font-size: 15px; }
    .notice { display: none; margin-bottom: 16px; padding: 13px 16px; border: 1px solid rgba(238,113,110,.42); border-radius: 13px; color: #ffe5e4; background: rgba(198,43,40,.14); }
    .empty { padding: 50px 20px; text-align: center; color: var(--muted); }
    footer { margin-top: 24px; color: var(--muted); font-size: 12px; text-align: center; }
    @media (max-width: 1024px) {
      header { grid-template-columns: 1fr; align-items: start; }
      .toolbar { width: 100%; }
      .metrics { grid-template-columns: repeat(2, 1fr); }
      .details { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .shell { width: min(100% - 20px, 1180px); padding-top: max(28px, env(safe-area-inset-top)); }
      .brand { align-items: flex-start; gap: 14px; }
      .brand-logo-wrap { flex-basis: 76px; width: 76px; height: 76px; padding: 3px; }
      .eyebrow { font-size: 10px; line-height: 1.4; }
      h1 { font-size: clamp(28px, 9vw, 39px); }
      .subtitle { font-size: 14px; }
      .toolbar select { flex: 1 0 100%; width: 100%; }
      .toolbar button { flex: 1; }
      .metrics { grid-template-columns: 1fr; }
      .status-strip { grid-template-columns: auto 1fr; }
      .updated { grid-column: 2; text-align: left; }
      .sensors { grid-template-columns: repeat(2, 1fr); }
      .facts { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div class="brand">
        <div class="brand-logo-wrap">
          <img class="brand-logo" src="/assets/umg-logo.png" width="102" height="102" alt="Escudo de la Universidad Mariano Gálvez de Guatemala" fetchpriority="high">
        </div>
        <div>
          <div class="eyebrow">Universidad Mariano Gálvez de Guatemala</div>
          <h1>Estación meteorológica</h1>
          <p class="subtitle">Monitoreo ambiental en tiempo real, salud de sensores e histórico enviado por el ESP32.</p>
        </div>
      </div>
      <div class="toolbar">
        <select id="device" aria-label="Dispositivo"></select>
        <button data-hours="6">6 h</button>
        <button class="active" data-hours="24">24 h</button>
        <button data-hours="72">3 días</button>
      </div>
    </header>

    <div id="notice" class="notice"></div>

    <section class="status-strip">
      <div id="dot" class="dot"></div>
      <div>
        <div id="status-title" class="status-title">Esperando datos...</div>
        <div id="status-meta" class="status-meta">Conectando con la estacion</div>
      </div>
      <div id="updated" class="updated">--</div>
    </section>

    <section class="metrics">
      <article class="card temp">
        <div class="label">Temperatura</div>
        <div class="range" id="temp-range">--</div>
        <div class="value"><span id="temperature">--</span><span class="unit">°C</span></div>
        <div class="chart-wrap"><svg viewBox="0 0 300 80" preserveAspectRatio="none"><line class="chart-base" x1="0" y1="76" x2="300" y2="76"/><polyline id="temp-chart" class="chart-line"/></svg></div>
      </article>
      <article class="card humidity">
        <div class="label">Humedad</div>
        <div class="range" id="humidity-range">--</div>
        <div class="value"><span id="humidity">--</span><span class="unit">%</span></div>
        <div class="chart-wrap"><svg viewBox="0 0 300 80" preserveAspectRatio="none"><line class="chart-base" x1="0" y1="76" x2="300" y2="76"/><polyline id="humidity-chart" class="chart-line"/></svg></div>
      </article>
      <article class="card pressure">
        <div class="label">Presión</div>
        <div class="range" id="pressure-range">--</div>
        <div class="value"><span id="pressure">--</span><span class="unit">hPa</span></div>
        <div class="chart-wrap"><svg viewBox="0 0 300 80" preserveAspectRatio="none"><line class="chart-base" x1="0" y1="76" x2="300" y2="76"/><polyline id="pressure-chart" class="chart-line"/></svg></div>
      </article>
      <article class="card light">
        <div class="label">Luz</div>
        <div class="range" id="light-range">--</div>
        <div class="value"><span id="light">--</span><span class="unit">lux</span></div>
        <div class="chart-wrap"><svg viewBox="0 0 300 80" preserveAspectRatio="none"><line class="chart-base" x1="0" y1="76" x2="300" y2="76"/><polyline id="light-chart" class="chart-line"/></svg></div>
      </article>
    </section>

    <section class="details">
      <article class="panel">
        <h2>Estado de sensores</h2>
        <div class="sensors">
          <div class="sensor"><div class="sensor-name">DHT22</div><div id="sensor-dht22" class="sensor-state">--</div></div>
          <div class="sensor"><div class="sensor-name">BMP280</div><div id="sensor-bmp280" class="sensor-state">--</div></div>
          <div class="sensor"><div class="sensor-name">BH1750</div><div id="sensor-bh1750" class="sensor-state">--</div></div>
          <div class="sensor"><div class="sensor-name">OLED</div><div id="sensor-oled" class="sensor-state">--</div></div>
        </div>
      </article>
      <article class="panel">
        <h2>Dispositivo</h2>
        <div class="facts">
          <div class="fact"><span>Señal Wi-Fi</span><strong id="rssi">--</strong></div>
          <div class="fact"><span>Firmware</span><strong id="firmware">--</strong></div>
          <div class="fact"><span>Tiempo encendido</span><strong id="uptime">--</strong></div>
          <div class="fact"><span>Muestras visibles</span><strong id="samples">--</strong></div>
        </div>
      </article>
    </section>
    <footer>Universidad Mariano Gálvez de Guatemala · Panel en vivo cada 1 segundo · Lecturas del ESP32 cada 2 segundos</footer>
  </main>

  <script>
    (function () {
      var POLL_INTERVAL_MS = 1000;
      var state = {
        device: "",
        hours: 24,
        history: [],
        latest: null,
        onlineWindowSeconds: 60,
        refreshing: false,
        loadingDevices: false
      };
      var el = function (id) { return document.getElementById(id); };

      function setNotice(message) {
        el("notice").textContent = message || "";
        el("notice").style.display = message ? "block" : "none";
      }

      async function getJson(path) {
        var response = await fetch(path, { cache: "no-store" });
        var body = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(body.message || "No se pudo consultar el servicio");
        return body;
      }

      function number(value, decimals) {
        return typeof value === "number" ? value.toFixed(decimals) : "--";
      }

      function uptime(seconds) {
        if (!Number.isFinite(seconds)) return "--";
        var days = Math.floor(seconds / 86400);
        var hours = Math.floor((seconds % 86400) / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        return (days ? days + " d " : "") + hours + " h " + minutes + " min";
      }

      function age(iso) {
        var seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
        if (seconds < 60) return "hace " + seconds + " s";
        if (seconds < 3600) return "hace " + Math.floor(seconds / 60) + " min";
        return "hace " + Math.floor(seconds / 3600) + " h";
      }

      function updateFreshness() {
        if (!state.latest) return;
        var elapsed = Date.now() - Date.parse(state.latest.receivedAt);
        var online = elapsed <= state.onlineWindowSeconds * 1000;
        el("updated").textContent = "Último dato " + age(state.latest.receivedAt);
        el("status-title").textContent = online ? "Estación en línea" : "Estación sin señal";
        el("status-meta").textContent = online
          ? "Recibiendo datos de " + state.latest.deviceId
          : "La última transmisión fue " + age(state.latest.receivedAt);
        el("dot").className = "dot " + (online ? "online" : "offline");
      }

      function sensor(id, ok) {
        var target = el("sensor-" + id);
        target.textContent = ok ? "OPERANDO" : "SIN LECTURA";
        target.className = "sensor-state " + (ok ? "ok" : "error");
      }

      function chart(polylineId, rangeId, key, decimals) {
        var values = state.history
          .map(function (row) { return row[key]; })
          .filter(function (value) { return typeof value === "number" && Number.isFinite(value); });
        var line = el(polylineId);
        if (values.length < 2) {
          line.setAttribute("points", "");
          el(rangeId).textContent = values.length ? number(values[0], decimals) : "--";
          return;
        }
        var min = Math.min.apply(Math, values);
        var max = Math.max.apply(Math, values);
        var span = max - min || 1;
        var points = values.map(function (value, index) {
          var x = index * 300 / (values.length - 1);
          var y = 73 - ((value - min) / span) * 66;
          return x.toFixed(2) + "," + y.toFixed(2);
        }).join(" ");
        line.setAttribute("points", points);
        el(rangeId).textContent = number(min, decimals) + "–" + number(max, decimals);
      }

      function render(latest) {
        el("temperature").textContent = number(latest.temperatureC, 1);
        el("humidity").textContent = number(latest.humidityPct, 0);
        el("pressure").textContent = number(latest.pressureHpa, 0);
        el("light").textContent = number(latest.lightLux, 1);
        el("rssi").textContent = latest.wifiRssi + " dBm";
        el("firmware").textContent = latest.firmwareVersion;
        el("uptime").textContent = uptime(latest.uptimeSeconds);
        el("samples").textContent = state.history.length;
        state.latest = latest;
        updateFreshness();
        sensor("dht22", latest.sensors.dht22);
        sensor("bmp280", latest.sensors.bmp280);
        sensor("bh1750", latest.sensors.bh1750);
        sensor("oled", latest.sensors.oled);
        chart("temp-chart", "temp-range", "temperatureC", 1);
        chart("humidity-chart", "humidity-range", "humidityPct", 0);
        chart("pressure-chart", "pressure-range", "pressureHpa", 0);
        chart("light-chart", "light-range", "lightLux", 1);
      }

      function mergeLatest(latest) {
        var cutoff = Date.now() - state.hours * 60 * 60 * 1000;
        state.history = state.history.filter(function (row) {
          return row.receivedAtMs >= cutoff;
        });
        var last = state.history[state.history.length - 1];
        var isNew = !last || last.bootId !== latest.bootId || last.sequence !== latest.sequence;
        if (isNew) state.history.push(latest);
        if (state.history.length > 2000) state.history = state.history.slice(-2000);
      }

      async function refresh(includeHistory) {
        if (!state.device || state.refreshing) return;
        state.refreshing = true;
        try {
          var encoded = encodeURIComponent(state.device);
          var latestRequest = getJson("/api/latest?device=" + encoded);
          var historyRequest = includeHistory
            ? getJson("/api/history?device=" + encoded + "&hours=" + state.hours + "&limit=2000")
            : Promise.resolve(null);
          var results = await Promise.all([latestRequest, historyRequest]);
          if (results[1]) state.history = results[1].data;
          state.onlineWindowSeconds = results[0].onlineWindowSeconds || 15;
          mergeLatest(results[0].data);
          render(results[0].data);
          setNotice("");
        } catch (error) {
          setNotice(error.message);
        } finally {
          state.refreshing = false;
        }
      }

      async function loadDevices() {
        if (state.loadingDevices) return;
        state.loadingDevices = true;
        try {
          var result = await getJson("/api/devices");
          var select = el("device");
          select.innerHTML = "";
          if (!result.devices.length) {
            var empty = document.createElement("option");
            empty.textContent = "Sin dispositivos";
            empty.value = "";
            select.appendChild(empty);
            state.device = "";
            setNotice("Aún no hay lecturas. El panel volverá a buscar automáticamente.");
            return;
          }
          result.devices.forEach(function (device) {
            var option = document.createElement("option");
            option.value = device.deviceId;
            option.textContent = device.deviceId + (device.online ? " · en linea" : " · sin señal");
            select.appendChild(option);
          });
          state.device = result.devices[0].deviceId;
          select.value = state.device;
          await refresh(true);
        } catch (error) {
          setNotice(error.message);
        } finally {
          state.loadingDevices = false;
        }
      }

      async function tick() {
        if (document.hidden) return;
        if (state.device) {
          await refresh();
        } else {
          await loadDevices();
        }
      }

      el("device").addEventListener("change", function (event) {
        state.device = event.target.value;
        state.history = [];
        refresh(true);
      });

      document.querySelectorAll("[data-hours]").forEach(function (button) {
        button.addEventListener("click", function () {
          document.querySelectorAll("[data-hours]").forEach(function (item) {
            item.classList.remove("active");
          });
          button.classList.add("active");
          state.hours = Number(button.getAttribute("data-hours"));
          refresh(true);
        });
      });

      async function liveLoop() {
        await tick();
        window.setTimeout(liveLoop, POLL_INTERVAL_MS);
      }

      liveLoop();
      setInterval(updateFreshness, 1000);
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) tick();
      });
      window.addEventListener("focus", tick);
      window.addEventListener("online", tick);
    }());
  </script>
</body>
</html>`;
