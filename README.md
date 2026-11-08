# Real-Debrid Resolver Plugin for Motrix ⚡

<p align="center">
  <b>Unrestrict and download files at full gigabit fiber speed within Motrix's sleek, modern UI.</b>
</p>

<p align="center">
  <a href="https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest"><img src="https://img.shields.io/github/v/release/DonTarken/motrix-plugin-realdebrid?label=Latest%20Release&color=success&style=for-the-badge" alt="Latest Release" /></a>
  <a href="https://motrix.app"><img src="https://img.shields.io/badge/Motrix-%3E%3D%202.0.0-orange?style=for-the-badge" alt="Motrix 2.0+" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" /></a>
  <a href="https://github.com/sponsors/DonTarken"><img src="https://img.shields.io/badge/Sponsor-%E2%99%A5-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" /></a>
  <a href="https://ko-fi.com/dontarken"><img src="https://img.shields.io/badge/Ko--fi-Support-F16061?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Ko-fi" /></a>
</p>

<p align="center">
  <a href="README.fr.md">🇫🇷 Lire en Français</a> &nbsp;|&nbsp; 🇬🇧 <b>English</b>
</p>

---

## ⚡ Why Use This Plugin?

Do you use **Motrix** as your daily download manager and hold a **Real-Debrid** premium subscription?

This official community plugin (`.moext`) transforms Motrix into a modern, ultra-lightweight alternative to **JDownloader**:
- **100% Automatic Unrestricting**: Paste any supported link (1fichier, Rapidgator, Mega, Turbobit, Katfile, DDownload, etc.), and Motrix instantly resolves the direct high-speed CDN stream.
- **Max Throughput**: Saturates your gigabit fiber connection (up to 100+ MB/s) powered by Motrix's Aria2 multi-connection engine.
- **Easy Configuration**: Simply paste your personal API token into the extension settings.
- **100% Autonomous**: Runs natively inside vanilla Motrix 2.0+ with zero core modifications or external daemons required.

---

## 🚀 Quick Installation Guide

### Step 1: Install the Extension in Motrix

#### ⚡ Method A: Drag & Drop (Fastest)
1. Download the latest **`realdebrid-resolver.moext`** from [GitHub Releases](https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest).
2. Open **Motrix** and simply **drag and drop** the downloaded `.moext` file directly onto the Motrix window.
3. Review requested permissions (*http*, *notify*, *storage*) and click **Install**.

#### 🌐 Method B: Directly via GitHub
1. In Motrix, navigate to the **"Extensions"** tab in the left sidebar (📦 icon).
2. Click the **`+`** button in the upper-right corner.
3. Enter:
   ```text
   DonTarken/motrix-plugin-realdebrid
   ```
4. Click **Confirm** to download and install.

---

### Step 2: Configure Your Real-Debrid API Token

1. Go to your official Real-Debrid token page:  
   👉 **[https://real-debrid.com/apitoken](https://real-debrid.com/apitoken)**
2. Copy your secret API token.
3. In Motrix, open **Extensions** ➔ **Real-Debrid Resolver** ➔ **Settings** tab.
4. Paste your token into the **Real-Debrid API Token** field.
5. Click **Apply** (or save).

---

## 🎯 How It Works

1. In Motrix, click the **`+`** button to add a new task.
2. Paste any supported file hoster link (e.g. `https://rapidgator.net/file/...` or `https://1fichier.com/?...`).
3. The plugin intercepts the URL in real time, requests a high-speed direct download link from Real-Debrid, and hands it off to Aria2.
4. Your download begins immediately at maximum speed!

---

## 📋 Features

- ⚡ **Real-time Link Resolution**: Seamless interception via Motrix's official `beforeCreate` hook.
- 💾 **Smart Domain Caching**: Automatically syncs and caches supported hosters (1 hour TTL) to minimize latency.
- 🔔 **Desktop Notifications**: Optional desktop alerts when links are unlocked or if token issues occur.
- 🔒 **Privacy-First**: Zero tracking. Direct HTTPS communication between your local Motrix and the official Real-Debrid API.

---

## 💖 Support & Contributions

If this plugin saves you time and bandwidth, consider supporting its development:

- 💖 **[Sponsor on GitHub](https://github.com/sponsors/DonTarken)**
- ☕ **[Buy me a Coffee on Ko-fi](https://ko-fi.com/dontarken)**

---

## 📄 License

MIT © [DonTarken](https://github.com/DonTarken)
