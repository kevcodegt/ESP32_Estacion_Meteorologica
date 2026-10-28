/*
  Estacion meteorologica ESP32 con telemetria HTTPS.

  Hardware:
    - OLED SSD1306 128x64: SDA GPIO21, SCL GPIO22, direccion 0x3C/0x3D
    - BH1750: mismo bus I2C, direccion 0x23
    - BMP280: mismo bus I2C, direccion 0x76/0x77
    - DHT22: DATA GPIO4, resistencia pull-up de 10k a 3V3

  Antes de compilar:
    1. Editar secrets.h con Wi-Fi, URL y token.
    2. Instalar las librerias indicadas en README.md.
    3. Usar ESP32 Arduino Core 3.3.12 o posterior para validar HTTPS
       mediante el paquete de certificados integrado.
*/

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_BMP280.h>
#include <BH1750.h>
#include <DHT.h>
#include <esp_system.h>
#include <esp_sleep.h>
#include <time.h>

#include "secrets.h"

constexpr uint8_t PIN_SDA = 21;
constexpr uint8_t PIN_SCL = 22;
constexpr uint8_t PIN_DHT = 4;
constexpr uint8_t TIPO_DHT = DHT22;

constexpr int ANCHO_PANTALLA = 128;
constexpr int ALTO_PANTALLA = 64;
constexpr int PIN_RESET_OLED = -1;

constexpr uint32_t INTERVALO_LECTURA_MS = 1000;
constexpr uint32_t INTERVALO_ENVIO_MS = 2000;
constexpr uint32_t INTERVALO_REINTENTO_NUBE_MS = 2000;
constexpr uint32_t INTERVALO_REINTENTO_SENSOR_MS = 30000;
constexpr uint32_t INTERVALO_REINTENTO_WIFI_MS = 10000;
constexpr uint32_t TIMEOUT_WIFI_MS = 20000;
constexpr uint32_t TIMEOUT_HTTP_MS = 15000;

// Modo de energia:
//   0 = tiempo real: lee cada 1 s y envia cada 2 s (requiere alimentacion USB).
//   1 = bajo consumo: despierta, lee, envia una muestra y entra en Deep Sleep.
#define MODO_BAJO_CONSUMO 0
constexpr uint64_t MINUTOS_ENTRE_MUESTRAS = 5;
constexpr uint64_t MICROSEGUNDOS_POR_MINUTO = 60ULL * 1000000ULL;

constexpr uint8_t BH1750_MTREG_LUZ_INTENSA = 32;
constexpr uint8_t BH1750_MTREG_NORMAL = 69;
constexpr uint8_t BH1750_MTREG_POCA_LUZ = 138;
constexpr float BH1750_UMBRAL_POCA_LUZ_LUX = 10.0f;
constexpr float BH1750_SALIDA_POCA_LUZ_LUX = 15.0f;
constexpr float BH1750_UMBRAL_LUZ_INTENSA_LUX = 40000.0f;
constexpr float BH1750_SALIDA_LUZ_INTENSA_LUX = 35000.0f;

constexpr char VERSION_FIRMWARE[] = "1.2.0";

// La memoria RTC sobrevive al Deep Sleep; la RAM normal se borra en cada despertar.
RTC_DATA_ATTR uint32_t secuenciaRtc = 0;
RTC_DATA_ATTR char bootIdRtc[9] = {0};

Adafruit_SSD1306 pantalla(ANCHO_PANTALLA, ALTO_PANTALLA, &Wire, PIN_RESET_OLED);
Adafruit_BMP280 bmp;
BH1750 medidorLuz;
DHT dht(PIN_DHT, TIPO_DHT);

struct Lectura {
  float temperaturaC = NAN;
  float temperaturaBmpC = NAN;
  float humedadPct = NAN;
  float presionHpa = NAN;
  float luzLux = NAN;
  bool dht22Ok = false;
  bool bmp280Ok = false;
  bool bh1750Ok = false;
  bool oledOk = false;
  uint32_t secuencia = 0;
  uint32_t tomadaEnMs = 0;
};

