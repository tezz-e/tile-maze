import type { NtpPingMsg, NtpPongMsg } from '@tiltmaze/protocol';

/**
 * Handles 4-timestamp NTP Ping from client and constructs the NTP Pong response.
 * t0 = clientSendTime
 * t1 = serverReceiveTime
 * t2 = serverSendTime
 */
export function handleNtpPing(ping: NtpPingMsg): NtpPongMsg {
  const serverReceiveTime = Date.now();
  const serverSendTime = Date.now();

  return {
    type: 'NTP_PONG',
    clientSendTime: ping.clientSendTime,
    serverReceiveTime,
    serverSendTime,
  };
}
