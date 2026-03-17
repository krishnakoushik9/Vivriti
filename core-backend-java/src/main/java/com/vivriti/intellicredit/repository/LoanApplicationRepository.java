package com.vivriti.intellicredit.repository;

import com.vivriti.intellicredit.entity.LoanApplication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.List;

@Repository
public interface LoanApplicationRepository extends JpaRepository<LoanApplication, Long> {
    Optional<LoanApplication> findByApplicationId(String applicationId);

    List<LoanApplication> findByStatusOrderByCreatedAtDesc(LoanApplication.ApplicationStatus status);

    List<LoanApplication> findAllByOrderByCreatedAtDesc();

    boolean existsByApplicationId(String applicationId);
}
