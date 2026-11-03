# PUJA OS — Database schema

PostgreSQL 16, managed by Prisma migrations (`apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/`). This document explains the model and the invariants
the database itself enforces. The Prisma schema is the field-level source of truth.

## Conventions

* Primary keys: `cuid` strings. Human document numbers come from `DocumentSequence`
  in the form `PREFIX/FY/00001` (Indian financial year, April–March, e.g. `MO/26-27/00012`).
* Quantities: `numeric(18,4)` in the item's base unit. Money: `numeric(14,2)` INR.
  Unit costs/prices: `numeric(14,4)`. Floats are never used.
* Timestamps are UTC; reporting buckets use `Asia/Kolkata`.

## Domains

| Domain | Tables |
|---|---|
| Identity & access | `User`, `Role`, `RolePermission`, `UserRole`, `Session`, `PasswordResetToken`, `AuditLog`, `ApprovalRequest` |
| Settings | `Setting` (typed JSON groups), `DocumentSequence`, `FileObject` |
| Locations & units | `Warehouse`, `Location` (type `STORAGE \| RECEIVING \| QC_HOLD \| REJECTED \| PRODUCTION \| DISPATCH`), `Uom` |
| Items | `ItemCategory` (with `attributeSchema`), `Product` (variant template), `Item` (material or finished-goods SKU), `ItemUomConversion`, `Batch` |
| Inventory ledger | `InventoryTransaction` (document), `StockMovement` (immutable ledger line), `StockBalance` (cache), `StockReservation`, `StockCount`, `StockCountLine` |
| BOM | `Bom` (one per SKU), `BomVersion`, `BomLine`, `BomLineAlternative` |
| Manufacturing config | `StageDefinition`, `Department`, `Workstation`, `Route`, `RouteStep` |
| Production | `ProductionOrder`, `ProductionMaterial` (requirement lines), `ProductionOrderStage`, `StageAssignment`, `ProductionOutput`, `ProductionEvent` |
| Workforce | `Worker`, `Attendance` |
| Quality | `DefectCategory`, `QcChecklist`, `QcChecklistItem`, `QualityInspection`, `QualityInspectionResult`, `QualityInspectionDefect` |
| Procurement | `Supplier`, `SupplierContact`, `SupplierItem`, `PurchaseRequisition(+Line)`, `PurchaseOrder(+Line)`, `GoodsReceipt(+Line)`, `SupplierReturn(+Line)` |
| Sales | `CustomerCategory`, `Customer`, `CustomerContact`, `CustomerPrice`, `SalesInquiry(+Line)`, `Quotation(+Line)`, `SalesOrder(+Line)`, `DeliveryChallan(+Line)` |
| Notifications | `Notification`, `NotificationPreference` |
| AI | `AiConversation`, `AiMessage`, `AiSummary` |

## The inventory ledger

```
InventoryTransaction 1 ── * StockMovement * ── 1 StockBalance (item, location, batch)
        │ reversalOf (1:1)                        ▲ cache: onHand, reserved
        ▼                                         │ updated in the same DB transaction
  REVERSAL transaction
```

* **StockMovement** rows are append-only. A trigger (`puja_forbid_ledger_mutation`) raises
  on `UPDATE` or `DELETE`. Corrections are reversal transactions.
* Each movement has a `bucket`: `ON_HAND` (physical) or `RESERVED` (allocated, not consumed),
  a signed `quantity`, and the balance **after** the movement (`onHandAfter`, `reservedAfter`).
* **StockBalance** is unique per `(itemId, locationId, batchId)` with
  `NULLS NOT DISTINCT`, so unbatched stock has exactly one row. Checks:
  `reserved >= 0` and `reserved <= GREATEST(onHand, 0)`.
* `GET /inventory/integrity` recomputes every balance from the ledger and reports mismatches.
* **StockReservation** tracks `quantity`, `consumedQty`, `releasedQty` per source line
  (`sourceType` = `PRODUCTION_ORDER`, `SALES_ORDER`, `MANUAL`). Check: consumed + released ≤ quantity.
* `InventoryTransaction.idempotencyKey` is unique; `requestHash` detects key reuse with a different payload.
* Only `STORAGE` locations count as *available* stock. QC hold, rejected, receiving and WIP stock is visible but cannot be reserved, issued or sold.

## Production model

* `ProductionOrder.bomVersionId` and `routeId` are frozen at release.
* `ProductionMaterial`: `qtyPerUnit` (standard, without allowance), `requiredQty` (with
  wastage allowance), `reservedQty`, `consumedQty`, `wastageQty`, `returnedQty`,
  `stageDefinitionId` (where it is consumed), `consumptionMode` (`BACKFLUSH` / `MANUAL`),
  `originalItemId` when substituted.
* `ProductionOrderStage` carries good/rejected/rework totals; `ProductionOutput` is one
  entry per recording (worker, quantities, defect, inspection, the inventory transactions it
  created and the exact `consumption` per material line so it can be reversed precisely).
* `ProductionEvent` is the order history (created, released, reserved, started, paused, output,
  wastage, substitution, assignment, remark, cancelled, completed, reversed).
* Checks: quantities non-negative; an output has at least one non-zero quantity.

## BOM versions

Exactly one `ACTIVE` version per BOM (partial unique index `BomVersion_one_active_per_bom`).
Versions are never edited after leaving `DRAFT`. `BomLine.quantityFormula` is evaluated by
the safe formula engine with the SKU's numeric attributes and `qty`.

## Audit

`AuditLog` is append-only (same trigger). It records actor (`USER`, `AI`, `SYSTEM`), action,
entity, before/after JSON, request id, IP and user agent. Stock and status changes write their
audit row inside the same transaction as the change.

## Migrations

| Migration | Purpose |
|---|---|
| `20261103120444_init` | full schema + custom constraints, partial unique index, immutability triggers |
| `20261103121000_immutable_message` | generic trigger error message |
| `…_item_relations_and_output_consumption` | FK relations from document lines to `Item`; `ProductionOutput.consumption` |

Create new migrations with `pnpm --filter @puja/api prisma:migrate:dev --name <change>`.
Postgres-specific DDL (checks, partial indexes, triggers) is added by hand to the generated
SQL — review it before committing. Never edit an applied migration; add a new one.
