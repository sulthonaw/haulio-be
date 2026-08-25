import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelematicsDevice } from '../telemetry/telematics-device.entity';
import { TelemetryEvent } from '../telemetry/telemetry-event.entity';
import { TruckState } from '../telemetry/truck-state.entity';
import { GoogleRoutesService } from './google-routes.service';
import { LocalOperationsService } from './local-operations.service';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [TypeOrmModule.forFeature([TelematicsDevice, TelemetryEvent, TruckState])],
  controllers: [OperationsController],
  providers: [GoogleRoutesService, LocalOperationsService, OperationsService],
})
export class OperationsModule {}
