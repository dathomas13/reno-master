/**
 * The in-app camera, an alternative to handing the shot off to the system camera app.
 *
 * Why this exists: the system camera app probes every lens on start-up, and a phone with
 * one broken lens crashes right there, before a photo can be taken. `getUserMedia` lets
 * this app open exactly one named lens instead, so a broken one can simply be avoided.
 */

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

export function customCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Every camera the device reports. Labels are empty until permission was granted once,
 * so this asks for it - briefly, and the stream is closed again right away - the first
 * time it is called without labels.
 */
export async function listCameraDevices(): Promise<CameraDeviceOption[]> {
  if (!customCameraSupported()) return [];
  let cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  if (cams.some((cam) => !cam.label)) {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true });
      probe.getTracks().forEach((track) => track.stop());
      cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch {
      // permission refused - the unlabelled list below is still better than nothing
    }
  }
  return cams.map((cam, index) => ({ deviceId: cam.deviceId, label: cam.label || `Kamera ${index + 1}` }));
}
