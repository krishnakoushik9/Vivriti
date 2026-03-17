package com.vivriti.intellicredit.service;

import com.vivriti.intellicredit.entity.AuditLog;
import com.vivriti.intellicredit.repository.AuditLogRepository;
import com.vivriti.intellicredit.security.AesEncryptionUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.UUID;

/**
 * Immutable Audit Service
 * All AI decisions are recorded in an immutable audit trail
 * Aligned with RBI Digital Lending Guidelines (Auditability Requirements)
 * ISO27001 Control: A.16.1.2 (Reporting Information Security Events)
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final AesEncryptionUtil aesEncryptionUtil;

    public AuditLog logEvent(
            String applicationId,
            String eventType,
            String actor,
            String inputPayload,
            String outputPayload,
            String status,
            String rbiComplianceTag,
            String iso27001Control) {
        String combinedPayload = (inputPayload != null ? inputPayload : "") +
                "|" + (outputPayload != null ? outputPayload : "");
        String checksum = aesEncryptionUtil.generateChecksum(combinedPayload);

        // Encrypt sensitive payloads at rest
        String encryptedInput = null;
        String encryptedOutput = null;
        try {
            if (inputPayload != null) {
                encryptedInput = aesEncryptionUtil.encrypt(inputPayload);
            }
            if (outputPayload != null) {
                encryptedOutput = aesEncryptionUtil.encrypt(outputPayload);
            }
        } catch (Exception e) {
            log.warn("Encryption failed for audit payload, storing plaintext: {}", e.getMessage());
            encryptedInput = inputPayload;
            encryptedOutput = outputPayload;
        }

        AuditLog auditLog = AuditLog.builder()
                .auditId(UUID.randomUUID().toString())
                .applicationId(applicationId)
                .eventType(eventType)
                .actor(actor)
                .inputPayload(encryptedInput)
                .outputPayload(encryptedOutput)
                .status(status)
                .rbiComplianceTag(rbiComplianceTag)
                .iso27001Control(iso27001Control)
                .checksum(checksum)
                .build();

        AuditLog saved = auditLogRepository.save(auditLog);
        log.info("[AUDIT] Event logged - Type: {}, App: {}, Status: {}", eventType, applicationId, status);
        return saved;
    }

    public List<AuditLog> getAuditTrail(String applicationId) {
        return auditLogRepository.findByApplicationIdOrderByTimestampAsc(applicationId);
    }
}
