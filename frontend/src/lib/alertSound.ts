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

/** Soft two-note chime (880 Hz then 1320 Hz), the same sound the CRM uses. Does nothing if the browser blocks audio. */
export function playChime() {
  try {
    const c = audio();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    const t0 = c.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.1, t0 + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.14 + 0.5);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + i * 0.14);
      osc.stop(t0 + i * 0.14 + 0.55);
    });
  } catch {
    /* autoplay policy or no audio device */
  }
}

/** Happy rising arpeggio (C, E, G, high C) for the customer when an order goes through. Quiet failure if audio is blocked. */
export function playSuccess() {
  try {
    const c = audio();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    const t0 = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const start = t0 + i * 0.11;
      const hold = i === 3 ? 0.7 : 0.35;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + hold);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + hold + 0.05);
    });
  } catch {
    /* autoplay policy or no audio device */
  }
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
    // silent: false lets the operating system play its own notification sound too
    const n = new Notification(title, { body, tag, icon: '/sbh-logo.jpg', silent: false });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {
    /* some browsers only allow notifications from a service worker; the toast and chime still work */
  }
}
