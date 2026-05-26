#!/usr/bin/env node
const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('public/index.html', 'utf8');
const api = fs.readFileSync('functions/api/transcribe.js', 'utf8');

assert(
  /<input[^>]+type=["']file["'][^>]+id=["']audioFile["']/i.test(html) ||
    /<input[^>]+id=["']audioFile["'][^>]+type=["']file["']/i.test(html),
  'UI must include an audio file input with id="audioFile"'
);

assert(
  /accept=["'][^"']*audio\/\*/i.test(html),
  'Audio file input must restrict picker to audio files with accept="audio/*"'
);

assert(
  /function\s+handleFileUpload\s*\(/.test(html) || /const\s+handleFileUpload\s*=/.test(html),
  'UI must define handleFileUpload() for uploaded audio files'
);

assert(
  /addEventListener\(["']change["']\s*,\s*handleFileUpload\)/.test(html) || /onchange=["']handleFileUpload\(/.test(html),
  'Audio file input must call handleFileUpload when a file is selected'
);

assert(
  /transcribe\([^,]+,\s*[^)]*\.name/.test(html),
  'Uploaded files must pass the original filename into transcribe()'
);

assert(
  /formData\.append\(["']file["']\s*,\s*blob\s*,\s*fileName/.test(html),
  'transcribe() must append fileName, not always recording.webm'
);

assert(
  /formData\.get\(["']fileName["']\)/.test(api),
  'API must read fileName from form data'
);

assert(
  /api\.deepgram\.com\/v1\/listen/.test(api),
  'API must call Deepgram prerecorded transcription endpoint'
);

assert(
  /model:\s*["']nova-3["']/.test(api) || /model=nova-3/.test(api),
  'API must use Deepgram Nova-3 for supported languages'
);

assert(
  /env\.DEEPGRAM_API_KEY/.test(api),
  'API must authenticate Deepgram with DEEPGRAM_API_KEY'
);

assert(
  /transcribeWithOpenAI/.test(api),
  'API must keep OpenAI fallback for unsupported languages or missing Deepgram key'
);

assert(
  /id=["']outputOriginal["']/.test(html) && /data-output=["']original["']/.test(html),
  'UI must include an explicit original-language transcript option'
);

assert(
  /id=["']outputEnglish["']/.test(html) && /data-output=["']english["']/.test(html),
  'UI must include an English translation option'
);

assert(
  /id=["']outputBoth["']/.test(html) && /data-output=["']both["']/.test(html),
  'UI must include a both transcript + translation option'
);

assert(
  /function\s+setOutputMode\s*\(/.test(html),
  'UI must define setOutputMode()'
);

assert(
  /formData\.append\(["']outputMode["']\s*,\s*selectedOutputMode\)/.test(html),
  'UI must send selectedOutputMode to the API'
);

assert(
  /id=["']downloadBtn["']/.test(html) && /function\s+downloadTranscript\s*\(/.test(html),
  'UI must include a download transcript button and handler'
);

assert(
  /formData\.get\(["']outputMode["']\)/.test(api),
  'API must read outputMode from form data'
);

assert(
  /translateToEnglish/.test(api),
  'API must be able to translate original transcripts to English when requested'
);

assert(
  /originalText/.test(api) && /englishText/.test(api),
  'API response must expose originalText and englishText fields'
);

console.log('Audio upload + Deepgram + output mode guard passed');
