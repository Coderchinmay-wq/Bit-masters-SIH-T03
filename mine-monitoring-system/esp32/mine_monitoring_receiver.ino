/*
  AI-Enabled Low-Cost Mine Monitoring & Risk Detection System
  ESP32 Receiver / Gateway Firmware

  Sensors Integrated:
  - MPU6050 (Tilt Angle, Accelerometer, Gyroscope via I2C)
  - Vibration Sensor (Digital/Analog Pin Interrupts & Count)
  - DHT11 / DHT22 Sensor (Temperature & Humidity)

  Telemetry Protocol: HTTP POST API
  Endpoint: /api/sensor-data
  Format: JSON
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>

// ======================================================
// 1. NETWORK CONFIGURATION
// ======================================================
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Replace with your Web Application server IP or domain address
// Example local development: "http://192.168.1.100:5000/api/sensor-data"
// Example Replit deployment: "https://your-app.repl.co/api/sensor-data"
const char* SERVER_URL    = "http://192.168.1.100:5000/api/sensor-data";

// Sensor Node Identification
const char* NODE_ID       = "NODE_01";

// Interval between HTTP POST transmissions (milliseconds)
const unsigned long SEND_INTERVAL_MS = 3000;
unsigned long lastSendTime = 0;

// ======================================================
// 2. HARDWARE SENSOR PINS & VARIABLES
// ======================================================
// MPU6050 I2C Pins (Default ESP32: SDA=21, SCL=22)
const int MPU_ADDR = 0x68;

// Vibration Sensor Pin
const int VIBRATION_PIN = 34;
volatile unsigned long vibrationEventCount = 0;

// Interrupt Handler for Vibration Sensor
void IRAM_ATTR onVibrationEvent() {
  vibrationEventCount++;
}

// DHT Sensor setup (if using Adafruit_DHT library)
// #include "DHT.h"
// #define DHTPIN 4
// #define DHTTYPE DHT22 // or DHT11
// DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==============================================");
  Serial.println(" MINE MONITORING SYSTEM - ESP32 GATEWAY INITIALIZING");
  Serial.println("==============================================");

  // Initialize I2C for MPU6050
  Wire.begin(21, 22);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1 register
  Wire.write(0);    // Wake up MPU6050
  Wire.endTransmission(true);
  Serial.println("[Hardware] MPU6050 Initialized.");

  // Initialize Vibration Sensor Pin
  pinMode(VIBRATION_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(VIBRATION_PIN), onVibrationEvent, RISING);
  Serial.println("[Hardware] Vibration Sensor Interrupt Attached.");

  // Connect to Wi-Fi
  Serial.print("[Network] Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Network] Connected! Local IP Address: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[Network] Connection failed. Will retry in main loop.");
  }
}

void loop() {
  // Reconnect Wi-Fi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Network] Wi-Fi disconnected. Reconnecting...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    delay(2000);
    return;
  }

  // Periodic Telemetry Transmission
  if (millis() - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = millis();
    sendTelemetryData();
  }
}

void sendTelemetryData() {
  // 1. Read MPU6050 Acceleration & Calculate Tilt
  int16_t AcX, AcY, AcZ, GyX, GyY, GyZ;
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B); // starting register for Accelerometer
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 14, true);

  AcX = Wire.read() << 8 | Wire.read();
  AcY = Wire.read() << 8 | Wire.read();
  AcZ = Wire.read() << 8 | Wire.read();
  Wire.read(); Wire.read(); // Skip temperature
  GyX = Wire.read() << 8 | Wire.read();
  GyY = Wire.read() << 8 | Wire.read();
  GyZ = Wire.read() << 8 | Wire.read();

  // Convert raw accel to g (±2g range)
  float ax = (float)AcX / 16384.0;
  float ay = (float)AcY / 16384.0;
  float az = (float)AcZ / 16384.0;

  // Calculate Tilt Angle from Vertical (Z-axis) in degrees
  float tilt = atan2(sqrt(ax * ax + ay * ay), az) * 180.0 / 3.14159265;
  tilt = abs(tilt);

  // Convert raw gyro to °/s (±250°/s range)
  float gx = (float)GyX / 131.0;
  float gy = (float)GyY / 131.0;
  float gz = (float)GyZ / 131.0;

  // 2. Read Vibration Sensor Intensity & Event Count
  float vibrationVal = analogRead(34) / 40.95; // Normalized 0-100 scale

  // 3. Read DHT Temperature & Humidity (Simulated or Real)
  // float temp = dht.readTemperature();
  // float hum = dht.readHumidity();
  float temp = 28.5; // Replace with dht.readTemperature()
  float hum = 55.0;  // Replace with dht.readHumidity()

  // 4. Construct JSON Payload
  StaticJsonDocument<300> doc;
  doc["node_id"] = NODE_ID;
  doc["tilt"] = round(tilt * 10.0) / 10.0;
  doc["accel_x"] = round((ax * 9.81) * 100.0) / 100.0;
  doc["accel_y"] = round((ay * 9.81) * 100.0) / 100.0;
  doc["accel_z"] = round((az * 9.81) * 100.0) / 100.0;
  doc["gyro_x"] = round(gx * 100.0) / 100.0;
  doc["gyro_y"] = round(gy * 100.0) / 100.0;
  doc["gyro_z"] = round(gz * 100.0) / 100.0;
  doc["vibration"] = round(vibrationVal);
  doc["temperature"] = round(temp * 10.0) / 10.0;
  doc["humidity"] = round(hum * 10.0) / 10.0;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  // 5. Send HTTP POST Request
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  Serial.println("\n[HTTP] Transmitting Telemetry to " + String(SERVER_URL));
  Serial.println("[HTTP] Payload: " + jsonPayload);

  int httpCode = http.POST(jsonPayload);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP] Success Code: %d\n", httpCode);
    Serial.println("[HTTP] Server Response: " + response);
  } else {
    Serial.printf("[HTTP] POST Failed! Error Code: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}
