# 🔍 Duplicate File Detector Pro

[![Version](https://img.shields.io/badge/version-2.5.0-blue.svg)](https://github.com/your-username/duplicate-file-detector)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-33.2.1-47848F.svg)](https://www.electronjs.org/)

A high-performance, professional desktop application built with **Electron** and **Node.js** designed to identify and eliminate duplicate files with surgical precision. 

Recover your storage space by finding identical files using advanced hashing algorithms, featuring a modern glassmorphism UI.

---

## ✨ Key Features

- **🚀 Dual-Stage Hash Scanning**: 
  - **Fast Scan**: Uses partial MD5 hashing for rapid identification of potential duplicates.
  - **Deep Scan**: Validates matches using full SHA-256 hashing to ensure 100% accuracy.
- **🖼️ Multimedia Preview**: Built-in support for previewing images, videos, audio, and text documents directly within the app.
- **📁 Smart Filters & Category Selection**: 
  - Filter by file type: Images, Videos, Documents, or All.
  - Exclude system directories to protect your OS.
  - Set minimum file size thresholds.
- **🌐 Multilingual Support**: Fully localized interface in **English** and **Spanish**.
- **🎯 Smart Selection Tools**: One-click selection to keep the *Oldest*, *Newest*, or *Shortest Path* versions of your duplicates.
- **🗑️ Safe Deletion**: Choose between moving files to the **Recycle Bin** or **Permanent Deletion**.
- **📊 Exportable Reports**: Generate detailed `.txt` cleaning reports of your scan results.
- **📂 Interactive Explorer**: Custom-built folder browser for easy directory selection.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla CSS (Custom Glassmorphism Design), Vanilla JavaScript.
- **Backend**: Node.js, Express.js (Local API).
- **Desktop Framework**: Electron.
- **Packaging**: Electron Builder.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm (comes with Node.js)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/duplicate-file-detector.git
   cd duplicate-file-detector
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

### Running in Development

To start the application in development mode:
```bash
npm start
```

### Building the Executable

To generate the portable Windows executable:
```bash
npm run build:exe
```
The output will be generated in the `dist/` folder as `Duplicate File Detector Pro.exe`.

---

## 📸 Screenshots

| Dashboard | Scan Results |
| :---: | :---: |
| ![Dashboard Placeholder](https://via.placeholder.com/400x250?text=Dashboard+UI) | ![Results Placeholder](https://via.placeholder.com/400x250?text=Scan+Results+UI) |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/your-username/duplicate-file-detector/issues).

---

*Developed with ❤️ by Duplicate File Detector Pro Team*
