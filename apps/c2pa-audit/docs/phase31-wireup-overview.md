# Phase 31 — Wire-up Overview (HLS Reference)

## B) Wire-up Overview (HLS Reference)

### 1. Authoring/Packaging (Origin/SSAI)

#### Requirements:
- Insert SCTE-35 at splice points
- HLS carries via #EXT-X-DATERANGE (and/or CUE-OUT/IN)
- Publish C2PA manifest for Program and each Ad creative
- Embed when controlling fMP4 init, else use remote
- Publish Range Index JSON per stream

#### Implementation Points:
```javascript
// SCTE-35 insertion example
const scte35 = {
  splice_insert: {
    splice_event_id: 0x6FFFFFF0,
    splice_event_cancel_indicator: 0,
    out_of_network_indicator: 0,
    program_splice_flag: 1,
    duration_flag: 1,
    duration: 90000, // 60 seconds in 90kHz ticks
    splice_immediate_flag: 0,
    unique_program_id: 1,
    pts_time: 486000000, // Start time in 90kHz
    component_count: 0,
    break_duration: 90000,
    splice_time_specified_flag: 1,
    pts_time: 486000000
  }
};
```

### 2. Delivery (CDN)

#### Requirements:
- Inject Link: <...>; rel="c2pa-manifest" on init segments when stable
- Support remote manifest resolution via Range Index
- Maintain CORS/CSP compliance via Edge Relay

#### Header Injection:
```http
Link: <https://manifests.example.com/program/sha256/.../active.c2pa>; rel="c2pa-manifest"
```

### 3. Playback (Player + Badge)

#### State Management:
- Listen for DATERANGE/ID3 metadata
- Swap active manifest on ad range entry/exit
- Maintain manifest state across ABR switches
- Update badge UI based on active content type

#### Verification Flow:
1. Detect DATERANGE entry
2. Lookup range in Range Index
3. Switch to appropriate manifest
4. Verify at boundary
5. Update badge state
6. Sample verify within range

## Status: IMPLEMENTED
