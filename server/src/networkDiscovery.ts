import os from 'node:os';

export interface LanInterface {
  name: string;
  ip: string;
  priority: number;
}

const IGNORED_INTERFACE_PATTERNS = [
  /wsl/i,
  /docker/i,
  /vethernet/i,
  /virtualbox/i,
  /vbox/i,
  /vmware/i,
  /hyper-v/i,
  /tap/i,
  /tun/i,
  /loopback/i,
  /teredo/i,
  /npcap/i,
  /bluetooth/i,
];

function isPrivateIpv4(ip: string): boolean {
  // 10.0.0.0 – 10.255.255.255
  if (/^10\./.test(ip)) return true;
  // 172.16.0.0 – 172.31.255.255
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  // 192.168.0.0 – 192.168.255.255
  if (/^192\.168\./.test(ip)) return true;
  return false;
}

function calculatePriority(interfaceName: string, ip: string): number {
  const lowerName = interfaceName.toLowerCase();
  // Highest priority: Wi-Fi / WLAN interfaces (standard for mobile pairing hotspot / Wi-Fi)
  if (lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('wireless')) {
    return 100;
  }
  // Secondary priority: Physical Ethernet
  if (lowerName.includes('ethernet') || lowerName.includes('eth') || lowerName.includes('en0')) {
    return 80;
  }
  // Standard private subnet
  if (isPrivateIpv4(ip)) {
    return 50;
  }
  return 10;
}

/**
 * Discovers and ranks local network IPv4 interfaces, stripping out virtual adapters.
 */
export function getLanInterfaces(): LanInterface[] {
  const interfaces = os.networkInterfaces();
  const validList: LanInterface[] = [];

  for (const [name, netList] of Object.entries(interfaces)) {
    if (!netList) continue;

    // Check if interface matches ignored virtual network adapters
    const isIgnored = IGNORED_INTERFACE_PATTERNS.some((pattern) => pattern.test(name));
    if (isIgnored) continue;

    for (const net of netList) {
      // Must be IPv4 and not loopback
      const isIpv4 = net.family === 'IPv4' || (net.family as unknown as number) === 4;
      if (!isIpv4 || net.internal) continue;

      // Ignore APIPA autoconfig 169.254.x.x
      if (net.address.startsWith('169.254.')) continue;

      // Check private IPv4
      if (isPrivateIpv4(net.address)) {
        validList.push({
          name,
          ip: net.address,
          priority: calculatePriority(name, net.address),
        });
      }
    }
  }

  // Sort descending by priority
  validList.sort((a, b) => b.priority - a.priority);
  return validList;
}

/**
 * Returns the single best LAN IPv4 address for QR code generation and mobile client pairing.
 * Falls back to '127.0.0.1' if disconnected or offline.
 */
export function getPrimaryLanIp(): string {
  const interfaces = getLanInterfaces();
  if (interfaces.length > 0) {
    return interfaces[0].ip;
  }
  return '127.0.0.1';
}
