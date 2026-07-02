// TODO: Port these tests to wrangler D1 test helpers.
// The sqlite singleton and the comparisonRepo singleton no longer exist after
// migrating to Cloudflare D1. ComparisonRepository is now a class instantiated
// with an AppDb (see src/server/db/repos/comparisons.ts).
//
// When porting, restore coverage for guest-visibility (#294): an admin or
// implementor sees every comparison regardless of collaborator, while a
// guest only sees comparisons where they appear in `collaborator`.
