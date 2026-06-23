import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/utils/validation-messages';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const isProduction = config.get<string>('nodeEnv') === 'production';

  // Behind a load balancer / reverse proxy, trust the proxy so `req.ip` is the
  // real client (accurate per-IP throttling and audit) instead of the proxy IP.
  const trustProxy = config.get<boolean | number | string>('trustProxy');
  if (trustProxy) app.set('trust proxy', trustProxy);

  app.use(helmet());
  app.enableCors({
    origin: config.get<string[]>('corsOrigins'),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // Drain in-flight requests and close the Prisma pool cleanly on SIGTERM/SIGINT
  // (docker stop / k8s rollout) instead of dropping connections.
  app.enableShutdownHooks();

  // Swagger maps the entire API surface — expose it only outside production.
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CredFlow API')
      .setDescription('Credit & Loan Management Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = config.get<number>('port', 3333);
  await app.listen(port, '0.0.0.0');
  logger.log(`CredFlow API running on http://localhost:${port}/api`);
  if (!isProduction) logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
