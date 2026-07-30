package ai.fullbuild.threadline.readiness;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface BlockerRepository extends JpaRepository<BlockerEntity, UUID> {
    boolean existsByStyleIdAndSeverityAndResolvedAtIsNull(UUID styleId, BlockerSeverity severity);
}
