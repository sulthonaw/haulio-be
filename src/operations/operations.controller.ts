import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LocalOperationsService } from './local-operations.service';
import { OperationsService } from './operations.service';

@Controller('v1')
export class OperationsController {
  constructor(
    private readonly operationsService: OperationsService,
    private readonly localOperationsService: LocalOperationsService,
  ) {}

  @Get('health')
  health(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.operationsService.forward(request, response, 'GET', 'health');
  }

  @Get('metrics')
  metrics() {
    return this.localOperationsService.metrics();
  }

  @Get('fleet')
  fleet() {
    return this.localOperationsService.fleet();
  }

  @Get('orders')
  orders(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.operationsService.forward(request, response, 'GET', 'orders');
  }

  @Get('regions')
  regions() {
    return this.localOperationsService.regions();
  }

  @Get('recommendations')
  recommendations() {
    return this.localOperationsService.recommendations();
  }

  @Get('recommendations/:recommendationId/route-options')
  routeOptions(@Param('recommendationId') recommendationId: string) {
    return this.localOperationsService.routeOptions(recommendationId);
  }

  @Get('recommendations/:recommendationId/live-traffic')
  liveTraffic(@Param('recommendationId') recommendationId: string) {
    return this.localOperationsService.liveTraffic(recommendationId);
  }

  @Post('recommendations/:recommendationId/decision')
  decision(@Param('recommendationId') recommendationId: string, @Body() body: unknown) {
    return this.localOperationsService.decide(recommendationId, body);
  }

  @Post('telemetry')
  telemetry(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    return this.operationsService.forward(
      request,
      response,
      'POST',
      'telemetry',
      body,
    );
  }

  @Post('simulation/tick')
  simulate() {
    return this.localOperationsService.simulateTelemetryTick();
  }
}
