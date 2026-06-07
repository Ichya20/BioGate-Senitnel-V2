/**
 * BioGate Sentinel: Scanner UI Component (Integrated with Teachable Machine)
 * Features:
 * 1. Real-Time Auto Face Detection via Teachable Machine Model
 * 2. Animated Confidence & Vector Counter based on real prediction
 * 3. Voice Verification via Web Speech API
 * 4. Covert Duress Protocol
 * 5. Real-time Clock & Live Activity Logs
 * 6. TTS Voice Notifications
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, CheckCircle, AlertTriangle, Lock, Fingerprint, ShieldAlert, UserX, Shield } from 'lucide-react';
import { AuthResponse, User } from '../types';
import { verifyFaceFromBlob } from "../services/faceApi";
import { useNavigate } from 'react-router-dom';
import { verifyVoiceFromBlob } from "../services/voiceApi";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

type Phase = 'scanning' | 'face_found' | 'face_denied' | 'voice' | 'result';

interface LogEntry {
  time: string;
  status: 'GRANTED' | 'DENIED';
  user: string;
}

const ALL_USERS = [
  { id: 1, name: 'Ichya Ulumiddiin' },
  { id: 2, name: 'Abid Fadhilah Mustofa' },
  { id: 3, name: 'Iklil Bahy Sabaiki' },
  { id: 4, name: 'Nathan Domuli Pasaribu' },
  { id: 5, name: 'Nashir Khoirul Huda' },
  { id: 6, name: 'Arif Kurniawan' },
];

const INITIAL_LOGS: LogEntry[] = [
  { time: '14:21:44', status: 'GRANTED', user: 'I. Bahy Sabaiki' },
  { time: '14:20:12', status: 'DENIED',  user: 'INVALID_VOICE_PATTERN' },
  { time: '14:18:55', status: 'GRANTED', user: 'A. Fadhilah Mustofa' },
  { time: '14:15:30', status: 'GRANTED', user: 'N. Khoirul Huda' },
  { time: '14:10:02', status: 'DENIED',  user: 'UNRECOGNIZED_FACE_ID' },
];

function getTimeString(): string {
  return new Date().toLocaleTimeString('id-ID', { hour12: false });
}

function speak(text: string) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function getUserPassphrase(userName: string): string {
  if (userName.includes("Ichya")) return "IZIN MASUK";
  if (userName.includes("Abid")) return "AKSES KEAMANAN";
  if (userName.includes("Iklil")) return "JARINGAN NETWORK";
  if (userName.includes("Nathan")) return "DATA DATABASE";
  if (userName.includes("Nashir")) return "PROTOKOL ANALISIS";
  if (userName.includes("Arif")) return "TAMPILAN SISTEM";
  return "AKSES MASUK";
}

function playDuressAlarm(durationMs = 5000) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextClass();

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(850, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.05);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();

    const interval = window.setInterval(() => {
      oscillator.frequency.setValueAtTime(850, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1150, audioContext.currentTime + 0.2);
    }, 400);

    window.setTimeout(() => {
      window.clearInterval(interval);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.1);
      oscillator.stop(audioContext.currentTime + 0.15);
      window.setTimeout(() => audioContext.close(), 300);
    }, durationMs);
  } catch (error) {
    console.error('Duress alarm failed:', error);
  }
}

function captureFrameFromVideo(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!video.videoWidth || !video.videoHeight) {
      reject(new Error("Video belum siap."));
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas context gagal dibuat."));
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Gagal capture frame."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      0.9
    );
  });
}

export default function ScannerUI() {
  const navigate = useNavigate();
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [phase, setPhase]               = useState<Phase>('scanning');
  const [users, setUsers]               = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUnknown, setIsUnknown]       = useState(false);
  const [scanningIndex, setScanningIndex] = useState(0);
  const [confidence, setConfidence]     = useState(0);
  const [vectors, setVectors]           = useState(0);
  const [isListening, setIsListening]   = useState(false);
  const [isVoiceVerifying, setIsVoiceVerifying] = useState(false);
  const [transcript, setTranscript]     = useState('');
  const [audioBlob, setAudioBlob]       = useState<Blob | null>(null);
  const [authResult, setAuthResult]     = useState<AuthResponse | null>(null);
  const [isDuress, setIsDuress]         = useState(false);
  const [showDuressPopup, setShowDuressPopup] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [logs, setLogs]                 = useState<LogEntry[]>(INITIAL_LOGS);
  const [currentTime, setCurrentTime]   = useState(getTimeString());
  const [phraseVisible, setPhraseVisible] = useState(false);
  const [voiceBars, setVoiceBars]       = useState([0.4, 0.7, 1, 0.6, 0.8, 0.7, 0.4]);

  // Face API States
const [isModelLoading, setIsModelLoading] = useState(true);
const [hasStarted, setHasStarted] = useState(false);
const isVerifyingRef = useRef(false);

const videoRef          = useRef<HTMLVideoElement>(null);
const recognitionRef    = useRef<any>(null);
const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
const audioChunksRef    = useRef<Blob[]>([]);
const audioBlobRef      = useRef<Blob | null>(null);
const barIntervalRef    = useRef<any>(null);
const requestRef        = useRef<number>(0);

  // ── Real-time clock ──────────────────────────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => setCurrentTime(getTimeString()), 1000);
    return () => clearInterval(tick);
  }, []);

  // ── Camera ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasStarted) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(true);
        setPhase('face_denied');
        speak('Camera module is not supported on this browser.');
        return;
      }

      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          setCameraError(false);

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(() => {
          setCameraError(true);
          setPhase('face_denied');
          speak('Camera access denied. Please allow camera permission to continue biometric scanning.');
        });
    }

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach(t => t.stop());
      }
    };
  }, [hasStarted]);

  // ── Fetch users ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(setUsers).catch(() => setUsers(ALL_USERS));
  }, []);

  // ── Check Face API ───────────────────────────────────────────────────────
useEffect(() => {
  const checkFaceApi = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/api/health");

      if (!response.ok) {
        throw new Error("Face API not ready");
      }

      setIsModelLoading(false);
      console.log("BioGate Face API connected.");
    } catch (error) {
      console.error("Gagal konek ke BioGate Face API:", error);
      setIsModelLoading(true);
    }
  };

  checkFaceApi();
}, []);

    const startVoiceRecording = async () => {
      try {
        setAudioBlob(null);
        audioBlobRef.current = null;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        audioChunksRef.current = [];

        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.start();
      } catch (error) {
        console.error('Voice recording failed:', error);
        setAudioBlob(null);
        audioBlobRef.current = null;
      }
    };

  const stopVoiceRecording = (): Promise<Blob | null> => {
      return new Promise((resolve) => {
        const recorder = mediaRecorderRef.current;

        if (!recorder || recorder.state === 'inactive') {
          resolve(audioBlobRef.current);
          return;
        }

        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

          audioBlobRef.current = blob;
          setAudioBlob(blob);

          const stream = recorder.stream;
          stream.getTracks().forEach(track => track.stop());

          resolve(blob);
        };

        recorder.requestData();
        recorder.stop();
      });
    };

  // ── Speech recognition ───────────────────────────────────────────────────
  const selectedUserRef  = useRef<User | null>(null);
  const verifyMFARef     = useRef<(phrase: string) => void>(() => {});
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.lang = 'id-ID';
    rec.onresult = async (e: any) => {
      const text = e.results[0][0].transcript;
      setTranscript(text);
      setIsListening(false);
      setIsVoiceVerifying(false);

      const blob = await stopVoiceRecording();

      if (blob) {
        audioBlobRef.current = blob;
        setAudioBlob(blob);
      }

      verifyMFARef.current(text);
    };

    rec.onerror = () => {
      setIsListening(false);
      setIsVoiceVerifying(false);
      stopVoiceRecording();
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;
  }, []);

// ── Verify MFA ───────────────────────────────────────────────────────────
const verifyMFA = useCallback(async (spokenPhrase: string) => {
  const user = selectedUserRef.current;
  if (!user) return;

  const recognizedText = spokenPhrase.toLowerCase().trim();

  let isMatch = false;
  let assignedRole = 'Authorized Agent';

  if (user.name.includes("Ichya")) {
    isMatch = recognizedText.includes("izin") || recognizedText.includes("masuk");
    assignedRole = 'System Lead';

  } else if (user.name.includes("Abid")) {
    isMatch = recognizedText.includes("akses") || recognizedText.includes("keamanan");
    assignedRole = 'Security Architect';

  } else if (user.name.includes("Iklil")) {
    isMatch = recognizedText.includes("jaringan") || recognizedText.includes("network");
    assignedRole = 'Network Specialist';

  } else if (user.name.includes("Nathan")) {
    isMatch = recognizedText.includes("data") || recognizedText.includes("database");
    assignedRole = 'DB Specialist';

  } else if (user.name.includes("Nashir")) {
    isMatch = recognizedText.includes("protokol") || recognizedText.includes("analisis");
    assignedRole = 'Protocol Analyst';

  } else if (user.name.includes("Arif")) {
    isMatch = recognizedText.includes("tampilan") || recognizedText.includes("sistem");
    assignedRole = 'UI/UX Specialist';

  } else {
    isMatch = recognizedText.includes("akses") || recognizedText.includes("masuk");
    assignedRole = 'Standard User';
  }

  const isDuressMatch =
    recognizedText.includes("darurat") ||
    recognizedText.includes("emergency") ||
    recognizedText.includes("bahaya");

  // DURESS: warning beberapa detik + alarm, lalu balik ke page awal
  if (isDuressMatch) {
    setAuthResult({
      status: 'error',
      message: 'DURESS PROTOCOL ACTIVE. UNKNOWN USER WARNING TRIGGERED.',
    });

    setIsDuress(true);
    setIsUnknown(true);
    setShowDuressPopup(true);
    setIsListening(false);
    setPhase('result');
    setIsVoiceVerifying(false);

    recognitionRef.current?.stop();

    speak('Access Denied. Duress protocol activated.');
    playDuressAlarm(5000);

    const newLog: LogEntry = {
      time: getTimeString(),
      status: 'DENIED',
      user: 'DURESS_PROTOCOL_UNKNOWN_USER',
    };

    setLogs(prev => [newLog, ...prev].slice(0, 12));

    sessionStorage.removeItem('biogate_auth');
    sessionStorage.removeItem('biogate_agent');
    sessionStorage.removeItem('biogate_role');
    sessionStorage.removeItem('biogate_duress');

    window.setTimeout(() => {
      recognitionRef.current?.stop();

      setHasStarted(false);
      setPhase('scanning');
      setConfidence(0);
      setVectors(0);
      setScanningIndex(0);
      setSelectedUser(null);
      setIsUnknown(false);
      setTranscript('');
      setAuthResult(null);
      setIsDuress(false);
      setShowDuressPopup(false);
      setPhraseVisible(false);
      setIsListening(false);
      setIsVoiceVerifying(false);

      window.history.replaceState(null, '', '/');
    }, 5000);

    return;
  }

// NORMAL: voice cocok, masuk vault
if (isMatch) {
  const recordedAudioBlob = audioBlobRef.current || audioBlob;
  if (!recordedAudioBlob) {
    setAuthResult({
      status: 'error',
      message: 'Voice recording not found.',
    });

    setIsDuress(false);
    setIsUnknown(false);
    setPhase('result');

    speak('Access Denied. Voice recording not found.');
    return;
  }

  const expectedUser = user.name.toLowerCase().split(' ')[0];
  setIsVoiceVerifying(true);

  let voiceResult;

  try {
    voiceResult = await verifyVoiceFromBlob(recordedAudioBlob, expectedUser);
  } finally {
    setIsVoiceVerifying(false);
  }

  console.log("VOICE RESULT:", voiceResult);

  if (!voiceResult.match) {
    setAuthResult({
      status: 'error',
      message: `Voice biometric mismatch. Score: ${voiceResult.score}`,
    });

    setIsDuress(false);
    setIsUnknown(false);
    setPhase('result');

    speak(`Access Denied. Voice biometric mismatch for ${user.name}.`);
    return;
  }

  setAuthResult({
    status: 'success',
    user: {
      name: user.name,
      role: assignedRole,
    },
  });

  setIsDuress(false);
  setShowDuressPopup(false);
  setIsUnknown(false);
  setPhase('result');

  speak(`Access Granted. Welcome back, ${assignedRole} ${user.name}`);

  const newLog: LogEntry = {
    time: getTimeString(),
    status: 'GRANTED',
    user: user.name[0] + '. ' + user.name.split(' ').slice(-1)[0],
  };

  setLogs(prev => [newLog, ...prev].slice(0, 12));

  window.setTimeout(() => {
    sessionStorage.setItem('biogate_auth', 'true');
    sessionStorage.setItem('biogate_agent', user.name);
    sessionStorage.setItem('biogate_role', assignedRole);
    sessionStorage.setItem('biogate_duress', 'false');

    navigate('/secret-vault', {
      state: {
        agentName: user.name,
        agentRole: assignedRole,
      },
    });
  }, 4000);

  return;
}

  // VOICE SALAH BIASA
  setAuthResult({
    status: 'error',
    message: 'Voice signature mismatch.',
  });

  setIsDuress(false);
  setIsUnknown(false);
  setPhase('result');

  speak(`Access Denied. Invalid voice signature for ${user.name}.`);

  const newLog: LogEntry = {
    time: getTimeString(),
    status: 'DENIED',
    user: 'INVALID_VOICE_PATTERN',
  };

  setLogs(prev => [newLog, ...prev].slice(0, 12));

  window.setTimeout(() => {
    setPhase('scanning');
    setConfidence(0);
    setVectors(0);
    setScanningIndex(0);
    setSelectedUser(null);
    setIsUnknown(false);
    setTranscript('');
    setAuthResult(null);
    setIsDuress(false);
    setPhraseVisible(false);
    setIsListening(false);
    setIsVoiceVerifying(false);
  }, 4000);
}, [navigate]);

  useEffect(() => { verifyMFARef.current = verifyMFA; }, [verifyMFA]);

  // Fungsi Reset / Restart manual
  const startAutoScan = useCallback(() => {
    setPhase('scanning');
    setConfidence(0);
    setVectors(0);
    setScanningIndex(0);
    setSelectedUser(null);
    setIsUnknown(false);
    setTranscript('');
    setAuthResult(null);
    setIsDuress(false);
    setPhraseVisible(false);
    setIsListening(false);
    setIsVoiceVerifying(false);
    setAudioBlob(null);
    audioBlobRef.current = null;
  }, []);

// ── Real-time Face Scanning via BioGate Face API ─────────────────────────
const predictWebcam = useCallback(async () => {
  if (!videoRef.current || phase !== "scanning" || isVerifyingRef.current) return;

  const video = videoRef.current;

  if (!video.videoWidth || !video.videoHeight) {
    requestRef.current = requestAnimationFrame(predictWebcam);
    return;
  }

  try {
    isVerifyingRef.current = true;

    const frameBlob = await captureFrameFromVideo(video);
    const result = await verifyFaceFromBlob(frameBlob);

    setVectors(Math.floor(Math.random() * 400 + 800));

    if (typeof result.confidence === "number") {
      setConfidence(result.confidence);
    }

    // Kalau kamera belum menangkap wajah, jangan langsung denied.
    // Tetap scanning.
    if (
      result.status === "ACCESS_DENIED" &&
      result.reason &&
      result.reason.toLowerCase().includes("tidak ada wajah")
    ) {
      isVerifyingRef.current = false;
      window.setTimeout(() => {
        requestRef.current = requestAnimationFrame(predictWebcam);
      }, 800);
      return;
    }

    // Kalau wajah cocok dengan database
    if (result.status === "MATCH" && result.user) {
      const identifiedName = result.user.name;
      const displayUsers = users.length > 0 ? users : ALL_USERS;

      const normalizeName = (name: string) =>
        name
          .toLowerCase()
          .replace(/[^a-z\s]/g, "")
          .replace(/\s+/g, " ")
          .trim();

      const normalizedIdentifiedName = normalizeName(identifiedName);

      const userMatch = displayUsers.find((u) => {
        const normalizedUserName = normalizeName(u.name);

        return (
          normalizedUserName === normalizedIdentifiedName ||
          normalizedUserName.includes(normalizedIdentifiedName) ||
          normalizedIdentifiedName.includes(normalizedUserName)
        );
      });

      const finalUser: User =
        userMatch ??
        ({
          id: displayUsers.length + 1,
          name: identifiedName,
        } as User);

      setSelectedUser(finalUser);
      setScanningIndex(displayUsers.findIndex((u) => u.id === finalUser.id));
      setPhase("face_found");

      speak(`Face recognized as ${finalUser.name}. Please provide voice authentication.`);

      setTimeout(() => {
        setPhase("voice");
        setPhraseVisible(false);
        setTimeout(() => setPhraseVisible(true), 700);
      }, 1800);

      isVerifyingRef.current = false;
      return;
    }

    if (result.status === "ACCESS_DENIED") {
      setIsUnknown(true);
      setSelectedUser(null);
      setIsDuress(true);
      setShowDuressPopup(true);
      setPhase("face_denied");

      speak("Access Denied. Unrecognized face detected. Duress protocol activated.");
      playDuressAlarm(5000);

      const newLog: LogEntry = {
        time: getTimeString(),
        status: "DENIED",
        user: "UNRECOGNIZED_FACE_ID",
      };

      setLogs((prev) => [newLog, ...prev].slice(0, 12));

      window.setTimeout(() => {
        recognitionRef.current?.stop();

        if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
        }

        setHasStarted(false);
        setPhase("scanning");
        setConfidence(0);
        setVectors(0);
        setScanningIndex(0);
        setSelectedUser(null);
        setIsUnknown(false);
        setTranscript("");
        setAuthResult(null);
        setIsDuress(false);
        setShowDuressPopup(false);
        setPhraseVisible(false);
        setIsListening(false);
        setIsVoiceVerifying(false);
        setCameraError(false);

        sessionStorage.removeItem("biogate_auth");
        sessionStorage.removeItem("biogate_agent");
        sessionStorage.removeItem("biogate_role");
        sessionStorage.removeItem("biogate_duress");

        window.history.replaceState(null, "", "/");
      }, 5000);

      isVerifyingRef.current = false;
      return;
    }

    isVerifyingRef.current = false;

    window.setTimeout(() => {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }, 900);
  } catch (error) {
    console.error("Face verification error:", error);

    isVerifyingRef.current = false;

    window.setTimeout(() => {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }, 1200);
  }
}, [phase, users, startAutoScan]);

// Trigger loop scanning saat berada di fase 'scanning'
useEffect(() => {
  if (hasStarted && phase === "scanning" && !isModelLoading) {
    requestRef.current = requestAnimationFrame(predictWebcam);
  }

  return () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };
}, [hasStarted, phase, isModelLoading, predictWebcam]);

  // ── Voice bar animation ──────────────────────────────────────────────────
  useEffect(() => {
    if (barIntervalRef.current) clearInterval(barIntervalRef.current);
    if (isListening) {
      barIntervalRef.current = setInterval(() => {
        setVoiceBars(Array.from({ length: 7 }, () => Math.random()));
      }, 120);
    } else {
      setVoiceBars([0.4, 0.7, 1, 0.6, 0.8, 0.7, 0.4]);
    }
    return () => clearInterval(barIntervalRef.current);
  }, [isListening]);

  const toggleListening = async () => {
  if (isListening) {
    recognitionRef.current?.stop();
    stopVoiceRecording();
    setIsListening(false);
    setIsVoiceVerifying(false);
  } else {
    setTranscript('');
    setIsListening(true);

    await startVoiceRecording();

    try {
      recognitionRef.current?.start();
    } catch (e) {
      console.error('Speech recognition start failed:', e);
      stopVoiceRecording();
      setIsListening(false);
      setIsVoiceVerifying(false);
    }
  }
};

  const displayUsers = users.length > 0 ? users : ALL_USERS;
  const isGranted    = phase === 'result' && authResult?.status === 'success';
  const isDenied     = (phase === 'result' && authResult?.status !== 'success') || phase === 'face_denied';

  // ── Scan box / badge color helpers ───────────────────────────────────────
  const boxRed    = isDenied;
  const cornerCls = boxRed ? 'border-red-500' : 'border-[var(--accent)]';
  const getStepStatus = (step: 'face' | 'voice' | 'result') => {
  if (!hasStarted) return 'STANDBY';

  if (step === 'face') {
    return phase === 'scanning' || phase === 'face_found' || phase === 'face_denied'
      ? 'ACTIVE'
      : 'DONE';
  }

  if (step === 'voice') {
    if (phase === 'voice') return 'ACTIVE';
    if (phase === 'result') return 'DONE';
    return 'LOCKED';
  }

  if (step === 'result') {
    return phase === 'result' ? 'ACTIVE' : 'LOCKED';
  }

  return 'LOCKED';
};

const StepBadge = ({
  number,
  label,
  status,
}: {
  number: string;
  label: string;
  status: string;
}) => {
  const isActive = status === 'ACTIVE';
  const isDone = status === 'DONE';

  return (
    <div
      className={`flex flex-1 items-center justify-between border px-3 py-2 font-mono text-[10px] tracking-widest transition-all ${
        isActive
          ? 'border-[var(--accent)] bg-[#00ff88]/10 text-[var(--accent)] shadow-[0_0_15px_rgba(0,255,136,0.25)]'
          : isDone
            ? 'border-emerald-900/70 bg-emerald-950/20 text-emerald-700'
            : 'border-slate-800 bg-black/40 text-slate-600'
      }`}
    >
      <span>
        [{number}] {label}
      </span>
      <span>{status}</span>
    </div>
  );
};

  return (
    <div className="h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text-primary)] flex flex-col font-sans relative">
       {showDuressPopup && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm">
        <div className="relative w-[90%] max-w-2xl border-2 border-red-500 bg-red-950/30 p-8 text-center shadow-[0_0_40px_rgba(239,68,68,0.8)] animate-pulse">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 px-4 py-1 text-xs font-black tracking-[0.4em] text-white">
            SECURITY ALERT
          </div>

          <div className="mb-4 text-6xl font-black text-red-500">
            ⚠
          </div>

          <h1 className="mb-3 text-3xl md:text-5xl font-black tracking-widest text-red-500">
            ACCESS DENIED
          </h1>

          <p className="mb-2 text-sm md:text-lg font-bold tracking-[0.3em] text-red-300">
            DURESS PROTOCOL ACTIVE
          </p>

          <p className="text-xs md:text-sm tracking-widest text-red-200/80">
            UNKNOWN USER WARNING TRIGGERED
          </p>

          <div className="mt-6 border border-red-500/40 bg-black/60 p-3 font-mono text-xs text-red-300">
            SYSTEM LOCKDOWN // RETURNING TO INITIAL PAGE IN 5 SECONDS
          </div>
            <div className="mt-4 h-2 w-full overflow-hidden border border-red-500/40 bg-black">
            <div className="h-full animate-[duressLoading_5s_linear_forwards] bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.9)]"></div>
          </div>
          <div className="mt-3 flex justify-center gap-2">
            <span className="h-2 w-2 animate-ping rounded-full bg-red-500"></span>
            <span className="h-2 w-2 animate-ping rounded-full bg-red-500 [animation-delay:150ms]"></span>
            <span className="h-2 w-2 animate-ping rounded-full bg-red-500 [animation-delay:300ms]"></span>
          </div>
        </div>
      </div>
    )}

    {isBooting && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/95 backdrop-blur-sm">
          <div className="w-[90%] max-w-2xl border border-[var(--accent)] bg-black/80 p-8 text-center font-mono shadow-[0_0_40px_rgba(0,255,136,0.35)]">
            <div className="mb-4 text-[10px] font-black tracking-[0.5em] text-[var(--accent)]">
              BIOGATE SENTINEL
            </div>

            <h1 className="mb-4 text-2xl md:text-4xl font-black tracking-widest text-[var(--accent)] neon-text">
              SYSTEM BOOTING
            </h1>

            <p className="mb-6 text-xs tracking-[0.35em] text-[var(--text-secondary)]">
              CALIBRATING BIOMETRIC SENSOR...
            </p>

            <div className="mx-auto mb-4 h-2 w-full max-w-md overflow-hidden border border-[var(--accent)] bg-black">
              <div className="h-full animate-[bootLoading_1.6s_linear_forwards] bg-[var(--accent)] shadow-[0_0_15px_rgba(0,255,136,0.9)]"></div>
            </div>

            <div className="grid grid-cols-1 gap-2 text-left text-[10px] tracking-widest text-emerald-400/80 md:grid-cols-2">
              <div>&gt; CAMERA_MODULE: INITIALIZING</div>
              <div>&gt; FACE_MODEL: STANDBY</div>
              <div>&gt; VOICE_AUTH: LOCKED</div>
              <div>&gt; VAULT_ACCESS: SEALED</div>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY: TAP TO START */}
      {!hasStarted && !isBooting && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[var(--bg)]">
          {/* Grid Background */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,136,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,136,0.08)_1px,transparent_1px)] bg-[size:42px_42px]" />
          </div>

          {/* Glow Background */}
          <div className="absolute h-[420px] w-[420px] rounded-full bg-[var(--accent)]/10 blur-[120px]" />

          {/* Corner Frame */}
          <div className="absolute left-8 top-8 h-24 w-24 border-l border-t border-[var(--accent)] opacity-50" />
          <div className="absolute right-8 top-8 h-24 w-24 border-r border-t border-[var(--accent)] opacity-50" />
          <div className="absolute bottom-8 left-8 h-24 w-24 border-b border-l border-[var(--accent)] opacity-50" />
          <div className="absolute bottom-8 right-8 h-24 w-24 border-b border-r border-[var(--accent)] opacity-50" />

          {/* Center Card */}
          <div className="relative z-10 flex w-[92%] max-w-3xl flex-col items-center border border-[var(--border)] bg-black/40 px-6 py-10 text-center shadow-[0_0_45px_rgba(0,255,136,0.12)] backdrop-blur-sm">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--accent)]/5 shadow-[0_0_25px_rgba(0,255,136,0.25)]">
              <Shield className="h-10 w-10 text-[var(--accent)] animate-pulse" />
            </div>

            <div className="mb-3 font-mono text-[10px] font-black tracking-[0.55em] text-[var(--text-secondary)]">
              SECURE BIOMETRIC GATEWAY
            </div>

            <h1 className="font-mono text-3xl font-extrabold tracking-[0.35em] text-[var(--accent)] drop-shadow-[0_0_18px_rgba(0,255,136,0.35)] md:text-5xl">
              BIOGATE SENTINEL
            </h1>

            <p className="mt-4 max-w-xl font-mono text-[10px] leading-relaxed tracking-[0.25em] text-[var(--text-secondary)]">
              FACE RECOGNITION // VOICE SIGNATURE VERIFICATION // SECURE VAULT ACCESS
            </p>

            <div className="mt-8 grid w-full grid-cols-1 gap-3 font-mono text-[10px] tracking-widest md:grid-cols-3">
              <div className="border border-[var(--border)] bg-black/50 px-4 py-3 text-left">
                <div className="mb-1 text-[var(--text-secondary)]">FACE_ID_MODULE</div>
                <div className="text-[var(--accent)]">STANDBY</div>
              </div>

              <div className="border border-[var(--border)] bg-black/50 px-4 py-3 text-left">
                <div className="mb-1 text-[var(--text-secondary)]">VOICE_SIGNATURE</div>
                <div className="text-yellow-500">LOCKED</div>
              </div>

              <div className="border border-[var(--border)] bg-black/50 px-4 py-3 text-left">
                <div className="mb-1 text-[var(--text-secondary)]">VAULT_ACCESS</div>
                <div className="text-red-400">SEALED</div>
              </div>
            </div>

            <button
              onClick={() => {
                setCameraError(false);
                setIsBooting(true);
                speak("System booting. Calibrating biometric sensors.");

                setTimeout(() => {
                  setHasStarted(true);
                  setIsBooting(false);
                  speak("Scanner active. Please face the camera.");
                }, 1600);
              }}
              className="group relative mt-8 flex cursor-pointer items-center gap-3 overflow-hidden border border-[var(--accent)] bg-[var(--accent)]/10 px-8 py-4 font-mono text-sm font-bold tracking-[0.25em] text-[var(--accent)] shadow-[0_0_20px_rgba(0,255,136,0.2)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:bg-[var(--accent)] hover:text-black hover:shadow-[0_0_35px_rgba(0,255,136,0.75)] active:scale-[0.98]"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

              <Fingerprint className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
              <span className="relative z-10">[ TAP TO INITIALIZE ]</span>
            </button>

            <div className="mt-6 border border-[var(--border)] bg-black/30 px-4 py-2 font-mono text-[9px] tracking-[0.3em] text-[var(--text-secondary)]">
              PROTOTYPE_MODE // LOCAL BIOMETRIC AUTHENTICATION
            </div>
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="h-[52px] bg-[var(--card-bg)] border-b border-[var(--border)] flex items-center justify-between px-6 z-20 flex-shrink-0">
        <div className="font-mono font-extrabold text-sm tracking-[3px] text-[var(--accent)]">
          BIOGATE // SENTINEL
        </div>
        <div className="flex gap-6 font-mono text-[10px] uppercase text-[var(--text-secondary)]">
          {([
            ['Encryption', 'AES-256-GCM'],
            ['Network',    'SECURE:443'],
            ['Status',
              phase === 'scanning'     ? (isModelLoading ? 'LOADING AI...' : 'SCANNING') :
              phase === 'face_found'   ? 'ID CONFIRMED' :
              phase === 'face_denied'  ? 'FACE DENIED'  :
              phase === 'voice'        ? 'VOICE MFA'    :
              isGranted                ? 'GRANTED'      : 'DENIED'
            ],
            ['Time', currentTime],
          ] as [string, string][]).map(([label, val]) => (
            <div key={label} className="flex flex-col">
              <span>{label}</span>
              <span className={`font-bold ${val === 'DENIED' || val === 'FACE DENIED' ? 'text-red-500' : 'text-[var(--accent)]'}`}>
                {val}
              </span>
            </div>
          ))}
        </div>
      </header>

      <div className="relative z-20 grid grid-cols-1 gap-2 border-b border-[var(--border)] bg-black/40 px-4 py-2 md:grid-cols-3">
        <StepBadge number="01" label="FACE_SCAN" status={getStepStatus('face')} />
        <StepBadge number="02" label="VOICE_AUTH" status={getStepStatus('voice')} />
        <StepBadge number="03" label="ACCESS_RESULT" status={getStepStatus('result')} />
      </div>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] overflow-hidden">

        {/* ── Camera / Scanner View ──────────────────────────────────────── */}
              <section className="relative bg-black border-r border-[var(--border)] overflow-hidden h-full flex items-center justify-center">
        <video ref={videoRef} autoPlay muted playsInline
          className="w-full h-full object-cover opacity-75"
          style={{ filter: 'grayscale(20%) contrast(1.2)' }} />

        {cameraError && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm">
            <div className="w-[90%] max-w-xl border border-red-500/60 bg-red-950/20 p-6 text-center font-mono shadow-[0_0_35px_rgba(239,68,68,0.35)]">
              <div className="mb-3 text-xs font-black tracking-[0.4em] text-red-400">
                CAMERA MODULE ERROR
              </div>

              <h2 className="mb-3 text-2xl font-black tracking-widest text-red-500">
                CAMERA ACCESS REQUIRED
              </h2>

              <p className="mb-5 text-xs leading-relaxed tracking-widest text-red-200/80">
                ALLOW CAMERA PERMISSION TO CONTINUE BIOMETRIC SCANNING.
              </p>

              <button
                onClick={() => {
                  setCameraError(false);
                  setHasStarted(false);
                  setPhase('scanning');
                }}
                className="border border-red-500 px-5 py-3 text-[10px] font-black tracking-[0.3em] text-red-300 transition-all hover:bg-red-500 hover:text-black"
              >
                RETURN TO INITIAL PAGE
              </button>
            </div>
          </div>
        )}

          {/* Scan box */}
          <div className={`absolute top-[15%] left-[25%] w-1/2 h-[60%] border-2 rounded-lg pointer-events-none transition-colors duration-500
            ${boxRed
              ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]'
              : 'border-[var(--accent)] shadow-[0_0_20px_var(--accent-glow)]'}`}>
            {(['top-[-2px] left-[-2px] border-t-[3px] border-l-[3px]',
               'top-[-2px] right-[-2px] border-t-[3px] border-r-[3px]',
               'bottom-[-2px] left-[-2px] border-b-[3px] border-l-[3px]',
               'bottom-[-2px] right-[-2px] border-b-[3px] border-r-[3px]'] as string[]).map((cls, i) => (
              <div key={i} className={`absolute w-5 h-5 ${cornerCls} ${cls}`} />
            ))}
            {phase === 'scanning' && !isModelLoading && (
              <motion.div
                initial={{ top: '0%' }} animate={{ top: '100%' }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                className={`absolute left-0 w-full h-[2px] opacity-60 ${boxRed ? 'bg-red-500' : 'bg-[var(--accent)]'}`}
              />
            )}
          </div>

          {/* Face label above scan box */}
          <div className={`absolute font-mono text-[10px] tracking-[3px] uppercase pointer-events-none
            ${boxRed ? 'text-red-500' : 'text-[var(--accent)]'}`}
            style={{ top: 'calc(15% - 20px)', left: '25%', width: '50%', textAlign: 'center' }}>
            {isModelLoading          ? 'INITIALIZING AI...' :
             phase === 'scanning'    ? 'SCANNING...'        :
             phase === 'face_denied' ? 'UNKNOWN FACE'       :
             selectedUser?.name.toUpperCase() ?? ''}
          </div>

          {/* Status badge */}
          <div className={`absolute top-3 right-3 px-3 py-1 font-mono text-[10px] font-bold tracking-[2px] uppercase rounded border bg-[rgba(15,23,42,0.85)]
            ${boxRed ? 'border-red-500 text-red-500' : 'border-[var(--accent)] text-[var(--accent)]'}`}>
            {isModelLoading          ? 'INITIALIZING'  :
             phase === 'scanning'    ? 'SCANNING'      :
             phase === 'face_found'  ? 'ID CONFIRMED'  :
             phase === 'face_denied' ? 'ACCESS DENIED' :
             phase === 'voice'       ? 'VOICE MFA'     :
             isGranted               ? 'ACCESS GRANTED': 'ACCESS DENIED'}
          </div>

          {/* Bottom-left info */}
          <div className="absolute bottom-4 left-4 font-mono text-[10px] bg-[rgba(15,23,42,0.85)] p-2 border-l-[3px] border-[var(--accent)] leading-relaxed">
            MATCH CONFIDENCE: <span className="text-[var(--accent)]">{confidence > 0 ? confidence.toFixed(1) : '--.-'}%</span><br />
            VECTORS: <span className="text-[var(--accent)]">{vectors > 0 ? vectors : '0'}</span><br />
            THERMAL: <span className="text-[var(--accent)]">OPTIMAL</span>
          </div>

          {/* Bottom-right progress */}
          <div className="absolute bottom-4 right-4 w-[140px]">
            <div className="text-[9px] font-mono text-[var(--text-secondary)] mb-1 text-right">FACE LOCK</div>
            <div className="h-[3px] bg-[var(--border)] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-150 ${boxRed ? 'bg-red-500' : 'bg-[var(--accent)]'}`}
                style={{ width: `${(confidence / 98.4) * 100}%` }} />
            </div>
          </div>
        </section>

        {/* ── Right Panel ────────────────────────────────────────────────── */}
        <section className="bg-[var(--card-bg)] flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">

            {/* Phase 1 — Scanning / Face Found */}
            {(phase === 'scanning' || phase === 'face_found') && (
              <motion.div key="phase1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-4 border-b border-[var(--border)]">
                <div className="flex justify-between items-center mb-3 font-mono text-[9px] uppercase tracking-widest">
                  <span className="text-[var(--text-secondary)]">Phase 01: Visual Identity</span>
                  <span className={`font-bold ${phase === 'face_found' ? 'text-[var(--accent)]' : 'text-amber-400'}`}>
                    {phase === 'face_found' ? 'ID CONFIRMED' : `AWAITING FACE...`}
                  </span>
                </div>
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {displayUsers.map((user) => {
                    const isMatch    = phase === 'face_found' && selectedUser?.id === user.id;
                    return (
                      <div key={user.id} className={`flex items-center gap-3 p-2 rounded-md border transition-colors duration-200
                        ${isMatch    ? 'border-[var(--accent)] bg-[rgba(74,222,128,0.05)]'
                        : 'border-[var(--border)] bg-[var(--bg)]'}`}>
                        <div className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0
                          ${isMatch    ? 'border-[var(--accent)] text-[var(--accent)]'
                          : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>
                          {isMatch ? <CheckCircle className="w-4 h-4" /> : <Fingerprint className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="text-xs font-semibold">{user.name}</div>
                          <div className={`text-[9px] font-mono uppercase
                            ${isMatch ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                            ID: {String(user.id).padStart(4, '0')} {isMatch ? '— MATCHED' : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Phase 1 DENIED — Unknown Face */}
            {phase === 'face_denied' && (
              <motion.div key="face_denied"
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="p-5 border-b border-[var(--border)] text-center">
                <div className="mb-3 flex justify-center">
                  <UserX className="w-14 h-14 text-red-500" />
                </div>
                <h2 className="text-xl font-black uppercase tracking-tighter italic text-red-500">
                  ACCESS DENIED
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Unrecognized face detected</p>
                <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded font-mono text-[9px] text-red-400 tracking-widest">
                  FACE NOT REGISTERED IN DATABASE
                </div>
                <p className="mt-3 text-[9px] font-mono text-[var(--text-secondary)]">
                  Restarting scan automatically...
                </p>
                <button onClick={startAutoScan}
                  className="mt-3 px-5 py-2 border border-[var(--border)] hover:bg-[var(--bg)] transition-colors rounded text-[10px] uppercase tracking-widest font-bold font-mono">
                  Restart Now
                </button>
              </motion.div>
            )}

            {/* Phase 2 — Voice */}
            {phase === 'voice' && selectedUser && (
              <motion.div key="phase2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-4 border-b border-[var(--border)]">
                <div className="flex justify-between items-center mb-3 font-mono text-[9px] uppercase tracking-widest">
                  <span className="text-[var(--text-secondary)]">Phase 02: Voice Verification</span>
                  <span className={`font-bold ${isListening ? 'text-amber-400' : 'text-[var(--text-primary)]'}`}>
                    {isListening ? 'LISTENING...' : 'AWAITING INPUT...'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mb-4 p-2 border border-[var(--accent)] rounded-md bg-[var(--bg)]">
                  <div className="w-9 h-9 rounded-full border border-[var(--accent)] flex items-center justify-center text-[var(--accent)] flex-shrink-0">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">{selectedUser.name}</div>
                    <div className="text-[9px] font-mono text-[var(--accent)] uppercase">VISUAL_ID: VERIFIED</div>
                  </div>
                </div>
                <div className="bg-[var(--bg)] border border-dashed border-[var(--border)] p-3 rounded-md text-center mb-3">
                  <div className="text-[9px] text-[var(--text-secondary)] uppercase tracking-widest mb-2">Ucapkan Passphrase:</div>
                  <div className="font-mono text-sm tracking-wider italic text-[var(--text-primary)]">
                    {phraseVisible ? `"${getUserPassphrase(selectedUser.name)}"` : '**************'}
                  </div>
                  <div className="flex items-center justify-center gap-[3px] h-[28px] mt-2">
                    {voiceBars.map((h, i) => (
                      <div key={i} className="w-[3px] bg-[var(--accent)] rounded-sm transition-all duration-100"
                        style={{ height: `${h * 28}px` }} />
                    ))}
                  </div>
                  {transcript && (
                    <div className="mt-2 text-[10px] font-mono text-[var(--text-secondary)]">&gt; "{transcript}"</div>
                  )}
                </div>
                <button onClick={toggleListening}
                  className={`w-full p-3 font-bold rounded-md flex items-center justify-center gap-2 uppercase text-[11px] tracking-widest transition-all font-mono
                    ${isListening
                      ? 'bg-amber-400 text-[var(--bg)]'
                      : 'bg-[var(--accent)] text-[var(--bg)] shadow-[0_0_16px_var(--accent-glow)]'}`}>
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {isListening ? 'Stop Listening' : 'Initialize Voice Scan'}
                </button>
                {isVoiceVerifying && (
                  <div className="mt-4 flex items-center gap-3 border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 font-mono text-xs tracking-widest text-yellow-300">
                    <span className="h-2 w-2 animate-ping rounded-full bg-yellow-400"></span>
                    <span>PROCESSING VOICE SIGNATURE...</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Phase 3 — Result */}
{phase === 'result' && authResult && (
  <motion.div key="phase3" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
    className="p-5 border-b border-[var(--border)] text-center">
    
    <div className="mb-3 flex justify-center">
      {isGranted
        ? <CheckCircle className="w-14 h-14 text-[var(--accent)]" />
        : <AlertTriangle className="w-14 h-14 text-red-500" />}
    </div>

    <h2 className={`text-xl font-black uppercase tracking-tighter italic ${isGranted ? 'text-[var(--accent)]' : 'text-red-500'}`}>
      {isGranted ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
    </h2>

    <p className="text-xs text-[var(--text-secondary)] mt-1">
      {isGranted ? `Welcome, ${authResult.user?.name}` : authResult.message}
    </p>

    {isGranted && (
      <>
        <p className="text-[10px] text-[var(--text-secondary)] mt-1">Role: {authResult.user?.role}</p>
        
        {/* --- LOADING SIMPEL MULAI DI SINI --- */}
        <div className="mt-6 flex flex-col items-center gap-3">
          {/* Spinner kecil warna hijau accent */}
          <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
          
          <p className="text-[9px] text-[var(--accent)] animate-pulse tracking-[0.2em] font-mono">
            PREPARING_SECURE_SESSION...
          </p>
        </div>
        {/* --- LOADING SIMPEL SELESAI DI SINI --- */}
      </>
    )}
                {isDuress && (
                  <div className="mt-3 p-2 bg-red-500/10 border border-red-500/40 rounded text-[9px] font-mono text-red-400 tracking-wider flex items-center justify-center gap-2">
                    <ShieldAlert className="w-3 h-3" />
                    DURESS PROTOCOL ACTIVE — UNKNOWN USER WARNING TRIGGERED
                  </div>
                )}
                <button onClick={startAutoScan}
                  className="mt-4 px-5 py-2 border border-[var(--border)] hover:bg-[var(--bg)] transition-colors rounded text-[10px] uppercase tracking-widest font-bold font-mono">
                  Restart Protocol
                </button>
              </motion.div>
            )}

          </AnimatePresence>

          {/* ── Activity Logs ─────────────────────────────────────────────── */}
          <div className="flex-1 p-4 font-mono text-[10px] overflow-hidden flex flex-col">
            <div className="mb-2 font-bold border-b border-[var(--border)] pb-2 tracking-widest flex items-center gap-2 text-[9px] uppercase">
              <Lock className="w-3 h-3 text-[var(--accent)]" />
              ACCESS EVENT LOGS
              <span className="ml-auto w-[6px] h-[6px] rounded-full bg-[var(--accent)] inline-block"
                style={{ animation: 'pulse 1.5s ease infinite' }} />
            </div>
            <div className="flex-1 overflow-y-auto space-y-[2px]">
              {logs.map((log, i) => (
                <motion.div key={`${log.time}-${i}`}
                  initial={i === 0 ? { opacity: 0, x: -6 } : { opacity: 1 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex gap-2 py-[3px] border-b border-white/[0.03]">
                  <span className="text-[var(--text-secondary)] min-w-[58px]">[{log.time}]</span>
                  <span className={`min-w-[48px] font-bold ${log.status === 'GRANTED' ? 'text-[var(--accent)]' : 'text-red-500'}`}>
                    {log.status}
                  </span>
                  <span className="truncate">
                    {log.status === 'GRANTED' ? `USER: ${log.user}` : log.user}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <style>{`
        :root {
          --bg: #020617; --card-bg: #0f172a; --panel: #1e293b;
          --border: #334155; --accent: #4ade80; --accent-glow: rgba(74,222,128,0.2);
          --danger: #ef4444; --text-primary: #f8fafc; --text-secondary: #94a3b8;
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
      `}</style>
    </div>
  );
}