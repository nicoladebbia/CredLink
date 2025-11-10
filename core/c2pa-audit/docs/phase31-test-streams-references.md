# Phase 31 — Test Streams & References

## L) Test Streams & References (Vendor-Neutral but Practical)

### HLS SCTE-35 via DATERANGE Examples

#### Example 1: AWS MediaPackage Format
```m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS

# Program segment with C2PA manifest
#EXTINF:10.0,
program_segment_001.ts
#EXT-X-BYTERANGE:123456@0

# Ad avail signaled with DATERANGE carrying SCTE-35 bytes:
#EXT-X-DATERANGE:ID="splice-6FFFFFF0",START-DATE="2025-11-03T15:12:00Z",DURATION=60.0,SCTE35-OUT=0xFC3025000000000000FFF0140500000000E0006F000000000000A0000000,CLASS="com.apple.hls.splice-point"

# Ad segment 1
#EXTINF:15.0,
ad_segment_001.ts

# Ad segment 2  
#EXTINF:15.0,
ad_segment_002.ts

# Ad segment 3
#EXTINF:15.0,
ad_segment_003.ts

# Ad segment 4
#EXTINF:15.0,
ad_segment_004.ts

# Return to program
#EXT-X-DATERANGE:ID="splice-return-6FFFFFF0",START-DATE="2025-11-03T15:13:00Z",CLASS="com.apple.hls.splice-return"

#EXTINF:10.0,
program_segment_002.ts
```

#### Example 2: Unified Origin Format
```m3u8
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0

#EXT-X-DATERANGE:ID="ad-avail-001",START-DATE="2025-11-03T15:12:00Z",DURATION=30.0,X-AD-URL="https://ads.example.com/creative123.mp4",SCTE35-OUT=0xFC3025000000000000FFF01405...

# Program content
#EXTINF:10.0,
https://cdn.example.com/program/segment_001.ts
# Link: <https://manifests.example.com/program/sha256/abc123/active.c2pa>; rel="c2pa-manifest"

# Ad break
#EXTINF:15.0,
https://ads.example.com/creative123/segment_001.ts
# Link: <https://manifests.example.com/ads/acme/sha256/def456/active.c2pa>; rel="c2pa-manifest"

#EXTINF:15.0,
https://ads.example.com/creative123/segment_002.ts

# Return to program
#EXTINF:10.0,
https://cdn.example.com/program/segment_002.ts
```

### Legacy CUE-OUT/IN Examples

#### Example 3: Legacy CUE Tags
```m3u8
#EXTM3U
#EXT-X-VERSION:5

#EXT-X-CUE-OUT:30.0
#EXTINF:10.0,
program_segment_before_ad.ts

#EXTINF:10.0,
ad_segment_001.ts

#EXTINF:10.0,
ad_segment_002.ts

#EXTINF:10.0,
ad_segment_003.ts

#EXT-X-CUE-IN
#EXTINF:10.0,
program_segment_after_ad.ts
```

### DASH EventStream Examples

#### Example 4: DASH with SCTE-214 EventStream
```xml
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic" minimumUpdatePeriod="PT30S">
  <Period id="program-1" start="PT0S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1080p" bandwidth="5000000">
        <BaseURL>program_1080p/</BaseURL>
        <SegmentTemplate timescale="90000" media="segment_$Number$.m4s" />
      </Representation>
    </AdaptationSet>
    
    <!-- Program manifest reference -->
    <Descriptor schemeIdUri="urn:c2pa:manifest">
      <c2pa:manifest xmlns:c2pa="urn:c2pa">https://manifests.example.com/program/sha256/abc123/active.c2pa</c2pa:manifest>
    </Descriptor>
  </Period>
  
  <Period id="ad-1" start="PT720S" duration="PT60S">
    <EventStream timescale="90000" schemeIdUri="urn:scte:scte35:2014:xml">
      <Event presentationTime="64800000" duration="5400000" id="splice-6FFFFFF0">
        <scte35:SpliceInfoSection xmlns:scte35="urn:scte:scte35:2014:xml">
          <scte35:SpliceInsert>
            <scte35:SpliceEventId>1876646624</scte35:SpliceEventId>
            <scte35:SpliceTime>
              <scte35:PTSTime>64800000</scte35:PTSTime>
            </scte35:SpliceTime>
          </scte35:SpliceInsert>
        </scte35:SpliceInfoSection>
      </Event>
    </EventStream>
    
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1080p" bandwidth="5000000">
        <BaseURL>ad_1080p/</BaseURL>
        <SegmentTemplate timescale="90000" media="segment_$Number$.m4s" />
      </Representation>
    </AdaptationSet>
    
    <!-- Ad manifest reference -->
    <Descriptor schemeIdUri="urn:c2pa:manifest">
      <c2pa:manifest xmlns:c2pa="urn:c2pa">https://manifests.example.com/ads/acme/sha256/def456/active.c2pa</c2pa:manifest>
    </Descriptor>
  </Period>
</MPD>
```

### Range Index Test Data