Lectura lecturaActual;

bool oledInicializada = false;
bool bmpInicializado = false;
bool bh1750Inicializado = false;
uint8_t bh1750MtregActual = BH1750_MTREG_NORMAL;
volatile bool ultimoEnvioOk = false;
bool relojSincronizado = false;
uint8_t direccionOled = 0;
uint8_t direccionBmp = 0;
uint32_t ultimaLecturaMs = 0;
uint32_t ultimoIntentoNubeMs = 0;
uint32_t ultimoReintentoSensorMs = 0;
uint32_t ultimoIntentoWifiMs = 0;
char bootId[9] = {0};
QueueHandle_t colaNube = nullptr;

bool tiempoCumplido(uint32_t ahora, uint32_t anterior, uint32_t intervalo) {
  return anterior == 0 || static_cast<uint32_t>(ahora - anterior) >= intervalo;
}

bool respondeI2C(uint8_t direccion) {
  Wire.beginTransmission(direccion);
  return Wire.endTransmission() == 0;
}

bool leerRegistrosI2C(uint8_t direccion, uint8_t registro,
                      uint8_t *destino, size_t cantidad) {
  Wire.beginTransmission(direccion);
  Wire.write(registro);
  if (Wire.endTransmission(false) != 0) return false;

  const size_t recibidos = Wire.requestFrom(
    static_cast<int>(direccion), static_cast<int>(cantidad)
  );
  if (recibidos != cantidad) return false;

  for (size_t i = 0; i < cantidad; ++i) {
    destino[i] = Wire.read();
  }
  return true;
}

uint8_t buscarDireccion(const uint8_t *direcciones, size_t cantidad) {
  for (size_t i = 0; i < cantidad; ++i) {
    if (respondeI2C(direcciones[i])) {
      return direcciones[i];
    }
  }
  return 0;
}

void imprimirEstadoI2C() {
  Serial.println(F("Escaneando bus I2C..."));
  uint8_t encontrados = 0;
  for (uint8_t direccion = 1; direccion < 127; ++direccion) {
    if (respondeI2C(direccion)) {
      Serial.printf("  I2C encontrado: 0x%02X\n", direccion);
      ++encontrados;
    }
  }
  Serial.printf("Total I2C: %u\n", encontrados);
}

void inicializarOled() {
  const uint8_t candidatas[] = {0x3C, 0x3D};
  direccionOled = buscarDireccion(candidatas, sizeof(candidatas));
  oledInicializada = direccionOled != 0 &&
                     pantalla.begin(SSD1306_SWITCHCAPVCC, direccionOled);

  if (oledInicializada) {
    pantalla.clearDisplay();
    pantalla.setTextColor(SSD1306_WHITE);
    pantalla.setTextSize(1);
    pantalla.setCursor(0, 0);
    pantalla.println(F("Estacion iniciando"));
    pantalla.display();
    Serial.printf("OLED OK en 0x%02X\n", direccionOled);
  } else {
    Serial.println(F("OLED no disponible."));
  }
}

