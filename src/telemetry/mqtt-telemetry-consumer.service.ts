import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, MqttClient } from 'mqtt';
import { TelemetryService } from './telemetry.service';

@Injectable()
export class MqttTelemetryConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MqttTelemetryConsumerService.name);
  private client: MqttClient | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly telemetryService: TelemetryService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('MQTT_ENABLED') !== 'true') {
      this.logger.log('MQTT telemetry consumer is disabled');
      return;
    }
    const url = this.configService.get<string>('MQTT_URL');
    if (!url) {
      this.logger.error('MQTT_ENABLED requires MQTT_URL');
      return;
    }
    if (
      this.configService.get<string>('NODE_ENV') === 'production' &&
      !url.startsWith('mqtts://')
    ) {
      this.logger.error('Production MQTT transport must use mqtts:// TLS');
      return;
    }
    const topic = `${(this.configService.get<string>('MQTT_TOPIC_PREFIX') ?? 'haulio/v1/telemetry').replace(/\/+$/, '')}/+`;
    this.client = connect(url, {
      protocolVersion: 5,
      clean: false,
      clientId:
        this.configService.get<string>('MQTT_CLIENT_ID') ??
        'haulio-nest-telemetry',
      username: this.configService.get<string>('MQTT_USERNAME') || undefined,
      password: this.configService.get<string>('MQTT_PASSWORD') || undefined,
      reconnectPeriod: 2_000,
      connectTimeout: 10_000,
    });
    this.client.on('connect', () => {
      this.client?.subscribe(topic, { qos: 1 }, (error) => {
        if (error)
          this.logger.error(`MQTT subscription failed: ${error.message}`);
        else this.logger.log(`Subscribed to ${topic} with QoS 1`);
      });
    });
    this.client.on('error', (error) =>
      this.logger.error(`MQTT error: ${error.message}`),
    );
    this.client.on('message', (messageTopic, rawPayload) => {
      void this.handleMessage(messageTopic, rawPayload);
    });
  }

  onModuleDestroy(): void {
    this.client?.end(true);
    this.client = null;
  }

  private async handleMessage(
    topic: string,
    rawPayload: Buffer,
  ): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(rawPayload.toString('utf8'));
    } catch {
      this.logger.warn(`Rejected non-JSON MQTT payload on ${topic}`);
      return;
    }
    const result = await this.telemetryService.ingestMqtt(topic, payload);
    if (!result.accepted) {
      this.logger.warn(
        `Rejected MQTT telemetry on ${topic}: ${result.reason ?? 'unknown reason'}`,
      );
    }
  }
}
