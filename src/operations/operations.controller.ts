import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { OperationsService } from './operations.service';

@Controller('v1')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('health')
  health(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.operationsService.forward(request, response, 'GET', 'health');
  }

  @Get('metrics')
  metrics(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.operationsService.forward(request, response, 'GET', 'metrics');
  }

  @Get('fleet')
  fleet(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.operationsService.forward(request, response, 'GET', 'fleet');
  }

  @Get('orders')
  orders(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.operationsService.forward(request, response, 'GET', 'orders');
  }

  @Get('regions')
  regions(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.operationsService.forward(request, response, 'GET', 'regions');
  }

  @Get('recommendations')
  recommendations(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.operationsService.forward(
      request,
      response,
      'GET',
      'recommendations',
    );
  }

  @Get('recommendations/:recommendationId/route-options')
  routeOptions(
    @Req() request: Request,
    @Res() response: Response,
    @Param('recommendationId') recommendationId: string,
  ): Promise<void> {
    return this.operationsService.forward(
      request,
      response,
      'GET',
      `recommendations/${encodeURIComponent(recommendationId)}/route-options`,
    );
  }

  @Get('recommendations/:recommendationId/live-traffic')
  liveTraffic(
    @Req() request: Request,
    @Res() response: Response,
    @Param('recommendationId') recommendationId: string,
  ): Promise<void> {
    return this.operationsService.forward(
      request,
      response,
      'GET',
      `recommendations/${encodeURIComponent(recommendationId)}/live-traffic`,
    );
  }

  @Post('recommendations/:recommendationId/decision')
  decision(
    @Req() request: Request,
    @Res() response: Response,
    @Param('recommendationId') recommendationId: string,
    @Body() body: unknown,
  ): Promise<void> {
    return this.operationsService.forward(
      request,
      response,
      'POST',
      `recommendations/${encodeURIComponent(recommendationId)}/decision`,
      body,
    );
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
  simulate(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    return this.operationsService.forward(
      request,
      response,
      'POST',
      'simulation/tick',
      body,
    );
  }
}
