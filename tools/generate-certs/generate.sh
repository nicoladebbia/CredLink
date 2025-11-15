#!/bin/bash
# Generate development certificates for C2PA signing

set -e

CERT_DIR="${1:-fixtures/certificates}"
mkdir -p "$CERT_DIR"

echo "Generating development certificates..."

# Generate private key
openssl genrsa -out "$CERT_DIR/signing-key.pem" 2048

# Generate self-signed certificate
openssl req -new -x509 -key "$CERT_DIR/signing-key.pem" \
  -out "$CERT_DIR/signing-cert.pem" \
  -days 365 \
  -subj "/C=US/ST=CA/L=San Francisco/O=CredLink Dev/CN=localhost"

# Generate certificate fingerprint
openssl x509 -in "$CERT_DIR/signing-cert.pem" -noout -fingerprint -sha256 \
  > "$CERT_DIR/cert-fingerprint.txt"

echo "✅ Certificates generated in $CERT_DIR"
echo "   - signing-key.pem (private key)"
echo "   - signing-cert.pem (certificate)"
echo "   - cert-fingerprint.txt (SHA256 fingerprint)"
