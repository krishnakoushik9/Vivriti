package com.vivriti.intellicredit.repository;

import com.vivriti.intellicredit.entity.RiskSignal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RiskSignalRepository extends JpaRepository<RiskSignal, Long> {
    Page<RiskSignal> findByApplicationIdOrderByRiskScoreDesc(String applicationId, Pageable pageable);

    List<RiskSignal> findTop10ByApplicationIdOrderByRiskScoreDesc(String applicationId);

    List<RiskSignal> findByApplicationId(String applicationId);
}

