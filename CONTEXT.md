# Payroll Comparison

A tool for comparing payroll output between a legacy system and new system to validate that the new system is configured correctly before go-live.

## Language

**User**:
A person with a login to the application. Every User has exactly one Role. Users are created by Admins; there is no self-registration.
_Avoid_: Account, member, analyst

**Role**:
The permission tier assigned to a User. Three values: Admin, Implementor, Guest. Determines what a User can see and do across the application.
_Avoid_: Permission level, access level, type

**Admin**:
A Role that grants full access — can see and edit all Comparisons, and manage all Users.
_Avoid_: Superuser, superadmin

**Implementor**:
A Role for staff managing a client payroll migration. Can create Comparisons. Can edit or delete only the Comparisons they own; can also edit (but not delete) Comparisons where they hold an Editor Collaborator. Can see all setup_complete Comparisons (read-only unless they are the Owner or hold an Editor Collaborator).
_Avoid_: LM, manager, analyst

**Guest**:
A Role for external stakeholders (e.g. clients). Cannot create Comparisons. Can only see Comparisons they have been explicitly granted a Collaborator on. Access level within those Comparisons is determined by the Collaborator.
_Avoid_: Client, read-only user (do not use "Viewer" as a Role name — Viewer is a Collaborator level)

**Collaborator**:
An explicit per-Comparison access record linking a User to a Comparison at a specific level: Owner, Editor, or Viewer. Every Comparison has exactly one Owner Collaborator (enforced by a partial unique index). An Owner Collaborator is created automatically when a Comparison is created. Any non-suspended Admin, Implementor, or Guest may hold a Collaborator. Collaborators are managed (created and revoked) only by the Owner or an Admin. Only the Owner and Admins can delete a Comparison — no other Collaborator level confers that right.
_Avoid_: ComparisonGrant, access grant, permission, share, invite

**Viewer** (Collaborator level):
A Collaborator level that allows read-only access to a specific Comparison. The User can see all results, notes, and MappingEntries but cannot make any changes.
_Avoid_: Read-only, read access

**Editor** (Collaborator level):
A Collaborator level that allows write access to a specific Comparison. An Editor can leave notes, edit legacy values, manually resolve MappingEntries, and reconfigure the Comparison. An Editor cannot delete the Comparison or manage its Collaborators.
_Avoid_: Contributor, write access

**Suspended**:
A User state in which login is blocked and all active sessions are immediately terminated. A Suspended User remains in the system with their Comparisons intact; they are not deleted. Suspension is reversible — an Admin can un-suspend at any time. Only Admins can suspend or un-suspend Users. The last Admin cannot be suspended. Role changes are blocked while a User is Suspended. A ban reason (free text) is required at suspend time.
_Avoid_: Banned, disabled, deactivated, locked

**Comparison**:
A named, saved session pairing one payroll export from the legacy system with one from the new system, for a specific PayPeriod. Identified by a label, a PayPeriod, and an optional description. The top-level unit of work in this application.
_Avoid_: Payroll Comparison, run, check

**Owner**:
The User holding the `owner` Collaborator level on a Comparison. Exactly one Owner per Comparison at all times, enforced at the database level. Defaults to the User who created the Comparison (an Owner Collaborator is created automatically on Comparison creation). Can be transferred by an Admin or the current Owner to any non-suspended User with role Admin or Implementor; on transfer, the outgoing Owner's Collaborator is automatically downgraded to Editor — they retain edit access unless the new Owner or an Admin explicitly revokes it. The Owner has full edit and delete rights. The Owner (and Admins) are the only Users who can manage Collaborators — adding, revoking, or changing levels. Ownership is no longer stored as a column on the Comparison — `created_by` remains the immutable audit field; the current Owner is always derived from the Collaborators.
_Avoid_: Creator, author, assigned user

**PayPeriod**:
The date range of work covered by a Comparison, defined by a start date and an end date (both required). Distinct from the disbursement date (the day pay hits accounts), which is not tracked. Stored as `pay_period_start` and `pay_period_end` on the Comparison. Used to filter Comparisons in the list view (each field is an independent, ANDed exact-match filter). Rendered in export filenames as `start to end` (e.g. `2026-01-01 to 2026-01-31`).
_Avoid_: Pay date, payday, disbursement date, pay period date

