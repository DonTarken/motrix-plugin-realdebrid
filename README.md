# Real-Debrid Resolver for Motrix

An open-source extension for the [Motrix](https://motrix.app) download manager that automatically resolves supported file hoster links (1fichier, Rapidgator, Mega, Turbobit, etc.) using the official Real-Debrid API.

[![Latest Release](https://img.shields.io/github/v/release/DonTarken/motrix-plugin-realdebrid?label=Release&color=blue)](https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest)
[![Motrix Compatibility](https://img.shields.io/badge/Motrix->=%202.0.0-orange)](https://motrix.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/DonTarken)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-F16061?logo=ko-fi&logoColor=white)](https://ko-fi.com/dontarken)

[Français](README.fr.md) | **English**

---

## Overview

When adding links from supported file hosters to Motrix, this plugin intercepts the URLs via Motrix's plugin API, retrieves direct download links through your Real-Debrid account, and passes them to Aria2 for unthrottled downloading.

- **Automatic resolution**: Intercepts links on task creation without manual copy-pasting into the Real-Debrid web interface.
- **Direct Aria2 integration**: Uses Aria2's multi-connection engine with full HTTP Range resume support.
- **Host caching**: Queries and caches the list of supported domains locally to minimize API requests.
- **Privacy & Security**: Your API token remains stored locally in Motrix and is only sent to the official Real-Debrid API via Bearer headers.
- **Tested & Hardened**: Comprehensive 15-test automated test suite covering fail-closed security, diagnostic sanitization, and network resilience.

---

## Installation

### Option 1: Directly from Motrix
1. Go to the **Extensions** tab in Motrix.
2. Click **Add an extension** (`+` button).
3. Type:
   ```text
   DonTarken/motrix-plugin-realdebrid
   ```
4. Confirm to install.

### Option 2: Manual `.moext` file
1. Download `realdebrid-resolver.moext` from the [Releases page](https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest).
2. Drag and drop the `.moext` file onto the Motrix window and confirm installation.

---

## Configuration

1. Get your API token from [real-debrid.com/apitoken](https://real-debrid.com/apitoken).
2. In Motrix, open **Extensions** -> **Real-Debrid Resolver** -> **Settings**.
3. Paste your token into the API Key field and save.
4. Add any supported file link in Motrix as usual.

---

## Multi-Resolver Compatibility

This plugin is designed to work alongside [motrix-plugin-alldebrid](https://github.com/DonTarken/motrix-plugin-alldebrid). If both plugins are enabled, links already resolved by one service are ignored by the other, providing automatic fallback across providers.

---

## Issues & Feedback

- [Report a bug](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=bug_report.yml)
- [Confirm test results & speeds](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=test_confirmation.yml)
- [Request a feature](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=feature_request.yml)
- [Discussion thread for testers](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/1)

---

## License

MIT License - see [LICENSE](LICENSE) for details.
