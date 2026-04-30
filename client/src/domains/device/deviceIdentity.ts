interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    platform?: string;
  };
}

function sanitizeIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of Array.from(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function createDeviceId(): string {
  return `d_${crypto.randomUUID()}`;
}

export function createLocalUserId(deviceId: string): string {
  return `u_local_${sanitizeIdSegment(deviceId)}`;
}

export function createSaltBase64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(bytes);
}

export function guessDeviceName(): string {
  if (typeof navigator === "undefined") {
    return "TATAC Device";
  }

  const nav = navigator as NavigatorWithUserAgentData;
  const candidate =
    (nav.userAgentData?.platform && `TATAC ${nav.userAgentData.platform}`) ||
    (navigator.platform && `TATAC ${navigator.platform}`) ||
    "TATAC Device";

  return candidate.slice(0, 128);
}
