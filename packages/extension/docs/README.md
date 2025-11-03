# C2 Concierge Browser Extension

A privacy-first browser extension that discovers and verifies C2PA content credentials on images and videos without publisher cooperation.

## Features

- **Zero-RCE Design**: MV3 compliant with no eval() or remote code execution
- **Privacy-First**: No data collection by default, all telemetry opt-in
- **Cross-Browser**: Chrome, Edge, and Safari support with shared codebase
- **Shadow DOM**: Isolated UI prevents CSS/JS collisions with host pages
- **C2PA Compliant**: Full support for C2PA 1.3+ and 2.2+ specifications
- **Performance Optimized**: Throttled scanning and efficient caching

## Architecture

### Components

1. **Background Service Worker** (`src/bg.js`)
   - Discovers manifests via webRequest headers
   - Handles verification through privacy-preserving relay
   - Manages caching and site configuration

2. **Content Script** (`src/content.js`)
   - Scans for media elements using MutationObserver
   - Renders Shadow DOM badge overlays
   - Provides interactive detail panels

3. **Popup UI** (`popup.html`, `popup.js`, `popup.css`)
   - Site-specific configuration
   - Quick verification actions
   - Privacy controls and statistics

4. **Link Header Parser** (`lib/parse-link.js`)
   - RFC 8288 compliant Link header parsing
   - Handles multi-value headers and parameters

## Installation

### Development

```bash
# Clone repository
git clone https://github.com/Nickiller04/c2-concierge.git
cd c2-concierge/packages/extension

# Install dependencies
npm install

# Build extension
npm run build

# Load in browser
# Chrome: chrome://extensions/ -> Load unpacked -> dist/chrome
# Edge: edge://extensions/ -> Load unpacked -> dist/edge
```

### Production

Production versions are available from:
- [Chrome Web Store](https://chrome.google.com/webstore)
- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons)
- [Safari App Store](https://apps.apple.com)

## Usage

### Automatic Discovery

The extension automatically discovers C2PA manifests through:

1. **Link Headers**: `Link: <manifest.c2pa>; rel="c2pa-manifest"`
2. **Sidecar Files**: Same-path `.c2pa` files
3. **Embedded Data**: For supported formats (JPEG, PNG, MP4)

### Badge Interaction

- **Hover**: Shows verification status badge
- **Click**: Opens detailed verification panel
- **Settings**: Per-site enable/disable controls

### Privacy Controls

- **Default**: No data collection, verification on user action only
- **Opt-in**: Optional telemetry for quality assurance
- **Storage**: Local only, respects browser storage limits

## Security Model

### Threat Mitigation

- **Code Injection**: MV3 forbids eval(), no remote code loading
- **CORS Bypass**: All remote requests go through verification relay
- **XSS Prevention**: Shadow DOM isolation, safe HTML escaping
- **Data Leakage**: Zero telemetry by default, explicit opt-in required

### CSP Compliance

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

### Permissions

```json
{
  "permissions": ["storage", "webRequest", "scripting"],
  "host_permissions": ["*://*/*"],
  "optional_host_permissions": ["<all_urls>"]
}
```

## Development

### File Structure

```
packages/extension/
├── manifest.json          # Extension manifest
├── src/
│   ├── bg.js              # Background service worker
│   └── content.js         # Content script
├── lib/
│   └── parse-link.js      # Link header parser
├── popup.html             # Popup interface
├── popup.js               # Popup logic
├── popup.css              # Popup styles
├── assets/                # Icons and images
├── tests/                 # Test suite
├── docs/                  # Documentation
├── build.js               # Build script
└── package.json           # Package configuration
```

### Building

```bash
# Build for all browsers
npm run build

# Build for specific browser
npm run build:chrome
npm run build:edge
npm run build:safari

# Run tests
npm run test

# Lint code
npm run lint

# Validate manifest
npm run validate
```

### Testing

```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# Security tests
npm run test:security

# Performance tests
npm run test:performance
```

## Verification Flow

### Remote Manifests
1. Background script observes Link headers via webRequest
2. If no header, performs HEAD request from service worker
3. Manifest fetched through Edge Relay (privacy-preserving)
4. Verification result displayed in badge overlay

### Embedded Manifests
1. Content script detects supported media formats
2. Uses bundled c2pa-js for local parsing
3. Verification displayed without network requests

### Sidecar Files
1. Attempts same-path `.c2pa` file discovery
2. Fetches and verifies if present
3. Falls back gracefully if not found

## Browser Compatibility

### Chrome/Edge (MV3)
- ✅ Service Worker background scripts
- ✅ webRequest API (non-blocking)
- ✅ Shadow DOM isolation
- ✅ Content Security Policy
- ✅ Optional host permissions

### Safari (WebExtensions)
- ✅ Safari Web Extension Converter
- ✅ Native app packaging
- ✅ App Store distribution
- ✅ macOS 12+ support

## Privacy Policy

### Data Collection

- **Default**: No browsing data collected
- **Verification**: Only when user clicks badges or verify buttons
- **Storage**: Local configuration and verification cache
- **Telemetry**: Opt-in only, anonymous usage statistics

### Data Retention

- **Cache**: 5 minutes for verification results
- **Configuration**: Until user changes settings
- **Telemetry**: 90 days rolling window

### Third Parties

- **Verification Relay**: Strips IP addresses, no tracking
- **No Analytics**: No Google Analytics or similar
- **No Advertising**: No ad networks or tracking

## Contributing

### Development Setup

1. Fork repository
2. Create feature branch
3. Make changes with tests
4. Ensure all tests pass
5. Submit pull request

### Code Standards

- ESLint configuration enforced
- No eval() or inline scripts
- Shadow DOM for all UI
- Comprehensive error handling
- Accessibility compliance (WCAG 2.1)

### Security Review

All changes undergo security review:
- CSP compliance verification
- Permission minimization
- Data flow analysis
- Threat model assessment

## Support

### Documentation

- [User Guide](./user-guide.md)
- [Developer Guide](./developer-guide.md)
- [Security Model](./security.md)
- [Privacy Policy](https://github.com/Nickiller04/c2-concierge/blob/main/PRIVACY.md)

### Issues

- [Bug Reports](https://github.com/Nickiller04/c2-concierge/issues)
- [Feature Requests](https://github.com/Nickiller04/c2-concierge/issues)
- [Security Issues](security@c2concierge.org)

### Community

- [Discussions](https://github.com/Nickiller04/c2-concierge/discussions)
- [Discord](https://discord.gg/c2concierge)
- [Twitter](https://twitter.com/c2concierge)

## License

MIT License - see [LICENSE](https://github.com/Nickiller04/c2-concierge/blob/main/LICENSE) for details.

## Acknowledgments

- [C2PA Specification](https://c2pa.org/)
- [Chrome Extension Guidelines](https://developer.chrome.com/docs/extensions/mv3/)
- [Content Authenticity Initiative](https://contentauthenticity.org/)
- [RFC 8288 - Web Linking](https://tools.ietf.org/html/rfc8288)