**ExpectedEmployeeCount**:
A user-asserted count of distinct employees expected to appear in this Comparison's results. Optional. Used by the SourceFormatter as a sanity check — if the extracted row count differs by more than 20%, the formatter upgrades an `ok` result to a `flag` with an explanatory message. Stored on the Comparison rather than per Source because both Sources are expected to cover the same people. Captured through the SourceFormatter only; written at Source confirm time alongside the file upload.
_Avoid_: Employee count, headcount, expected rows

**Source**:
One of the two payroll exports being compared within a Comparison. Always labeled either "Legacy" or "New". Each Comparison has exactly two Sources.
_Avoid_: File, upload, side

**LegacyProvider**:
The payroll system that produced a Legacy Source export — e.g. ADP, Paychex, Gusto. Free text, set per Source at upload time, never inferred. Implicitly "New" on a new Source and therefore not stored there. Captured through the SourceFormatter only; written to the Legacy Source row at confirm time. Used by the SourceFormatter to disambiguate Claude's extraction prompt; not consumed elsewhere yet.
_Avoid_: Provider, payroll system, vendor, source system

**FormatNotes**:
Free-text notes the user provides about a Legacy Source's layout quirks before AI formatting — e.g. "summary rows at the bottom of every page", "first three rows are header context". Read by the SourceFormatter as prompt context. Stored on the Legacy Source row, set at confirm time via the SourceFormatter. Distinct from MappingEntry notes (analyst commentary on a specific discrepancy) and Diagnosis notes (AI-generated explanations).
_Avoid_: Notes, formatter hints, instructions

**ColumnEntry**:
A single column group definition within a Comparison's ColumnMapping. Maps one or more Legacy columns to one or more new columns (many-to-many supported). At comparison time, each side is summed and the totals are compared against the Tolerance. Has a user-defined label (defaults to the new column names joined with " + ") used as the sub-group header in the results view. Has a per-category display order that controls the sequence in which entries appear within their ComparisonCategory during review — display order is purely presentational, not a blocking gate.
_Avoid_: MappingEntry, column pair, field mapping, mapping row

**MappingEntry**:
The persisted result of comparing a single matched employee's values for a given ColumnEntry. Stores the Legacy value, new value, computed Difference, and resolution state: auto-set to resolved if within Tolerance, otherwise unresolved. Can be manually overridden by the user. Optionally accompanied by a note. Created and replaced by the comparison engine on each run. Cleared or preserved when a Source is re-uploaded, at the user's choice.
_Avoid_: DiscrepancyStatus, flag, review status, result row

**ColumnMapping**:
The full set of ColumnEntry definitions for a Comparison. When a new Comparison reaches the Map Columns step, New columns are auto-loaded using the New CSV's grouping row to assign each column's ComparisonCategory; the Legacy side of each ColumnEntry is left blank for the user to fill in. The user can trigger an AI-assisted suggestion (via a button on the Map Columns step) that fills in the Legacy side of currently-empty entries based on header name matching and also suggests the Legacy EmployeeKey; suggestions are confident-only — ambiguous Legacy columns are surfaced separately for manual review rather than auto-assigned. Reused when a Source is re-uploaded into the same Comparison; prompted for adjustment if headers have changed. When creating a new Comparison, the user can optionally copy the ColumnMapping from a previous one. Column types are auto-detected; mismatched types produce a warning but do not block mapping.
_Avoid_: Header mapping, field mapping

**ComparisonStatus**:
A derived overall status for a Comparison. Starts as "setup" until the Comparison is first run (POST /run succeeds), at which point it transitions based on resolution state: passes when every MappingEntry and UnmatchedEmployee is resolved, fails if any are unresolved, otherwise in_progress. The "setup" phase is tracked via a `setup_complete` boolean on the Comparison (false at creation, set to true on first successful run). Values: setup, in_progress, pass, fail.
_Avoid_: Result, outcome, pass/fail

