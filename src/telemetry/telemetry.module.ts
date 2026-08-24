import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { DsTelemetryForwarderService } from './ds-telemetry-forwarder.service';
import { MqttTelemetryConsumerService } from './mqtt-telemetry-consumer.service';
import { TelematicsDevice } from './telematics-device.entity';
import { TelemetryController } from './telemetry.controller';
import { TelemetryEvent } from './telemetry-event.entity';
import { TelemetryService } from './telemetry.service';
import { TruckState } from './truck-state.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelematicsDevice, TelemetryEvent, TruckState]),
    EventsModule,
  ],
  controllers: [TelemetryController],
  providers: [
    DsTelemetryForwarderService,
    MqttTelemetryConsumerService,
    TelemetryService,
  ],
})
export class TelemetryModule {}
