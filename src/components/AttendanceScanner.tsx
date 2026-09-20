// Change ID: LC-CAMERA-STARTUP-v2
// Change ID: LC-MOBILE-CAMERA-v1
// Change ID: LC-P08L-v1
// Change ID: LC-P08E-v1
// Change ID: LC-P08D-v1
// Change ID: LC-UI-COPY-v2
import { uiMessage } from '../lib/uiText'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Expand, Flashlight, FlashlightOff, Minimize, ScanLine, Search, SwitchCamera, TriangleAlert, X } from 'lucide-react'
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

type SearchMember = {
  id: string
  first_name: string
  last_name: string
  member_number: string
  email: string | null
  mobile: string | null
  status: string
}

type CameraDevice = {
  id: string
  label: string
}

type RecentCheckIn = {
  memberName: string
  time: string
}

/*
  This shared queue prevents React Strict Mode from starting a second
  camera instance before the first one has completely stopped.
*/
let scannerShutdown = Promise.resolve()

export default function AttendanceScanner({ event }: Props) {
  const [processing, setProcessing] = useState(false)
  const attemptSequence = useRef(0)
  const releaseTimer = useRef<number | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [matchedMembers, setMatchedMembers] = useState<SearchMember[]>([])
  const [matchTotal, setMatchTotal] = useState(0)
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchRetry, setSearchRetry] = useState(0)
  const [finishedSearchKey, setFinishedSearchKey] = useState('')
  const [selectedMemberEventId, setSelectedMemberEventId] = useState('')
  const currentEventId = useRef(event?.id)
  currentEventId.current = event?.id
  const mounted = useRef(true)
  useEffect(() => {mounted.current=true;return () => {mounted.current=false;attemptSequence.current++;if(releaseTimer.current)clearTimeout(releaseTimer.current)}},[])
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<SearchMember | null>(null)
  const [memberLoadError, setMemberLoadError] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [cameraId, setCameraId] = useState('')
  const [facingMode,setFacingMode]=useState<'user'|'environment'>('environment')
  const [cameraState,setCameraState]=useState<'starting'|'ready'|'error'>('starting')
  const [cameraRetry,setCameraRetry]=useState(0)
  const [torchBusy,setTorchBusy]=useState(false)
  const activeTrack=useRef<MediaStreamTrack|null>(null)
  const activeDevice=useRef('')
  const activeFacing=useRef<'user'|'environment'>('environment')
  const torchLock=useRef(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([])
  const [isKioskMode, setIsKioskMode] = useState(false)
  const processingRef = useRef(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerLayoutRef = useRef<HTMLElement | null>(null)

  const searchKey = JSON.stringify([event?.id,memberSearch.trim(),searchRetry])
  const currentSearchKey = useRef(searchKey)
  currentSearchKey.current = searchKey
  const waitingForSearch = searchBusy || finishedSearchKey!==searchKey

  function notifySuccessfulCheckIn() {
    if ('vibrate' in navigator) {
      navigator.vibrate?.([70, 45, 90])
    }

    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextConstructor) return

    try {
      const audioContext = new AudioContextConstructor()
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime)
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14)

      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.15)
      oscillator.addEventListener('ended', () => void audioContext.close())
    } catch {
      // Audio feedback is an enhancement; a successful check-in must still continue.
    }
  }

  function addRecentCheckIn(memberName: string, time: string) {
    setRecentCheckIns((current) => [
      { memberName, time },
      ...current,
    ].slice(0, 2))
  }

  function attemptIsCurrent(attempt: number, serviceId: string) {
    return mounted.current && attemptSequence.current===attempt && currentEventId.current===serviceId
  }

  function startAttempt() {
    if(!event || !mounted.current || currentEventId.current!==event.id || processingRef.current)return null
    const attempt=++attemptSequence.current
    processingRef.current=true
    setProcessing(true)
    setResult(null)
    return {attempt,serviceId:event.id}
  }

  function finishAttempt(attempt: number, serviceId: string) {
    if(!attemptIsCurrent(attempt,serviceId))return
    setProcessing(false)
    // Keep a short cooldown so a QR held in the frame is not immediately read again.
    releaseTimer.current=window.setTimeout(()=>{
      if(attemptIsCurrent(attempt,serviceId))processingRef.current=false
    },1800)
  }

  async function recordMemberAttendance(member: Pick<SearchMember, 'id' | 'first_name' | 'last_name' | 'status'>, attempt: number, serviceId: string) {
    if(!attemptIsCurrent(attempt,serviceId))return
    const memberName=`${member.first_name} ${member.last_name}`
    if(member.status!=='active'){
      setResult({type:'error',memberName,message:'This member is inactive.'})
      return
    }
    const {error}=await supabase.from('attendance').insert({member_id:member.id,event_id:serviceId})
    if(!attemptIsCurrent(attempt,serviceId))return
    if(error?.code==='23505'){
      setResult({type:'duplicate',memberName,message:'Already checked in for this service.'})
    }else if(error){
      setResult({type:'error',memberName,message:'Check-in could not be confirmed. Please try again. Existing check-ins will not be duplicated.'})
    }else{
      const checkInTime=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date())
      notifySuccessfulCheckIn()
      addRecentCheckIn(memberName,checkInTime)
      setResult({type:'success',memberName,message:'Attendance recorded successfully.',time:checkInTime})
    }
  }

  async function recordAttendance(rawCode: string) {
    const started=startAttempt()
    if(!started)return
    const {attempt,serviceId}=started
    try{
      const token=rawCode.trim().replace(/^att:/,'')
      if(!token){setResult({type:'error',message:'This QR code is not valid.'});return}
      const {data:member,error}=await supabase.from('members')
        .select('id, first_name, last_name, status').eq('qr_token',token).maybeSingle()
      if(!attemptIsCurrent(attempt,serviceId))return
      if(error)throw error
      if(!member){setResult({type:'error',message:'No member was found for this QR code.'});return}
      await recordMemberAttendance(member,attempt,serviceId)
    }catch{
      if(attemptIsCurrent(attempt,serviceId))setResult({type:'error',message:'Check-in could not be confirmed. Please scan again. Existing check-ins will not be duplicated.'})
    }finally{
      finishAttempt(attempt,serviceId)
    }
  }

  useEffect(() => {
    let disposed=false
    const key=searchKey
    const term=memberSearch.trim()
    const isCurrent=() => !disposed && mounted.current && currentSearchKey.current===key
    setMemberLoadError('')
    setMatchedMembers([])
    setMatchTotal(0)
    if(!event || !term || selectedMember) {
      setSearchBusy(false);setFinishedSearchKey(key)
      return () => {disposed=true}
    }
    setSearchBusy(true)
    const timer=window.setTimeout(async () => {
      try {
        const {data,error}=await supabase.rpc('lc_scanner_member_search',{p_search:term})
        if(!isCurrent())return
        if(error)throw error
        if(!data || !Array.isArray(data.rows) || typeof data.total!=='number')throw new Error('Invalid member search response')
        setMatchedMembers(data.rows as SearchMember[])
        setMatchTotal(data.total)
      } catch {
        if(isCurrent())setMemberLoadError('Member search is not available right now. Please try again.')
      } finally {
        if(isCurrent()){setSearchBusy(false);setFinishedSearchKey(key)}
      }
    },300)
    return () => {disposed=true;window.clearTimeout(timer)}
  },[searchKey,selectedMember])

  useEffect(() => {
    attemptSequence.current++
    if(releaseTimer.current)clearTimeout(releaseTimer.current)
    processingRef.current=false
    setProcessing(false)
    setResult(null)
    setRecentCheckIns([])
    setSelectedMember(null)
    setSelectedMemberEventId('')
    setMemberSearch('')
  }, [event?.id])

  useEffect(() => {
    if(!event)return
    let disposed=false
    let scanner:Html5Qrcode|null=null
    let track:MediaStreamTrack|null=null
    setCameraState('starting');setCameraError('');setTorchSupported(false);setTorchOn(false)
    setTorchBusy(false);torchLock.current=false
    async function startCamera(){
      await scannerShutdown
      if(disposed)return
      const reader=document.getElementById('attendance-reader')
      if(!reader)return
      reader.replaceChildren()
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('error')
        setCameraError(!window.isSecureContext
          ? 'Camera access requires HTTPS or localhost. Open this app using a secure URL, then retry.'
          : 'Camera access is not available in this browser. Open the app in a browser with camera support.')
        return
      }
      try{
        scanner=new Html5Qrcode('attendance-reader',{verbose:false})
        await scanner.start(
          cameraId?{deviceId:{exact:cameraId}}:{facingMode},
          {fps:10,qrbox:(width,height)=>{const size=Math.min(250,Math.floor(Math.min(width,height)*.8));return {width:size,height:size}},aspectRatio:1},
          text=>{if(!disposed)void recordAttendance(text)},()=>{},
        )
      }catch(error){
        if(!disposed){
          const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
          let message = 'Could not start this camera. Choose Retry Camera or Switch Camera. If it still fails, check the browser console for the camera error.'
          if (/NotAllowedError|PermissionDeniedError|permission denied/i.test(detail)) {
            message = 'Camera permission was denied. Allow camera access for this site in your browser and system settings, then choose Retry Camera.'
          } else if (/NotFoundError|DevicesNotFoundError/i.test(detail)) {
            message = 'No camera was found. Connect or enable a camera, then choose Retry Camera.'
          } else if (/NotReadableError|TrackStartError|could not start video source/i.test(detail)) {
            message = 'The camera could not be opened. Close other apps or browser tabs using it, then choose Retry Camera.'
          } else if (/OverconstrainedError|ConstraintNotSatisfiedError/i.test(detail)) {
            message = 'The selected camera or camera settings are unavailable. Choose Switch Camera to try another camera.'
          }
          console.error('LifeCity camera startup failed:', error)
          setCameraState('error');setCameraError(message)
        }
        return
      }
      if(disposed)return
      scannerRef.current=scanner
      setCameraState('ready');setCameraError('')
      // Optional metadata must never turn a successful start into an access error.
      try{
        const video=reader.querySelector('video')
        const stream=video?.srcObject as MediaStream|null
        track=stream?.getVideoTracks?.()[0]??null
        activeTrack.current=track
        const settings=track?.getSettings?.()??scanner.getRunningTrackSettings()
        activeDevice.current=settings.deviceId??cameraId
        activeFacing.current=settings.facingMode==='user'?'user':settings.facingMode==='environment'?'environment':facingMode
      }catch{activeDevice.current=cameraId;activeFacing.current=facingMode}
      try{
        const caps=(track?.getCapabilities?.()??scanner.getRunningTrackCapabilities()) as MediaTrackCapabilities & {torch?:boolean|boolean[]}
        setTorchSupported(caps.torch===true || (Array.isArray(caps.torch)&&caps.torch.includes(true)))
      }catch{setTorchSupported(false)}
      // Enumerate after permission, without requesting a second camera stream.
      try{
        void navigator.mediaDevices.enumerateDevices().then(devices=>{
          if(!disposed)setCameras(devices.filter(device=>device.kind==='videoinput'&&device.deviceId).map(device=>({id:device.deviceId,label:device.label})))
        }).catch(()=>{if(!disposed)setCameras([])})
      }catch{if(!disposed)setCameras([])}
    }
    const startup=startCamera()
    return()=>{
      disposed=true
      scannerShutdown=scannerShutdown.then(async()=>{
        await startup
        if(!scanner)return
        if(scannerRef.current===scanner){scannerRef.current=null;activeTrack.current=null}
        try{await scanner.stop()}catch{track?.stop()}
        try{scanner.clear()}catch{/* Reader may already be removed. */}
      })
    }
  },[event?.id,cameraId,facingMode,cameraRetry])

  useEffect(() => {
    function updateKioskMode() {
      setIsKioskMode(document.fullscreenElement === scannerLayoutRef.current)
    }

    document.addEventListener('fullscreenchange', updateKioskMode)
    return () => document.removeEventListener('fullscreenchange', updateKioskMode)
  }, [])

  function switchCamera() {
    if(cameraState==='starting'||torchLock.current)return
    const nextFacing=activeFacing.current==='environment'?'user':'environment'
    const opposite=cameras.find(camera=>camera.id!==activeDevice.current && (nextFacing==='user'?/front|user|facetime/i:/back|rear|environment/i).test(camera.label))
    const currentIndex=cameras.findIndex(camera=>camera.id===activeDevice.current)
    const next=opposite??(cameras.length>1?cameras[(currentIndex+1)%cameras.length]:undefined)
    setCameraState('starting');setCameraError('');setTorchOn(false)
    setCameraId(next?.id??'')
    setFacingMode(nextFacing)
    setCameraRetry(value=>value+1)
  }

  async function toggleTorch() {
    const scanner=scannerRef.current
    const track=activeTrack.current
    if(!scanner || !torchSupported || cameraState!=='ready' || torchLock.current)return
    torchLock.current=true;setTorchBusy(true);setCameraError('')
    const next=!torchOn
    try{
      const settings:MediaTrackConstraintSet & {torch:boolean}={torch:next}
      if(track)await track.applyConstraints({advanced:[settings]})
      else await scanner.applyVideoConstraints({advanced:[settings]})
      if(scannerRef.current===scanner && mounted.current)setTorchOn(next)
    }catch{
      if(scannerRef.current===scanner && mounted.current)setCameraError('This camera could not change its flashlight. Scanning is still available.')
    }finally{
      if(scannerRef.current===scanner && mounted.current){torchLock.current=false;setTorchBusy(false)}
    }
  }

  async function toggleKioskMode() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await scannerLayoutRef.current?.requestFullscreen()
      }
    } catch {
      setCameraError('Full-screen mode could not be opened in this browser.')
    }
  }

  function submitMemberSearch(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if(!selectedMember || !event || selectedMemberEventId!==event.id)return
    const started=startAttempt()
    if(!started)return
    const {attempt,serviceId}=started
    const memberId=selectedMember.id
    setSelectedMember(null)
    setSelectedMemberEventId('')
    setMemberSearch('')
    void (async()=>{
      try{
        const {data:member,error}=await supabase.from('members')
          .select('id, first_name, last_name, status').eq('id',memberId).maybeSingle()
        if(!attemptIsCurrent(attempt,serviceId))return
        if(error)throw error
        if(!member){setResult({type:'error',message:'This member is no longer available. Search again before checking in.'});return}
        await recordMemberAttendance(member,attempt,serviceId)
      }catch{
        if(attemptIsCurrent(attempt,serviceId))setResult({type:'error',message:'Check-in could not be confirmed. Search for this member and try again. Existing check-ins will not be duplicated.'})
      }finally{
        finishAttempt(attempt,serviceId)
      }
    })()
  }

  if (!event) {
    return (
      <section className="scanner-empty">
        <ScanLine size={36} />
        <h2>Select an Event First</h2>
        <p>Choose a service or gathering above before opening the scanner.</p>
      </section>
    )
  }

  return (
    <section ref={scannerLayoutRef} className={`scanner-layout${isKioskMode ? ' is-kiosk-mode' : ''}`}>
      <div className="scanner-camera-heading">
        <div>
          <p className="card-kicker">Camera Scanner</p>
          <h2>Scan Member QR</h2>
          <p>Hold the QR code inside the frame to check in automatically.</p>
        </div>
        <div className="scanner-camera-actions">
          <button
            type="button"
            className={`scanner-camera-switch${isKioskMode ? ' is-active' : ''}`}
            onClick={() => void toggleKioskMode()}
            title={isKioskMode ? 'Exit Kiosk Mode' : 'Open Kiosk Mode'}
          >
            {isKioskMode ? <Minimize size={16} /> : <Expand size={16} />}
            {isKioskMode ? 'Exit Kiosk' : 'Kiosk Mode'}
          </button>
          {(
            <button
              type="button"
              className={`scanner-camera-switch${torchOn ? ' is-active' : ''}`}
              onClick={() => void toggleTorch()}
              disabled={!torchSupported || cameraState!=='ready' || torchBusy}
              aria-label={torchSupported?'Toggle Flashlight':'Flashlight Unavailable on This Camera'}
              title={!torchSupported?'Flashlight is not supported by this camera or browser':torchOn?'Turn Off Flashlight':'Turn On Flashlight'}
              aria-pressed={torchOn}
            >
              {torchOn ? <FlashlightOff size={16} /> : <Flashlight size={16} />}
              {torchOn ? 'Flash On' : 'Flash'}
            </button>
          )}
          {(
            <button
              type="button"
              className="scanner-camera-switch"
              onClick={switchCamera}
              disabled={cameraState==='starting'||torchBusy}
              title="Switch Camera"
            >
              <SwitchCamera size={16} />
              Switch Camera
            </button>
          )}
          {cameraState==='error' && <button type="button" className="scanner-camera-switch" onClick={()=>{setCameraState('starting');setCameraRetry(value=>value+1)}}>Retry Camera</button>}
          <span className={cameraState==='ready'?'scanner-ready-status':'manual-member-search-help'} role="status">
            {cameraState==='ready' && <i/>}{cameraState==='ready'?'Ready':cameraState==='starting'?'Starting Camera…':'Camera Unavailable'}
          </span>
        </div>
      </div>

      <div className="scanner-camera-stage">
        <div id="attendance-reader" className="scanner-reader" />
      </div>

      {recentCheckIns.length > 0 && (
        <div className="scanner-recent-checkins" aria-live="polite">
          <span>Last Checked in</span>
          <div>
            {recentCheckIns.map((checkIn, index) => (
              <p key={`${checkIn.memberName}-${checkIn.time}-${index}`}>
                <strong>{checkIn.memberName}</strong>
                <small>{checkIn.time}</small>
              </p>
            ))}
          </div>
        </div>
      )}

      {cameraError && (
        <div className="scan-result error">
          <TriangleAlert size={28} />
          <p>{uiMessage(cameraError)}</p>
        </div>
      )}

      {processing && <p className="manual-member-search-help" role="status" aria-live="polite">Checking in… Please wait.</p>}

      {result && (
        <div className={`scan-result ${result.type}`} role="status" aria-live="polite">
          {result.type === 'success' ? (
            <CheckCircle2 size={28} />
          ) : (
            <TriangleAlert size={28} />
          )}

          <div>
            {result.memberName && <strong>{result.memberName}</strong>}
            <p>{uiMessage(result.message)}</p>
            {result.time && <span>{result.time}</span>}
          </div>
        </div>
      )}

      <section className="manual-checkin-card">
        <div className="manual-checkin-heading">
          <p>Manual Check-In</p>
          <span>Use member search only when a QR code cannot be scanned.</span>
        </div>

        <form className="manual-member-search" onSubmit={submitMemberSearch}>
          <div className="manual-member-search-input">
            <Search size={18} />
            <input
              value={memberSearch}
              onChange={(event) => {
                setMemberSearch(event.target.value)
                setSelectedMember(null)
              }}
              placeholder="Search Members"
              aria-label="Search for a Member to Check in"
            />
          </div>

          <button className="secondary-button manual-checkin-button" disabled={!selectedMember || selectedMemberEventId!==event.id || processing}>
            {processing ? 'Checking In…' : 'Check In'}
          </button>

          <p className="manual-member-search-help">
            Search by first name, last name, full name, mobile number, member ID, or email.
          </p>

          {memberLoadError && !waitingForSearch && !selectedMember && <div role="alert"><p className="error-message">{memberLoadError}</p><button type="button" className="secondary-button" onClick={()=>setSearchRetry(value=>value+1)}>Try Again</button></div>}

          {selectedMember && (
            <div className="manual-member-selected">
              <div>
                <strong>{selectedMember.first_name} {selectedMember.last_name}</strong>
                <span>{selectedMember.member_number}{selectedMember.email ? ` · ${selectedMember.email}` : ''}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedMember(null)
                  setMemberSearch('')
                }}
                aria-label="Clear Selected Member"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {!selectedMember && memberSearch.trim() && (
            <div className="manual-member-results">
              {waitingForSearch ? (
                <p role="status">Searching members…</p>
              ) : memberLoadError ? null : matchedMembers.length === 0 ? (
                <p role="status">No active members found.</p>
              ) : (
                matchedMembers.map((member) => (
                  <button
                    type="button"
                    key={member.id}
                    onClick={() => {
                      setSelectedMember(member)
                      setSelectedMemberEventId(event.id)
                      setMemberSearch(`${member.first_name} ${member.last_name}`)
                    }}
                  >
                    <strong>{member.first_name} {member.last_name}</strong>
                    <span>{member.member_number}{member.email ? ` · ${member.email}` : ''}</span>
                  </button>
                ))
              )}
              {!waitingForSearch && !memberLoadError && matchTotal>matchedMembers.length && <p className="manual-member-search-help">Showing {matchedMembers.length} of {matchTotal} matches. Add a surname, member ID, email, or mobile number to narrow your search.</p>}
            </div>
          )}
        </form>
      </section>
    </section>
  )
}
