const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_API_URL = 'http://127.0.0.1:8787/api/mrz';
const PYTHON_PATH = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
const SCRIPT_PATH = path.join(__dirname, 'open_mrz_engine.py');

/**
 * Goi Open MRZ qua REST API HTTP
 * @param {string} base64Image Chuoi anh Base64
 * @param {string} endpoint URL endpoint (mac dinh http://127.0.0.1:8787/api/mrz)
 * @returns {Promise<any>}
 */
function recognizeViaHttp(base64Image, endpoint = DEFAULT_API_URL) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const postData = JSON.stringify({ image: base64Image });

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 10000,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(rawData);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            }
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Goi Open MRZ truc tiep qua Python Process
 * @param {string} imagePath Duong dan file anh
 * @returns {Promise<any>}
 */
function recognizeViaCli(imagePath) {
  return new Promise((resolve, reject) => {
    const resolvedPath = path.resolve(imagePath);
    if (!fs.existsSync(resolvedPath)) {
      return reject(new Error(`File khong ton tai: ${resolvedPath}`));
    }

    const pyCode = `
import json, sys
from open_mrz_engine import ENGINE
res = ENGINE.recognize_image(sys.argv[1])
print(json.dumps(res, ensure_ascii=False))
`;

    const proc = spawn(PYTHON_PATH, ['-c', pyCode, resolvedPath], {
      cwd: __dirname,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python process failed: ${stderr.trim()}`));
      }
      try {
        const jsonRes = JSON.parse(stdout.trim());
        resolve(jsonRes);
      } catch (e) {
        reject(new Error(`JSON parse error: ${e.message}`));
      }
    });
  });
}

/**
 * Nhan dien MRZ (Tu dong thu HTTP neu server dang chay, fallback CLI)
 * @param {string} imagePathOrBase64 Duong dan file hoac chuoi Base64
 * @returns {Promise<any>}
 */
async function recognizeMrz(imagePathOrBase64) {
  if (typeof imagePathOrBase64 !== 'string') {
    throw new Error('Dau vao phai la duong dan file hoac chuoi base64');
  }

  // Truong hop la duong dan file
  if (fs.existsSync(imagePathOrBase64)) {
    try {
      return await recognizeViaCli(imagePathOrBase64);
    } catch (_) {
      const b64 = fs.readFileSync(imagePathOrBase64).toString('base64');
      return await recognizeViaHttp(b64);
    }
  }

  // Truong hop la chuoi base64
  return await recognizeViaHttp(imagePathOrBase64);
}

module.exports = {
  recognizeMrz,
  recognizeViaHttp,
  recognizeViaCli,
};
