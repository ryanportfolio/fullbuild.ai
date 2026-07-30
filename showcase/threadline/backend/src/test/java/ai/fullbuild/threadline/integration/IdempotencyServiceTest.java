package ai.fullbuild.threadline.integration;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

class IdempotencyServiceTest {
    private final IdempotencyRecordRepository records = mock(IdempotencyRecordRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-07-29T16:00:00Z"), ZoneOffset.UTC);
    private final IdempotencyService service = new IdempotencyService(records, clock);

    @Test
    void identicalDuplicateIsAReplay() {
        when(records.findById("evt-1")).thenReturn(Optional.of(
                new IdempotencyRecordEntity("evt-1", "abc", clock.instant())
        ));

        assertThat(service.reserve("evt-1", "abc")).isEqualTo(IdempotencyService.Reservation.REPLAY);
    }

    @Test
    void reusedKeyWithDifferentPayloadIsRejected() {
        when(records.findById("evt-1")).thenReturn(Optional.of(
                new IdempotencyRecordEntity("evt-1", "abc", clock.instant())
        ));

        assertThatThrownBy(() -> service.reserve("evt-1", "def"))
                .hasMessageContaining("409");
    }

    @Test
    void concurrentReservationReturnsRetryableConflict() {
        when(records.findById("evt-1")).thenReturn(Optional.empty());
        when(records.saveAndFlush(any(IdempotencyRecordEntity.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key"));

        assertThatThrownBy(() -> service.reserve("evt-1", "abc"))
                .hasMessageContaining("409")
                .hasMessageContaining("retry the same request");
    }
}
