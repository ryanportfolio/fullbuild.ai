package ai.fullbuild.threadline.readiness;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface StyleRepository extends JpaRepository<StyleEntity, UUID> {
    List<StyleReadinessProjection> findProjectedBySeasonOrderByReadinessAsc(String season);

    interface StyleReadinessProjection {
        UUID getId();
        String getStyleNumber();
        String getName();
        StyleStatus getStatus();
        int getReadiness();
        long getVersion();
    }
}
