// Minisign signature checks as the Tauri updater does them (Ed25519; "ED" signs the BLAKE2b-512
// hash of the file). Used by the release scripts to confirm an installer verifies against the
// public key in tauri.conf.json before it is published.
import { createHash, createPublicKey, verify } from "node:crypto";

const lines = (b64) => Buffer.from(b64.trim(), "base64").toString("utf8").split("\n");

export function parsePublicKey(b64) {
  const raw = Buffer.from(lines(b64)[1].trim(), "base64");
  if (raw.length !== 42 || raw.toString("latin1", 0, 2) !== "Ed") throw new Error("not a minisign public key");
  return { keyId: raw.subarray(2, 10), key: raw.subarray(10) };
}

export function parseSignature(b64) {
  const l = lines(b64);
  if (!l[0].startsWith("untrusted comment:") || !l[2]?.startsWith("trusted comment:")) throw new Error("not a minisign signature");
  const sig = Buffer.from(l[1].trim(), "base64");
  if (sig.length !== 74) throw new Error("bad signature length");
  const alg = sig.toString("latin1", 0, 2);
  if (alg !== "ED" && alg !== "Ed") throw new Error("unknown signature algorithm");
  return { alg, keyId: sig.subarray(2, 10), sig: sig.subarray(10), trusted: l[2].slice("trusted comment: ".length), global: Buffer.from(l[3].trim(), "base64") };
}

const ed = (key) => createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.toString("base64url") }, format: "jwk" });

/** True only when the file, its trusted comment and the key id all check out. */
export function verifyFile(fileBytes, signatureB64, publicKeyB64) {
  let pk, s;
  try {
    pk = parsePublicKey(publicKeyB64);
    s = parseSignature(signatureB64);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "malformed key or signature" };
  }
  if (!pk.keyId.equals(s.keyId)) return { ok: false, reason: "signed with a different key" };
  const key = ed(pk.key);
  const msg = s.alg === "ED" ? createHash("blake2b512").update(fileBytes).digest() : fileBytes;
  if (!verify(null, msg, key, s.sig)) return { ok: false, reason: "file signature does not match" };
  if (!verify(null, Buffer.concat([s.sig, Buffer.from(s.trusted, "utf8")]), key, s.global)) return { ok: false, reason: "trusted comment signature does not match" };
  return { ok: true, trusted: s.trusted };
}
