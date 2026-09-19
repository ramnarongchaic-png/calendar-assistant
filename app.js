/**
 * Voice-Activated Shared Calendar Assistant
 */
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxrehfkNqflvIN_cW2XnTfyxY9TVovb6PTMCKd7qozHCf7uuJ_pROpYDlPAmnZEEm8O/exec'; // Replace with your GAS Web App URL
const SECRET_TOKEN = 'my-secret-123'; // Replace with your secret token
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const replyEl = document.getElementById('reply');
const micBtn = document.getElementById('mic-btn');

/** @type {'idle' | 'listening' | 'error'} */
let uiState = 'idle';
let recognition = null;
let isListening = false;

function isSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function setStatus(text, kind = 'idle') {
  statusEl.textContent = text;
  statusEl.classList.remove('is-error', 'is-idle');
  if (kind === 'error') statusEl.classList.add('is-error');
  if (kind === 'idle') statusEl.classList.add('is-idle');
}

function setUiState(state) {
  uiState = state;
  micBtn.classList.toggle('listening', state === 'listening');
  micBtn.classList.toggle('error', state === 'error');
  micBtn.setAttribute('aria-pressed', state === 'listening' ? 'true' : 'false');
}

function setTranscript(text, isFinal) {
  transcriptEl.textContent = text || '—';
  transcriptEl.classList.toggle('is-interim', !isFinal && !!text);
  transcriptEl.classList.toggle('is-final', !!isFinal && !!text);
}

function setReply(text) {
  replyEl.textContent = text || '—';
}

function speak(text) {
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'th-TH';
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

function createRecognition() {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognitionCtor();
  rec.lang = 'th-TH';
  rec.interimResults = true;
  rec.continuous = false;

  rec.onstart = () => {
    isListening = true;
    setUiState('listening');
    setStatus('กำลังฟัง…', 'listening');
    setTranscript('', false);
    setReply('—');
  };

  rec.onresult = async (event) => {
    let interim = '';
    let finalText = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const chunk = result[0].transcript;
      if (result.isFinal) {
        finalText += chunk;
      } else {
        interim += chunk;
      }
    }

    if (finalText) {
      const text = finalText.trim();
      setTranscript(text, true);
      setStatus('กำลังประมวลผล...', 'idle');
      
      try {
        const response = await fetch(GAS_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          // Send plain JSON string directly to GAS
          body: JSON.stringify({
            text: text,
            secret_token: SECRET_TOKEN,
            current_time: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        });

        const result = await response.json();

        if (result.success) {
          let replyMsg = '';
          if (result.action === 'create') {
            replyMsg = `บันทึกกิจกรรม ${result.title || ''} เรียบร้อยแล้ว`;
          } else if (result.action === 'update') {
            replyMsg = `อัปเดตกิจกรรม ${result.title || ''} เรียบร้อยแล้ว`;
          } else if (result.action === 'delete') {
            replyMsg = `ยกเลิกกิจกรรม ${result.title || ''} เรียบร้อยแล้ว`;
          } else {
            replyMsg = 'ดำเนินการเรียบร้อยแล้ว';
          }
          setReply(replyMsg);
          speak(replyMsg);
        } else {
          const errMsg = `เกิดข้อผิดพลาด: ${result.message || 'ไม่ทราบสาเหตุ'}`;
          setReply(errMsg);
          speak('ขออภัย ไม่สามารถดำเนินการได้ เกิดข้อผิดพลาดบางอย่าง');
          setStatus('เกิดข้อผิดพลาด', 'error');
        }
      } catch (err) {
        console.error(err);
        setReply('ไม่สามารถเชื่อมต่อกับระบบได้');
        speak('ขออภัย ไม่สามารถเชื่อมต่อกับระบบได้ โปรดลองอีกครั้ง');
        setStatus('ไม่สามารถเชื่อมต่อระบบ', 'error');
      }
    } else if (interim) {
      setTranscript(interim.trim(), false);
    }
  };

  rec.onerror = (event) => {
    isListening = false;
    setUiState('error');

    const messages = {
      'not-allowed': 'ไม่ได้รับอนุญาตใช้ไมโครโฟน — โปรดอนุญาตแล้วลองใหม่',
      'service-not-allowed': 'ไม่ได้รับอนุญาตใช้ไมโครโฟน — โปรดอนุญาตแล้วลองใหม่',
      'audio-capture': 'ไม่พบไมโครโฟน หรือใช้งานไม่ได้',
      'no-speech': 'ไม่ได้ยินเสียงพูด ลองพูดอีกครั้ง',
      aborted: 'หยุดฟังแล้ว',
      network: 'เครือข่ายมีปัญหา ลองใหม่อีกครั้ง',
    };

    const msg = messages[event.error] || `เกิดข้อผิดพลาด: ${event.error}`;
    setStatus(msg, 'error');
    setReply(msg);

    // Brief error flash, then return to idle (except keep message visible)
    setTimeout(() => {
      setUiState('idle');
      setStatus('พร้อม', 'idle');
    }, 2200);
  };

  rec.onend = () => {
    isListening = false;
    if (uiState === 'listening') {
      setUiState('idle');
      setStatus('พร้อม', 'idle');
    }
  };

  return rec;
}

function startListening() {
  if (!recognition || isListening) return;
  try {
    recognition.start();
  } catch (err) {
    setUiState('error');
    setStatus('เริ่มฟังไม่ได้ ลองใหม่อีกครั้ง', 'error');
    setTimeout(() => {
      setUiState('idle');
      setStatus('พร้อม', 'idle');
    }, 2000);
  }
}

function stopListening() {
  if (!recognition || !isListening) return;
  try {
    recognition.stop();
  } catch (_) {
    /* ignore */
  }
}

function onMicClick() {
  if (!isSpeechSupported()) return;
  if (isListening) {
    stopListening();
  } else {
    startListening();
  }
}

function init() {
  if (!isSpeechSupported()) {
    setUiState('idle');
    setStatus('เบราว์เซอร์นี้ไม่รองรับการพูด — ใช้ Chrome หรือ Edge', 'error');
    setReply('โปรดเปิดหน้านี้ใน Google Chrome หรือ Microsoft Edge');
    micBtn.disabled = true;
    return;
  }

  recognition = createRecognition();
  setStatus('พร้อม', 'idle');
  micBtn.addEventListener('click', onMicClick);
}

init();
