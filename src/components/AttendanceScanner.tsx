import { type FormEvent, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Keyboard, ScanLine, TriangleAlert } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'

type AttendanceEvent = {
  id: string
  name: string
  starts_at: string
}

type ScanResult = {
  type: 'success' | 'duplicate' | 'error'
  message: string
  memberName?: string
  time?: string
}

type Props = {
  event: AttendanceEvent | null
}

/*
  This shared queue prevents React Strict Mode from starting a second
  camera instance before the first one has completely stopped.
*/
let scannerShutdown = Promise.resolve()

export default function AttendanceScanner({ event }: Props) {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [cameraError, setCameraError] = useState('')
  const processingRef = useRef(false)

  async function recordAttendance(rawCode: string) {
    if (!event || processingRef.current) return

    processingRef.current = true
    setResult(null)

    const token = rawCode.trim().replace(/^att:/, '')

    if (!token) {
      setResult({
        type: 'error',
        message: 'This QR code is not valid.',
      })
      processingRef.current = false
      return
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, first_name, last_name, status')
      .eq('qr_token', token)
      .maybeSingle()

    if (memberError || !member) {
      setResult({
        type: 'error',
        message: 'No active member was found for this QR code.',
      })
      processingRef.current = false
      return
    }

    const memberName = `${member.first_name} ${member.last_name}`

    if (member.status !== 'active') {
      setResult({
        type: 'error',
        memberName,
        message: 'This member is inactive.',
      })
      processingRef.current = false
      return
    }

    const { error: attendanceError } = await supabase
      .from('attendance')
      .insert({
        member_id: member.id,
        event_id: event.id,
      })

    if (attendanceError?.code === '23505') {
      setResult({
        type: 'duplicate',
        memberName,
        message: 'Already checked in for this event.',
      })
    } else if (attendanceError) {
      setResult({
        type: 'error',
        memberName,
        message: attendanceError.message,
      })
    } else {
      setResult({
        type: 'success',
        memberName,
        message: 'Attendance recorded successfully.',
        time: new Intl.DateTimeFormat('en-PH', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date()),
      })
    }

    window.setTimeout(() => {
      processingRef.current = false
    }, 1800)
  }

  useEffect(() => {
    if (!event) return

    let disposed = false
    let scanner: Html5Qrcode | null = null

    async function startCamera() {
      await scannerShutdown

      if (disposed) return

      const reader = document.getElementById('attendance-reader')

      if (!reader) return

      reader.replaceChildren()
      setCameraError('')

      scanner = new Html5Qrcode('attendance-reader', {
        verbose: false,
      })

      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            void recordAttendance(decodedText)
          },
          () => {
            // Normal failed frames are ignored while the camera keeps scanning.
          },
        )
      } catch {
        setCameraError(
          'Camera access was not available. Allow camera permission, or use the manual token field below.',
        )
      }
    }

    void startCamera()

    return () => {
      disposed = true

      scannerShutdown = scannerShutdown.then(async () => {
        if (!scanner) return

        try {
          await scanner.stop()
        } catch {
          // Scanner may already be stopped.
        }

        try {
          await scanner.clear()
        } catch {
          // Clearing an already removed scanner is safe to ignore.
        }
      })
    }
  }, [event?.id])

  function submitManualCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!manualCode.trim()) return

    void recordAttendance(manualCode)
    setManualCode('')
  }

  if (!event) {
    return (
      <section className="scanner-empty">
        <ScanLine size={36} />
        <h2>Select an event first</h2>
        <p>Choose a service or gathering above before opening the scanner.</p>
      </section>
    )
  }

  return (
    <section className="scanner-layout">
      <div className="scanner-event">
        <span>Currently checking in</span>
        <strong>{event.name}</strong>
      </div>

      <div id="attendance-reader" className="scanner-reader" />

      {cameraError && (
        <div className="scan-result error">
          <TriangleAlert size={28} />
          <p>{cameraError}</p>
        </div>
      )}

      {result && (
        <div className={`scan-result ${result.type}`}>
          {result.type === 'success' ? (
            <CheckCircle2 size={28} />
          ) : (
            <TriangleAlert size={28} />
          )}

          <div>
            {result.memberName && <strong>{result.memberName}</strong>}
            <p>{result.message}</p>
            {result.time && <span>{result.time}</span>}
          </div>
        </div>
      )}

      <form className="manual-scan-form" onSubmit={submitManualCode}>
        <Keyboard size={18} />

        <input
          value={manualCode}
          onChange={(event) => setManualCode(event.target.value)}
          placeholder="Manual QR token fallback"
        />

        <button className="secondary-button">Check in</button>
      </form>
    </section>
  )
}