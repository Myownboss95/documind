# Stage 1 — Planted Bug (ANSWER KEY — don't open until you've attempted the debug)

**Location:** `server/src/documents/documents.controller.ts` — the `@UseGuards(ApiKeyGuard)` placement.

---

<!-- ================= SPOILER BELOW ================= -->

## The bug
The `@UseGuards(ApiKeyGuard)` was moved from the **class** level to a **single method** (`findAll`). So only `GET /documents` is protected. `GET /documents/:id` and `POST /documents` have **no guard** → they work with **no API key**. That's an **auth bypass** on a read and, worse, a **write** route.

This is a very realistic bug: someone "refactors" guards to be per-route (maybe to make one route public) and forgets to re-cover the others. It compiles, it boots, and the happy path (listing) still asks for a key — so it looks fine at a glance.

## The symptom you'd observe
- `GET  /documents` **without** `x-api-key` → `401` (still protected — looks OK).
- `GET  /documents/<uuid>` **without** `x-api-key` → `404`/`200` (should be `401`!).
- `POST /documents` **without** `x-api-key` → `201` created (should be `401`!). Unauthenticated writes.

## The tell (how to spot it in code)
`@UseGuards` sits on the `findAll` method instead of above `@Controller()`. Scan for it being at method scope when every route needs it. In review, a guard that protects *some* routes of a resource but not its mutating routes is a red flag.

## The fix
Move the guard back to the **class** level so it covers every current and future route:

```ts
@UseGuards(ApiKeyGuard)   // <-- class level: protects ALL routes
@Controller('documents')
export class DocumentsController {
  @Get() findAll() { ... }          // remove the per-method @UseGuards
  @Get(':id') findOne(...) { ... }
  @Post() create(...) { ... }
}
```

## The lesson
Apply a guard at the **broadest scope where the rule is uniformly true**. All document routes need auth → guard the controller (or go global with a `@Public()` opt-out). Per-route guards multiply the chances to forget one — and the one you forget is often a destructive route.
