import { uiMessage } from '../lib/uiText';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Expand,
  LoaderCircle,
  Minimize,
  ScanLine,
  Search,
  SwitchCamera,
  TriangleAlert,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import './attendance-scanner.css';

type AttendanceEvent = {
  id: string;
  name: string;
  starts_at: string;
};

type ScanResult = {
  type: 'success' | 'duplicate' | 'error';
  message: string;
  memberName?: string;
  time?: string;
};

type Props = {
  event: AttendanceEvent | null;
  onCheckIn?: (serviceId: string) => void;
  checkInCount?: number;
};

type SearchMember = {
  id: string;
  first_name: string;
  last_name: string;
  member_number: string;
  email: string | null;
  mobile: string | null;
  status: string;
};

type CameraDevice = {
  id: string;
  label: string;
};

type RecentCheckIn = {
  memberName: string;
  time: string;
};

let scannerShutdown = Promise.resolve();

export default function AttendanceScanner({ event, onCheckIn, checkInCount }: Props) {
  const id = useId();
  const checkInCallback = useRef(onCheckIn);
  checkInCallback.current = onCheckIn;
  const manualInput = useRef<HTMLInputElement>(null);
  const [manualOpen, setManualOpen] = useState(() => !matchMedia('(max-width:900px)').matches);
  const [coolingDown, setCoolingDown] = useState(false);
  useEffect(() => {
    const media = matchMedia('(min-width:901px)');
    const expand = () => {
      if (media.matches) setManualOpen(true);
    };
    media.addEventListener('change', expand);
    return () => media.removeEventListener('change', expand);
  }, []);
  const [processing, setProcessing] = useState(false);
  const attemptSequence = useRef(0);
  const releaseTimer = useRef<number | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [matchedMembers, setMatchedMembers] = useState<SearchMember[]>([]);
  const [matchTotal, setMatchTotal] = useState(0);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);
  const [finishedSearchKey, setFinishedSearchKey] = useState('');
  const [selectedMemberEventId, setSelectedMemberEventId] = useState('');
  const currentEventId = useRef(event?.id);
  currentEventId.current = event?.id;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attemptSequence.current++;
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
    };
  }, []);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<SearchMember | null>(null);
  const [memberLoadError, setMemberLoadError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraId, setCameraId] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'error'>('starting');
  const [cameraRetry, setCameraRetry] = useState(0);
  const activeDevice = useRef('');
  const activeFacing = useRef<'user' | 'environment'>('environment');
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [isKioskMode, setIsKioskMode] = useState(false);
  const kioskButtonRef = useRef<HTMLButtonElement>(null);
  const nativeKiosk = useRef(false);
  const processingRef = useRef(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerLayoutRef = useRef<HTMLElement | null>(null);

  const searchKey = JSON.stringify([event?.id, memberSearch.trim(), searchRetry]);
  const currentSearchKey = useRef(searchKey);
  currentSearchKey.current = searchKey;
  const waitingForSearch = searchBusy || finishedSearchKey !== searchKey;

  function notifySuccessfulCheckIn() {
    if ('vibrate' in navigator) {
      navigator.vibrate?.([70, 45, 90]);
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) return;

    try {
      const audioContext = new AudioContextConstructor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.15);
      oscillator.addEventListener('ended', () => void audioContext.close());
    } catch {}
  }

  function addRecentCheckIn(memberName: string, time: string) {
    setRecentCheckIns((current) => [{ memberName, time }, ...current].slice(0, 3));
  }

  function attemptIsCurrent(attempt: number, serviceId: string) {
    return (
      mounted.current && attemptSequence.current === attempt && currentEventId.current === serviceId
    );
  }

  function startAttempt() {
    if (!event || !mounted.current || currentEventId.current !== event.id || processingRef.current)
      return null;
    const attempt = ++attemptSequence.current;
    processingRef.current = true;
    setProcessing(true);
    setResult(null);
    return { attempt, serviceId: event.id };
  }

  function finishAttempt(attempt: number, serviceId: string) {
    if (!attemptIsCurrent(attempt, serviceId)) return;
    setProcessing(false);
    setCoolingDown(true);

    releaseTimer.current = window.setTimeout(() => {
      if (attemptIsCurrent(attempt, serviceId)) {
        processingRef.current = false;
        setCoolingDown(false);
      }
    }, 1800);
  }

  async function recordMemberAttendance(
    member: Pick<SearchMember, 'id' | 'first_name' | 'last_name' | 'status'>,
    attempt: number,
    serviceId: string,
  ) {
    if (!attemptIsCurrent(attempt, serviceId)) return;
    const memberName = `${member.first_name} ${member.last_name}`;
    if (member.status !== 'active') {
      setResult({ type: 'error', memberName, message: 'This member is inactive.' });
      return;
    }
    const { error } = await supabase
      .from('attendance')
      .insert({ member_id: member.id, event_id: serviceId });
    if (!attemptIsCurrent(attempt, serviceId)) return;
    if (error?.code === '23505') {
      setResult({ type: 'duplicate', memberName, message: 'Already checked in for this service.' });
    } else if (error) {
      setResult({
        type: 'error',
        memberName,
        message:
          'Check-in could not be confirmed. Please try again. Existing check-ins will not be duplicated.',
      });
    } else {
      const checkInTime = new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());
      notifySuccessfulCheckIn();
      addRecentCheckIn(memberName, checkInTime);
      setResult({
        type: 'success',
        memberName,
        message: 'Attendance recorded successfully.',
        time: checkInTime,
      });

      try {
        checkInCallback.current?.(serviceId);
      } catch {}
    }
  }

  async function recordAttendance(rawCode: string) {
    const started = startAttempt();
    if (!started) return;
    const { attempt, serviceId } = started;
    try {
      const token = rawCode.trim().replace(/^att:/, '');
      if (!token) {
        setResult({ type: 'error', message: 'This QR code is not valid.' });
        return;
      }
      const { data: member, error } = await supabase
        .from('members')
        .select('id, first_name, last_name, status')
        .eq('qr_token', token)
        .maybeSingle();
      if (!attemptIsCurrent(attempt, serviceId)) return;
      if (error) throw error;
      if (!member) {
        setResult({ type: 'error', message: 'No member was found for this QR code.' });
        return;
      }
      await recordMemberAttendance(member, attempt, serviceId);
    } catch {
      if (attemptIsCurrent(attempt, serviceId))
        setResult({
          type: 'error',
          message:
            'Check-in could not be confirmed. Please scan again. Existing check-ins will not be duplicated.',
        });
    } finally {
      finishAttempt(attempt, serviceId);
    }
  }

  useEffect(() => {
    let disposed = false;
    const key = searchKey;
    const term = memberSearch.trim();
    const isCurrent = () => !disposed && mounted.current && currentSearchKey.current === key;
    setMemberLoadError('');
    setMatchedMembers([]);
    setMatchTotal(0);
    if (!event || !term || selectedMember) {
      setSearchBusy(false);
      setFinishedSearchKey(key);
      return () => {
        disposed = true;
      };
    }
    setSearchBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('lc_scanner_member_search', { p_search: term });
        if (!isCurrent()) return;
        if (error) throw error;
        if (!data || !Array.isArray(data.rows) || typeof data.total !== 'number')
          throw new Error('Invalid member search response');
        setMatchedMembers(data.rows as SearchMember[]);
        setMatchTotal(data.total);
      } catch {
        if (isCurrent())
          setMemberLoadError('Member search is not available right now. Please try again.');
      } finally {
        if (isCurrent()) {
          setSearchBusy(false);
          setFinishedSearchKey(key);
        }
      }
    }, 300);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [searchKey, selectedMember]);

  useEffect(() => {
    attemptSequence.current++;
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    processingRef.current = false;
    setProcessing(false);
    setCoolingDown(false);
    setResult(null);
    setRecentCheckIns([]);
    setSelectedMember(null);
    setSelectedMemberEventId('');
    setMemberSearch('');
  }, [event?.id]);

  useEffect(() => {
    if (!event) return;
    let disposed = false;
    let scanner: Html5Qrcode | null = null;
    let track: MediaStreamTrack | null = null;
    let sizeObserver: ResizeObserver | null = null;
    let resizeTimer: number | undefined;
    let removePreviewListeners = () => {};
    setCameraState('starting');
    setCameraError('');
    async function startCamera() {
      await scannerShutdown;
      if (disposed) return;
      const reader = document.getElementById('attendance-reader');
      if (!reader) return;
      reader.replaceChildren();
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('error');
        setCameraError(
          !window.isSecureContext
            ? 'Camera access requires HTTPS or localhost. Open this app using a secure URL, then retry.'
            : 'Camera access is not available in this browser. Open the app in a browser with camera support.',
        );
        return;
      }

      const fitPreview = () => {
        const video = reader.querySelector('video');
        const stage = reader.parentElement;
        if (!video || !stage || !video.videoWidth || !video.videoHeight) return;
        const box = stage.getBoundingClientRect();
        const width = Math.ceil(
          Math.max(box.width, (box.height * video.videoWidth) / video.videoHeight),
        );
        video.style.setProperty('--scan-video-width', `${width}px`);
        stage.style.setProperty(
          '--scan-guide-size',
          `${Math.round(Math.min(260, box.width * 0.46, box.height * 0.54))}px`,
        );
      };

      reader.addEventListener('loadedmetadata', fitPreview, true);
      removePreviewListeners = () => reader.removeEventListener('loadedmetadata', fitPreview, true);
      try {
        scanner = new Html5Qrcode('attendance-reader', { verbose: false });
        await scanner.start(
          cameraId ? { deviceId: { exact: cameraId } } : { facingMode },

          { fps: 10 },
          (text) => {
            if (!disposed) void recordAttendance(text);
          },
          () => {},
        );
      } catch (error) {
        if (!disposed) {
          const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          let message =
            'Could not start this camera. Choose Retry Camera or Switch Camera. If it still fails, check the browser console for the camera error.';
          if (/NotAllowedError|PermissionDeniedError|permission denied/i.test(detail)) {
            message =
              'Camera permission was denied. Allow camera access for this site in your browser and system settings, then choose Retry Camera.';
          } else if (/NotFoundError|DevicesNotFoundError/i.test(detail)) {
            message = 'No camera was found. Connect or enable a camera, then choose Retry Camera.';
          } else if (
            /NotReadableError|TrackStartError|could not start video source/i.test(detail)
          ) {
            message =
              'The camera could not be opened. Close other apps or browser tabs using it, then choose Retry Camera.';
          } else if (/OverconstrainedError|ConstraintNotSatisfiedError/i.test(detail)) {
            message =
              'The selected camera or camera settings are unavailable. Choose Switch Camera to try another camera.';
          }
          console.error('LifeCity camera startup failed:', error);
          setCameraState('error');
          setCameraError(message);
        }
        return;
      }
      if (disposed) return;
      scannerRef.current = scanner;

      const preview = reader.querySelector('video');
      const mobileNavigator = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
      const isMobile =
        mobileNavigator.userAgentData?.mobile === true ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (preview && !isMobile) preview.style.setProperty('--scan-mirror', '-1');
      fitPreview();
      setCameraState('ready');
      setCameraError('');

      const stage = reader.parentElement;
      if (stage) {
        const initial = stage.getBoundingClientRect();
        let width = Math.round(initial.width),
          height = Math.round(initial.height);
        sizeObserver = new ResizeObserver((entries) => {
          const box = entries[0]?.contentRect;
          if (
            !box ||
            disposed ||
            (Math.abs(box.width - width) < 3 && Math.abs(box.height - height) < 3)
          )
            return;
          width = Math.round(box.width);
          height = Math.round(box.height);
          fitPreview();
          window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => {
            if (!disposed) setCameraRetry((value) => value + 1);
          }, 180);
        });
        sizeObserver.observe(stage);
      }

      try {
        const video = reader.querySelector('video');
        const stream = video?.srcObject as MediaStream | null;
        track = stream?.getVideoTracks?.()[0] ?? null;
        const settings = track?.getSettings?.() ?? scanner.getRunningTrackSettings();
        activeDevice.current = settings.deviceId ?? cameraId;
        activeFacing.current =
          settings.facingMode === 'user'
            ? 'user'
            : settings.facingMode === 'environment'
              ? 'environment'
              : facingMode;
      } catch {
        activeDevice.current = cameraId;
        activeFacing.current = facingMode;
      }

      try {
        void navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            if (!disposed)
              setCameras(
                devices
                  .filter((device) => device.kind === 'videoinput' && device.deviceId)
                  .map((device) => ({ id: device.deviceId, label: device.label })),
              );
          })
          .catch(() => {
            if (!disposed) setCameras([]);
          });
      } catch {
        if (!disposed) setCameras([]);
      }
    }
    const startup = startCamera();
    return () => {
      disposed = true;
      sizeObserver?.disconnect();
      window.clearTimeout(resizeTimer);
      removePreviewListeners();
      scannerShutdown = scannerShutdown.then(async () => {
        await startup;
        if (!scanner) return;
        if (scannerRef.current === scanner) {
          scannerRef.current = null;
        }
        try {
          await scanner.stop();
        } catch {
          track?.stop();
        }
        try {
          scanner.clear();
        } catch {}
      });
    };
  }, [event?.id, cameraId, facingMode, cameraRetry, isKioskMode]);

  useEffect(() => {
    function updateKioskMode() {
      const active = document.fullscreenElement === scannerLayoutRef.current;
      if (nativeKiosk.current && !active) setIsKioskMode(false);
      nativeKiosk.current = active;
    }
    document.addEventListener('fullscreenchange', updateKioskMode);
    return () => document.removeEventListener('fullscreenchange', updateKioskMode);
  }, []);

  useEffect(() => {
    if (!isKioskMode) return;
    const element = scannerLayoutRef.current;
    if (!element) return;
    const phone = matchMedia('(max-width:900px)');
    const viewport = window.visualViewport;
    let frame = 0;
    const clearPhoneViewport = () => {
      element.style.removeProperty('--lc-scan-viewport-height');
      element.style.removeProperty('--lc-scan-viewport-top');
    };
    const fitPhoneViewport = () => {
      if (!phone.matches) {
        clearPhoneViewport();
        return;
      }
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      element.style.setProperty(
        '--lc-scan-viewport-height',
        `${Math.max(1, Math.floor(height))}px`,
      );
      element.style.setProperty('--lc-scan-viewport-top', `${Math.max(0, Math.floor(top))}px`);
    };
    const scheduleFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitPhoneViewport);
    };
    fitPhoneViewport();
    viewport?.addEventListener('resize', scheduleFit);
    viewport?.addEventListener('scroll', scheduleFit);
    window.addEventListener('resize', scheduleFit);
    phone.addEventListener('change', scheduleFit);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', scheduleFit);
      viewport?.removeEventListener('scroll', scheduleFit);
      window.removeEventListener('resize', scheduleFit);
      phone.removeEventListener('change', scheduleFit);
      clearPhoneViewport();
    };
  }, [isKioskMode]);

  useEffect(() => {
    if (!isKioskMode) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const siblings: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement | null = scannerLayoutRef.current;
    while (branch?.parentElement && branch !== document.body) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          siblings.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsKioskMode(false);
    }
    window.addEventListener('keydown', escape);
    kioskButtonRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
      siblings.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      window.removeEventListener('keydown', escape);
      kioskButtonRef.current?.focus({ preventScroll: true });
    };
  }, [isKioskMode]);

  useEffect(() => {
    if (!event) setIsKioskMode(false);
  }, [event]);

  function switchCamera() {
    if (cameraState === 'starting') return;
    const nextFacing = activeFacing.current === 'environment' ? 'user' : 'environment';
    const opposite = cameras.find(
      (camera) =>
        camera.id !== activeDevice.current &&
        (nextFacing === 'user' ? /front|user|facetime/i : /back|rear|environment/i).test(
          camera.label,
        ),
    );
    const currentIndex = cameras.findIndex((camera) => camera.id === activeDevice.current);
    const next =
      opposite ?? (cameras.length > 1 ? cameras[(currentIndex + 1) % cameras.length] : undefined);
    setCameraState('starting');
    setCameraError('');
    setCameraId(next?.id ?? '');
    setFacingMode(nextFacing);
    setCameraRetry((value) => value + 1);
  }

  async function toggleKioskMode() {
    if (isKioskMode) {
      setIsKioskMode(false);
      if (document.fullscreenElement === scannerLayoutRef.current) {
        try {
          await document.exitFullscreen();
        } catch {}
      }
      return;
    }
    setIsKioskMode(true);

    if (matchMedia('(max-width:900px)').matches) return;
    try {
      await scannerLayoutRef.current?.requestFullscreen?.();
    } catch {}
  }

  function submitMemberSearch(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!selectedMember || !event || selectedMemberEventId !== event.id) return;
    const started = startAttempt();
    if (!started) return;
    const { attempt, serviceId } = started;
    const memberId = selectedMember.id;
    setSelectedMember(null);
    setSelectedMemberEventId('');
    setMemberSearch('');
    void (async () => {
      try {
        const { data: member, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, status')
          .eq('id', memberId)
          .maybeSingle();
        if (!attemptIsCurrent(attempt, serviceId)) return;
        if (error) throw error;
        if (!member) {
          setResult({
            type: 'error',
            message: 'This member is no longer available. Search again before checking in.',
          });
          return;
        }
        await recordMemberAttendance(member, attempt, serviceId);
      } catch {
        if (attemptIsCurrent(attempt, serviceId))
          setResult({
            type: 'error',
            message:
              'Check-in could not be confirmed. Search for this member and try again. Existing check-ins will not be duplicated.',
          });
      } finally {
        finishAttempt(attempt, serviceId);
      }
    })();
  }

  function toggleManual() {
    const next = !manualOpen;
    setManualOpen(next);
    if (next) requestAnimationFrame(() => manualInput.current?.focus({ preventScroll: true }));
  }

  function clearSelectedMember() {
    setSelectedMember(null);
    setSelectedMemberEventId('');
    setMemberSearch('');
    manualInput.current?.focus({ preventScroll: true });
  }

  function dismissResult() {
    setResult(null);
    if (!isKioskMode && manualOpen) manualInput.current?.focus({ preventScroll: true });
    else kioskButtonRef.current?.focus({ preventScroll: true });
  }

  if (!event) return null;

  const feedbackState = processing ? 'processing' : (result?.type ?? 'ready');
  const FeedbackIcon = processing
    ? LoaderCircle
    : result?.type === 'success'
      ? CheckCircle2
      : result?.type === 'duplicate'
        ? Clock3
        : result?.type === 'error'
          ? TriangleAlert
          : ScanLine;
  const feedbackTitle = processing
    ? 'Checking In…'
    : result?.type === 'success'
      ? 'Checked In'
      : result?.type === 'duplicate'
        ? 'Already Checked In'
        : result?.type === 'error'
          ? 'Check-In Not Confirmed'
          : 'Scan a QR Code';
  const kioskSchedule = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(event.starts_at));

  return (
    <section
      ref={scannerLayoutRef}
      className={`scanner-layout lc-scan-station${isKioskMode ? ' is-kiosk-mode' : ''}`}
      data-camera-state={cameraState}
      aria-label="Member Check-In Workspace"
    >
      {isKioskMode && (
        <header className="lc-scan-kiosk-service">
          <div className="lc-scan-kiosk-service__details">
            <p className="lc-scan-eyebrow">LifeCity · Kiosk</p>
            <h2 title={event.name}>{event.name}</h2>
            <p>{kioskSchedule}</p>
          </div>
          <div className="lc-scan-kiosk-service__actions">
            {typeof checkInCount === 'number' && (
              <div className="lc-scan-kiosk-total">
                <strong>{checkInCount.toLocaleString()}</strong>
                <span>Check-Ins</span>
              </div>
            )}
            <button
              type="button"
              ref={kioskButtonRef}
              className="lc-scan-tool"
              onClick={() => void toggleKioskMode()}
            >
              <Minimize size={16} aria-hidden="true" />
              Exit Kiosk
            </button>
          </div>
        </header>
      )}
      <div className="lc-scan-layout">
        <section className="lc-scan-camera" aria-labelledby={`${id}-camera-title`}>
          <header className="lc-scan-camera__header">
            <div>
              <h2 id={`${id}-camera-title`}>
                {isKioskMode ? 'Scan Your QR Code' : 'Scan a Member QR'}
              </h2>
            </div>
            <span className="lc-scan-camera__state" data-state={cameraState} role="status">
              <i aria-hidden="true" />
              {cameraState === 'ready'
                ? 'Camera Ready'
                : cameraState === 'starting'
                  ? 'Starting Camera…'
                  : 'Camera Unavailable'}
            </span>
          </header>
          <div className="lc-scan-camera__stage" role="group" aria-label="Camera Preview">
            <div id="attendance-reader" className="scanner-reader lc-scan-reader" />
            {cameraState === 'ready' && (
              <div className="lc-scan-camera__guide" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <span>Place QR Here</span>
              </div>
            )}
            {cameraState !== 'ready' && (
              <div className="lc-scan-camera__placeholder" aria-hidden="true">
                {cameraState === 'starting' ? (
                  <LoaderCircle size={30} className="lc-scan-spinner" />
                ) : (
                  <ScanLine size={33} />
                )}
                <strong>
                  {cameraState === 'starting' ? 'Starting Camera…' : 'Camera Unavailable'}
                </strong>
                <span>
                  {cameraState === 'starting'
                    ? 'Please wait.'
                    : 'Retry the camera or use manual check-in.'}
                </span>
              </div>
            )}
            {cameraState === 'ready' && (processing || coolingDown) && (
              <span className="lc-scan-camera__stage-hint">
                <ScanLine size={14} aria-hidden="true" />
                {processing ? 'Checking In…' : 'Hold a Moment'}
              </span>
            )}
          </div>
          <div className="lc-scan-camera__tools">
            <div>
              <button
                type="button"
                className="lc-scan-tool"
                onClick={switchCamera}
                disabled={cameraState === 'starting'}
              >
                <SwitchCamera size={16} aria-hidden="true" />
                Switch Camera
              </button>
              {!isKioskMode && (
                <button
                  type="button"
                  ref={kioskButtonRef}
                  className="lc-scan-tool"
                  aria-pressed={false}
                  onClick={() => void toggleKioskMode()}
                  title="Open Kiosk Mode"
                >
                  <Expand size={16} aria-hidden="true" />
                  Kiosk Mode
                </button>
              )}
            </div>
          </div>
          {cameraError && (
            <div className="lc-scan-camera__error" role="alert">
              <span aria-hidden="true">
                <TriangleAlert size={20} />
              </span>
              <div>
                <strong>Camera Unavailable</strong>
                <p>{uiMessage(cameraError)}</p>
                <button
                  type="button"
                  className="lc-scan-tool"
                  onClick={() => {
                    setCameraState('starting');
                    setCameraError('');
                    setCameraRetry((value) => value + 1);
                  }}
                >
                  Retry Camera
                  <ArrowRight size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="lc-scan-rail" aria-label="Check-In Feedback and Manual Entry">
          <section
            className="lc-scan-feedback"
            data-state={feedbackState}
            aria-labelledby={`${id}-feedback-title`}
          >
            <header>
              <p className="lc-scan-eyebrow" id={`${id}-feedback-title`}>
                Check-In Status
              </p>
              {result && !processing && (
                <button
                  type="button"
                  className="lc-scan-dismiss"
                  aria-label="Dismiss Check-In Result"
                  onClick={dismissResult}
                >
                  <X size={15} />
                </button>
              )}
            </header>
            <div
              className="lc-scan-feedback__body"
              role={result?.type === 'error' ? 'alert' : 'status'}
              aria-live={result?.type === 'error' ? 'assertive' : 'polite'}
              aria-atomic="true"
            >
              <div className="lc-scan-feedback__status">
                <FeedbackIcon
                  size={21}
                  className={processing ? 'lc-scan-spinner' : undefined}
                  aria-hidden="true"
                />
                <h3>{feedbackTitle}</h3>
              </div>
              {result?.memberName && !processing && (
                <strong
                  className="lc-scan-feedback__member"
                  data-long={result.memberName.length > 36 || undefined}
                >
                  {result.memberName}
                </strong>
              )}
              {(processing || result?.type === 'error') && (
                <p>{processing ? 'Please wait.' : uiMessage(result!.message)}</p>
              )}
              {result?.time && !processing && (
                <span className="lc-scan-feedback__time">
                  <Clock3 size={12} aria-hidden="true" />
                  {result.time} · Manila Time
                </span>
              )}
            </div>
          </section>

          <section
            className={`lc-scan-manual${manualOpen ? ' is-open' : ''}`}
            hidden={isKioskMode}
            aria-labelledby={`${id}-manual-title`}
          >
            <button
              type="button"
              className="lc-scan-manual__heading"
              aria-expanded={manualOpen}
              aria-controls={`${id}-manual-form`}
              onClick={toggleManual}
            >
              <span className="lc-scan-manual__symbol" aria-hidden="true">
                <Search size={18} />
              </span>
              <span>
                <strong id={`${id}-manual-title`}>Manual Check-In</strong>
                <small>Find a member without a QR code.</small>
              </span>
              <ChevronDown size={17} aria-hidden="true" />
            </button>
            <form
              id={`${id}-manual-form`}
              className="lc-scan-manual__form"
              onSubmit={submitMemberSearch}
              hidden={!manualOpen}
            >
              <label className="lc-scan-manual__search">
                <Search size={16} aria-hidden="true" />
                <input
                  ref={manualInput}
                  type="search"
                  value={memberSearch}
                  disabled={processing}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Name, Member ID or Contact"
                  aria-label="Search for a Member to Check In"
                  aria-describedby={`${id}-search-help`}
                  aria-busy={waitingForSearch && !!memberSearch.trim()}
                  onChange={(change) => {
                    setMemberSearch(change.target.value);
                    setSelectedMember(null);
                    setSelectedMemberEventId('');
                  }}
                />
                {memberSearch && !selectedMember && (
                  <button
                    type="button"
                    aria-label="Clear Member Search"
                    disabled={processing}
                    onClick={clearSelectedMember}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              <p id={`${id}-search-help`} className="lc-scan-manual__help">
                Search by name, member ID, mobile number or email.
              </p>
              {memberLoadError && !waitingForSearch && !selectedMember && (
                <div className="lc-scan-manual__error" role="alert">
                  <p>{memberLoadError}</p>
                  <button
                    type="button"
                    className="lc-scan-tool"
                    onClick={() => setSearchRetry((value) => value + 1)}
                  >
                    Try Again
                    <ArrowRight size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
              {selectedMember ? (
                <div className="lc-scan-member-selected">
                  <span className="lc-scan-member-avatar" aria-hidden="true">
                    {selectedMember.first_name[0]}
                    {selectedMember.last_name[0]}
                  </span>
                  <div>
                    <small>Ready to Check In</small>
                    <strong>
                      {selectedMember.first_name} {selectedMember.last_name}
                    </strong>
                    <span>{selectedMember.member_number}</span>
                  </div>
                  <button
                    type="button"
                    className="lc-scan-dismiss"
                    disabled={processing}
                    onClick={clearSelectedMember}
                    aria-label="Clear Selected Member"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : memberSearch.trim() ? (
                <div className="lc-scan-manual__results" aria-label="Matching Members">
                  {waitingForSearch ? (
                    <p className="lc-scan-manual__message" role="status">
                      <LoaderCircle size={15} className="lc-scan-spinner" aria-hidden="true" />
                      Searching Members…
                    </p>
                  ) : memberLoadError ? null : !matchedMembers.length ? (
                    <p className="lc-scan-manual__message" role="status">
                      No Active Members Found. Try another name or member ID.
                    </p>
                  ) : (
                    <>
                      <p className="lc-scan-manual__count" role="status">
                        {matchTotal} Matching Member{matchTotal === 1 ? '' : 's'}
                      </p>
                      <ul role="list">
                        {matchedMembers.map((member) => (
                          <li key={member.id}>
                            <button
                              type="button"
                              disabled={member.status !== 'active'}
                              onClick={() => {
                                setSelectedMember(member);
                                setSelectedMemberEventId(event.id);
                                setMemberSearch(`${member.first_name} ${member.last_name}`);
                              }}
                            >
                              <span className="lc-scan-member-avatar" aria-hidden="true">
                                {member.first_name[0]}
                                {member.last_name[0]}
                              </span>
                              <span>
                                <strong>
                                  {member.first_name} {member.last_name}
                                </strong>
                                <small>
                                  {member.member_number}
                                  {member.email || member.mobile
                                    ? ` · ${member.email || member.mobile}`
                                    : ''}
                                </small>
                              </span>
                              {member.status === 'active' ? (
                                <ArrowRight size={14} aria-hidden="true" />
                              ) : (
                                <small>Inactive</small>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {matchTotal > matchedMembers.length && (
                        <p className="lc-scan-manual__help">
                          Showing {matchedMembers.length} of {matchTotal}. Add more detail to narrow
                          the results.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="lc-scan-manual__empty">
                  <UserRoundCheck size={20} aria-hidden="true" />
                  <p>Search and select a member to check in.</p>
                </div>
              )}
              <button
                type="submit"
                className="lc-scan-primary lc-scan-manual__submit"
                disabled={
                  !selectedMember || selectedMemberEventId !== event.id || processing || coolingDown
                }
              >
                {processing ? (
                  <LoaderCircle size={16} className="lc-scan-spinner" aria-hidden="true" />
                ) : (
                  <UserRoundCheck size={16} aria-hidden="true" />
                )}
                {processing
                  ? 'Checking In…'
                  : selectedMember
                    ? `Check In ${selectedMember.first_name}`
                    : 'Check In Member'}
              </button>
            </form>
          </section>

          {recentCheckIns.length > 0 && (
            <section className="lc-scan-recent" aria-labelledby={`${id}-recent-title`}>
              <div className="lc-scan-recent__heading">
                <UsersRound size={15} aria-hidden="true" />
                <h3 id={`${id}-recent-title`}>Recent Check-Ins</h3>
                <span>{recentCheckIns.length} Recent</span>
              </div>
              <ul role="list">
                {recentCheckIns.map((checkIn, index) => (
                  <li key={`${checkIn.memberName}-${checkIn.time}-${index}`}>
                    <span className="lc-scan-recent__check" aria-hidden="true">
                      <Check size={12} />
                    </span>
                    <strong>{checkIn.memberName}</strong>
                    <time>{checkIn.time}</time>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {isKioskMode && <p className="lc-scan-kiosk-help">No QR? Ask a team member for help.</p>}
        </aside>
      </div>
    </section>
  );
}
