const fs = require('fs');
const path = require('path');

function generateWav(sampleRate, frequency, duration, volume, type) {
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    let sample;
    const t = i / sampleRate;

    if (type === 'success') {
      const freq1 = frequency;
      const freq2 = frequency * 1.5;
      const env = Math.min(1, t * 20) * Math.pow(1 - t / duration, 2);
      sample = Math.sin(2 * Math.PI * freq1 * t) * 0.5 + Math.sin(2 * Math.PI * freq2 * t) * 0.3;
      sample *= env * volume;
    } else if (type === 'error') {
      const env = Math.min(1, t * 30) * Math.pow(1 - t / duration, 1.5);
      sample = Math.sin(2 * Math.PI * frequency * t) * env * volume;
      if (t > duration * 0.4) {
        sample *= Math.sin(2 * Math.PI * (frequency * 0.75) * t) * 0.8;
      }
    } else {
      sample = Math.sin(2 * Math.PI * frequency * t) * volume;
    }

    const intSample = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }

  return buffer;
}

const outDir = __dirname;

const successBuffer = generateWav(22050, 880, 0.15, 0.6, 'success');
fs.writeFileSync(path.join(outDir, 'scan-success.wav'), successBuffer);
console.log('生成成功音效: scan-success.wav', successBuffer.length, 'bytes');

const errorBuffer = generateWav(22050, 330, 0.25, 0.5, 'error');
fs.writeFileSync(path.join(outDir, 'scan-error.wav'), errorBuffer);
console.log('生成失败音效: scan-error.wav', errorBuffer.length, 'bytes');

console.log('音效文件生成完成');
