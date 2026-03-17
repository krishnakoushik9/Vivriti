package com.vivriti.intellicredit.repository;

import com.vivriti.intellicredit.entity.QualitativeNote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface QualitativeNoteRepository extends JpaRepository<QualitativeNote, Long> {
    List<QualitativeNote> findByApplicationIdOrderByCreatedAtDesc(String applicationId);
}

