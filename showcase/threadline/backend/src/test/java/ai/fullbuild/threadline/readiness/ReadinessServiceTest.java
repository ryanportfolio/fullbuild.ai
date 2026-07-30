package ai.fullbuild.threadline.readiness;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReadinessServiceTest {
    @Test
    void criticalBlockerAlwaysCapsStatusAtBlocked() {
        assertThat(ReadinessService.statusFor(100, true)).isEqualTo(StyleStatus.BLOCKED);
    }

    @Test
    void readinessThresholdsMapToStableStatusVocabulary() {
        assertThat(ReadinessService.statusFor(100, false)).isEqualTo(StyleStatus.READY);
        assertThat(ReadinessService.statusFor(83, false)).isEqualTo(StyleStatus.AT_RISK);
        assertThat(ReadinessService.statusFor(69, false)).isEqualTo(StyleStatus.IN_PROGRESS);
    }

    @Test
    void firstResolutionUsesTheServiceClockAndAdvancesReadinessOnce() {
        StyleRepository styles = mock(StyleRepository.class);
        BlockerRepository blockers = mock(BlockerRepository.class);
        BlockerEntity blocker = mock(BlockerEntity.class);
        StyleEntity style = mock(StyleEntity.class);
        UUID blockerId = UUID.randomUUID();
        UUID styleId = UUID.randomUUID();
        Instant now = Instant.parse("2026-07-29T16:00:00Z");
        ReadinessService service = new ReadinessService(
                styles,
                blockers,
                Clock.fixed(now, ZoneOffset.UTC)
        );

        when(blockers.findById(blockerId)).thenReturn(Optional.of(blocker));
        when(blocker.getId()).thenReturn(blockerId);
        when(blocker.getStyleId()).thenReturn(styleId);
        when(blocker.resolve("engineer-1", now)).thenReturn(true);
        when(styles.findById(styleId)).thenReturn(Optional.of(style));
        when(style.getId()).thenReturn(styleId);
        when(style.getReadiness()).thenReturn(100);
        when(style.getStatus()).thenReturn(StyleStatus.READY);

        ReadinessService.ResolutionResult result = service.resolve(blockerId, "engineer-1");

        verify(style).applyResolvedMilestone(false, now);
        assertThat(result.readiness()).isEqualTo(100);
    }

    @Test
    void repeatedResolutionDoesNotAdvanceReadinessAgain() {
        StyleRepository styles = mock(StyleRepository.class);
        BlockerRepository blockers = mock(BlockerRepository.class);
        BlockerEntity blocker = mock(BlockerEntity.class);
        StyleEntity style = mock(StyleEntity.class);
        UUID blockerId = UUID.randomUUID();
        UUID styleId = UUID.randomUUID();
        Instant now = Instant.parse("2026-07-29T16:00:00Z");
        ReadinessService service = new ReadinessService(
                styles,
                blockers,
                Clock.fixed(now, ZoneOffset.UTC)
        );

        when(blockers.findById(blockerId)).thenReturn(Optional.of(blocker));
        when(blocker.getId()).thenReturn(blockerId);
        when(blocker.getStyleId()).thenReturn(styleId);
        when(blocker.resolve("engineer-1", now)).thenReturn(false);
        when(styles.findById(styleId)).thenReturn(Optional.of(style));
        when(style.getId()).thenReturn(styleId);
        when(style.getReadiness()).thenReturn(100);
        when(style.getStatus()).thenReturn(StyleStatus.READY);

        service.resolve(blockerId, "engineer-1");

        verify(style, never()).applyResolvedMilestone(anyBoolean(), any(Instant.class));
        verify(blockers, never()).existsByStyleIdAndSeverityAndResolvedAtIsNull(
                any(UUID.class),
                any(BlockerSeverity.class)
        );
    }
}
