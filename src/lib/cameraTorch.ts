import type { Html5Qrcode } from 'html5-qrcode'

type TorchSettings = MediaTrackSettings & { torch?: boolean }
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean | boolean[] }
type TorchConstraints = MediaTrackConstraints & { torch?: boolean }
export type TorchCamera = Pick<Html5Qrcode, 'getRunningTrackSettings' | 'getRunningTrackCapabilities' | 'applyVideoConstraints'>

/** Read each source independently: optional track APIs can throw on some browsers. */
export function readTorch(camera: TorchCamera, track: MediaStreamTrack | null) {
  let on: boolean | undefined
  for (const read of [() => track?.getSettings(), () => camera.getRunningTrackSettings()]) {
    try { const settings = read() as TorchSettings | undefined; if (typeof settings?.torch === 'boolean') { on = settings.torch; break } } catch { /* Try the scanner's track. */ }
  }
  let advertised: boolean | undefined
  for (const read of [() => track?.getCapabilities?.(), () => camera.getRunningTrackCapabilities()]) {
    try {
      const caps = read() as TorchCapabilities | undefined
      if (caps?.torch === true || (Array.isArray(caps?.torch) && caps.torch.includes(true))) { advertised = true; break }
      if (caps?.torch === false || (Array.isArray(caps?.torch) && !caps.torch.includes(true))) advertised = false
    } catch { /* Optional metadata must not break scanning. */ }
  }
  return { supported: advertised ?? (typeof on === 'boolean'), on }
}

/** Apply to the existing stream only; never acquire another camera for the lamp. */
export async function setCameraTorch(camera: TorchCamera, track: MediaStreamTrack | null, next: boolean, isCurrent: () => boolean = () => true) {
  if (!readTorch(camera, track).supported) throw new Error('Flashlight control is unavailable for this camera. Try another rear camera.')
  let previous: TorchConstraints = {}
  try { previous = { ...track?.getConstraints?.() } } catch { /* Constraints are optional metadata. */ }
  delete previous.torch
  // Preserve constraints such as deviceId and focusMode while updating only torch.
  const advanced = (previous.advanced ?? []).map(item => {
    const copy = { ...item } as MediaTrackConstraintSet & { torch?: boolean }
    delete copy.torch
    return copy
  })
  const torch = { torch: next } as MediaTrackConstraintSet & { torch: boolean }
  const requests: TorchConstraints[] = [
    { ...previous, torch: next, advanced: [...advanced, torch] },
    { ...previous, advanced: [...advanced, torch] },
  ]
  let appliedWithoutSettings = false
  for (const request of requests) {
    if (!isCurrent()) return null
    try {
      if (track?.readyState === 'live') await track.applyConstraints(request)
      else await camera.applyVideoConstraints(request)
      // Some phones publish changed settings shortly after applyConstraints resolves.
      for (let attempt = 0; attempt < 4; attempt++) {
        if (!isCurrent()) return null
        const actual = readTorch(camera, track).on
        if (actual === next) return { on: actual, verified: true }
        if (actual === undefined) { appliedWithoutSettings = true; break }
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 60))
      }
      if (appliedWithoutSettings) return { on: next, verified: false }
    } catch { /* Try the compatible advanced-only request before reporting failure. */ }
  }
  if (!isCurrent()) return null
  throw new Error('The camera did not confirm the flashlight change. Scanning is still available; try another rear camera.')
}
