package com.vivriti.intellicredit.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import java.time.LocalDateTime;

@Entity
@Table(name = "audit_log", indexes = {
        @Index(name = "idx_audit_app_id", columnList = "applicationId"),
        @Index(name = "idx_audit_event_type", columnList = "eventType"),
        @Index(name = "idx_audit_timestamp", columnList = "timestamp")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String auditId; // System-generated UUID

    @Column(nullable = false)
    private String applicationId;

    @Column(nullable = false)
    private String eventType; // e.g., INGESTION_COMPLETE, ML_SCORE_RECEIVED, CAM_GENERATED, DECISION_MADE

    @Column(nullable = false)
    private String actor; // SYSTEM, CREDIT_OFFICER, ML_WORKER, BFF

    @Column(columnDefinition = "TEXT")
    private String inputPayload; // Encrypted JSON of what was sent

    @Column(columnDefinition = "TEXT")
    private String outputPayload; // Encrypted JSON of what was received

    @Column(nullable = false)
    private String status; // SUCCESS, FAILURE, WARNING

    @Column(columnDefinition = "TEXT")
    private String errorDetails;

    // Risk/Compliance fields
    private String rbiComplianceTag; // RBI DL guideline reference
    private String iso27001Control; // ISO27001 control reference

    // Immutability marker - once written, never updated
    @Column(nullable = false, updatable = false)
    private LocalDateTime timestamp;

    @Column(nullable = false, updatable = false)
    private String checksum; // SHA-256 of the payload for tamper detection

    @PrePersist
    protected void onCreate() {
        timestamp = LocalDateTime.now();
    }
}