void inicializarBmp280() {
  const uint8_t candidatas[] = {0x76, 0x77};
  direccionBmp = buscarDireccion(candidatas, sizeof(candidatas));
  bmpInicializado = direccionBmp != 0 && bmp.begin(direccionBmp);

  if (bmpInicializado) {
    bmp.setSampling(
      Adafruit_BMP280::MODE_FORCED,
      Adafruit_BMP280::SAMPLING_X2,
      Adafruit_BMP280::SAMPLING_X16,
      Adafruit_BMP280::FILTER_X4,
      Adafruit_BMP280::STANDBY_MS_1
    );
    uint8_t diagnostico[6] = {0};
    const bool diagnosticoOk =
      leerRegistrosI2C(direccionBmp, 0xD0, diagnostico, 1) &&
      leerRegistrosI2C(direccionBmp, 0x88, diagnostico + 1, 2) &&
      leerRegistrosI2C(direccionBmp, 0x8E, diagnostico + 3, 2) &&
      leerRegistrosI2C(direccionBmp, 0xF3, diagnostico + 5, 1);
    const uint16_t digT1 = static_cast<uint16_t>(diagnostico[1]) |
                           (static_cast<uint16_t>(diagnostico[2]) << 8);
    const uint16_t digP1 = static_cast<uint16_t>(diagnostico[3]) |
                           (static_cast<uint16_t>(diagnostico[4]) << 8);
    Serial.printf(
      "BMP280 OK en 0x%02X | ID:0x%02X dig_T1:%u dig_P1:%u status:0x%02X diag:%s\n",
      direccionBmp,
      diagnostico[0],
      digT1,
      digP1,
      diagnostico[5],
      diagnosticoOk ? "OK" : "ERROR"
    );
  } else {
    Serial.println(F("BMP280 no disponible."));
  }
}

void inicializarBh1750() {
  bh1750Inicializado = respondeI2C(0x23) &&
    medidorLuz.begin(BH1750::CONTINUOUS_HIGH_RES_MODE_2, 0x23, &Wire);
  bh1750MtregActual = BH1750_MTREG_NORMAL;

  if (bh1750Inicializado) {
    Serial.println(F("BH1750 OK en 0x23 (alta resolucion adaptativa)"));
  } else {
    Serial.println(F("BH1750 no disponible."));
  }
}

constexpr uint8_t seleccionarMtregBh1750(float luzLux, uint8_t mtregActual) {
  if (luzLux >= BH1750_UMBRAL_LUZ_INTENSA_LUX) {
    return BH1750_MTREG_LUZ_INTENSA;
  }
  if (luzLux <= BH1750_UMBRAL_POCA_LUZ_LUX) {
    return BH1750_MTREG_POCA_LUZ;
  }
  if (mtregActual == BH1750_MTREG_POCA_LUZ &&
      luzLux >= BH1750_SALIDA_POCA_LUZ_LUX) {
    return BH1750_MTREG_NORMAL;
  }
  if (mtregActual == BH1750_MTREG_LUZ_INTENSA &&
      luzLux <= BH1750_SALIDA_LUZ_INTENSA_LUX) {
    return BH1750_MTREG_NORMAL;
  }
  return mtregActual;
}

constexpr bool lecturaBmp280EnRango(float temperaturaC, float presionHpa) {
  return temperaturaC >= -40.0f && temperaturaC <= 85.0f &&
         presionHpa >= 300.0f && presionHpa <= 1200.0f;
}

static_assert(lecturaBmp280EnRango(22.5f, 850.0f),
              "Una lectura ambiental normal del BMP280 debe ser valida");
static_assert(!lecturaBmp280EnRango(-139.49f, 1087.08f),
              "Una temperatura interna imposible debe invalidar el BMP280");

static_assert(seleccionarMtregBh1750(5.0f, BH1750_MTREG_NORMAL) ==
              BH1750_MTREG_POCA_LUZ,
              "El BH1750 debe aumentar sensibilidad con poca luz");
static_assert(seleccionarMtregBh1750(20.0f, BH1750_MTREG_POCA_LUZ) ==
              BH1750_MTREG_NORMAL,
              "El BH1750 debe volver al rango normal con histeresis");
static_assert(seleccionarMtregBh1750(50000.0f, BH1750_MTREG_NORMAL) ==
              BH1750_MTREG_LUZ_INTENSA,
              "El BH1750 debe ampliar rango con luz intensa");

