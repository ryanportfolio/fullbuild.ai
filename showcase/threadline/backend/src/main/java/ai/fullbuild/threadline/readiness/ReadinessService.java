package ai.fullbuild.threadline.readiness;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class ReadinessService {
    private final StyleRepository styles;
    private final BlockerRepository blockers;
    private final Clock clock;

    public ReadinessService(StyleRepository styles, BlockerRepository blockers) {
        this(styles, blockers, Clock.systemUTC());
    }

    ReadinessService(StyleRepository styles, BlockerRepository blockers, Clock clock) {
        this.styles = styles;
        this.blockers = blockers;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public CollectionReadiness season(String season) {
        List<StyleRepository.StyleReadinessProjection> rows =
                styles.findProjectedBySeasonOrderByReadinessAsc(season.toUpperCase(Locale.ROOT));
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Season not found");
        }

        int average = (int) Math.round(rows.stream().mapToInt(StyleRepository.StyleReadinessProjection::getReadiness)
                .average().orElse(0));
        long ready = rows.stream().filter(row -> row.getStatus() == StyleStatus.READY).count();
        long blocked = rows.stream().filter(row -> row.getStatus() == StyleStatus.BLOCKED).count();
        long version = rows.stream().mapToLong(StyleRepository.StyleReadinessProjection::getVersion).sum();
        List<StyleRow> styleRows = rows.stream()
                .map(row -> new StyleRow(row.getId(), row.getStyleNumber(), row.getName(), row.getReadiness(), row.getStatus()))
                .toList();

        return new CollectionReadiness(
                season.toUpperCase(Locale.ROOT),
                average,
                rows.size(),
                ready,
                blocked,
                version,
                styleRows
        );
    }

    @Transactional(readOnly = true)
    public StyleDetail style(UUID styleId) {
        StyleEntity style = requireStyle(styleId);
        return new StyleDetail(style.getId(), style.getStyleNumber(), style.getName(), style.getSeason(),
                style.getReadiness(), style.getStatus(), style.getLaunchDate(), style.getUpdatedAt(), style.getVersion());
    }

    @Transactional
    public ResolutionResult resolve(UUID blockerId, String actor) {
        BlockerEntity blocker = blockers.findById(blockerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Blocker not found"));
        Instant now = clock.instant();
        boolean newlyResolved = blocker.resolve(actor, now);
        StyleEntity style = requireStyle(blocker.getStyleId());
        if (newlyResolved) {
            boolean criticalRemain = blockers.existsByStyleIdAndSeverityAndResolvedAtIsNull(
                    blocker.getStyleId(), BlockerSeverity.CRITICAL);
            style.applyResolvedMilestone(criticalRemain, now);
        }
        return new ResolutionResult(blocker.getId(), style.getId(), style.getReadiness(), style.getStatus());
    }

    public static StyleStatus statusFor(int readiness, boolean criticalBlockersRemain) {
        if (criticalBlockersRemain) return StyleStatus.BLOCKED;
        if (readiness >= 100) return StyleStatus.READY;
        if (readiness >= 70) return StyleStatus.AT_RISK;
        return StyleStatus.IN_PROGRESS;
    }

    private StyleEntity requireStyle(UUID styleId) {
        return styles.findById(styleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Style not found"));
    }

    public record CollectionReadiness(
            String season,
            int readiness,
            int totalStyles,
            long readyStyles,
            long blockedStyles,
            long version,
            List<StyleRow> styles
    ) {}

    public record StyleRow(UUID id, String styleNumber, String name, int readiness, StyleStatus status) {}

    public record StyleDetail(
            UUID id,
            String styleNumber,
            String name,
            String season,
            int readiness,
            StyleStatus status,
            LocalDate launchDate,
            Instant updatedAt,
            long version
    ) {}

    public record ResolutionResult(UUID blockerId, UUID styleId, int readiness, StyleStatus status) {}
}
