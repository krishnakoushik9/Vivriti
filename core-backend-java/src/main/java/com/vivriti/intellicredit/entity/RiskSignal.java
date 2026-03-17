package com.vivriti.intellicredit.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "risk_signals", indexes = {
        @Index(name = "idx_risk_signals_app", columnList = "applicationId"),
        @Index(name = "idx_risk_signals_score", columnList = "riskScore")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RiskSignal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String applicationId;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(nullable = false, length = 2000)
    private String url;

    @Column(nullable = false)
    private String sourceName;

    @Column(nullable = false)
    private String sourceType;

    @Column(nullable = false)
    private Integer riskScore;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RiskLevel riskLevel;

    @Column(columnDefinition = "TEXT")
    private String riskKeywordsJson;

    private LocalDateTime publishedAt;

    private LocalDateTime scrapedAt;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (scrapedAt == null) scrapedAt = createdAt;
    }

    public enum RiskLevel {
        CRITICAL, HIGH, MEDIUM, LOW, NONE
    }
}