void adaptarSensibilidadBh1750(float luzLux) {
  const uint8_t mtregObjetivo = seleccionarMtregBh1750(luzLux, bh1750MtregActual);
  if (mtregObjetivo == bh1750MtregActual) return;

  if (!medidorLuz.setMTreg(mtregObjetivo)) {
    Serial.println(F("BH1750: no se pudo ajustar la sensibilidad."));
    return;
  }

  bh1750MtregActual = mtregObjetivo;
  if (mtregObjetivo == BH1750_MTREG_POCA_LUZ) {
    Serial.println(F("BH1750: sensibilidad alta para poca luz (MTreg 138)."));
  } else if (mtregObjetivo == BH1750_MTREG_LUZ_INTENSA) {
    Serial.println(F("BH1750: rango ampliado para luz intensa (MTreg 32)."));
  } else {
    Serial.println(F("BH1750: sensibilidad normal (MTreg 69)."));
  }
}

void reintentarSensoresAusentes() {
  const uint32_t ahora = millis();
  if (!tiempoCumplido(ahora, ultimoReintentoSensorMs, INTERVALO_REINTENTO_SENSOR_MS)) {
    return;
  }

  ultimoReintentoSensorMs = ahora;
  if (!oledInicializada) inicializarOled();
  if (!bmpInicializado) inicializarBmp280();
  if (!bh1750Inicializado) inicializarBh1750();
}

void conectarWiFi(bool esperarConexion) {
  if (WiFi.status() == WL_CONNECTED) return;

  const uint32_t ahora = millis();
  if (!esperarConexion &&
      !tiempoCumplido(ahora, ultimoIntentoWifiMs, INTERVALO_REINTENTO_WIFI_MS)) {
    return;
  }
  ultimoIntentoWifiMs = ahora;

  Serial.printf("Conectando a Wi-Fi %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  if (!esperarConexion) {
    Serial.println(F(" (en segundo plano)"));
    return;
  }

  const uint32_t inicio = millis();
  while (WiFi.status() != WL_CONNECTED &&
         static_cast<uint32_t>(millis() - inicio) < TIMEOUT_WIFI_MS) {
    delay(350);
    Serial.print('.');
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nWi-Fi OK. IP: %s, RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println(F("\nWi-Fi no disponible; se reintentara sin detener sensores."));
  }
}

void sincronizarReloj() {
  if (relojSincronizado || WiFi.status() != WL_CONNECTED) return;

  configTime(0, 0, "time.cloudflare.com", "pool.ntp.org");
  Serial.print(F("Sincronizando reloj para HTTPS"));
  const uint32_t inicio = millis();
  time_t ahora = time(nullptr);

  while (ahora < 1700000000 && static_cast<uint32_t>(millis() - inicio) < 15000) {
    delay(300);
    Serial.print('.');
    ahora = time(nullptr);
  }

  relojSincronizado = ahora >= 1700000000;
  Serial.println(relojSincronizado ? F(" OK") : F(" fallo; se reintentara"));
}

Lectura leerSensores() {
  Lectura resultado;
  resultado.secuencia = lecturaActual.secuencia + 1;
  resultado.tomadaEnMs = millis();

  const float humedad = dht.readHumidity();
  const float temperaturaDht = dht.readTemperature();
  resultado.dht22Ok = isfinite(humedad) && isfinite(temperaturaDht) &&
                      humedad >= 0.0f && humedad <= 100.0f &&
                      temperaturaDht >= -40.0f && temperaturaDht <= 80.0f;
  if (resultado.dht22Ok) {
    resultado.humedadPct = humedad;
    resultado.temperaturaC = temperaturaDht;
  }

  resultado.bmp280Ok = bmpInicializado && respondeI2C(direccionBmp);
  if (resultado.bmp280Ok) {
    const bool medicionLista = bmp.takeForcedMeasurement();
    const float temperaturaBmp = medicionLista ? bmp.readTemperature() : NAN;
    const float presionPa = medicionLista ? bmp.readPressure() : NAN;
    const float presion = presionPa / 100.0f;
    resultado.bmp280Ok = isfinite(temperaturaBmp) && isfinite(presion) &&
                         lecturaBmp280EnRango(temperaturaBmp, presion);
    if (resultado.bmp280Ok) {
      resultado.temperaturaBmpC = temperaturaBmp;
      resultado.presionHpa = presion;
      if (!resultado.dht22Ok) resultado.temperaturaC = temperaturaBmp;
    } else {
      Serial.printf(
        "BMP280 lectura invalida | ID:0x%02X T:%.2f C P:%.2f Pa (%.2f hPa)\n",
        bmp.sensorID(), temperaturaBmp, presionPa, presion
      );
    }
  }
  if (!resultado.bmp280Ok) bmpInicializado = false;

  resultado.bh1750Ok = bh1750Inicializado && respondeI2C(0x23);
  if (resultado.bh1750Ok) {
    const float luz = medidorLuz.readLightLevel();
    resultado.bh1750Ok = isfinite(luz) && luz >= 0.0f;
    if (resultado.bh1750Ok) {
      resultado.luzLux = luz;
      adaptarSensibilidadBh1750(luz);
    }
  }
  if (!resultado.bh1750Ok) bh1750Inicializado = false;

  resultado.oledOk = oledInicializada && respondeI2C(direccionOled);
  if (!resultado.oledOk) oledInicializada = false;
  return resultado;
}

