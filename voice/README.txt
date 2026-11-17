Fungi Field Key: offline voice pack (Session 14, 16 November 2026)

Published in the site's voice/ folder, beside index.html. The app downloads these files on request into its own cache
("ffk-voice-1") and runs the speech model in voice-worker.js, on the phone, with no signal. Nothing is fetched from any other site.

  voice-worker.js                         the worker (this project)
  transformers.min.js                     transformers.js 4.3.2, npm @huggingface/transformers, dist/transformers.min.js (Apache 2.0, LICENSE-transformers.txt)
  ort-wasm-simd-threaded.mjs, .wasm       ONNX Runtime Web, npm onnxruntime-web 1.31.0-dev.20260914-8d85527a0, dist/ (MIT, LICENSE-onnxruntime.txt)
  models/moonshine-base/                  Hugging Face onnx-community/moonshine-base-ONNX: config.json, generation_config.json,
                                          preprocessor_config.json, tokenizer.json, tokenizer_config.json,
                                          onnx/encoder_model_quantized.onnx, onnx/decoder_model_merged_quantized.onnx (MIT, LICENSE-moonshine.txt)