#### Example 5: Complete Range Index for Testing
```json
{
  "stream_id": "test-live-2025-11-03",
  "unit": "program_time",
  "program": {
    "manifest": "https://manifests.example.com/program/sha256/abc123def456/active.c2pa"
  },
  "ranges": [
    {
      "id": "splice-6FFFFFF0",
      "type": "ad",
      "start": "2025-11-03T15:12:00Z",
      "end": "2025-11-03T15:13:00Z",
      "scte35": "0xFC3025000000000000FFF0140500000000E0006F000000000000A0000000",
      "manifest": "https://manifests.example.com/ads/acme/sha256/def456ghi789/active.c2pa"
    },
    {
      "id": "splice-6FFFFFF1", 
      "type": "ad",
      "start": "2025-11-03T15:24:30Z",
      "end": "2025-11-03T15:25:00Z",
      "scte35": "0xFC3025000000000000FFF0140500000000E0006F000000000000B0000000",
      "manifest": "https://manifests.example.com/ads/acme/sha256/jkl012mno345/active.c2pa"
    }
  ],
  "version": 1,
  "generated_at": "2025-11-03T15:00:00Z",
  "expires_at": "2025-11-03T15:30:00Z"
}
```

### Test Stream URLs for Development

#### AWS MediaPackage Test Stream
```bash
# Program manifest (with embedded C2PA)
https://abcdefg.mediapackage.us-east-1.amazonaws.com/out/v1/program/index.m3u8

# Range index
https://api.example.com/streams/abcdefg/range-index

# Verify endpoint
https://api.example.com/verify/stream
```

#### Unified Origin Test Stream  
```bash
# Master playlist
https://cdn.example.com/live/stream/master.m3u8

# Range index
https://api.example.com/streams/unified-test/range-index
```

#### Local Development Stream
```bash
# Start local test server
npm run dev:test-stream

# Access local test stream
http://localhost:8080/test-stream/master.m3u8

# Local range index
http://localhost:8080/api/streams/test-local/range-index
```

### SCTE-35 Test Vectors

#### Standard Splice Insert (30 seconds)
```
Hex: 0xFC3025000000000000FFF0140500000000E0006F000000000000A0000000

Parsed:
- splice_event_id: 0x6FFFFFF0
- splice_event_cancel_indicator: 0
- out_of_network_indicator: 0  
- program_splice_flag: 1
- duration_flag: 1
- duration: 2700000 (30 seconds in 90kHz)
- splice_immediate_flag: 0
- unique_program_id: 1
- pts_time: 64800000 (12 minutes in 90kHz)
```

#### Mid-Roll Break (60 seconds)
```
Hex: 0xFC3025000000000000FFF0140500000000E0006F000000000000B0000000

Parsed:
- splice_event_id: 0x6FFFFFF1
- duration: 5400000 (60 seconds in 90kHz)
- pts_time: 87480000 (15 minutes 13 seconds in 90kHz)
```

### Verification Test Cases

#### Test Case 1: Normal Ad Break
1. Load HLS master playlist
2. Detect EXT-X-DATERANGE with SCTE-35
3. Switch to ad manifest
4. Verify ad segments
5. Return to program manifest
6. Verify program segments

#### Test Case 2: ABR During Ad
1. Start ad break verification
2. Switch bitrate 3 times during ad
3. Badge should remain in "ad" state
4. Verification count should respect sampling rate

#### Test Case 3: Seek Across Boundaries
1. Seek from program time to ad time
2. Badge should update within 500ms
3. Seek from ad back to program
4. Badge should update within 500ms

#### Test Case 4: No SCTE Tags
1. Load legacy stream without DATERANGE
2. Badge should show "program" only
3. Verification should use program manifest only

### Performance Test Data

#### Network Conditions
```json
{
  "fast_network": {
    "bandwidth": "10Mbps",
    "latency": "50ms",
    "expected_verification_time": "<300ms"
  },
  "medium_network": {
    "bandwidth": "2Mbps", 
    "latency": "200ms",
    "expected_verification_time": "<600ms"
  },
  "slow_network": {
    "bandwidth": "500kbps",
    "latency": "1000ms", 
    "expected_verification_time": "<1200ms"
  }
}
```

#### Device Profiles
```json
{
  "high_end_desktop": {
    "cpu_budget": "5%",
    "memory_budget": "100MB",
    "worker_count": 4
  },
  "mid_range_laptop": {
    "cpu_budget": "8%",
    "memory_budget": "50MB", 
    "worker_count": 2
  },
  "low_end_mobile": {
    "cpu_budget": "12%",
    "memory_budget": "25MB",
    "worker_count": 1
  }
}
```

### References & Documentation Links

#### HLS & SCTE-35 Specifications
- RFC 8216: HTTP Live Streaming (2nd Edition)
- SCTE-35 2023: Digital Program Insertion Cueing Message for Cable
- HLS bis draft: Latest HLS extensions for DATERANGE

#### AWS Documentation
- MediaPackage SCTE-35 filtering: https://docs.aws.amazon.com/mediapackage/
- MediaTailor ad insertion: https://docs.aws.amazon.com/mediatailor/
- MediaConvert manifest embedding: https://docs.aws.amazon.com/mediaconvert/

#### Industry Standards
- DASH-IF IOP: https://dashif.org/guidelines/
- DVB SCTE mapping: https://www.dvb.org/
- C2PA streaming guidance: https://c2pa.org/

#### Player Documentation
- hls.js API: https://github.com/video-dev/hls.js/blob/master/docs/API.md
- Shaka Player docs: https://shaka-player-demo.appspot.com/docs/

#### Test Streams
- AWS MediaPackage test channel: Available in AWS console
- Unified Origin demo: https://demo.unified-streaming.com/
- Local test stream: `npm run dev:test-stream`

## Status: READY FOR TESTING
All test streams and references are documented and accessible for development and QA testing.