void imprimirLectura(const Lectura &lectura) {
  Serial.printf(
    "Lectura #%lu | T: %.1f C | H: %.1f %% | P: %.1f hPa | Luz: %.2f lux | MTreg: %u\n",
    static_cast<unsigned long>(lectura.secuencia),
    lectura.temperaturaC,
    lectura.humedadPct,
    lectura.presionHpa,
    lectura.luzLux,
    bh1750MtregActual
  );
  Serial.printf("Sensores | DHT22:%s BMP280:%s BH1750:%s OLED:%s\n",
                lectura.dht22Ok ? "OK" : "ERROR",
                lectura.bmp280Ok ? "OK" : "ERROR",
                lectura.bh1750Ok ? "OK" : "ERROR",
                lectura.oledOk ? "OK" : "ERROR");
}

void mostrarValorOError(float valor, uint8_t decimales, const __FlashStringHelper *unidad) {
  if (isfinite(valor)) {
    pantalla.print(valor, decimales);
    pantalla.print(unidad);
  } else {
    pantalla.print(F("ERR"));
  }
}

void actualizarPantalla(const Lectura &lectura) {
  if (!oledInicializada || !lectura.oledOk) return;

  pantalla.clearDisplay();
  pantalla.setTextColor(SSD1306_WHITE);
  pantalla.setTextSize(1);

  pantalla.setCursor(0, 0);
  pantalla.print(F("T "));
  mostrarValorOError(lectura.temperaturaC, 1, F("C"));
  pantalla.setCursor(68, 0);
  pantalla.print(F("H "));
  mostrarValorOError(lectura.humedadPct, 0, F("%"));

  pantalla.setCursor(0, 16);
  pantalla.print(F("P "));
  mostrarValorOError(lectura.presionHpa, 0, F(" hPa"));

  pantalla.setCursor(0, 30);
  pantalla.print(F("Luz "));
  mostrarValorOError(lectura.luzLux, 1, F(" lux"));

  pantalla.setCursor(0, 46);
  pantalla.print(WiFi.status() == WL_CONNECTED ? F("WiFi OK") : F("WiFi --"));
  pantalla.setCursor(70, 46);
  pantalla.print(ultimoEnvioOk ? F("Nube OK") : F("Nube --"));

  pantalla.setCursor(0, 57);
  pantalla.print(F("D")); pantalla.print(lectura.dht22Ok ? F("+") : F("-"));
  pantalla.print(F(" B")); pantalla.print(lectura.bmp280Ok ? F("+") : F("-"));
  pantalla.print(F(" L")); pantalla.print(lectura.bh1750Ok ? F("+") : F("-"));
  pantalla.print(F(" #")); pantalla.print(lectura.secuencia);
  pantalla.display();
}

