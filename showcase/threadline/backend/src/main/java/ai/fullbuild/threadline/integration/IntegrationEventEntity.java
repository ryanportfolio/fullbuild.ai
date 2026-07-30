package ai.fullbuild.threadline.integration;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "integration_event")
public class IntegrationEventEntity {
    @Id
    private UUID id;

    @Column(name = "style_id", nullable = false)
    private UUID styleId;

    @Column(nullable = false, length = 40)
    private String source;

    @Column(nullable = false, length = 80)
    private String type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private IntegrationState state;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    @Column(name = "correlation_id", nullable = false, length = 80)
    private String correlationId;

    @Column(nullable = false)
    private int attempt;

    @Version
    @Column(nullable = false)
    private long version;

    protected IntegrationEventEntity() {
    }

    static IntegrationEventEntity accepted(
            UUID styleId,
            String source,
            String type,
            Instant occurredAt,
            String correlationId,
            Instant receivedAt
    ) {
        IntegrationEventEntity event = new IntegrationEventEntity();
        event.id = UUID.randomUUID();
        event.styleId = styleId;
        event.source = source;
        event.type = type;
        event.state = IntegrationState.ACCEPTED;
        event.occurredAt = occurredAt;
        event.receivedAt = receivedAt;
        event.correlationId = correlationId;
        event.attempt = 1;
        return event;
    }

    public UUID getId() {
        return id;
    }

    public UUID getStyleId() {
        return styleId;
    }

    public String getSource() {
        return source;
    }

    public String getType() {
        return type;
    }

    public IntegrationState getState() {
        return state;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public int getAttempt() {
        return attempt;
    }

    void queueRetry() {
        if (state != IntegrationState.FAILED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only failed events can be retried");
        }
        state = IntegrationState.PROCESSING;
        attempt += 1;
    }
}
