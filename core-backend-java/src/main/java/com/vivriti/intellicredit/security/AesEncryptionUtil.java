package com.vivriti.intellicredit.security;

import javax.crypto.Cipher;

import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.stereotype.Component;

/**
 * AES-256-GCM Encryption Utility
 * Provides authenticated encryption for sensitive data at rest (ISO27001
 * A.10.1)
 * Aligned with RBI Digital Lending Guidelines Section 7 (Data Security)
 */
@Component
public class AesEncryptionUtil {

    private static final String ALGORITHM = "AES/GCM/NoPadding";

    private static final int TAG_LENGTH_BIT = 128;
    private static final int IV_LENGTH_BYTE = 12;

    // In production: load from HSM / Vault / AWS KMS
    private static final String MASTER_KEY_BASE64 = "VivritiAES256KeyForProductionHSM2025AbCdEfGh=";

    private final SecretKey secretKey;

    public AesEncryptionUtil() throws Exception {
        // Derive a 256-bit key from the master key via SHA-256
        byte[] keyBytes = MessageDigest.getInstance("SHA-256")
                .digest(MASTER_KEY_BASE64.getBytes("UTF-8"));
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
    }

    /**
     * Encrypt plaintext using AES-256-GCM
     * 
     * @param plaintext - raw sensitive data
     * @return Base64-encoded ciphertext with prepended IV
     */
    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_LENGTH_BYTE];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(TAG_LENGTH_BIT, iv));

            byte[] cipherText = cipher.doFinal(plaintext.getBytes("UTF-8"));

            // Prepend IV to ciphertext for decryption
            byte[] combined = ByteBuffer.allocate(iv.length + cipherText.length)
                    .put(iv)
                    .put(cipherText)
                    .array();

            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new RuntimeException("Encryption failed", e);
        }
    }

    /**
     * Decrypt AES-256-GCM ciphertext
     * 
     * @param encryptedBase64 - Base64-encoded ciphertext with prepended IV
     * @return original plaintext
     */
    public String decrypt(String encryptedBase64) {
        try {
            byte[] combined = Base64.getDecoder().decode(encryptedBase64);
            ByteBuffer buffer = ByteBuffer.wrap(combined);

            byte[] iv = new byte[IV_LENGTH_BYTE];
            buffer.get(iv);
            byte[] cipherText = new byte[buffer.remaining()];
            buffer.get(cipherText);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(TAG_LENGTH_BIT, iv));
            return new String(cipher.doFinal(cipherText), "UTF-8");
        } catch (Exception e) {
            throw new RuntimeException("Decryption failed", e);
        }
    }

    /**
     * Generate SHA-256 checksum for tamper detection in audit logs
     */
    public String generateChecksum(String data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data.getBytes("UTF-8"));
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException("Checksum generation failed", e);
        }
    }
}