void agregarNumeroOJsonNull(JsonDocument &doc, const char *clave, float valor) {
  if (isfinite(valor)) {
    doc[clave] = valor;
  } else {
    doc[clave] = nullptr;
  }
}

String construirJson(const Lectura &lectura) {
  JsonDocument doc;
  doc["schemaVersion"] = 1;
  doc["deviceId"] = DEVICE_ID;
  doc["bootId"] = bootId;
  doc["firmwareVersion"] = VERSION_FIRMWARE;
  doc["sequence"] = lectura.secuencia;
  doc["uptimeSeconds"] = millis() / 1000;
  doc["wifiRssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : -127;

  agregarNumeroOJsonNull(doc, "temperatureC", lectura.temperaturaC);
  agregarNumeroOJsonNull(doc, "temperatureBmpC", lectura.temperaturaBmpC);
  agregarNumeroOJsonNull(doc, "humidityPct", lectura.humedadPct);
  agregarNumeroOJsonNull(doc, "pressureHpa", lectura.presionHpa);
  agregarNumeroOJsonNull(doc, "lightLux", lectura.luzLux);

  JsonObject sensores = doc["sensors"].to<JsonObject>();
  sensores["dht22"] = lectura.dht22Ok;
  sensores["bmp280"] = lectura.bmp280Ok;
  sensores["bh1750"] = lectura.bh1750Ok;
  sensores["oled"] = lectura.oledOk;

  String json;
  json.reserve(512);
  serializeJson(doc, json);
  return json;
}

bool enviarALaNube(const Lectura &lectura) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("Envio omitido: no hay Wi-Fi."));
    return false;
  }

  sincronizarReloj();
  if (!relojSincronizado) {
    Serial.println(F("Envio omitido: el reloj no esta sincronizado para HTTPS."));
    return false;
  }

  NetworkClientSecure clienteSeguro;
  clienteSeguro.useBuiltinCACertBundle();
  clienteSeguro.setHandshakeTimeout(15);

  HTTPClient http;
  http.setConnectTimeout(TIMEOUT_HTTP_MS);
  http.setTimeout(TIMEOUT_HTTP_MS);

  if (!http.begin(clienteSeguro, TELEMETRY_URL)) {
    Serial.println(F("No se pudo iniciar la conexion HTTPS."));
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("User-Agent", String("ESP32-Weather/") + VERSION_FIRMWARE);

  const String cuerpo = construirJson(lectura);
  const int codigo = http.POST(cuerpo);
  const String respuesta = codigo > 0 ? http.getString() : String();
  http.end();

  if (codigo >= 200 && codigo < 300) {
    JsonDocument confirmacion;
    const DeserializationError errorJson = deserializeJson(confirmacion, respuesta);
    const bool confirmacionValida = !errorJson &&
                                    confirmacion["ok"].is<bool>() &&
                                    confirmacion["ok"].as<bool>();
    if (confirmacionValida) {
      Serial.printf("Nube OK HTTP %d\n", codigo);
      return true;
    }

    const String resumen = respuesta.substring(0, 240);
    Serial.printf("Respuesta de nube invalida HTTP %d: %s\n",
                  codigo, resumen.c_str());
    return false;
  }

  const String resumen = respuesta.substring(0, 240);
  Serial.printf("Error de nube HTTP %d: %s\n", codigo, resumen.c_str());
  return false;
}

void tareaEnvioNube(void *parametro) {
  (void)parametro;
  Lectura lecturaPendiente;

  for (;;) {
    if (xQueueReceive(colaNube, &lecturaPendiente, portMAX_DELAY) == pdTRUE) {
      ultimoEnvioOk = enviarALaNube(lecturaPendiente);
    }
  }
}

