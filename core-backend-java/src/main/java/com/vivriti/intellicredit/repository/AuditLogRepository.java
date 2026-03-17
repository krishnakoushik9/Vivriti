package com.vivriti.intellicredit.repository;

import com.vivriti.intellicredit.entity.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findByApplicationIdOrderByTimestampAsc(String applicationId);

    List<AuditLog> findByEventTypeOrderByTimestampDesc(String eventType);
}
