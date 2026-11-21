# 🚀 Duplicate File Detector Pro

**Duplicate File Detector Pro** es una potente aplicación de escritorio desarrollada con **Electron** y **Express** diseñada para encontrar y eliminar archivos duplicados basándose en su contenido exacto (Hash), no solo en su nombre.

---

## 🇪🇸 Características Principales

- **🔍 Escaneo Inteligente**: Detecta duplicados mediante comparación de tamaño exacto y hashes criptográficos (MD5/SHA-256).
- **🖼️ Vista Previa Multimedia**: Panel lateral para previsualizar imágenes, vídeos, audio y documentos antes de eliminarlos.
- **🛡️ Seguridad del Sistema**: Exclusión automática de carpetas críticas (Windows, Program Files, node_modules).
- **♻️ Borrado Seguro**: Soporte para Papelera de Reciclaje de Windows o eliminación permanente con doble confirmación.
- **📏 Selección Inteligente**: Botones rápidos para mantener el archivo más antiguo, el más reciente o la ruta más corta.
- **🌐 Multilingüe**: Selector de idiomas dinámico (Español / Inglés).
- **📊 Informes**: Exportación de resultados de limpieza en formato `.txt`.
- **🚀 Portable**: Ejecutable único sin necesidad de instalación.

---

## 🇬🇧 Key Features

- **🔍 Intelligent Scanning**: Detects duplicates via exact size comparison and cryptographic hashes (MD5/SHA-256).
- **🖼️ Multimedia Preview**: Side panel to preview images, videos, audio, and documents before deletion.
- **🛡️ System Safety**: Automatic exclusion of critical folders (Windows, Program Files, node_modules).
- **♻️ Safe Deletion**: Support for Windows Recycle Bin or permanent deletion with double confirmation.
- **📏 Smart Selection**: Quick buttons to keep the oldest, newest, or shortest path file.
- **🌐 Multilingual**: Dynamic language switcher (English / Spanish).
- **📊 Reporting**: Export cleaning results in `.txt` format.
- **🚀 Portable**: Single executable, no installation required.

---

## 🛠️ Instalación y Desarrollo | Installation & Development

### Requisitos | Prerequisites
- [Node.js](https://nodejs.org/) (v18 o superior recomendado)
- [npm](https://www.npmjs.com/)

### Ejecutar en modo desarrollo | Run in Development
```bash
# Instalar dependencias | Install dependencies
npm install

# Iniciar aplicación | Start application
npm start
```

### Compilar el ejecutable | Build Executable
```bash
# Generar el ejecutable portable en /dist | Generate portable exe in /dist
npm run build:exe
```

---

## 📦 Tecnologías | Tech Stack
- **Electron**: Framework de escritorio.
- **Node.js & Express**: Servidor interno y gestión de archivos.
- **Electron Builder**: Empaquetado nativo y portable.
- **PowerShell Integration**: Gestión de papelera en Windows.

---
*Desarrollado con ❤️ para optimizar tu almacenamiento.*