void inicializarTareaNube() {
  colaNube = xQueueCreate(1, sizeof(Lectura));
  if (colaNube == nullptr) {
    Serial.println(F("No se pudo crear la cola de nube; se usara envio directo."));
    return;
  }

  const BaseType_t creada = xTaskCreatePinnedToCore(
    tareaEnvioNube,
    "envio-nube",
    16384,
    nullptr,
    1,
    nullptr,
    0
  );

  if (creada != pdPASS) {
    vQueueDelete(colaNube);
    colaNube = nullptr;
    Serial.println(F("No se pudo iniciar la tarea de nube; se usara envio directo."));
    return;
  }

  Serial.println(F("Envio a nube iniciado en segundo plano."));
}

#if MODO_BAJO_CONSUMO
void ejecutarCicloBajoConsumo() {
  // Una sola lectura y un solo envio por despertar.
  lecturaActual.secuencia = secuenciaRtc;
  lecturaActual = leerSensores();
  secuenciaRtc = lecturaActual.secuencia;
  imprimirLectura(lecturaActual);

  ultimoEnvioOk = enviarALaNube(lecturaActual);
  actualizarPantalla(lecturaActual);
  delay(1500);  // deja ver la pantalla antes de apagarla

  // Apaga todo lo que consume antes de dormir.
  if (oledInicializada) pantalla.ssd1306_command(SSD1306_DISPLAYOFF);
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);

  Serial.printf("Deep Sleep por %llu min.\n", MINUTOS_ENTRE_MUESTRAS);
  Serial.flush();
  esp_sleep_enable_timer_wakeup(MINUTOS_ENTRE_MUESTRAS * MICROSEGUNDOS_POR_MINUTO);
  esp_deep_sleep_start();
}
#endif

void setup() {
  Serial.begin(115200);
  delay(1200);
  Serial.println(F("\n=== Estacion meteorologica ESP32 ==="));

  // Tras un Deep Sleep se conserva el mismo bootId para que la nube vea una
  // sola sesion con secuencia creciente; en un arranque en frio se genera otro.
  const bool despertoDeSueno =
    esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER && bootIdRtc[0] != '\0';
  if (despertoDeSueno) {
    memcpy(bootId, bootIdRtc, sizeof(bootId));
  } else {
    snprintf(bootId, sizeof(bootId), "%08lX", static_cast<unsigned long>(esp_random()));
    memcpy(bootIdRtc, bootId, sizeof(bootId));
    secuenciaRtc = 0;
  }
  Serial.printf("Boot ID: %s | firmware %s\n", bootId, VERSION_FIRMWARE);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);
  imprimirEstadoI2C();

  inicializarOled();
  inicializarBmp280();
  inicializarBh1750();
  dht.begin();

  conectarWiFi(true);
  sincronizarReloj();

  delay(2200);

#if MODO_BAJO_CONSUMO
  ejecutarCicloBajoConsumo();  // no regresa: termina en Deep Sleep
#endif

  lecturaActual = leerSensores();
  ultimaLecturaMs = millis();
  imprimirLectura(lecturaActual);
  actualizarPantalla(lecturaActual);
  inicializarTareaNube();
}

void loop() {
  const uint32_t ahora = millis();

  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi(false);
  }

  reintentarSensoresAusentes();

  if (tiempoCumplido(ahora, ultimaLecturaMs, INTERVALO_LECTURA_MS)) {
    ultimaLecturaMs = ahora;
    lecturaActual = leerSensores();
    imprimirLectura(lecturaActual);
    actualizarPantalla(lecturaActual);
  }

  const uint32_t intervaloNube = ultimoEnvioOk
    ? INTERVALO_ENVIO_MS
    : INTERVALO_REINTENTO_NUBE_MS;

  if (tiempoCumplido(ahora, ultimoIntentoNubeMs, intervaloNube)) {
    ultimoIntentoNubeMs = ahora;
    if (colaNube != nullptr) {
      xQueueOverwrite(colaNube, &lecturaActual);
    } else {
      ultimoEnvioOk = enviarALaNube(lecturaActual);
    }
    actualizarPantalla(lecturaActual);
  }

  delay(50);
}
