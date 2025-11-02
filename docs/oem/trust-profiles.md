# OEM Trust Profiles (Phase 15)

This document tracks the current OEM trust posture, certificate pins, and guidance used by the OEM Bridge v1 flow.

## Leica Camera AG (stable)

- **Models**: Leica M11-P (first production camera shipping with Content Credentials)
- **Signer fingerprint (SHA-256)**: `C3371D91FE5F839549A12FA8E3BE0549F6F0F1A7C55F6F5D2F3F7DAB1D0E6F99`
- **Notes**: Hardware-backed signing key embedded at capture, remote manifest bridge maintains original provenance without re-authoring bytes.
- **Status rationale**: Shipping firmware with stable Content Credentials implementation. Production pins validated against CAI sample set.

## Nikon Corporation (pilot)

- **Models**: Nikon Z6III (Authenticity Service pilot firmware)
- **Signer fingerprint (SHA-256)**: `9B57E37A8FD4C9F16BC6F32BD97A4F8C8CBEFA9F3A6D71DB91D0972BEEA8D3F1`
- **Notes**: Pilot program; badge surfaces amber warning until Nikon GA release. Fingerprints updated from authenticity service disclosure.
- **Status rationale**: Firmware and authenticity service still in pilot. Treat as partial until revocation endpoints and production docs are published.

## Guidance Notes

- **Pins** are stored in `oem_pins` (see `infra/db/schema_oem.sql`) and surfaced through the `@c2/oem-trust` package.
- **Trust scores** feed into Phase 11 trust graph: Leica hardware capture +20, Nikon pilot +10 with warning.
- **Badge wording** must remain plain-language in line with CAI requirements: "Captured with <device> at <time>" or degrade to "Imported (no camera attestations)."
