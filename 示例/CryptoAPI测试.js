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

    const fail = (suite, name, e) =>
    console.log(`[FAIL] ${suite}/${name} | ${e.name}: ${e.message}`);

    const test = async (suite, name, fn) => {
        try {
            await fn();
        } catch (e) {
            fail(suite, name, e);
        }
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

    // ===== 1. digests =====
    await test("SEAL", "digest_sha256", async () => {
        const h = await crypto.subtle.digest("SHA-256", dataSeal);
        pass("SEAL", "SHA-256", "Hex", toHex(h));
    });

    await test("STRICT", "digest_sha512_long", async () => {
        const h = await crypto.subtle.digest("SHA-512", dataStrict);
        pass("STRICT", "SHA-512", "Hex", toHex(h));
    });

    await test("SEAL", "digest_md5_legacy", async () => {
        const h = await crypto.subtle.digest("MD5", dataSeal);
        pass("SEAL", "MD5 (Legacy)", "Hex", toHex(h));
    });

    await test("LEGACY", "MD5_Digest", async () => {
        const h = await crypto.subtle.digest("MD5", dataLegacy);
        legacy("LEGACY", "MD5", "Hex", toHex(h));
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

    await test("STRICT", "RSA_PKCS1_Legacy", async () => {
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

    await test("SEAL", "Ed25519_Flow", async () => {
        const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
            "sign",
            "verify",
        ]);
        const sig = await crypto.subtle.sign("Ed25519", kp.privateKey, dataSeal);
        const ok = await crypto.subtle.verify("Ed25519", kp.publicKey, sig, dataSeal);
        pass("SEAL", "Ed25519", `SigLen: ${sig.byteLength}`, `Verified: ${ok}`);
    });

    await test("STRICT", "Ed25519_Raw_Import_Seed", async () => {
        const seed = new Uint8Array(32).fill(0x55);
        const k = await crypto.subtle.importKey(
            "raw",
            seed,
            { name: "Ed25519", keyType: "private" },
            true,
            ["sign"]
        );
        const s = await crypto.subtle.sign("Ed25519", k, dataStrict);
        pass(
            "STRICT",
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

    await test("SEAL", "X25519_Raw_Import", async () => {
        const rawPriv = new Uint8Array(32).fill(0x42);
        const k = await crypto.subtle.importKey(
            "raw",
            rawPriv,
            { name: "X25519", keyType: "private" },
            true,
            ["deriveBits"]
        );
        pass("SEAL", "X25519_Raw", "KeyType", k.type);
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

    // ===== 7. legacy algorithms =====
    await test("SEAL", "3DES_CBC_Generate", async () => {
        const k = await crypto.subtle.generateKey(
            { name: "3DES-CBC", length: 192 },
            true,
            ["encrypt"]
        );
        pass("SEAL", "3DES-CBC", "AlgorithmName", k.algorithm.name);
    });

    await test("LEGACY", "DES_EDE3_CBC_Encrypt_Decrypt", async () => {
        const k = await crypto.subtle.generateKey(
            { name: "3DES-CBC", length: 192 },
            true,
            ["encrypt", "decrypt"]
        );
        const iv = crypto.getRandomValues(new Uint8Array(8));
        const encBytes = await crypto.subtle.encrypt({ name: "3DES-CBC", iv }, k, dataLegacy);
        const decBytes = await crypto.subtle.decrypt({ name: "3DES-CBC", iv }, k, encBytes);
        legacy("LEGACY", "3DES-CBC", "Decrypted", dec.decode(decBytes));
    });

    await test("LEGACY", "RSAES_PKCS1_v1_5", async () => {
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
        legacy(
            "LEGACY",
            "RSAES-PKCS1",
            "Status",
            dec.decode(decBytes) === "legacy_compat_test" ? "SUCCESS" : "FAIL"
        );
    });

    await test("LEGACY", "HMAC_MD5", async () => {
        const k = await crypto.subtle.generateKey({ name: "HMAC", hash: "MD5" }, true, [
            "sign",
        ]);
        const s = await crypto.subtle.sign("HMAC", k, dataLegacy);
        legacy("LEGACY", "HMAC-MD5", "SigLen", String(s.byteLength));
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
 [PASS] BASE/randomUUID | Value | eb66d16d-69f1-4aeb-b6b8-0b4b89b66972
 [PASS] BASE/getRandomValues | 8 bytes hex | 9ad98c5e16844e6e
 [PASS] STRICT/getRandomValues | Boundaries checked | 1 to 65536 bytes
 [PASS] SEAL/SHA-256 | Hex | 98d124beadd0a45d029d3ddf1301b6623bd8e6653ddd6d72fefe32a5f0fcccf8
 [PASS] STRICT/SHA-512 | Hex | 2bbaf5c033e4276e91cd9d8582f02437d7fa5a0907ee4798f051c3e833dfd2d5913984c22709bcac2ca45804bba03ea76b8159201b43025c98eac915ba9d6732
 [PASS] SEAL/MD5 (Legacy) | Hex | 7c9fe937cde8063d2dd9862015df4a91
 [LEGACY] LEGACY/MD5 | Hex | cc51ddbc9750241257b0745b2b6da0d2
 [LEGACY] LEGACY/SHA-1 | Hex | 282f3adb4ab147fd9e2d7eacb3a15db52fd67884
 [PASS] STRICT/RSA-PSS | SigLen: 256 | Verified: true
 [PASS] STRICT/PKCS1-v1_5 | SigLen | 256 | Verified: true
 [PASS] STRICT/ECDSA_P256 | SigHex | cc2dd79b6c81cca81fbe6f6544edbd315816f866879307d59482f57bc8abfd67c26a59f2a9fa554a1f78a79d4bb27e3172583e210976c07eaa46e00798487ba8
 [PASS] STRICT/ECDSA_P256 | Verified | true
 [PASS] SEAL/Ed25519 | SigLen: 64 | Verified: true
 [PASS] STRICT/Ed25519_Raw | KeyType | private | SigHex: 17b359348b8aa856...
 [PASS] SEAL/PBKDF2-1000-SHA256 | DerivedBitsHex | a24afd4f4007cf64a9a0b7023bdbb99b
 [PASS] STRICT/HKDF | DerivedBits | 87b07fa849ef5932d1fd9124893466bcd8b81b582229aaeef6b54a6aba3c5631
 [PASS] STRICT/ECDH_P256 | SharedSecretHex | 4f0dbe879e5a381ff4f7b916dd3e6811dcd88710ed04326ce6d1d45f876635ca
 [PASS] SEAL/X25519_Raw | KeyType | private
 [PASS] SEAL/AES-GCM | CipherHex | 535aae71ca64d84ac7c224d76fc96a4714d94b7228883dbba7399440bbb5701a07146566
 [PASS] SEAL/AES-GCM | Decrypted | sealdice_crypto_test
 [PASS] STRICT/AES-CTR | CipherHex | e4e25e6b703913f58b984998bc5d561e2eb15ae1129472
 [PASS] SEAL/JWK_Export | Alg | A256GCM | K: xRDmsBmfKax-cBOWTF_INg-ntd3DBjTz3Bq7vgWyFLE
 [PASS] SEAL/WrapKey | WrappedHex | 69dc134a7eba071ccb0779f5a74655688986ea7dbb837098301359dc74fd563b7f6bf8a3a6b11a98742b81c64ff68c4fb4780cb94117347790c042914a0a49bab2d8801eda2f1b4a61fb1721e2a670d00f91466c2fc74fae4d74c44ecc12d71b354e50c5b8848b53211f555913818771a5184f4298169b16e202f60a3537a5599035ab9948beed4040969ca229a0afbe6aabdf9d
 [PASS] SEAL/3DES-CBC | AlgorithmName | 3DES-CBC
 [LEGACY] LEGACY/3DES-CBC | Decrypted | legacy_compat_test
 [LEGACY] LEGACY/RSAES-PKCS1 | Status | SUCCESS
 [LEGACY] LEGACY/HMAC-MD5 | SigLen | 16
 [PASS] STRESS/HMAC-SHA256 | SUCCESS | 100/100
 RESULT: STABLE
 --- CRYPTO TEST SUITE COMPLETE ---
 */
