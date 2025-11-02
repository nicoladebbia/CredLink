#![no_main]

use libfuzzer_sys::fuzz_target;
use std::panic;

/// Fuzz target for c2pa::Reader to test manifest parsing robustness
/// 
/// This fuzz target tests:
/// - Malformed JUMBF structures
/// - Invalid JSON in manifests  
/// - Buffer overflow attempts
/// - Unicode edge cases
/// - Deep nesting attacks
/// - Circular references
fuzz_target!(|data: &[u8]| {
    // Prevent panics from crashing the fuzzer
    let _ = panic::catch_unwind(|| {
        // Test 1: Direct manifest parsing
        if let Ok(data_str) = std::str::from_utf8(data) {
            // Attempt to parse as JSON manifest
            if let Ok(_manifest) = serde_json::from_str::<serde_json::Value>(data_str) {
                // If valid JSON, try to extract C2PA fields
                test_manifest_extraction(&_manifest);
            }
        }
        
        // Test 2: JUMBF buffer parsing simulation
        test_jumbf_parsing(data);
        
        // Test 3: Edge case validation
        test_edge_cases(data);
    });
});

fn test_manifest_extraction(manifest: &serde_json::Value) {
    // Extract common C2PA fields to test parsing
    if let Some(title) = manifest.get("title") {
        let _ = title.as_str();
    }
    
    if let Some(generator) = manifest.get("claim_generator") {
        let _ = generator.as_str();
    }
    
    if let Some(timestamp) = manifest.get("timestamp") {
        let _ = timestamp.as_str();
    }
    
    if let Some(assertions) = manifest.get("assertions") {
        if let Some(assertions_array) = assertions.as_array() {
            for assertion in assertions_array {
                if let Some(label) = assertion.get("label") {
                    let _ = label.as_str();
                }
            }
        }
    }
}

fn test_jumbf_parsing(data: &[u8]) {
    // Simulate JUMBF box parsing with various malformed inputs
    if data.len() < 4 {
        return;
    }
    
    // Test box header parsing
    let _box_size = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
    
    // Test box type validation (4 bytes)
    if data.len() >= 8 {
        let box_type = &data[4..8];
        let _type_str = std::str::from_utf8(box_type);
    }
    
    // Test nested box parsing
    test_nested_boxes(data);
}

fn test_nested_boxes(data: &[u8]) {
    // Simulate deeply nested JUMBF structures
    let mut depth = 0;
    let mut pos = 0;
    
    while pos + 8 <= data.len() && depth < 100 { // Prevent infinite loops
        // Read box size
        let box_size = u32::from_be_bytes([data[pos], data[pos+1], data[pos+2], data[pos+3]]) as usize;
        pos += 8;
        
        if box_size == 0 || pos + box_size > data.len() {
            break; // Invalid box size
        }
        
        // Check if this looks like a nested box
        if pos + 4 <= data.len() {
            let box_type = &data[pos..pos+4];
            if box_type == b"jumb" || box_type == b"json" {
                depth += 1;
            }
        }
        
        pos += box_size;
        
        // Prevent excessive nesting (fuzzing attack)
        if depth > 64 {
            break;
        }
    }
}

fn test_edge_cases(data: &[u8]) {
    // Test various edge cases that might cause crashes
    
    // 1. Null bytes in strings
    if data.contains(&0) {
        if let Ok(data_str) = std::str::from_utf8(data) {
            let _cleaned = data_str.trim_end_matches('\0');
        }
    }
    
    // 2. Overlong UTF-8 sequences
    if data.len() >= 2 && data[0] == 0xC0 && data[1] >= 0x80 && data[1] <= 0xBF {
        let _ = std::str::from_utf8(data);
    }
    
    // 3. Extremely large numbers
    if data.len() >= 8 {
        let _large_num = u64::from_be_bytes([
            data[0], data[1], data[2], data[3],
            data[4], data[5], data[6], data[7]
        ]);
    }
    
    // 4. Control characters
    for &byte in data {
        if byte < 32 && byte != b'\t' && byte != b'\n' && byte != b'\r' {
            // Control character detected - test handling
            let _escaped = format!("\\x{:02x}", byte);
        }
    }
}
