// Prints a fresh VAPID key pair (P-256, base64url) as the SQL that stores it in Vault.
// Run once per Supabase project: node supabase/scripts/vapid-keys.mjs
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-65); // uncompressed point
console.log(`select vault.create_secret('${pub.toString('base64url')}', 'vapid_public_key');`);
console.log(`select vault.create_secret('${jwk.d}', 'vapid_private_key');`);
