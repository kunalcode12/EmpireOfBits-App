# Elo rating — migration & client regeneration

The Elo rating system adds the following schema changes:

- `User.rating` — `Int @default(800)` (default rating awarded to every user)
- `Game.whiteRatingBefore`, `Game.blackRatingBefore`, `Game.whiteRatingAfter`,
  `Game.blackRatingAfter` — all `Int?` (rating snapshots per game)

## Apply the migration

Run from `backendEob/code/`:

```bash
npx prisma migrate dev --name add_elo_rating --schema ./prisma/schema.prisma
npx prisma generate --schema ./prisma/schema.prisma
```

If your environment historically uses `prisma db push` instead of versioned
migrations:

```bash
npx prisma db push --schema ./prisma/schema.prisma
npx prisma generate --schema ./prisma/schema.prisma
```

The `prisma generate` step is required — without it the TypeScript compiler will
not see the new `rating` and `*RatingBefore/After` fields on the Prisma client
types and the build will fail with TS errors like
`Property 'rating' does not exist on type '...'`.

## Backfill behaviour

- Every existing user automatically receives `rating = 800` (the default).
- Every previously finished game keeps `NULL` for the four `*Rating*` columns
  (no historical backfill — only games finished after this deploy will record
  rating snapshots).
- Existing matchmaking, room, computer, and guest game flows are untouched.

## Restart

After running the migration + generate, restart the Node process so the new
Prisma client is loaded.
