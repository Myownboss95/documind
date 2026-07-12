import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';

/**
 * DOCUMENTS CONTROLLER  (Stage 1 · ① — the HTTP layer)
 * ----------------------------------------------------
 * @Controller('documents') sets the ROUTE PREFIX, so every method below lives
 * under /documents. Nest reads these decorators at startup and registers the
 * routes for you (no manual app.use() like Express).
 *
 *   @Get()        -> GET  /documents
 *   @Get(':id')   -> GET  /documents/:id
 *   @Post()       -> POST /documents
 *
 * DEPENDENCY INJECTION (the important bit):
 * The constructor asks for a DocumentsService. We never `new` it — Nest sees the
 * type, finds the provider in the DI container, and injects the SAME shared
 * instance. That's why state (our in-memory array) persists across requests, and
 * why we can swap the service for a fake in tests. (Laravel: type-hinting a
 * dependency in the constructor and letting the container resolve it.)
 *
 * `private readonly` is shorthand: TypeScript auto-creates and assigns
 * `this.documentsService` from the parameter. One line instead of boilerplate.
 */
// No @UseGuards here anymore: the GLOBAL JwtAuthGuard (Stage 2 ②) protects every
// route by default. A valid access token is required to reach any handler below.
// This is "secure by default" — new routes are auto-protected.
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // GET /documents -> list documents. Protected by the global JWT guard now; a
  // valid token is required to reach here. (Stage 3 scopes results by user.)
  @Get()
  findAll() {
    return this.documentsService.findAll();
  }

  // GET /documents/:id -> one document. ParseUUIDPipe validates the param IS a
  // UUID before the handler runs -> a malformed id is a clean 400, never reaching
  // the service. (Laravel: Route::get('/documents/{id}')->whereUuid('id').)
  // If the id is a valid UUID but no such doc exists, the service throws 404.
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.findOne(id);
  }

  // POST /documents -> create. @Body() gives us the parsed JSON body as a DTO.
  // Nest returns 201 for @Post by default. (Validation of the body: sub-step ④.)
  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.documentsService.create(dto);
  }
}
