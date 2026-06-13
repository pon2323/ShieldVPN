const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class SingBoxRunner {
  constructor({ userData, log, status }) {
    this.userData = userData;
    this.log = log || (() => {});
    this.status = status || (() => {});
    this.proc = null;
  }

  enginePath() {
    // В packaged-приложении extraResources попадает в process.resourcesPath.
    const packaged = path.join(process.resourcesPath || '', 'engines', 'sing-box.exe');
    const dev = path.join(__dirname, '..', 'engines', 'sing-box.exe');
    if (fs.existsSync(packaged)) return packaged;
    if (fs.existsSync(dev)) return dev;
    return null;
  }

  engineStatus() {
    const engine = this.enginePath();
    return {
      ok: Boolean(engine),
      path: engine,
      message: engine
        ? 'sing-box.exe найден. Реальный VPN-режим доступен.'
        : 'sing-box.exe не найден. Положи его в client/engines/sing-box.exe и пересобери приложение.'
    };
  }

  async start(config) {
    if (this.proc) await this.stop();

    const engine = this.enginePath();
    if (!engine) {
      throw new Error('VPN-core не найден: нет engines/sing-box.exe. Без него реальный VPN невозможен.');
    }

    const dir = path.join(this.userData, 'runtime');
    fs.mkdirSync(dir, { recursive: true });
    const configPath = path.join(dir, 'sing-box-config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    this.log(`ENGINE: ${engine}`);
    this.log(`CONFIG: ${configPath}`);
    this.status('connecting');

    this.proc = spawn(engine, ['run', '-c', configPath], {
      cwd: dir,
      windowsHide: true
    });

    this.proc.stdout.on('data', (data) => this.log(data.toString().trim()));
    this.proc.stderr.on('data', (data) => this.log(data.toString().trim()));

    this.proc.on('exit', (code) => {
      this.log(`ENGINE EXIT: ${code}`);
      this.status(code === 0 ? 'disconnected' : 'error');
      this.proc = null;
    });

    await wait(900);
    if (this.proc) this.status('connected');
  }

  async stop() {
    if (!this.proc) {
      this.status('disconnected');
      return;
    }
    this.status('disconnecting');
    const p = this.proc;
    this.proc = null;
    try { p.kill(); } catch (_) {}
    await wait(450);
    this.status('disconnected');
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { SingBoxRunner };
