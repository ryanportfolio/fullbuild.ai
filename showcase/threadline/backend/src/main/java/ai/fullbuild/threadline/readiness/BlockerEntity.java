package ai.fullbuild.threadline.readiness;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "blocker")
public class BlockerEntity {
    @Id
    private UUID id;

    @Column(name = "style_id", nullable = false)
    private UUID styleId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private BlockerSeverity severity;

    @Column(nullable = false, length = 40)
    private String code;

    @Column(nullable = false, length = 240)
    private String title;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolved_by", length = 120)
    private String resolvedBy;

    @Version
    @Column(nullable = false)
    private long version;

    protected BlockerEntity() {
    }

    public UUID getId() {
        return id;
    }

    public UUID getStyleId() {
        return styleId;
    }

    public BlockerSeverity getSeverity() {
        return severity;
    }

    public String getCode() {
        return code;
    }

    public String getTitle() {
        return title;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    boolean resolve(String actor, Instant now) {
        if (resolvedAt != null) {
            return false;
        }
        resolvedAt = now;
        resolvedBy = actor;
        return true;
    }
}
