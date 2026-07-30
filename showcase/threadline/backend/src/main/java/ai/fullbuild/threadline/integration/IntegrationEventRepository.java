package ai.fullbuild.threadline.integration;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface IntegrationEventRepository extends JpaRepository<IntegrationEventEntity, UUID> {
    List<IntegrationEventEntity> findByOccurredAtLessThanOrderByOccurredAtDesc(Instant cursor, Pageable pageable);

    List<IntegrationEventEntity> findAllByOrderByOccurredAtDesc(Pageable pageable);
}
