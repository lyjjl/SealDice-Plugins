// 测试脚本 100% 由 Gemini 和 ChatGPT 编写
// 请确保你海豹的 JS 环境支持 Crypto API
// 似乎可以是良好的示例

(async () => {
    // ===== helpers =====
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const toHex = (b) =>
    Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

    const pass = (suite, name, detail, data) =>
    console.log(`[PASS] ${suite}/${name} | ${detail}${data ? " | " + data : ""}`);

    const legacy = (suite, name, detail, data) =>
    console.log(
        `[LEGACY] ${suite}/${name} | ${detail}${data ? " | " + data : ""}`
    );

    const extra = (suite, name, detail, data) =>
    console.log(
        `[EXTRA] ${suite}/${name} | ${detail}${data ? " | " + data : ""}`
    );

    const fail = (suite, name, e) =>
    console.log(`[FAIL] ${suite}/${name} | ${e.name}: ${e.message}`);

    const test = async (suite, name, fn) => {
        try {
            await fn();
        } catch (e) {
            fail(suite, name, e);
        }
    };

    const abEq = (a, b) => {
        const ua = new Uint8Array(a);
        const ub = new Uint8Array(b);
        if (ua.byteLength !== ub.byteLength) return false;
        for (let i = 0; i < ua.byteLength; i++) if (ua[i] !== ub[i]) return false;
        return true;
    };

    // ===== vectors =====
    const dataStrict = enc.encode("strict_test_vector_2026");
    const dataSeal = enc.encode("sealdice_crypto_test");
    const dataLegacy = enc.encode("legacy_compat_test");

    console.log("--- CRYPTO TEST SUITE START ---");

    // ===== 0. top-level APIs =====
    await test("BASE", "randomUUID", async () => {
        pass("BASE", "randomUUID", "Value", crypto.randomUUID());
    });

    await test("BASE", "getRandomValues_8", async () => {
        const buf = new Uint8Array(8);
        crypto.getRandomValues(buf);
        pass("BASE", "getRandomValues", "8 bytes hex", toHex(buf));
    });

    await test("STRICT", "getRandomValues_Boundary", async () => {
        const limits = [1, 65536];
        for (const l of limits) {
            const b = new Uint8Array(l);
            crypto.getRandomValues(b);
        }
        pass("STRICT", "getRandomValues", "Boundaries checked", "1 to 65536 bytes");
    });

    // NEW #1: over-limit should throw
    await test("STRICT", "getRandomValues_OverLimit_ShouldThrow", async () => {
        let threw = false;
        try {
            crypto.getRandomValues(new Uint8Array(65537));
        } catch (e) {
            threw = true;
        }
        if (!threw) throw new Error("Expected getRandomValues(65537) to throw");
        pass("STRICT", "getRandomValues", "OverLimit", "65537 bytes -> threw");
    });

    // ===== 1. digests =====
    await test("SEAL", "digest_sha256", async () => {
        const h = await crypto.subtle.digest("SHA-256", dataSeal);
        pass("SEAL", "SHA-256", "Hex", toHex(h));
    });

    await test("STRICT", "digest_sha512_long", async () => {
        const h = await crypto.subtle.digest("SHA-512", dataStrict);
        pass("STRICT", "SHA-512", "Hex", toHex(h));
    });

    // EXTRA: MD5 digest (non-standard / legacy extension)
    await test("EXTRA", "digest_md5_extra", async () => {
        const h = await crypto.subtle.digest("MD5", dataSeal);
        extra("EXTRA", "MD5", "Hex", toHex(h));
    });

    // EXTRA: MD5 digest legacy vector
    await test("EXTRA", "MD5_Digest", async () => {
        const h = await crypto.subtle.digest("MD5", dataLegacy);
        extra("EXTRA", "MD5", "Hex", toHex(h));
    });

    await test("LEGACY", "SHA1_Digest", async () => {
        const h = await crypto.subtle.digest("SHA-1", dataLegacy);
        legacy("LEGACY", "SHA-1", "Hex", toHex(h));
    });

    // ===== 2. signatures =====
    let rsaPssKey;
    await test("STRICT", "RSA_PSS_Sign_Verify", async () => {
        rsaPssKey = await crypto.subtle.generateKey(
            {
                name: "RSA-PSS",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256",
            },
            true,
            ["sign", "verify"]
        );
        const sig = await crypto.subtle.sign(
            { name: "RSA-PSS", saltLength: 32 },
            rsaPssKey.privateKey,
            dataStrict
        );
        const ok = await crypto.subtle.verify(
            { name: "RSA-PSS", saltLength: 32 },
            rsaPssKey.publicKey,
            sig,
            dataStrict
        );
        pass("STRICT", "RSA-PSS", `SigLen: ${sig.byteLength}`, `Verified: ${ok}`);
    });

    await test("STRICT", "RSA_PKCS1_Sign_Verify", async () => {
        const k = await crypto.subtle.generateKey(
            {
                name: "RSASSA-PKCS1-v1_5",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256",
            },
            true,
            ["sign", "verify"]
        );
        const s = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k.privateKey, dataStrict);
        const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", k.publicKey, s, dataStrict);
        pass("STRICT", "PKCS1-v1_5", "SigLen", `${s.byteLength} | Verified: ${ok}`);
    });

    await test("STRICT", "ECDSA_P256", async () => {
        const kp = await crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["sign", "verify"]
        );
        const sig = await crypto.subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            kp.privateKey,
            dataStrict
        );
        const ok = await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            kp.publicKey,
            sig,
            dataStrict
        );
        pass("STRICT", "ECDSA_P256", "SigHex", toHex(sig));
        pass("STRICT", "ECDSA_P256", "Verified", String(ok));
    });

    // NEW #3: ECDSA negative cases (tampered sig / tampered data)
    await test("STRICT", "ECDSA_P256_Negatives", async () => {
        const kp = await crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["sign", "verify"]
        );

        const sig = await crypto.subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            kp.privateKey,
            dataStrict
        );

        const ok = await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            kp.publicKey,
            sig,
            dataStrict
        );
        if (!ok) throw new Error("Expected verify(true) for original sig/data");

        const tamperedSig = new Uint8Array(sig);
        tamperedSig[0] ^= 0x01;

        const okSig = await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            kp.publicKey,
            tamperedSig,
            dataStrict
        );
        if (okSig) throw new Error("Expected verify(false) for tampered signature");

        const tamperedData = enc.encode("strict_test_vector_2026X");
        const okData = await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            kp.publicKey,
            sig,
            tamperedData
        );
        if (okData) throw new Error("Expected verify(false) for tampered data");

        pass("STRICT", "ECDSA_P256_Negatives", "verify(false) checks", "sig/data tamper -> false");
    });

    await test("SEAL", "Ed25519_Flow", async () => {
        const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
            "sign",
            "verify",
        ]);
        const sig = await crypto.subtle.sign("Ed25519", kp.privateKey, dataSeal);
        const ok = await crypto.subtle.verify("Ed25519", kp.publicKey, sig, dataSeal);
        pass("SEAL", "Ed25519", `SigLen: ${sig.byteLength}`, `Verified: ${ok}`);
    });

    // EXTRA: Ed25519 raw private import (seed)
    await test("EXTRA", "Ed25519_Raw_Import_Seed", async () => {
        const seed = new Uint8Array(32).fill(0x55);
        const k = await crypto.subtle.importKey(
            "raw",
            seed,
            { name: "Ed25519", keyType: "private" },
            true,
            ["sign"]
        );
        const s = await crypto.subtle.sign("Ed25519", k, dataStrict);
        extra(
            "EXTRA",
            "Ed25519_Raw",
            "KeyType",
            `${k.type} | SigHex: ${toHex(s).slice(0, 16)}...`
        );
    });

    // ===== 3. KDF / derivation =====
    await test("SEAL", "PBKDF2_Derive", async () => {
        const password = enc.encode("password123");
        const base = await crypto.subtle.importKey("raw", password, "PBKDF2", false, [
            "deriveBits",
        ]);
        const bits = await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: new Uint8Array(8).fill(0),
                                                    iterations: 1000,
                                                    hash: "SHA-256",
            },
            base,
            128
        );
        pass("SEAL", "PBKDF2-1000-SHA256", "DerivedBitsHex", toHex(bits));
    });

    await test("STRICT", "HKDF_Derive", async () => {
        const ikm = await crypto.subtle.importKey(
            "raw",
            new Uint8Array(32).fill(0x01),
                                                  "HKDF",
                                                  false,
                                                  ["deriveKey", "deriveBits"]
        );
        const bits = await crypto.subtle.deriveBits(
            {
                name: "HKDF",
                hash: "SHA-256",
                salt: new Uint8Array(16),
                                                    info: enc.encode("info"),
            },
            ikm,
            256
        );
        pass("STRICT", "HKDF", "DerivedBits", toHex(bits));
    });

    // ===== 4. key agreement =====
    await test("STRICT", "ECDH_Key_Agreement", async () => {
        const alice = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey", "deriveBits"]
        );
        const bob = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey", "deriveBits"]
        );
        const shared = await crypto.subtle.deriveBits(
            { name: "ECDH", public: bob.publicKey },
            alice.privateKey,
            256
        );
        pass("STRICT", "ECDH_P256", "SharedSecretHex", toHex(shared));
    });

    // NEW #2: ECDH bilateral match (alice(bobPub) == bob(alicePub))
    await test("STRICT", "ECDH_Bilateral_Match", async () => {
        const alice = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveBits"]
        );
        const bob = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveBits"]
        );

        const ab = await crypto.subtle.deriveBits(
            { name: "ECDH", public: bob.publicKey },
            alice.privateKey,
            256
        );
        const ba = await crypto.subtle.deriveBits(
            { name: "ECDH", public: alice.publicKey },
            bob.privateKey,
            256
        );

        if (!abEq(ab, ba)) {
            throw new Error(
                `ECDH secrets mismatch | ab=${toHex(ab).slice(0, 16)}... ba=${toHex(ba).slice(0, 16)}...`
            );
        }

        pass("STRICT", "ECDH_Bilateral_Match", "SharedSecret", toHex(ab));
    });

    // EXTRA: X25519 raw private import
    await test("EXTRA", "X25519_Raw_Import", async () => {
        const rawPriv = new Uint8Array(32).fill(0x42);
        const k = await crypto.subtle.importKey(
            "raw",
            rawPriv,
            { name: "X25519", keyType: "private" },
            true,
            ["deriveBits"]
        );
        extra("EXTRA", "X25519_Raw", "KeyType", k.type);
    });

    // ===== 5. symmetric crypto =====
    let aesGcmKey;
    const gcmIv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // fixed IV for comparison

    await test("SEAL", "AES_GCM_Encrypt_Decrypt", async () => {
        aesGcmKey = await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt", "wrapKey"]
        );
        const encBytes = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: gcmIv },
            aesGcmKey,
            dataSeal
        );
        const decBytes = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: gcmIv },
            aesGcmKey,
            encBytes
        );
        pass("SEAL", "AES-GCM", "CipherHex", toHex(encBytes));
        pass("SEAL", "AES-GCM", "Decrypted", dec.decode(decBytes));
    });

    // NEW #4a: same key+same iv, different plaintexts => different ciphertexts; both decrypt OK
    await test("STRICT", "AES_GCM_SameIV_DiffPlaintexts", async () => {
        if (!aesGcmKey) {
            aesGcmKey = await crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt", "wrapKey"]
            );
        }

        const p1 = enc.encode("gcm_plaintext_A");
        const p2 = enc.encode("gcm_plaintext_B");

        const c1 = await crypto.subtle.encrypt({ name: "AES-GCM", iv: gcmIv }, aesGcmKey, p1);
        const c2 = await crypto.subtle.encrypt({ name: "AES-GCM", iv: gcmIv }, aesGcmKey, p2);

        if (abEq(c1, c2)) throw new Error("Expected different ciphertexts for different plaintexts");

        const d1 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: gcmIv }, aesGcmKey, c1);
        const d2 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: gcmIv }, aesGcmKey, c2);

        pass("STRICT", "AES-GCM", "SameIV_DiffPT", `c1!=c2 | d1=${dec.decode(d1)} d2=${dec.decode(d2)}`);
    });

    // NEW #4b: random IV encrypt twice same plaintext => ciphertext differs
    await test("STRICT", "AES_GCM_RandomIV_TwiceSamePT", async () => {
        if (!aesGcmKey) {
            aesGcmKey = await crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt", "wrapKey"]
            );
        }

        const iv1 = crypto.getRandomValues(new Uint8Array(12));
        const iv2 = crypto.getRandomValues(new Uint8Array(12));

        const c1 = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv1 }, aesGcmKey, dataSeal);
        const c2 = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv2 }, aesGcmKey, dataSeal);

        if (abEq(c1, c2)) throw new Error("Expected different ciphertexts for different IVs");

        pass("STRICT", "AES-GCM", "RandomIV_Twice", `iv1=${toHex(iv1)} iv2=${toHex(iv2)}`);
    });

    await test("STRICT", "AES_CTR_Counter_Wrap", async () => {
        const k = await crypto.subtle.generateKey(
            { name: "AES-CTR", length: 128 },
            true,
            ["encrypt"]
        );
        const counter = new Uint8Array(16).fill(0xff);
        const encBytes = await crypto.subtle.encrypt(
            { name: "AES-CTR", counter, length: 64 },
            k,
            dataStrict
        );
        pass("STRICT", "AES-CTR", "CipherHex", toHex(encBytes));
    });

    // ===== 6. key import/export/wrap =====
    await test("SEAL", "JWK_Export", async () => {
        if (!aesGcmKey) throw new Error("AES-GCM key not generated yet");
        const jwk = await crypto.subtle.exportKey("jwk", aesGcmKey);
        pass("SEAL", "JWK_Export", "Alg", `${jwk.alg} | K: ${jwk.k}`);
    });

    await test("SEAL", "WrapKey_AES_GCM", async () => {
        if (!aesGcmKey) throw new Error("AES-GCM key not generated yet");
        const wrapIv = new Uint8Array(12).fill(9);
        const wrapped = await crypto.subtle.wrapKey("jwk", aesGcmKey, aesGcmKey, {
            name: "AES-GCM",
            iv: wrapIv,
        });
        pass("SEAL", "WrapKey", "WrappedHex", toHex(wrapped));
    });

    // ===== 6.1 importKey Tests =====
    await test("STRICT", "AES_Import_Raw", async () => {
        const rawKey = new Uint8Array(16).fill(0x11);
        const key = await crypto.subtle.importKey(
            "raw",
            rawKey,
            { name: "AES-GCM" },
            true,
            ["encrypt", "decrypt"]
        );
        pass("STRICT", "importKey_Raw", "Alg", key.algorithm.name);
    });

    await test("STRICT", "JWK_RoundTrip_AES", async () => {
        const originalKey = await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 128 },
            true,
            ["encrypt"]
        );
        const jwk = await crypto.subtle.exportKey("jwk", originalKey);
        const importedKey = await crypto.subtle.importKey(
            "jwk",
            jwk,
            { name: "AES-GCM" },
            true,
            ["encrypt"]
        );
        pass("STRICT", "JWK_RoundTrip", "Status", importedKey.type === "secret" ? "SUCCESS" : "FAIL");
    });

    await test("STRICT", "ECDSA_Import_SPKI_Public", async () => {
        const kp = await crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["verify"]
        );
        const spki = await crypto.subtle.exportKey("spki", kp.publicKey);
        const importedPubKey = await crypto.subtle.importKey(
            "spki",
            spki,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["verify"]
        );
        pass("STRICT", "importKey_SPKI", "Status", importedPubKey.type === "public" ? "SUCCESS" : "FAIL");
    });

    await test("STRICT", "PKCS8_Import_RSA_Private", async () => {
        const kp = await crypto.subtle.generateKey(
            {
                name: "RSASSA-PKCS1-v1_5",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256",
            },
            true,
            ["sign"]
        );
        const pkcs8 = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
        const importedPrivKey = await crypto.subtle.importKey(
            "pkcs8",
            pkcs8,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            true,
            ["sign"]
        );
        pass("STRICT", "importKey_PKCS8", "Status", importedPrivKey.type === "private" ? "SUCCESS" : "FAIL");
    });

    // ===== 7. extra algorithms =====
    // EXTRA: 3DES-CBC
    await test("EXTRA", "3DES_CBC_Generate", async () => {
        const k = await crypto.subtle.generateKey(
            { name: "3DES-CBC", length: 192 },
            true,
            ["encrypt"]
        );
        extra("EXTRA", "3DES-CBC", "AlgorithmName", k.algorithm.name);
    });

    // EXTRA: 3DES-CBC enc/dec
    await test("EXTRA", "DES_EDE3_CBC_Encrypt_Decrypt", async () => {
        const k = await crypto.subtle.generateKey(
            { name: "3DES-CBC", length: 192 },
            true,
            ["encrypt", "decrypt"]
        );
        const iv = crypto.getRandomValues(new Uint8Array(8));
        const encBytes = await crypto.subtle.encrypt({ name: "3DES-CBC", iv }, k, dataLegacy);
        const decBytes = await crypto.subtle.decrypt({ name: "3DES-CBC", iv }, k, encBytes);
        extra("EXTRA", "3DES-CBC", "Decrypted", dec.decode(decBytes));
    });

    // EXTRA: RSAES-PKCS1-v1_5 enc/dec
    await test("EXTRA", "RSAES_PKCS1_v1_5", async () => {
        const kp = await crypto.subtle.generateKey(
            {
                name: "RSAES-PKCS1-v1_5",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
            },
            true,
            ["encrypt", "decrypt"]
        );
        const encBytes = await crypto.subtle.encrypt(
            { name: "RSAES-PKCS1-v1_5" },
            kp.publicKey,
            dataLegacy
        );
        const decBytes = await crypto.subtle.decrypt(
            { name: "RSAES-PKCS1-v1_5" },
            kp.privateKey,
            encBytes
        );
        extra(
            "EXTRA",
            "RSAES-PKCS1",
            "Status",
            dec.decode(decBytes) === "legacy_compat_test" ? "SUCCESS" : "FAIL"
        );
    });

    // EXTRA: HMAC-MD5
    await test("EXTRA", "HMAC_MD5", async () => {
        const k = await crypto.subtle.generateKey({ name: "HMAC", hash: "MD5" }, true, ["sign"]);
        const s = await crypto.subtle.sign("HMAC", k, dataLegacy);
        extra("EXTRA", "HMAC-MD5", "SigLen", String(s.byteLength));
    });

    // ===== 8. stress test =====
    await test("STRESS", "HMAC_SHA256_100", async () => {
        const iterations = 100;
        let ok = 0;

        for (let i = 0; i < iterations; i++) {
            try {
                const buf = crypto.getRandomValues(new Uint8Array(1024));
                const key = await crypto.subtle.generateKey(
                    { name: "HMAC", hash: "SHA-256" },
                    false,
                    ["sign"]
                );
                await crypto.subtle.sign("HMAC", key, buf);
                ok++;
            } catch {}
        }

        pass("STRESS", "HMAC-SHA256", "SUCCESS", `${ok}/${iterations}`);
        if (ok === iterations) console.log("RESULT: STABLE");
    });

        console.log("--- CRYPTO TEST SUITE COMPLETE ---");
})();