**UnmatchedEmployee**:
An employee row present in one Source but absent in the other, identified by EmployeeKey. Stored as an EmployeePairing with one null key — Legacy-only (only legacy_key set) or new-only (only new_key set). Written by the comparison engine on each run. Surfaced before value comparisons as a blocking concern. Resolved by acknowledging with a note or by creating a matched EmployeePairing.
_Avoid_: Missing employee, orphan row, unmapped employee

**Difference**:
The signed numeric distance between the absolute Legacy and New values for a single employee row within a ColumnEntry, computed as `|legacy_value| - |new_value|`. A positive Difference means the Legacy magnitude is higher; negative means the new magnitude is higher. Using absolute magnitudes normalises sign-convention differences across payroll systems (e.g. a deduction recorded as −100 in one system and +100 in the other is treated as equivalent).
_Avoid_: Delta, variance, gap

**Tolerance**:
The maximum allowed Difference between two mapped values before a row is flagged as a discrepancy. Set per ColumnEntry, with a default of $0.01. A Difference is within Tolerance when it falls in the symmetric range `[−tolerance, +tolerance]`. Higher tolerances are expected for taxes and net pay; lower (or zero) for gross earnings and FICA.
_Avoid_: Threshold, variance, delta

**EmployeeKey**:
One or more designated columns on each Source whose values are space-joined to produce a single identifier string used to pair rows across the two Sources. Configured in the Define Employee Keys step alongside the EmployeeMatchMode. Either side may use a single column or a composite of multiple columns — for example, a legacy export with a single "Full Name" column can be paired against a new export using "First Name" + "Last Name". The joined value is the canonical key stored throughout the system (MappingEntries, EmployeePairings). Every row without a matching EmployeeKey on the other side is an UnmatchedEmployee. The new EmployeeKey defaults to `["Employee ID"]` but is user-selectable. The Legacy EmployeeKey is variable and must be identified per client.
_Avoid_: Employee ID column, match key, join key

**EmployeeMatchMode**:
The strategy used to pair rows across the two Sources by EmployeeKey. Two values: `exact` (row keys must match exactly) or `fuzzy` (token overlap on key values — rows are proposed as candidates and must be validated by the user before being treated as matched). Configured in the Define Employee Keys step alongside the EmployeeKey.
_Avoid_: Match strategy, match type, definitive match

**EmployeePairing**:
A row that represents an employee identity relationship within a Comparison. Three forms: both Legacy and New keys set (a user-confirmed matched pair); only Legacy key set (an UnmatchedEmployee from the Legacy source); only New key set (an UnmatchedEmployee from the New source). Matched pairs are established in the Validate Employees step — in fuzzy mode the algorithm proposes them and the user approves; in exact mode the user enters them manually. UnmatchedEmployee rows are written by the comparison engine on each run. All forms share the same resolved and note fields for resolution tracking. Consumed identically by the comparison engine regardless of EmployeeMatchMode.
_Avoid_: Fuzzy approval, manual match, approved pair, override

**EmployeeName**:
An optional display name shown alongside the EmployeeKey in results. Always sourced from up to two designated New columns — first name and last name — never from the Legacy source, since name formatting is inconsistent across sources. Both columns are user-selectable and independent; either may be omitted. When both are present, displayed as "First Last". Default column names are `"First Name"` and `"Last Name"`. Configured in the Define Employee Keys step. Absent if neither New name column is configured, or if the employee is unmatched from the Legacy side (no New row exists to look up). When present, shown next to the EmployeeKey; when absent, only the EmployeeKey is shown — no placeholder. Stored as a single concatenated string in results — first and last are joined at run-time and never stored separately.
_Avoid_: Display name, full name, employee label

**ReconfigureWizard**:
A multi-step wizard for updating an existing Comparison after setup is complete. Steps: Replace Files → Remap Columns → Reset Options → Review & Run. All changes are held in client-side state and do not take effect until the final commit, which is atomic. Entered at a specific step (via `?step=` param) but allows backward navigation. On successful commit, the user is taken to ComparisonDetail with fresh results. Cancel returns to the options page. Not accessible when ComparisonStatus is "setup" (use SetupWizard instead).
_Avoid_: Edit wizard, update wizard, re-run wizard

