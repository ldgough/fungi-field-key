/* Fungi Field Key, offline voice pack: speech-to-text worker (Session 14, 16 November 2026).
   Runs the Moonshine base speech model (int8, MIT licence) through transformers.js 4.3.2 (Apache 2.0) on WebAssembly, one thread.
   Every file is read from this folder (voice/), which the app's service worker serves from the voice pack cache; nothing is fetched
   from any other site. Messages in: {type:'load'}, {type:'transcribe', id, audio: Float32Array at 16 kHz}, {type:'dispose'}.
   Messages out: {type:'progress', file, loaded, total}, {type:'ready', ms}, {type:'text', id, text, ms}, {type:'error', id, msg}. */
import { pipeline, env } from './transformers.min.js';
const HERE = new URL('./', self.location.href).href;
env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = 'models/'; env.useBrowserCache = false;
env.backends.onnx.wasm.wasmPaths = { mjs: HERE + 'ort-wasm-simd-threaded.mjs', wasm: HERE + 'ort-wasm-simd-threaded.wasm' };
env.backends.onnx.wasm.numThreads = 1; env.backends.onnx.wasm.proxy = false;
let asr = null;
function load() {
  if (!asr) { const t0 = Date.now();
    asr = pipeline('automatic-speech-recognition', 'moonshine-base', { dtype: 'q8', device: 'wasm',
      progress_callback: p => { if (p && p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); } })
      .then(a => { self.postMessage({ type: 'ready', ms: Date.now() - t0 }); return a; }, e => { asr = null; throw e; }); }
  return asr; }
self.onmessage = async ev => { const m = ev.data || {};
  try {
    if (m.type === 'load') { await load(); return; }
    if (m.type === 'transcribe') { const a = await load(), t0 = Date.now(), sec = m.audio.length / 16000;
      const out = await a(m.audio, { max_new_tokens: Math.max(24, Math.ceil(sec * 8)) });
      self.postMessage({ type: 'text', id: m.id, text: String((out && out.text) || '').trim(), ms: Date.now() - t0, sec }); return; }
    if (m.type === 'dispose') { const a = asr; asr = null; if (a) { try { (await a).dispose(); } catch (e) {} } self.close(); }
  } catch (e) { self.postMessage({ type: 'error', id: m.id, msg: String((e && e.message) || e) }); } };
