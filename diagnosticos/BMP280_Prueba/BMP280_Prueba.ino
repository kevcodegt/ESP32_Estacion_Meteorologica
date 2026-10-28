/*
  Prueba aislada del BMP280 con ESP32.

  BMP280 de 4 pines:
    VCC/VIN -> 3V3
    GND     -> GND
    SCL/SCK -> GPIO22
    SDA/SDI -> GPIO21

  BMP280 de 6 pines:
    CS/CSB  -> 3V3
    SDO     -> GND para 0x76, o 3V3 para 0x77
*/

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>

constexpr uint8_t PIN_SDA = 21;
constexpr uint8_t PIN_SCL = 22;

Adafruit_BMP280 bmp;
uint8_t direccionBmp = 0;

bool iniciarBmp280() {
  const uint8_t direcciones[] = {0x76, 0x77};
  for (const uint8_t direccion : direcciones) {
    if (bmp.begin(direccion)) {
      direccionBmp = direccion;
      bmp.setSampling(
        Adafruit_BMP280::MODE_FORCED,
        Adafruit_BMP280::SAMPLING_X2,
        Adafruit_BMP280::SAMPLING_X16,
        Adafruit_BMP280::FILTER_X4,
        Adafruit_BMP280::STANDBY_MS_1
      );
      return true;
    }
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);

  Serial.println(F("\n=== Prueba BMP280 ==="));
  if (!iniciarBmp280()) {
    Serial.println(F("BMP280 no detectado. Revisa VCC, GND, SDA, SCL, CSB y SDO."));
    return;
  }

  Serial.printf("BMP280 detectado en 0x%02X, ID 0x%02X\n",
                direccionBmp, bmp.sensorID());
}

void loop() {
  if (direccionBmp == 0) {
    delay(2000);
    return;
  }

  if (!bmp.takeForcedMeasurement()) {
    Serial.println(F("No se pudo iniciar la medicion."));
    delay(2000);
    return;
  }

  const float temperaturaC = bmp.readTemperature();
  const float presionHpa = bmp.readPressure() / 100.0f;
  const bool valida = isfinite(temperaturaC) && isfinite(presionHpa) &&
                      temperaturaC >= -40.0f && temperaturaC <= 85.0f &&
                      presionHpa >= 300.0f && presionHpa <= 1200.0f;

  Serial.printf("Temperatura: %.2f C | Presion: %.2f hPa | %s\n",
                temperaturaC, presionHpa, valida ? "OK" : "ERROR");
  delay(2000);
}
