# BUG-001: Floating Point Precision Drift in Wallet Balance After Repeated Transfers

## Summary

Storing monetary amounts as `Float` in the `balance` and `amount` columns allows IEEE 754 floating point rounding errors to accumulate across repeated transfers. After a sufficient number of transactions with fractional amounts, the sender and receiver balances can drift by fractions of a cent from the mathematically correct value, breaking strict equality assertions and, in a real financial system, corrupting the ledger.

## Severity

High

## Priority

P1

## Environment

| Field | Value |
|---|---|
| Application | fintech-api-qa-framework / server |
| Endpoint | POST /api/wallet/transfer |
| Database | SQLite via Prisma (Float column type) |
| Detected By | tests/specs/03-db-validation.spec.ts |
| Detected On | Local run, Node 22, Prisma 5.19.1 |

## Preconditions

Two authenticated accounts exist with a starting balance obtained via GET /api/wallet/balance. Both accounts have a valid JWT.

## Steps to Reproduce

1. Log in as the sender account and record the exact starting balance.
2. Send repeated POST requests to /api/wallet/transfer to the same receiver using fractional amounts that do not resolve cleanly in binary floating point, for example 0.1, 0.2, and 0.3, for a large number of iterations (in practice this becomes observable after roughly 50 to 100 repeated transfers in local testing).
3. After the loop completes, call GET /api/wallet/balance for both accounts.
4. Independently compute the expected balance in application code using exact decimal arithmetic: startingBalance minus the sum of all transferred amounts.
5. Compare the computed expected balance against the value returned by the API and against the raw value stored in the SQLite users table.

## Expected Result

The balance returned by the API and the balance stored in the database should equal the mathematically exact result of the arithmetic, matching the independently computed expected value exactly.

## Actual Result

After enough repeated fractional transfers, the stored balance differs from the expected value by a small fraction, for example 149.99999999999997 instead of 150. The drift is small per transaction but is cumulative and compounds with transaction volume.

## Root Cause

`schema.prisma` defines both `User.balance` and `Transaction.amount` as `Float`, which SQLite and Prisma represent using IEEE 754 double precision. Arithmetic operations in `wallet.controller.ts` such as `decrement` and `increment` are performed directly on this floating point representation instead of using a fixed-point or integer-based representation for currency, which is the standard practice for financial systems.

## Suggested Fix

Store all monetary values as integers representing the smallest currency unit, for example cents, using a Prisma `Int` column, or migrate to Prisma `Decimal` with a fixed precision and scale. Perform all arithmetic in the integer or Decimal domain and only convert to a display-friendly decimal value at the API response boundary.

## Impact

In a production financial system this class of bug leads to silent ledger corruption, failed reconciliation against external payment processors, and potential regulatory and audit findings. It is classified High rather than Critical here because the demo application is not connected to real funds, but the same defect in a production system would be Critical.

## Attachments

Direct DB assertion output from `tests/helpers/db.helper.ts`, specifically the `senderBalanceMatches` and `receiverBalanceMatches` fields returned by `verifyTransferConsistency`, can be attached from the Allure report for the failing run.

## Status

Open
