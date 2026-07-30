package ai.fullbuild.threadline.integration;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;

@Service
public class IdempotencyService {
    private final IdempotencyRecordRepository records;
    private final Clock clock;

    public IdempotencyService(IdempotencyRecordRepository records) {
        this(records, Clock.systemUTC());
    }

    IdempotencyService(IdempotencyRecordRepository records, Clock clock) {
        this.records = records;
        this.clock = clock;
    }

    @Transactional
    public Reservation reserve(String key, String payloadHash) {
        IdempotencyRecordEntity existing = records.findById(key).orElse(null);
        if (existing != null) {
            return replayOrConflict(existing, payloadHash);
        }
        try {
            records.saveAndFlush(new IdempotencyRecordEntity(key, payloadHash, clock.instant()));
            return Reservation.NEW;
        } catch (DataIntegrityViolationException race) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Idempotency key is being processed; retry the same request"
            );
        }
    }

    private Reservation replayOrConflict(IdempotencyRecordEntity existing, String payloadHash) {
        if (existing.getPayloadHash().equals(payloadHash)) {
            return Reservation.REPLAY;
        }
        throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Idempotency key was already used with a different payload"
        );
    }

    public enum Reservation {
        NEW,
        REPLAY
    }
}