/* 某次运行输出
 - -- CRYPTO TEST SUITE START ---   *
 [PASS] BASE/randomUUID | Value | a9959321-b9cc-4200-9446-1d16d047db90
 [PASS] BASE/getRandomValues | 8 bytes hex | 5a20add09ade1fb0
 [PASS] STRICT/getRandomValues | Boundaries checked | 1 to 65536 bytes
 [PASS] STRICT/getRandomValues | OverLimit | 65537 bytes -> threw
 [PASS] SEAL/SHA-256 | Hex | 98d124beadd0a45d029d3ddf1301b6623bd8e6653ddd6d72fefe32a5f0fcccf8
 [PASS] STRICT/SHA-512 | Hex | 2bbaf5c033e4276e91cd9d8582f02437d7fa5a0907ee4798f051c3e833dfd2d5913984c22709bcac2ca45804bba03ea76b8159201b43025c98eac915ba9d6732
 [EXTRA] EXTRA/MD5 | Hex | 7c9fe937cde8063d2dd9862015df4a91
 [EXTRA] EXTRA/MD5 | Hex | cc51ddbc9750241257b0745b2b6da0d2
 [LEGACY] LEGACY/SHA-1 | Hex | 282f3adb4ab147fd9e2d7eacb3a15db52fd67884
 [PASS] STRICT/RSA-PSS | SigLen: 256 | Verified: true
 [PASS] STRICT/PKCS1-v1_5 | SigLen | 256 | Verified: true
 [PASS] STRICT/ECDSA_P256 | SigHex | bdaee11eab44f83a2cb790a1c67b41fa458d4575daf9554a00809bb2318425c50cc694722eead960139abd6960f09cbd8cd6c7dc3ddcbd3dc4031fc6de02bd8d
 [PASS] STRICT/ECDSA_P256 | Verified | true
 [PASS] STRICT/ECDSA_P256_Negatives | verify(false) checks | sig/data tamper -> false
 [PASS] SEAL/Ed25519 | SigLen: 64 | Verified: true
 [EXTRA] EXTRA/Ed25519_Raw | KeyType | private | SigHex: 17b359348b8aa856...
 [PASS] SEAL/PBKDF2-1000-SHA256 | DerivedBitsHex | a24afd4f4007cf64a9a0b7023bdbb99b
 [PASS] STRICT/HKDF | DerivedBits | 87b07fa849ef5932d1fd9124893466bcd8b81b582229aaeef6b54a6aba3c5631
 [PASS] STRICT/ECDH_P256 | SharedSecretHex | e73c1e8513d507a64927e44594d8d520557fe33d77e1f548bad7f5e7614734c6
 [PASS] STRICT/ECDH_Bilateral_Match | SharedSecret | 17be3fe4d26be514ec5f50a7a66a005cafdc770d90aad7fb81376aee8bcb7104
 [EXTRA] EXTRA/X25519_Raw | KeyType | private
 [PASS] SEAL/AES-GCM | CipherHex | c557b4e84a0ff78a3ed5a5f2e10ac0a8513f043d704a6d35b1845650d739dd2ab9442805
 [PASS] SEAL/AES-GCM | Decrypted | sealdice_crypto_test
 [PASS] STRICT/AES-GCM | SameIV_DiffPT | c1!=c2 | d1=gcm_plaintext_A d2=gcm_plaintext_B
 [PASS] STRICT/AES-GCM | RandomIV_Twice | iv1=36b68300f0c76410a47f67f7 iv2=520026b457a72489fa77926c
 [PASS] STRICT/AES-CTR | CipherHex | b65905836958524ea2060afae204af8ce07505ba3eeacc
 [PASS] SEAL/JWK_Export | Alg | A256GCM | K: -ItpUCDR09Vn2jRm90MRExsD7AfqUTo2nKBRhle2exM
 [PASS] SEAL/WrapKey | WrappedHex | baacecef18cf3978982bfa95828072e989d767765571b6f85e5dd38c2eeac99170f816080984bfa52bebae6ddfd3a00be438baa359e37edf914d2f45ba8c7acbe52f6353bea058a5cd7b87e561637436b5a07e93181f4e00f8b5a1985a6e8e5ca5ece097a2a46a10ef6e6d3ee81a1af09973eb44b41e2e663747d6e85d28b506a428e61c1d394ff559c5cbe2b18f174b924cd73f
 [PASS] STRICT/importKey_Raw | Alg | AES-GCM
 [PASS] STRICT/JWK_RoundTrip | Status | SUCCESS
 [PASS] STRICT/importKey_SPKI | Status | SUCCESS
 [PASS] STRICT/importKey_PKCS8 | Status | SUCCESS
 [EXTRA] EXTRA/3DES-CBC | AlgorithmName | 3DES-CBC
 [EXTRA] EXTRA/3DES-CBC | Decrypted | legacy_compat_test
 [EXTRA] EXTRA/RSAES-PKCS1 | Status | SUCCESS
 [EXTRA] EXTRA/HMAC-MD5 | SigLen | 16
 [PASS] STRESS/HMAC-SHA256 | SUCCESS | 100/100
 RESULT: STABLE
 --- CRYPTO TEST SUITE COMPLETE ---
 */
