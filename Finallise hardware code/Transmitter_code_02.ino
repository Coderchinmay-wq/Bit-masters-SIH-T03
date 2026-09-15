#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <DHT.h>
#include <math.h>

// =====================================================
// PIN DEFINITIONS
// =====================================================

// MPU6050
#define SDA_PIN 21
#define SCL_PIN 22
#define MPU6050_ADDR 0x68

// DHT11
#define DHT_PIN 4
#define DHT_TYPE DHT11

// SW-420
#define VIBRATION_PIN 27

// LED
#define LED_PIN 2

// LoRa SX1278
#define SS   5
#define RST  14
#define DIO0 26

// LoRa frequency
#define LORA_FREQUENCY 433E6

// =====================================================
// OBJECTS
// =====================================================

DHT dht(DHT_PIN, DHT_TYPE);

// =====================================================
// VARIABLES
// =====================================================

unsigned long packetNumber = 0;

// MPU6050
int16_t ax = 0;
int16_t ay = 0;
int16_t az = 0;

float tiltX = 0.0;
float tiltY = 0.0;

bool mpuOK = false;

// DHT11
float temperature = 0.0;
float humidity = 0.0;

// SW-420
int vibrationState = 0;

// =====================================================
// SETUP
// =====================================================

void setup()
{
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("==============================================");
  Serial.println("       SIH26025 SENSOR NODE - NODE 01");
  Serial.println("==============================================");

  // -------------------------------------------------
  // LED
  // -------------------------------------------------

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // -------------------------------------------------
  // SW-420
  // -------------------------------------------------

  pinMode(VIBRATION_PIN, INPUT);

  Serial.println();
  Serial.println("SW-420 initialized.");

  // -------------------------------------------------
  // MPU6050
  // -------------------------------------------------

  Serial.println();
  Serial.println("Initializing MPU6050...");

  Wire.begin(SDA_PIN, SCL_PIN);

  Wire.beginTransmission(MPU6050_ADDR);
  byte error = Wire.endTransmission();

  if (error == 0)
  {
    Serial.println("MPU6050 FOUND!");

    // Wake up MPU6050
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x6B);
    Wire.write(0x00);
    error = Wire.endTransmission();

    if (error == 0)
    {
      Serial.println("MPU6050 wake-up successful!");
      mpuOK = true;
    }
    else
    {
      Serial.println("MPU6050 wake-up FAILED!");
    }
  }
  else
  {
    Serial.print("MPU6050 NOT FOUND! I2C Error = ");
    Serial.println(error);
  }

  // -------------------------------------------------
  // DHT11
  // -------------------------------------------------

  Serial.println();
  Serial.println("Initializing DHT11...");

  dht.begin();

  Serial.println("DHT11 initialized.");

  // -------------------------------------------------
  // LoRa
  // -------------------------------------------------

  Serial.println();
  Serial.println("Initializing LoRa SX1278...");

  LoRa.setPins(SS, RST, DIO0);

  if (!LoRa.begin(LORA_FREQUENCY))
  {
    Serial.println("LoRa initialization FAILED!");

    while (1)
    {
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
      delay(5000);
    }
  }

  Serial.println("LoRa initialization SUCCESS!");
  Serial.println("Frequency : 433 MHz");

  // Same settings must be used by gateway
  LoRa.setTxPower(17);
  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setCodingRate4(5);

  Serial.println("SF      : 7");
  Serial.println("BW      : 125 kHz");
  Serial.println("CR      : 4/5");
  Serial.println("TX Power: 17 dBm");

  // -------------------------------------------------
  // READY
  // -------------------------------------------------

  Serial.println();
  Serial.println("==============================================");
  Serial.println("          SENSOR NODE READY");
  Serial.println("==============================================");
}

// =====================================================
// READ MPU6050
// =====================================================

bool readMPU6050()
{
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x3B);

  byte error = Wire.endTransmission(false);

  if (error != 0)
  {
    Serial.print("MPU6050 I2C error: ");
    Serial.println(error);
    return false;
  }

  int bytesReceived = Wire.requestFrom(MPU6050_ADDR, 6, true);

  if (bytesReceived != 6)
  {
    Serial.print("MPU6050: Expected 6 bytes, received ");
    Serial.println(bytesReceived);
    return false;
  }

  int16_t newAX = (Wire.read() << 8) | Wire.read();
  int16_t newAY = (Wire.read() << 8) | Wire.read();
  int16_t newAZ = (Wire.read() << 8) | Wire.read();

  // Only update values after successful read
  ax = newAX;
  ay = newAY;
  az = newAZ;

  return true;
}

