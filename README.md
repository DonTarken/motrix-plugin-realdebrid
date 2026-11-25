# Real-Debrid Resolver Plugin for Motrix

<p align="center">
  <img src="assets/realdebrid-logo.png" alt="Real-Debrid Logo" height="38" />
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/motrix-logo.png" alt="Motrix Logo" height="38" />
</p>

<p align="center">
  <a href="https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest"><img src="https://img.shields.io/github/v/release/DonTarken/motrix-plugin-realdebrid?label=Latest%20Release&color=success&style=for-the-badge" alt="Latest Release" /></a>
  <a href="https://motrix.app"><img src="https://img.shields.io/badge/Motrix-%3E%3D%202.0.0-orange?style=for-the-badge" alt="Motrix 2.0+" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" /></a>
  <a href="https://github.com/sponsors/DonTarken"><img src="https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor on GitHub" /></a>
  <a href="https://ko-fi.com/dontarken"><img src="https://img.shields.io/badge/Ko--fi-Support%20the%20Project-F16061?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support on Ko-fi" /></a>
</p>

<p align="center">
  <a href="README.fr.md">🇫🇷 Lire en Français</a> &nbsp;|&nbsp; 🇬🇧 <b>English</b>
</p>

---

## Why Use This Plugin?

Do you use **Motrix** as your daily download manager and hold a **Real-Debrid** premium subscription?

This autonomous plugin (`.moext`) turns Motrix into a fast, lightweight alternative to **JDownloader**:
- **100% Automatic Unrestricting**: Paste any supported link (1fichier, Rapidgator, Turbobit, Mega, Katfile, Nitroflare, etc.), and Motrix unlocks the high-speed direct link via the official Real-Debrid REST API v1.0.
- **Built-in Motrix UI Configuration**: Configure and verify your Real-Debrid API token directly from the extension's **Operations** tab inside Motrix.
- **Fail-Safe Download Protection**: If a link cannot be unrestricted (expired account, dead file, missing key), Motrix aborts the task and notifies you instead of downloading an HTML webpage.
- **Max Throughput**: Saturates gigabit fiber connections powered by Motrix's Aria2 multi-connection engine.
- **Automated Test Suite**: Tested for fail-closed host matching, Bearer token isolation, Motrix schema conformance, and error handling.

---

## 🚀 Quick Installation Guide

### Step 1: Install the Extension in Motrix (Choose One)

#### Method A: Directly via GitHub (Recommended — Fastest)
1. Open **Motrix** and click on the **"Extensions"** tab in the left navigation sidebar (package icon 📦 below *Trackers*).
2. Click the **`+`** button in the upper-right corner to open the *"Add an extension"* modal.
3. Enter the repository name:
   ```text
   DonTarken/motrix-plugin-realdebrid
   ```
   *(Do not prefix it with `https://` so Motrix fetches GitHub releases directly).*
4. Click the search icon 🔍 (or press Enter) and confirm the installation.

---

#### 📁 Method B: Via Local `.moext` File
1. 👉 **[Download `realdebrid-resolver.moext`](https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest/download/realdebrid-resolver.moext)** (latest release).
2. In Motrix ➔ **Extensions** tab ➔ click **`+`** in the upper-right corner.
3. **Drag and drop** the downloaded file into the field (or select it with the paperclip icon 📎) and confirm.

---

### Step 2: Enter & Verify Your Real-Debrid API Token

> **Why Operations instead of Settings?** Motrix Desktop 2.4.x currently has an upstream bug where values typed in an extension's *Settings* tab are not forwarded to plugins at runtime. Using the extension's **Operations** tab saves your token reliably into Motrix's local SQLite storage.

1. Retrieve your personal API token at **[real-debrid.com/apitoken](https://real-debrid.com/apitoken)**.
2. In Motrix, open **Extensions** ➔ **Real-Debrid Resolver**.
3. Open the **Operations** tab (**Account & Settings**).
4. Paste your API token into **Real-Debrid API Token** and click **Save & Verify**.
5. Motrix verifies your account immediately and displays your plan & expiration right on screen!

*(Alternative shortcut: pasting `https://real-debrid.com/set-key/YOUR_API_TOKEN` into Motrix's **Add Task (+)** dialog also saves your token directly.)*

---

## 💡 Daily Usage

* **Single Download:** Copy any filehoster link and paste it into Motrix (`Ctrl + N` or `+` button).
* **Batch Downloads:** Paste 10, 20, or 50 split archive parts (`.part01.rar`, `.part02.rar`...); all links are unrestricted and queued in parallel.
* **Browser Extension:** Use Motrix's browser extension to right-click **"Download with Motrix"** on supported links.

---

## ❓ FAQ & Troubleshooting

<details>
<summary><b>My download speed fluctuates or the progress bar is stuck at 0 B/s?</b></summary>
<br>

If downloading very large files (e.g. 20 to 60 GB video files), check where Motrix is writing:
- **Use an SSD (SATA or NVMe)** instead of a 5400 RPM mechanical HDD.
- On slow mechanical drives, pre-allocating a large file can saturate disk I/O queues for minutes, temporarily starving Aria2's RPC stats loop.
</details>

<details>
<summary><b>Which hosters are supported?</b></summary>
<br>

All filehosters supported by your Real-Debrid account (280+ domains including 1fichier, Rapidgator, Turbobit, Mega, Katfile, DDownload, Filefactory, Nitroflare, etc.). The plugin refreshes the supported hosts list automatically every hour.
</details>

<details>
<summary><b>Why does the extension request broad host permissions (*://*/*)?</b></summary>
<br>

Motrix requires `beforeCreate` plugins to match a task URL against `hostPermissions` before the hook is even invoked. Because Real-Debrid supports 280+ dynamic domains, a wildcard pattern is needed for Motrix to hand incoming links to the plugin. **Fail-closed check**: the plugin matches URLs strictly against Real-Debrid's official domain list inside Motrix first, and non-matching links are never sent to Real-Debrid.
</details>

<details>
<summary><b>Are my account credentials safe?</b></summary>
<br>

**Yes.** The plugin never asks for your Real-Debrid password. Your API token stays locally on your machine in Motrix's storage and is only sent to `api.real-debrid.com` via `Authorization: Bearer`.
</details>

---

## 🐛 Issues, Testing & Feedback

* 👉 **[Discussion thread](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/1)**: Join the discussion and share feedback.
* 👉 **[Report a Bug](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=bug_report.yml)**: If a link fails unexpectedly.
* 👉 **[Request a Feature](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=feature_request.yml)**: Suggest improvements.

---

## 🛠️ Building from Source (Developers)

```bash
git clone https://github.com/DonTarken/motrix-plugin-realdebrid.git
cd motrix-plugin-realdebrid

npm test
npm run build
```

Compiled `.moext` packages are output to `dist/`.

---

## 💖 Support the Project

<p align="center">
  <a href="https://ko-fi.com/dontarken" target="_blank">
    <img src="https://storage.ko-fi.com/cdn/kofi3.png?v=3" height="40" alt="Buy Me a Coffee at ko-fi.com" />
  </a>
</p>

---

## 📄 License

Open-source under the **[MIT](LICENSE)** license by **[DonTarken](https://github.com/DonTarken)**.
