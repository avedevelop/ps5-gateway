// Finds the PC's LAN IPv4 address (the one the PS5 can reach).
// Skips virtual adapters (VPN, Hyper-V, WSL, VirtualBox, Docker) and link-local addresses.
import { networkInterfaces } from 'node:os';

const VIRTUAL = /vpn|virtual|vethernet|vmware|vbox|hyper-v|wsl|docker|loopback|tap|tun|tailscale|zerotier|radmin|hamachi|parsec/i;

/** All private IPv4 candidates, best first. */
export function lanCandidates() {
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue;
      const priv = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      if (!priv) continue;
      out.push({ name, address: a.address, virtual: VIRTUAL.test(name) });
    }
  }
  // physical first, then 192.168/10 before 172.16
  return out.sort((x, y) => Number(x.virtual) - Number(y.virtual) || (x.address.startsWith('172.') ? 1 : 0) - (y.address.startsWith('172.') ? 1 : 0));
}

/** Configured value wins; otherwise the best candidate, or '' if none. */
export function detectLanIp(configured) {
  if (configured && configured.trim()) return configured.trim();
  return lanCandidates()[0]?.address ?? '';
}
