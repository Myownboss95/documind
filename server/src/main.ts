import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * BOOTSTRAP  (Stage 1 · ④ global ValidationPipe)
 * ----------------------------------------------
 * A GLOBAL ValidationPipe validates every DTO argument across the whole app,
 * using the class-validator decorators on the DTO classes. (Laravel does this per
 * request via Form Requests; here it's one global switch.)
 *
 * The options matter — each closes a real hole:
 *  - whitelist: true          -> STRIP any property not declared in the DTO. If a
 *                                client sends { title, sourceUri, mimeType, isAdmin:true }
 *                                the stray isAdmin is dropped, so it can never
 *                                sneak into your entity. (Laravel: $request->validated()
 *                                returns only the validated keys — same protection.)
 *  - forbidNonWhitelisted: true -> don't just strip extras, REJECT with 400. Stricter;
 *                                surfaces client bugs instead of silently ignoring.
 *  - transform: true          -> turn the plain JSON into an actual DTO instance and
 *                                coerce primitive types (e.g. a numeric route param
 *                                string "1" -> number when the handler expects one).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS (Stage 5): the SPA client (Vite :5173) and Next app (:3000) are different
  // origins from this API (:4000), so browsers block cross-origin XHR/fetch unless
  // the server opts in. credentials:true also allows the httpOnly refresh cookie to
  // be sent/received cross-origin. The socket.io gateway sets its own CORS separately.
  app.enableCors({ origin: true, credentials: true });

  // Parse the Cookie header into req.cookies (needed to read the refresh cookie).
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global interceptor -> every SUCCESSFUL response is wrapped in { data, meta }.
  app.useGlobalInterceptors(new TransformInterceptor());

  // Global filter -> every ERROR gets a consistent shape + is logged with req.id.
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
