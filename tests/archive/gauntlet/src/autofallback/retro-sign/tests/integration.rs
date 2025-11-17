//! Integration tests for C2 Concierge Retro-Sign CLI

use anyhow::Result;
use std::process::Command;
use tempfile::TempDir;
use std::path::Path;

#[test]
fn test_cli_help() -> Result<()> {
    let output = Command::new("cargo")
        .args(&["run", "--bin", "c2c", "--", "--help"])
        .output()?;
    
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout)?;
    assert!(stdout.contains("C2 Concierge retro-sign CLI"));
    assert!(stdout.contains("inventory"));
    assert!(stdout.contains("plan"));
    assert!(stdout.contains("run"));
    
    Ok(())
}

#[test]
fn test_inventory_command_help() -> Result<()> {
    let output = Command::new("cargo")
        .args(&["run", "--bin", "c2c", "--", "inventory", "--help"])
        .output()?;
    
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout)?;
    assert!(stdout.contains("--tenant"));
    assert!(stdout.contains("--origin"));
    assert!(stdout.contains("--bucket"));
    
    Ok(())
}

#[test]
fn test_plan_command_help() -> Result<()> {
    let output = Command::new("cargo")
        .args(&["run", "--bin", "c2c", "--", "plan", "--help"])
        .output()?;
    
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout)?;
    assert!(stdout.contains("--tenant"));
    assert!(stdout.contains("--input"));
    assert!(stdout.contains("--dry-run"));
    
    Ok(())
}

#[test]
fn test_run_command_help() -> Result<()> {
    let output = Command::new("cargo")
        .args(&["run", "--bin", "c2c", "--", "run", "--help"])
        .output()?;
    
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout)?;
    assert!(stdout.contains("--tenant"));
    assert!(stdout.contains("--input"));
    assert!(stdout.contains("--checkpoint"));
    
    Ok(())
}

#[test]
fn test_sample_command_help() -> Result<()> {
    let output = Command::new("cargo")
        .args(&["run", "--bin", "c2c", "--", "sample", "--help"])
        .output()?;
    
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout)?;
    assert!(stdout.contains("--tenant"));
    assert!(stdout.contains("--sample"));
    assert!(stdout.contains("--stratify"));
    
    Ok(())
}

#[test]
fn test_verify_command_help() -> Result<()> {
    let output = Command::new("cargo")
        .args(&["run", "--bin", "c2c", "--", "verify", "--help"])
        .output()?;
    
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout)?;
    assert!(stdout.contains("--input"));
    assert!(stdout.contains("--sample"));
    assert!(stdout.contains("--verify-url"));
    
    Ok(())
}

#[test]
fn test_report_command_help() -> Result<()> {
    let output = Command::new("cargo")
        .args(&["run", "--bin", "c2c", "--", "report", "--help"])
        .output()?;
    
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout)?;
    assert!(stdout.contains("--input"));
    assert!(stdout.contains("--output"));
    assert!(stdout.contains("--format"));
    
    Ok(())
}

#[test]
fn test_inventory_dry_run() -> Result<()> {
    let temp_dir = TempDir::new()?;
    let output_file = temp_dir.path().join("test-inventory.jsonl");
    
    let output = Command::new("cargo")
        .args(&[
            "run", "--bin", "c2c", "--",
            "inventory",
            "--tenant", "test-tenant",
            "--origin", "file",
            "--bucket", "test-bucket",
            "--prefix", "/nonexistent/path",
            "--output", output_file.to_str().unwrap()
        ])
        .output()?;
    
    // Should not crash, even with nonexistent path
    // The command should complete without panic
    let stderr = String::from_utf8(output.stderr)?;
    assert!(!stderr.contains("panic"));
    
    Ok(())
}

#[test]
fn test_plan_with_empty_inventory() -> Result<()> {
    let temp_dir = TempDir::new()?;
    let inventory_file = temp_dir.path().join("empty-inventory.jsonl");
    let plan_file = temp_dir.path().join("test-plan.jsonl");
    let ledger_file = temp_dir.path().join("test-ledger.json");
    
    // Create empty inventory file
    std::fs::write(&inventory_file, "")?;
    
    let output = Command::new("cargo")
        .args(&[
            "run", "--bin", "c2c", "--",
            "plan",
            "--tenant", "test-tenant",
            "--input", inventory_file.to_str().unwrap(),
            "--plan-out", plan_file.to_str().unwrap(),
            "--ledger-out", ledger_file.to_str().unwrap(),
            "--dry-run"
        ])
        .output()?;
    
    assert!(output.status.success());
    
    // Check that output files were created
    assert!(plan_file.exists());
    assert!(ledger_file.exists());
    
    // Check ledger content
    let ledger_content = std::fs::read_to_string(&ledger_file)?;
    assert!(ledger_content.contains("\"objects_total\":0"));
    assert!(ledger_content.contains("\"objects_unique\":0"));
    
    Ok(())
}
