import { constants, createDecipheriv, createHash, privateDecrypt } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { chmod, readFile, writeFile } from 'node:fs/promises';

const [packagePath = 'data/private-import.enc', privateKeyPath = '.private-import-key.pem', outputPath = '.private-import.json'] = process.argv.slice(2);

const packageData = JSON.parse(await readFile(packagePath, 'utf8'));
if (packageData.version !== 1) throw new Error('Unsupported private import package version.');
for (const key of ['encrypted_key', 'iv', 'tag', 'ciphertext', 'payload_sha256']) {
  if (typeof packageData[key] !== 'string' || !packageData[key]) throw new Error(`Encrypted package field ${key} is required.`);
}
const privateKey = await readFile(privateKeyPath, 'utf8');
const contentKey = privateDecrypt({
  key: privateKey,
  padding: constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha256'
}, Buffer.from(packageData.encrypted_key, 'base64'));
const decipher = createDecipheriv('aes-256-gcm', contentKey, Buffer.from(packageData.iv, 'base64'));
decipher.setAuthTag(Buffer.from(packageData.tag, 'base64'));
const compressed = Buffer.concat([
  decipher.update(Buffer.from(packageData.ciphertext, 'base64')),
  decipher.final()
]);
const payloadBytes = gunzipSync(compressed);
const payloadHash = createHash('sha256').update(payloadBytes).digest('hex');
if (payloadHash !== packageData.payload_sha256) throw new Error('Decrypted payload SHA-256 does not match.');
const payload = JSON.parse(payloadBytes.toString('utf8'));
if (payload.version !== 1 || !Array.isArray(payload.items)) throw new Error('Private import payload is invalid.');
const noteCount = payload.items.reduce((sum, item) => sum + (Array.isArray(item.notes) ? item.notes.length : 0), 0);
if (Number(packageData.expected_works) !== payload.items.length) throw new Error('Encrypted package work count does not match.');
if (Number(packageData.expected_notes) !== noteCount) throw new Error('Encrypted package note count does not match.');
await writeFile(outputPath, payloadBytes, { mode: 0o600 });
await chmod(outputPath, 0o600);
console.log(JSON.stringify({ works: payload.items.length, notes: noteCount, sha256: payloadHash }));
