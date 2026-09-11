#include <SPI.h>
#include <LoRa.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ======================================================
// WIFI SETTINGS
// ======================================================

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// IMPORTANT:
// Replace this with your actual Replit API URL
const char* SERVER_URL =
  "https://YOUR-REPLIT-APP.replit.app/api/sensor-data";


// ======================================================
// LORA PINS
// ======================================================

#define SS   5
#define RST  14
#define DIO0 26

// ======================================================
// LORA SETTINGS
// Must match transmitter
// ======================================================

#define LORA_FREQUENCY 433E6


// ======================================================
// WIFI CONNECTION
// ======================================================

void connectWiFi()
{
  Serial.println();
  Serial.println("Connecting to WiFi...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;

  while (WiFi.status() != WL_CONNECTED && attempts < 30)
  {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("WiFi CONNECTED!");
    Serial.print("Gateway IP: ");
    Serial.println(WiFi.localIP());
  }
  else
  {
    Serial.println("WiFi connection FAILED!");
  }
}


// ======================================================
// GET VALUE FROM LORA PACKET
// Example:
// NODE=NODE_01,PKT=5,TX=2.5,TY=-1.2
//
// getValue(packet, "NODE") -> NODE_01
// ======================================================

String getValue(String data, String key)
{
  String searchKey = key + "=";

  int start = data.indexOf(searchKey);

  if (start == -1)
  {
    return "";
  }

  start += searchKey.length();

  int end = data.indexOf(",", start);

  if (end == -1)
  {
    end = data.length();
  }

  return data.substring(start, end);
}


// ======================================================
// SEND DATA TO REPLIT
// ======================================================

void sendToReplit(String receivedPacket)
{
  // ----------------------------------------------------
  // Check WiFi
  // ----------------------------------------------------

  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("WiFi disconnected!");
    connectWiFi();

    if (WiFi.status() != WL_CONNECTED)
    {
      Serial.println("Could not reconnect to WiFi.");
      return;
    }
  }


  // ----------------------------------------------------
  // Extract values from LoRa packet
  // ----------------------------------------------------

  String node = getValue(receivedPacket, "NODE");
  String pkt  = getValue(receivedPacket, "PKT");

  String tx = getValue(receivedPacket, "TX");
  String ty = getValue(receivedPacket, "TY");

  String ax = getValue(receivedPacket, "AX");
  String ay = getValue(receivedPacket, "AY");
  String az = getValue(receivedPacket, "AZ");

  String temp = getValue(receivedPacket, "TEMP");
  String hum  = getValue(receivedPacket, "HUM");

  String vib = getValue(receivedPacket, "VIB");


  // ----------------------------------------------------
  // Display parsed data
  // ----------------------------------------------------

  Serial.println();
  Serial.println("========== PARSED DATA ==========");

  Serial.print("Node        : ");
  Serial.println(node);

  Serial.print("Packet      : ");
  Serial.println(pkt);

  Serial.print("Tilt X      : ");
  Serial.println(tx);

  Serial.print("Tilt Y      : ");
  Serial.println(ty);

  Serial.print("Accel X     : ");
  Serial.println(ax);

  Serial.print("Accel Y     : ");
  Serial.println(ay);

  Serial.print("Accel Z     : ");
  Serial.println(az);

  Serial.print("Temperature : ");
  Serial.println(temp);

  Serial.print("Humidity    : ");
  Serial.println(hum);

  Serial.print("Vibration   : ");
  Serial.println(vib);

  Serial.println("=================================");


  // ----------------------------------------------------
  // Create JSON
  // ----------------------------------------------------

  String json = "{";

  json += "\"node_id\":\"" + node + "\",";
  json += "\"packet\":" + pkt + ",";
  json += "\"tilt_x\":" + tx + ",";
  json += "\"tilt_y\":" + ty + ",";
  json += "\"accel_x\":" + ax + ",";
  json += "\"accel_y\":" + ay + ",";
  json += "\"accel_z\":" + az + ",";
  json += "\"temperature\":" + temp + ",";
  json += "\"humidity\":" + hum + ",";
  json += "\"vibration\":" + vib;

  json += "}";


  Serial.println();
  Serial.println("JSON being sent:");
  Serial.println(json);


  // ----------------------------------------------------
  // HTTPS connection
  // ----------------------------------------------------

  WiFiClientSecure client;

  // For demonstration/testing only.
  // This skips certificate verification.
  client.setInsecure();

  HTTPClient http;

  Serial.println();
  Serial.println("Sending data to Replit...");

  if (http.begin(client, SERVER_URL))
  {
    http.addHeader("Content-Type", "application/json");

    int httpResponseCode = http.POST(json);

    Serial.print("HTTP Response Code: ");
    Serial.println(httpResponseCode);

    if (httpResponseCode > 0)
    {
      String response = http.getString();

      Serial.println("Server Response:");
      Serial.println(response);
    }
    else
    {
      Serial.print("HTTP Error: ");
      Serial.println(http.errorToString(httpResponseCode));
    }

    http.end();
  }
  else
  {
    Serial.println("Could not connect to server.");
  }
}


// ======================================================
// SETUP
// ======================================================

void setup()
{
  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("====================================");
  Serial.println("   LoRa + WiFi Gateway ESP32");
  Serial.println("====================================");


  // ----------------------------------------------------
  // Start WiFi
  // ----------------------------------------------------

  connectWiFi();


  // ----------------------------------------------------
  // Start LoRa
  // ----------------------------------------------------

  Serial.println();
  Serial.println("Starting LoRa...");

  LoRa.setPins(SS, RST, DIO0);

  if (!LoRa.begin(LORA_FREQUENCY))
  {
    Serial.println("LoRa initialization FAILED!");

    while (1)
    {
      delay(1000);
    }
  }

  // These settings should match transmitter
  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setCodingRate4(5);

  Serial.println("LoRa initialization SUCCESS!");

  Serial.println();
  Serial.println("Gateway is ready.");
  Serial.println("Waiting for LoRa packets...");
}


// ======================================================
// LOOP
// ======================================================

void loop()
{
  // ----------------------------------------------------
  // Check WiFi
  // ----------------------------------------------------

  if (WiFi.status() != WL_CONNECTED)
  {
    connectWiFi();
  }


  // ----------------------------------------------------
  // Check for LoRa packet
  // ----------------------------------------------------

  int packetSize = LoRa.parsePacket();

  if (packetSize)
  {
    String receivedPacket = "";

    while (LoRa.available())
    {
      receivedPacket += (char)LoRa.read();
    }


    // --------------------------------------------------
    // Display received packet
    // --------------------------------------------------

    Serial.println();
    Serial.println("====================================");
    Serial.println("       LORA PACKET RECEIVED");
    Serial.println("====================================");

    Serial.print("DATA : ");
    Serial.println(receivedPacket);

    Serial.print("RSSI : ");
    Serial.print(LoRa.packetRssi());
    Serial.println(" dBm");

    Serial.print("SNR  : ");
    Serial.print(LoRa.packetSnr());
    Serial.println(" dB");


    // --------------------------------------------------
    // Send packet to Replit
    // --------------------------------------------------

    sendToReplit(receivedPacket);

    Serial.println();
    Serial.println("Waiting for next packet...");
  }
}