**SourceFormatter**:
A modal that accepts a raw Legacy file (CSV, XLSX, or PDF), uses Claude to reshape it into the standard flat-table structure (rows = employees, columns = pay categories or identifiers, no summary or metadata rows), and allows iterative chat refinement before committing the result as the Legacy Source. Opened via a dedicated "Format with AI" file picker on the Legacy Source upload card — separate from the normal upload path. Always available on Legacy uploads regardless of whether a prior upload succeeded. PDF files are only accepted through the SourceFormatter path.
_Avoid_: AI formatter, format wizard, reformat tool

**Export**:
A snapshot of a Comparison's results — all ColumnEntry comparisons, MappingEntries, and Differences — rendered as a file for sharing outside the application. Available formats: CSV, Excel (XLSX), or Google Drive. Each Export has an ExportMode. Not available when ComparisonStatus is "setup".
_Avoid_: Download, report, output

**ExportMode**:
One of two rendering strategies for an Export. **Static** renders all values as hardcoded numbers. **Dynamic** renders three sheets (Legacy, New, Summary): the Legacy sheet contains the ColumnEntry labels and pre-summed values per matched employee; the New sheet is a full replica of the uploaded new Source CSV (all columns, original order) plus a hidden `__key__` helper column appended at the far right that computes the composite NewEmployeeKey using INDEX/MATCH by column header name; the Summary sheet references them with XLOOKUP formulas (by header name, not column position) so values recalculate when source cells are edited — supporting the use case of pasting a new New payroll export directly into the New sheet. Summary columns A (`__legacy_key__`) and B (`__new_key__`) are hidden and store the per-employee key strings used for row lookup; columns C onward are the visible Employee ID, Employee Name, and five columns per ColumnEntry (Legacy, New, Difference, Status, Notes). Multi-column ColumnEntry mappings generate one XLOOKUP term per raw New column, summed. Dynamic is available for Excel and Google Sheets only; CSV is always Static. UnmatchedEmployees are excluded from the Legacy and New sheets in both modes and appear statically at the bottom of the Summary. Sheet names are fixed: "Legacy", "New", "Summary".
_Avoid_: Formula mode, live mode, interactive mode

**ComparisonCategory**:
An ordered grouping of MappingEntries for comparison review: Hours, Earnings, Non-Taxed Earnings, FICA, Benefits, Deductions, Taxes, Fringes, Net. Analysts work through categories sequentially — all DiscrepancyStatuses within a category should be resolved before moving to the next. Within a category, MappingEntries are presented as labeled sub-groups in the order set by the analyst during mapping configuration.
_Avoid_: Section, group, step

**ColumnPairing**:
An individual atomic assignment of a single column from one Source to a ColumnEntry. Each ColumnPairing identifies the source type (Legacy or New) and the column name. A ColumnEntry aggregates multiple ColumnPairings — all Legacy-side columns are summed and compared against all new-side columns. No column may appear in more than one ColumnEntry within the same Comparison.
_Avoid_: Column assignment, column slot, column entry

**UnmappedColumn**:
A column header from either Source that is not assigned to any ColumnEntry, is not the EmployeeKey for either Source, and is not the New name column. Computed separately for each Source (Legacy and New). When the user attempts to advance past the Map Columns step with any UnmappedColumns present, a blocking dialog lists them grouped by Source — the user must explicitly acknowledge each one before proceeding.
_Avoid_: Ignored column, skipped column, unused column

**Diagnosis**:
An AI-generated plain text explanation of a pattern of discrepancies within a Comparison. Has a lifecycle: open (default), resolved, or invalid. Links to one or more MappingEntries. Resolving a Diagnosis auto-resolves all linked MappingEntries; marking it invalid leaves them unchanged. Generated on demand at three scopes: Comparison-wide ("Diagnose All"), per ComparisonCategory, or per individual employee row. In all cases the AI runs pattern matching across the full scope and may link multiple rows to a single Diagnosis. Re-diagnosing a scope clears and replaces that scope's existing Diagnoses (replace-by-scope). Downstream ComparisonCategories (e.g. Net Pay) cannot be diagnosed until all upstream categories (e.g. Earnings, FICA) have fully resolved MappingEntries — the diagnose action is disabled with a tooltip when this condition is not met.
_Avoid_: Issue, finding, AI note, flag, known issue
