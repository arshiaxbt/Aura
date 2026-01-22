<p align="center">
  <img src="assets/aura-logo.png" alt="Aura Logo" width="120"/>
</p>

<h1 align="center">Aura - Ethos Network Reputation Extension</h1>

<p align="center">
  <strong>Real-time blockchain reputation and security intelligence, directly in your browser</strong>
</p>

<p align="center">
  <a href="https://youtu.be/N_3zugF_-aw">📺 Watch Demo</a> •
  <a href="https://ethos.network">🌐 Ethos Network</a> •
  <a href="#installation">⚡ Install</a>
</p>

---

## 🎬 Demo Video

[![Aura Demo](https://img.youtube.com/vi/N_3zugF_-aw/maxresdefault.jpg)](https://youtu.be/N_3zugF_-aw)

> Click to watch the full demo video

---

## ✨ Features

### 🔍 Real-Time Address Detection
- Automatically detects Ethereum addresses, ENS names, and Basenames on any webpage
- Supports `0x...` addresses, `.eth` domains, and `.base.eth` Basenames
- Works on Twitter/X, Discord, Etherscan, and any website

### 💫 Instant Hover Tooltips
- Hover over any detected address to see reputation instantly
- View Ethos credibility score (0-2000) with visual tier indicator
- Color-coded rings: 🟢 Green (trusted) | 🟡 Yellow (neutral) | 🔴 Red (warning)
- Quick access to vouch count, reviews, and profile stats

### 🛡️ RiskShield Security Scanner
- Multi-chain security scanning (Ethereum, Base, Arbitrum, BSC, Polygon, Optimism)
- Powered by **GoPlus Security API** and **ScamSniffer Blacklist**
- Detects honeypots, blacklisted addresses, and malicious contracts
- Visual shield indicator: ✅ Safe | ⚠️ Warning | 🚨 Danger

### 🔐 Secret Notes (Encrypted)
- Add private notes to any address directly from hover tooltips
- **AES-256-GCM encryption** with PBKDF2 key derivation
- Password-protected vault with 1-hour auto-lock
- Sync encrypted notes across browsers via Chrome sync storage

### 🎯 Extension Popup Dashboard
- Search any address, ENS, or Basename instantly
- Full profile view with vouches, reviews, and social links
- Quick access to security scan results
- Notes management with list view

---

## 🚀 Installation

### Quick Install (Pre-built)
1. Download `Aura-Final-Extension.zip` from this repo
2. Extract the zip file
3. Open Chrome → `chrome://extensions`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked" → Select the extracted folder
6. Pin Aura to your toolbar!

### Build from Source
```bash
# Clone the repo
git clone https://github.com/arshiaxbt/Aura.git
cd Aura

# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build
```

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | [Plasmo](https://plasmo.com) |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Encryption | Web Crypto API (AES-256-GCM) |
| Icons | Lucide React |

### API Integrations
- **[Ethos Network](https://ethos.network)** - Reputation scores & vouching
- **[GoPlus Security](https://gopluslabs.io)** - Multi-chain security scanning
- **[ScamSniffer](https://scamsniffer.io)** - Scam address blacklist
- **[ENSData](https://ensdata.net)** - ENS resolution
- **Cloudflare ETH DNS** - Backup ENS resolution

---

## 📁 Project Structure

```
src/
├── background/          # Service worker
│   └── index.ts
├── components/          # React components
│   ├── AuraRing.tsx       # Animated reputation ring
│   ├── HudCard.tsx        # Main profile card
│   ├── RiskShield.tsx     # Security scanner
│   ├── SecretNotes.tsx    # Encrypted notes vault
│   ├── NotesListView.tsx  # Notes management
│   └── ...
├── contents/            # Content scripts
│   └── scanner.ts         # Address detection & tooltips
├── hooks/               # Custom React hooks
│   └── useEthosProfile.ts
├── lib/                 # Utilities
│   ├── crypto.ts          # Encryption helpers
│   ├── ethos-client.ts    # API client
│   └── constants.ts
├── popup/               # Extension popup
│   └── index.tsx
└── types/               # TypeScript types
    └── ethos.ts
```

---

## 🔒 Security & Privacy

- **Local Encryption**: Notes are encrypted before leaving your device
- **No Tracking**: We don't collect or store any browsing data
- **Password Protected**: Vault requires password to access notes
- **Auto-Lock**: Session expires after 1 hour of inactivity
- **Open Source**: Full source code available for audit

---

## 🏆 Built for Ethos Vibeathon

This project was built for the [Ethos Network Vibeathon](https://ethos.network).

**Track**: Net-New Product  
**Vertical**: Discovery & Curation

---

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

---

<p align="center">
  Made with 💜 by <a href="https://github.com/arshiaxbt">@arshiaxbt</a>
</p>
