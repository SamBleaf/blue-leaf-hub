import { useCallback, useRef, useState } from "react";

/**
 * Web Speech API voice capture (en-AU). Returns the live transcript while listening.
 * Browser support varies — `error` is set with a friendly message when unsupported/denied.
 * Extracted from the original SupervisorHome so the field app + supervisor page can share it.
 */
export function useVoiceCapture() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const recognizerRef = useRef(null);

  const start = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setError("Voice capture isn't supported in this browser — type your note instead."); return; }
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-AU";
    recognizerRef.current = r;
    let final = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      setTranscript((final + interim).trim());
    };
    r.onerror = (e) => { setError(e.error || "Voice capture error"); setListening(false); };
    r.onend = () => setListening(false);
    r.start();
    setListening(true);
    setError("");
  }, []);

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
    setListening(false);
  }, []);

  const clear = useCallback(() => { setTranscript(""); setError(""); }, []);

  return { listening, transcript, error, start, stop, clear, setTranscript };
}

export default useVoiceCapture;
