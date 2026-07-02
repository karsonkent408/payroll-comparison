// TODO: These tests need to be migrated to use wrangler D1 test helpers.
// The sqlite singleton and db singleton no longer exist after migrating to Cloudflare D1.
// Use `wrangler dev --test` or miniflare's D1 binding to run these tests.
//
// When porting, restore coverage for: POST/PATCH create+update, payPeriod filters,
// owner_name in list and detail responses, ?filters= JSON param, pagination defaults,
// and the guest-visibility cases added in #294 (guest with no collaborator → empty,
// guest as viewer → sees just that comparison, guest cannot see setup_complete=1
// without a collaborator row, implementor sees all).