// =====================================================
// CALCULATE TILT
// =====================================================

void calculateTilt()
{
  float accX = ax / 16384.0;
  float accY = ay / 16384.0;
  float accZ = az / 16384.0;

  tiltX = atan2(
            accY,
            sqrt((accX * accX) + (accZ * accZ))
          ) * 180.0 / PI;

  tiltY = atan2(
            -accX,
            sqrt((accY * accY) + (accZ * accZ))
          ) * 180.0 / PI;
}

// =====================================================
// READ ALL SENSORS
// =====================================================

void readSensors()
{
  // -------------------------------------------------
  // MPU6050
  // -------------------------------------------------

  if (readMPU6050())
  {
    mpuOK = true;
    calculateTilt();
  }
  else
  {
    mpuOK = false;
  }

  // -------------------------------------------------
  // DHT11
  // -------------------------------------------------

  float newTemperature = dht.readTemperature();
  float newHumidity = dht.readHumidity();

  if (!isnan(newTemperature))
  {
    temperature = newTemperature;
  }

  if (!isnan(newHumidity))
  {
    humidity = newHumidity;
  }

  // -------------------------------------------------
  // SW-420
  // -------------------------------------------------

  vibrationState = digitalRead(VIBRATION_PIN);

  // -------------------------------------------------
  // LED
  // -------------------------------------------------

  if (vibrationState == HIGH)
  {
    digitalWrite(LED_PIN, HIGH);
  }
  else
  {
    digitalWrite(LED_PIN, LOW);
  }
}

// =====================================================
// CREATE + SEND LoRa PACKET
// =====================================================

void sendLoRaPacket()
{
  packetNumber++;

  // -------------------------------------------------
  // Create packet
  // -------------------------------------------------

  String packet = "";

  packet += "NODE=NODE_01";
  packet += ",PKT=";
  packet += packetNumber;

  packet += ",TX=";
  packet += String(tiltX, 2);

  packet += ",TY=";
  packet += String(tiltY, 2);

  packet += ",AX=";
  packet += ax;

  packet += ",AY=";
  packet += ay;

  packet += ",AZ=";
  packet += az;

  packet += ",TEMP=";
  packet += String(temperature, 1);

  packet += ",HUM=";
  packet += String(humidity, 1);

  packet += ",VIB=";
  packet += vibrationState;

  // -------------------------------------------------
  // Serial display
  // -------------------------------------------------

  Serial.println();
  Serial.println("----------------------------------------------");
  Serial.println("SENSOR PACKET");

  Serial.print("Packet No   : ");
  Serial.println(packetNumber);

  Serial.print("Tilt X      : ");
  Serial.print(tiltX, 2);
  Serial.println(" deg");

  Serial.print("Tilt Y      : ");
  Serial.print(tiltY, 2);
  Serial.println(" deg");

  Serial.print("Accel X     : ");
  Serial.println(ax);

  Serial.print("Accel Y     : ");
  Serial.println(ay);

  Serial.print("Accel Z     : ");
  Serial.println(az);

  Serial.print("Temperature : ");
  Serial.print(temperature, 1);
  Serial.println(" C");

  Serial.print("Humidity    : ");
  Serial.print(humidity, 1);
  Serial.println(" %");

  Serial.print("Vibration   : ");

  if (vibrationState == HIGH)
  {
    Serial.println("DETECTED");
  }
  else
  {
    Serial.println("NORMAL");
  }

  // -------------------------------------------------
  // Send LoRa packet
  // -------------------------------------------------

  Serial.println();
  Serial.println("Sending LoRa packet...");

  LoRa.beginPacket();
  LoRa.print(packet);

  int result = LoRa.endPacket();

  if (result == 1)
  {
    Serial.println("LoRa packet SENT successfully!");
  }
  else
  {
    Serial.println("LoRa packet transmission FAILED!");
  }

  Serial.println("----------------------------------------------");
}

// =====================================================
// LOOP
// =====================================================

void loop()
{
  readSensors();

  sendLoRaPacket();

  delay(10000);
}