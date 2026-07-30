package ai.fullbuild.threadline.integration;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "idempotency_record")
public class IdempotencyRecordEntity {
    @Id
    @Column(name = "idempotency_key", length = 120)
    private String key;

    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected IdempotencyRecordEntity() {
    }

    IdempotencyRecordEntity(String key, String payloadHash, Instant createdAt) {
        this.key = key;
        this.payloadHash = payloadHash;
        this.createdAt = createdAt;
    }

    public String getPayloadHash() {
        return payloadHash;
    }
}
