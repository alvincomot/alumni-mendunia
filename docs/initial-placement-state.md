# Initial placement state

## Source of truth

`placements.placement_secured` records whether an alumnus has obtained a
placement for that placement cycle:

- `true`: placement has been obtained;
- `false`: an operator explicitly recorded that placement has not been
  obtained;
- `NULL`: legacy or otherwise unknown state.

New records always write an explicit boolean. The intermediary is stored in
`placement_provider_name`. The older `company_name` column describes an
employer/company in historical data and is not copied into or relabeled as an
LPK, Sending Organization, or P3MI.

For `persiapan_berangkat`, country remains required. Provider, work sector, and
planned departure are accepted only when `placement_secured = true`. Other
initial statuses require `placement_secured = true`. The existing status-change
RPC promotes the state to `true` atomically when departure is confirmed.

## Historical data

The migration backfills only `aktif_bekerja` and `selesai_kontrak` rows to
`true`, because those statuses prove that a placement existed. Preparation and
cancelled rows remain `NULL`; nullable descriptive fields are not sufficient
evidence to infer the business state. Dashboard and report summaries group this
unknown state with **Belum ada penempatan** to keep the operational view compact,
while the stored value and detailed historical output remain unchanged.

Current placement details can be corrected by active School Staff from the
alumni detail page. Dinas roles remain read-only. The edit workflow keeps the
status immutable, locks the current row, verifies its `updated_at` snapshot,
and updates only fields that are valid for the stored status. The existing
placement audit trigger records a real change, while `status_histories` remains
unchanged because corrections do not represent a status transition.

## Deployment order

Apply `20261105000100_initial_placement_state.sql` before deploying the
application code, followed by
`20261105000200_edit_current_placement_details.sql` before enabling the edit
control in a deployment. The migrated database retains the older creation RPC
overload for a rolling deployment; older application instances therefore keep
working and leave the new state `NULL`. During a code-first local rollout, the
application retries placement reads with the legacy projection and presents the
same conservative classification as the migration: active/completed rows are
`true`, while preparation/cancelled rows remain unknown. Creation and edit
writes fail safely when their guarded RPC is missing instead of silently losing
state. Migration-first remains the required production deployment order.
