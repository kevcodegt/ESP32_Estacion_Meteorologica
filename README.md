# Estación meteorológica ESP32 + nube

El proyecto lee cuatro módulos, muestra el estado localmente y envía una
muestra por HTTPS cada 2 segundos. Cloudflare Worker valida la petición, guarda
los datos en D1 y sirve un panel web desde el mismo dominio.

~~~text
DHT22 ─┐
BMP280 ├── ESP32 ── HTTPS + token ── Worker ── D1
BH1750 ┤                              │
OLED  ─┘                              └── Panel web
~~~

## Qué incluye

- Diagnóstico individual de DHT22, BMP280, BH1750 y OLED.
- Recuperación automática de Wi-Fi y reintento de sensores ausentes.
- Comunicación HTTPS con validación de certificado, sin conexiones inseguras.
- Validación de rangos y token de dispositivo en la API.
- Deduplicación mediante deviceId, bootId y sequence.
- Panel responsive para teléfono, tableta y PC con estado en línea, métricas,
  gráficas y salud de sensores.
- Actualización automática del panel cada segundo, sin recargar la página.
- Sensibilidad adaptativa del BH1750 para poca luz, iluminación normal y luz intensa.
- Retención automática de datos durante 90 días.

## 1. Preparar el ESP32

Conexiones:

| Módulo | ESP32 |
|---|---|
| OLED SDA, BH1750 SDA, BMP280 SDA | GPIO21 |
| OLED SCL, BH1750 SCL, BMP280 SCL | GPIO22 |
| DHT22 DATA | GPIO4 con resistencia de 10 kΩ a 3V3 |
| Todos los VCC | 3V3 |
| Todos los GND | GND |

### Conexión del BMP280

Para un módulo de cuatro pines:

| BMP280 | ESP32 |
|---|---|
| VCC o VIN | 3V3 |
| GND | GND |
| SCL o SCK | GPIO22 |
| SDA o SDI | GPIO21 |

Para un módulo de seis pines agrega estas conexiones:

| BMP280 | ESP32 | Función |
|---|---|---|
| CS o CSB | 3V3 | Selecciona comunicación I2C |
| SDO | GND | Dirección I2C `0x76` |

Si conectas SDO a 3V3, la dirección cambia a `0x77`. No dejes CS/CSB
flotando y alimenta el módulo desde 3V3. Desconecta el USB antes de cambiar
los cables.

En Arduino IDE instala:

- Placa esp32 by Espressif Systems versión **3.3.12 o posterior**.
- Adafruit SSD1306
- Adafruit GFX Library
- Adafruit BMP280 Library
- Adafruit Unified Sensor
- BH1750 de Christopher Laws
- DHT sensor library de Adafruit
- ArduinoJson de Benoit Blanchon

Edita [secrets.h](./secrets.h):

~~~cpp
#define WIFI_SSID "MiWiFi"
#define WIFI_PASSWORD "mi-clave"
#define TELEMETRY_URL "https://clima.midominio.com/api/telemetry"
#define DEVICE_TOKEN "una-clave-larga-y-aleatoria"
#define DEVICE_ID "estacion-meteorologica-01"
~~~

La clave debe coincidir exactamente con DEVICE_TOKEN en Cloudflare. El
archivo está ignorado por Git para evitar publicar credenciales.

## Modo de bajo consumo (Deep Sleep)

En `ESP32_Estacion_Meteorologica.ino` cambia:

~~~cpp
#define MODO_BAJO_CONSUMO 1
constexpr uint64_t MINUTOS_ENTRE_MUESTRAS = 5;
~~~

La estación despierta, lee los sensores, envía una muestra, apaga la OLED y el
Wi-Fi, y duerme hasta la siguiente muestra. El `bootId` y la secuencia se
guardan en memoria RTC para que la nube los siga deduplicando. Con
`MODO_BAJO_CONSUMO 0` vuelve al modo de tiempo real (envío cada 2 segundos).
El panel mostrará "sin señal" entre muestras, porque espera datos cada 15 segundos.

## 2. Crear la base y desplegar la nube

Necesitas una cuenta de Cloudflare. Desde la carpeta cloud:

~~~bash
npm install
npx wrangler login
npx wrangler d1 create esp32-weather-db
~~~

El último comando devuelve un database_id. Reemplaza
00000000-0000-0000-0000-000000000000 en
[wrangler.jsonc](./cloud/wrangler.jsonc).

Inicializa la base remota:

~~~bash
npm run db:remote
~~~

Genera un token y guárdalo como secreto. No lo pongas directamente en
wrangler.jsonc:

~~~bash
openssl rand -hex 32
npx wrangler secret put DEVICE_TOKEN
~~~

Pega el mismo valor en secrets.h y despliega:

~~~bash
npm run deploy
~~~

Wrangler mostrará primero una dirección workers.dev. Puedes usarla en
TELEMETRY_URL para comprobar el sistema antes de conectar el dominio.

## 3. Conectar el dominio

El dominio debe estar administrado dentro de la misma cuenta de Cloudflare.
En [wrangler.jsonc](./cloud/wrangler.jsonc), activa y cambia esta sección:

~~~jsonc
,"routes": [
  { "pattern": "clima.midominio.com", "custom_domain": true }
]
~~~

Después ejecuta otra vez:

~~~bash
npm run deploy
~~~

Cloudflare crea el registro DNS y el certificado. El hostname exacto no debe
tener previamente un CNAME. El panel quedará en:

~~~text
https://clima.midominio.com/
~~~

Y el ESP32 enviará a:

~~~text
https://clima.midominio.com/api/telemetry
~~~

## 4. Probar antes de encender el ESP32

Reemplaza dominio y token:

~~~bash
curl -X POST https://clima.midominio.com/api/telemetry \
  -H 'Authorization: Bearer TU_TOKEN' \
  -H 'Content-Type: application/json' \
  --data '{
    "schemaVersion": 1,
    "deviceId": "estacion-meteorologica-01",
    "bootId": "A1B2C3D4",
    "firmwareVersion": "1.0.0",
    "sequence": 1,
    "uptimeSeconds": 60,
    "wifiRssi": -58,
    "temperatureC": 22.8,
    "temperatureBmpC": 23.1,
    "humidityPct": 61.2,
    "pressureHpa": 1013.4,
    "lightLux": 840,
    "sensors": {
      "dht22": true,
      "bmp280": true,
      "bh1750": true,
      "oled": true
    }
  }'
~~~

Debe responder 201 y el panel mostrará el dispositivo.

## API

| Método | Ruta | Uso |
|---|---|---|
| POST | /api/telemetry | Recibe datos; exige Authorization Bearer |
| GET | /api/devices | Lista estaciones detectadas |
| GET | /api/latest?device=... | Última lectura y estado en línea |
| GET | /api/history?device=...&hours=24 | Histórico para gráficas |
| GET | /api/health | Comprueba Worker y D1 |

El panel considera la estación sin señal cuando pasan más de 15 segundos
sin recibir datos.

## Desarrollo local del Worker

Después de configurar el ID de D1:

~~~bash
cd cloud
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev
~~~

El token de .dev.vars debe coincidir con el utilizado por curl.
