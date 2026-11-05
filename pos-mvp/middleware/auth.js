// pos-mvp/middleware/auth.js
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatic Environment Configuration Loader (.env)
if (!process.env.MANAGER_PIN_HASH) {
  const envCandidatePaths = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'pos-mvp', '.env')
  ];
  for (const envFilePath of envCandidatePaths) {
    if (fs.existsSync(envFilePath)) {
      try {
        const rawEnv = fs.readFileSync(envFilePath, 'utf8');
        for (const line of rawEnv.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const k = trimmed.slice(0, eqIdx).trim();
            let v = trimmed.slice(eqIdx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (!process.env[k]) {
              process.env[k] = v;
            }
          }
        }
      } catch {}
    }
  }
}

export const verifyManagerPin = async (request, reply) => {
  // Extract PIN from headers (for API calls) or body/query (for specific POSTs/GETs)
  const pin = request.headers['x-manager-pin'] || request.body?.pin || request.query?.pin;

  if (!pin) {
    return reply.code(401).send({ error: 'Manager PIN required for this action.' });
  }

  const hash = process.env.MANAGER_PIN_HASH;
  if (!hash) {
    request.log.error('CRITICAL: MANAGER_PIN_HASH is missing from .env');
    return reply.code(500).send({ error: 'Server authentication misconfigured.' });
  }

  try {
    // Bcrypt safely compares the raw input against the hash without exposing it
    const isValid = await bcrypt.compare(pin.toString(), hash);

    if (!isValid) {
      request.log.warn(`Unauthorized manager action attempted from IP: ${request.socket?.remoteAddress || 'unknown'}`);
      return reply.code(403).send({ error: 'Invalid Manager PIN.' });
    }

    // Valid: route proceeds
  } catch (error) {
    request.log.error('Bcrypt comparison failed:', error);
    return reply.code(500).send({ error: 'Authentication processing error.' });
  }
};

// Aliased for full backward compatibility across all existing domain route plugins
export const managerAuth = verifyManagerPin;

export default verifyManagerPin;
