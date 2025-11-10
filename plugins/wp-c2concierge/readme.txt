=== C2 Concierge - Content Credentials ===
Contributors: credlink
Tags: c2pa, provenance, content credentials, image verification, media
Requires at least: 5.0
Tested up to: 6.4
Stable tag: 0.1.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Sign uploads, inject remote C2PA manifests, and add verification badges to protect content provenance.

== Description ==

C2 Concierge automatically signs your media uploads with C2PA provenance metadata and injects verification capabilities into your WordPress site.

**Key Features:**
* Automatic signing of new image uploads
* Remote manifest storage for maximum survival
* Optimizer detection with automatic policy enforcement
* C2 verification badge injection
* Theme-agnostic compatibility
* Admin dashboard with policy controls
* Nightly retro-signing for existing media
* Zero-config installation

**How it works:**
1. Upload an image to your WordPress media library
2. C2 Concierge automatically signs it with cryptographic provenance
3. Manifest URLs are stored and injected into your pages
4. C2 verification badges appear next to images
5. If image optimizers are detected, remote-only mode is enforced

== Installation ==

1. Upload the `wp-credlink` folder to your `/wp-content/plugins/` directory
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Configure your settings in Settings > C2 Concierge (optional)

That's it! Your uploads will now be automatically signed with C2PA provenance.

== Configuration ==

**Basic Settings:**
* **Tenant ID**: Your C2 Concierge tenant identifier
* **Preserved Paths**: Comma-separated paths where embeds are allowed
* **Show C2 Badge**: Display verification badges next to images
* **Retro-sign Period**: Number of days to look back for signing existing media

**Policy Settings:**
* **Remote Default**: Automatically enforced when optimizers are detected
* **Optimizer Detection**: Automatically flips to remote-only mode when image transformations are detected

== Frequently Asked Questions ==

= What is C2PA? =

C2PA (Coalition for Content Provenance and Authenticity) is an open technical standard for proving the origin and history of media content. It provides cryptographic proof of content authenticity.

= What happens when optimizers are detected? =

When C2 Concierge detects image optimizers or transformations, it automatically switches to "remote-only" mode. This ensures provenance survival by storing manifests remotely and preventing embed mutations.

= Does this slow down my site? =

No. The signing process happens asynchronously in the background. The badge injection is lightweight and doesn't impact page load times.

= Can I disable the badges? =

Yes, you can disable badge display in the settings while still maintaining provenance signing.

= What happens if I uninstall the plugin? =

The plugin includes a clean uninstall that removes all plugin data while preserving your media content. Your pages will continue to render normally.

== Screenshots ==

1. Admin dashboard showing policy status
2. Settings page with configuration options
3. Optimizer detection banner
4. Theme survival test results

== Changelog ==

= 0.1.0 =
* Initial release
* Automatic upload signing
* Remote manifest injection
* Optimizer detection
* Admin dashboard
* Theme survival testing
* Retro-signing capabilities

== Upgrade Notice ==

= 0.1.0 =
Initial release of C2 Concierge for WordPress.

== Additional Information ==

**Compatibility:**
* WordPress 5.0+
* PHP 7.4+
* All major WordPress themes
* WooCommerce compatible

**Security:**
* All data is transmitted securely
* No sensitive information is stored locally
* Clean uninstall with no content breakage

**Performance:**
* Asynchronous signing process
* Minimal impact on page load times
* Efficient caching mechanisms

**Support:**
For support and documentation, visit [C2 Concierge](https://credlink.com).

**License:**
This plugin is released under the MIT License.
