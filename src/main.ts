import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 3000;
  const host = configService.get<string>('HOST') ?? '127.0.0.1';
  const corsOrigin = configService.get<string>('CORS_ORIGIN') ?? '*';

  // Enable CORS
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Set API prefix
  app.setGlobalPrefix('api');

  // Set global validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(port, host);
  logger.log(`Application is running on: http://${host}:${port}/api`);
  logger.log(`WebSocket Gateway is running on: ws://${host}:${port}`);
}
bootstrap();
