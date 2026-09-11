#include <SPI.h>
#include <LoRa.h>

// =============================
// LoRa pins
// =============================

#define SS   5
#define RST  14
#define DIO0 26

// =============================
// SETUP
// =============================

void setup()
{
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("================================");
  Serial.println(" SIH26025 LoRa GATEWAY");
  Serial.println("================================");

  LoRa.setPins(SS, RST, DIO0);

  if (!LoRa.begin(433E6))
  {
    Serial.println("LoRa initialization FAILED!");

    while (1)
    {
      delay(1000);
    }
  }

  Serial.println("LoRa initialization SUCCESS!");
  Serial.println("Gateway waiting for packets...");
}

// =============================
// LOOP
// =============================

void loop()
{
  int packetSize = LoRa.parsePacket();

  if (packetSize)
  {
    String receivedPacket = "";

    while (LoRa.available())
    {
      receivedPacket += (char)LoRa.read();
    }

    Serial.println();
    Serial.println("================================");
    Serial.println("        PACKET RECEIVED");
    Serial.println("================================");

    Serial.print("DATA : ");
    Serial.println(receivedPacket);

    Serial.print("RSSI : ");
    Serial.print(LoRa.packetRssi());
    Serial.println(" dBm");

    Serial.print("SNR  : ");
    Serial.print(LoRa.packetSnr());
    Serial.println(" dB");

    Serial.println("================================");
  }
}