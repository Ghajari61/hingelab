import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { verifyFile } from "../../../scripts/desktop/minisign.mjs";
import conf from "@/desktop/src-tauri/tauri.conf.json";

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");

/** A minisign key pair and signer, as `tauri signer` produces them. */
function signer() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const keyId = Buffer.from(Array.from({ length: 8 }, () => Math.floor(Math.random() * 256)));
  const pub = b64(`untrusted comment: minisign public key\n${b64(Buffer.concat([Buffer.from("Ed"), keyId, raw]))}\n`);
  const signFile = (file: Buffer, trusted = "timestamp:1\tfile:HingeLab_1.0.1_x64-setup.exe") => {
    const sig = sign(null, createHash("blake2b512").update(file).digest(), privateKey);
    const global = sign(null, Buffer.concat([sig, Buffer.from(trusted)]), privateKey);
    return b64(`untrusted comment: signature from tauri secret key\n${b64(Buffer.concat([Buffer.from("ED"), keyId, sig]))}\ntrusted comment: ${trusted}\n${b64(global)}\n`);
  };
  return { pub, signFile };
}

describe("installer signature check (release scripts)", () => {
  const file = Buffer.from("MZ fake installer bytes ".repeat(1000));
  const a = signer();

  it("accepts a correctly signed installer", () => {
    expect(verifyFile(file, a.signFile(file), a.pub)).toMatchObject({ ok: true });
  });

  it("rejects a tampered installer", () => {
    const bad = Buffer.from(file);
    bad[100] ^= 1;
    expect(verifyFile(bad, a.signFile(file), a.pub)).toEqual({ ok: false, reason: "file signature does not match" });
  });

  it("rejects a signature from another key", () => {
    const b = signer();
    expect(verifyFile(file, b.signFile(file), a.pub).ok).toBe(false);
  });

  it("rejects corrupted or truncated signatures", () => {
    const sig = a.signFile(file);
    expect(verifyFile(file, sig.slice(0, 60), a.pub).ok).toBe(false);
    expect(verifyFile(file, "garbage", a.pub).ok).toBe(false);
    const text = Buffer.from(sig, "base64").toString("utf8").replace("timestamp:1", "timestamp:2");
    expect(verifyFile(file, b64(text), a.pub)).toEqual({ ok: false, reason: "trusted comment signature does not match" });
  });

  it("the app's configured updater key is a valid minisign public key", () => {
    const sig = a.signFile(file);
    const r = verifyFile(file, sig, conf.plugins.updater.pubkey);
    expect(r).toEqual({ ok: false, reason: "signed with a different key" });
  });
});
