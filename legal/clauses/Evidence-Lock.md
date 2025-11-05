# Evidence Lock (WORM) Clause

## Standard WORM Clause

"Provider shall store compliance evidence in an immutable (WORM) repository with retention ≥ 24 months, supporting legal hold. Deletion before expiry is prohibited."

## Detailed WORM Clause

"Provider shall maintain all compliance evidence, including C2PA manifests, TSA receipts, verification logs, and audit trails, in Write-Once-Read-Many (WORM) storage using AWS S3 Object Lock in Compliance Mode. Evidence shall be retained for a minimum of 24 months from creation date and shall support indefinite legal hold when required. Deletion, modification, or overwriting of evidence before the retention period expires is technically and operationally prohibited. This implementation meets SEC 17a-4 and Cohasset assessment requirements for electronic records retention."
