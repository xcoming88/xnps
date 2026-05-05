# X-Tunnel (X-NPS & X-NPC) - High Performance Tunneling

X-Tunnel is a high-performance intranet penetration solution built with Node.js. It leverages native `net` modules for efficient TCP data forwarding.

## Architecture
- **Control Channel**: A persistent connection between XNPS and XNPC for real-time command delivery.
- **Tunnel Pairing**: Uses 16-character Session IDs to pair user requests with internal services.
- **Analytics**: Built-in traffic monitoring and visitor IP logging.

## Key Features
- **High Performance**: Native TCP piping ensures minimum overhead and near-wire speed.
- **Visitor Logs**: Real-time capture and logging of visitor IPs accessible via the dashboard.
- **Speed Test**: Integrated module for real-time Upload/Download bandwidth measurement (Mbps).
- **Dynamic Rules**: Supports on-the-fly port mapping updates.

## Getting Started

### 1. Installation
Run `npm install` in the root directory.

### 2. Configuration
Copy `config.example.json` to `config.json` in the following locations:
- **Server & Web**: `web/server/apps/xnps/config.example.json`
- **Client**: `xnpc/config.example.json`

### 3. Running the Components
- **XNPS Server**:
  ```bash
  cd xnps && node xnps_server.js
  ```
- **Web Dashboard**:
  ```bash
  cd web/server/apps/xnps && node xnps.js
  ```
- **XNPC Client**:
  ```bash
  cd xnpc && node xnpc_client.js
  ```
