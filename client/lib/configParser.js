const { URL } = require('url');

async function parseInputToConfig(raw) {
  const input = String(raw || '').trim();

  if (input === 'VPN-2026-FREE-KEY') {
    return { demo: true };
  }

  if (input.startsWith('{')) {
    const json = JSON.parse(input);
    if (!json.inbounds || !json.outbounds) throw new Error('Это JSON, но не похож на полный sing-box config: нужны inbounds и outbounds.');
    return { protocol: 'sing-box-json', name: 'Custom sing-box config', config: json };
  }

  let outbound;
  let protocol;
  let name;

  if (/^vless:\/\//i.test(input)) {
    ({ outbound, name } = parseVless(input)); protocol = 'vless';
  } else if (/^vmess:\/\//i.test(input)) {
    ({ outbound, name } = parseVmess(input)); protocol = 'vmess';
  } else if (/^trojan:\/\//i.test(input)) {
    ({ outbound, name } = parseTrojan(input)); protocol = 'trojan';
  } else if (/^ss:\/\//i.test(input)) {
    ({ outbound, name } = parseShadowsocks(input)); protocol = 'shadowsocks';
  } else {
    throw new Error('Формат ключа не поддержан. Сейчас поддерживаются vless://, vmess://, trojan://, ss://, subscription URL и sing-box JSON.');
  }

  return { protocol, name, config: buildTunConfig(outbound) };
}

function buildTunConfig(proxyOutbound) {
  proxyOutbound.tag = 'proxy';

  return {
    log: { level: 'info', timestamp: true },
    dns: {
      servers: [
        { tag: 'cloudflare', address: 'https://1.1.1.1/dns-query', detour: 'proxy' },
        { tag: 'local', address: 'local' }
      ],
      final: 'cloudflare'
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'ShieldVPN',
        address: ['172.19.0.1/30'],
        mtu: 9000,
        auto_route: true,
        strict_route: true,
        stack: 'mixed',
        sniff: true
      }
    ],
    outbounds: [
      proxyOutbound,
      { type: 'direct', tag: 'direct' },
      { type: 'block', tag: 'block' }
    ],
    route: {
      auto_detect_interface: true,
      final: 'proxy'
    }
  };
}

function parseVless(link) {
  const u = new URL(link);
  const name = decodeURIComponent((u.hash || '').replace(/^#/, '')) || 'VLESS Server';
  const q = u.searchParams;
  const security = q.get('security') || 'none';
  const type = q.get('type') || 'tcp';

  const outbound = {
    type: 'vless',
    server: u.hostname,
    server_port: Number(u.port || 443),
    uuid: decodeURIComponent(u.username),
    flow: q.get('flow') || undefined
  };

  if (security === 'tls' || security === 'reality') {
    outbound.tls = {
      enabled: true,
      server_name: q.get('sni') || q.get('serverName') || u.hostname,
      insecure: q.get('allowInsecure') === '1'
    };
    if (security === 'reality') {
      outbound.tls.reality = {
        enabled: true,
        public_key: q.get('pbk') || '',
        short_id: q.get('sid') || ''
      };
      if (q.get('fp')) outbound.tls.utls = { enabled: true, fingerprint: q.get('fp') };
    }
  }

  addTransport(outbound, type, q, u.hostname);
  cleanup(outbound);
  return { outbound, name };
}

function parseTrojan(link) {
  const u = new URL(link);
  const q = u.searchParams;
  const name = decodeURIComponent((u.hash || '').replace(/^#/, '')) || 'Trojan Server';
  const outbound = {
    type: 'trojan',
    server: u.hostname,
    server_port: Number(u.port || 443),
    password: decodeURIComponent(u.username),
    tls: {
      enabled: true,
      server_name: q.get('sni') || q.get('peer') || u.hostname,
      insecure: q.get('allowInsecure') === '1'
    }
  };
  addTransport(outbound, q.get('type') || 'tcp', q, u.hostname);
  cleanup(outbound);
  return { outbound, name };
}

function parseVmess(link) {
  const body = link.replace(/^vmess:\/\//i, '');
  const json = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  const outbound = {
    type: 'vmess',
    server: json.add,
    server_port: Number(json.port),
    uuid: json.id,
    security: json.scy || json.security || 'auto',
    alter_id: Number(json.aid || 0)
  };
  if (json.tls === 'tls') {
    outbound.tls = { enabled: true, server_name: json.sni || json.host || json.add, insecure: false };
  }

  const q = new URLSearchParams();
  if (json.path) q.set('path', json.path);
  if (json.host) q.set('host', json.host);
  if (json.sni) q.set('sni', json.sni);
  addTransport(outbound, json.net || 'tcp', q, json.add);
  cleanup(outbound);
  return { outbound, name: json.ps || 'VMess Server' };
}

function parseShadowsocks(link) {
  const clean = link.replace(/^ss:\/\//i, '');
  const [withoutHash, hash] = clean.split('#');
  const name = hash ? decodeURIComponent(hash) : 'Shadowsocks Server';

  let userHost = withoutHash;
  const atIndex = withoutHash.lastIndexOf('@');

  if (atIndex === -1) {
    const decoded = Buffer.from(withoutHash.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    userHost = decoded;
  } else {
    const left = withoutHash.slice(0, atIndex);
    const right = withoutHash.slice(atIndex + 1);
    try {
      const decodedLeft = Buffer.from(left.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      userHost = `${decodedLeft}@${right}`;
    } catch (_) {}
  }

  const finalAt = userHost.lastIndexOf('@');
  if (finalAt === -1) throw new Error('Не удалось разобрать ss:// ключ.');
  const cred = userHost.slice(0, finalAt);
  const hostPort = userHost.slice(finalAt + 1).split('?')[0];
  const [method, password] = cred.split(':');
  const port = Number(hostPort.split(':').pop());
  const server = hostPort.replace(/:\d+$/, '');

  return {
    name,
    outbound: {
      type: 'shadowsocks',
      server,
      server_port: port,
      method,
      password
    }
  };
}

function addTransport(outbound, type, q, host) {
  if (!type || type === 'tcp') return;

  if (type === 'ws') {
    outbound.transport = {
      type: 'ws',
      path: q.get('path') || '/',
      headers: q.get('host') ? { Host: q.get('host') } : undefined
    };
  }

  if (type === 'grpc') {
    outbound.transport = {
      type: 'grpc',
      service_name: q.get('serviceName') || q.get('service_name') || ''
    };
  }

  if (type === 'http' || type === 'h2') {
    outbound.transport = {
      type: 'http',
      host: q.get('host') ? [q.get('host')] : [host],
      path: q.get('path') || '/'
    };
  }
}

function cleanup(obj) {
  Object.keys(obj).forEach((key) => {
    if (obj[key] === undefined || obj[key] === '') delete obj[key];
    else if (typeof obj[key] === 'object' && obj[key] !== null) cleanup(obj[key]);
  });
}

module.exports = { parseInputToConfig };
