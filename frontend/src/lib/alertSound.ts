/** Chime and desktop notifications for the admin. No audio file needed: the chime is synthesised. */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Browsers only allow sound after a click or key press; call this from one. */
export function unlockAudio() {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume();
}

/** Two rising notes, like a shop doorbell. Safe to call anywhere: it does nothing if sound is blocked. */
export function playChime() {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  [[659.25, 0], [987.77, 0.16], [1318.51, 0.34]].forEach(([freq, offset]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.55);
    osc.connect(gain).connect(c.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.6);
  });
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function askNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'default') {
    try { return await Notification.requestPermission(); } catch { return Notification.permission; }
  }
  return Notification.permission;
}

export function showDesktopNotification(title: string, body: string, tag: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, tag, icon: '/sbh-logo.jpg' });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {
    /* some browsers only allow notifications from a service worker; the toast and chime still work */
  }
}
