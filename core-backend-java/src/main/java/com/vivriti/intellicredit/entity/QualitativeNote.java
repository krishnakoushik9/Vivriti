package com.vivriti.intellicredit.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "qualitative_notes", indexes = {
        @Index(name = "idx_qual_notes_app", columnList = "applicationId")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class QualitativeNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String applicationId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String note;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private Integer impact; // -20..+20

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}

