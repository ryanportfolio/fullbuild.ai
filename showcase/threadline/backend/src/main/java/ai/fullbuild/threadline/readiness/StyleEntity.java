package ai.fullbuild.threadline.readiness;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "style")
public class StyleEntity {
    @Id
    private UUID id;

    @Column(name = "style_number", nullable = false, unique = true, length = 40)
    private String styleNumber;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 40)
    private String season;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private StyleStatus status;

    @Column(nullable = false)
    private int readiness;

    @Column(name = "launch_date", nullable = false)
    private LocalDate launchDate;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private long version;

    protected StyleEntity() {
    }

    public UUID getId() {
        return id;
    }

    public String getStyleNumber() {
        return styleNumber;
    }

    public String getName() {
        return name;
    }

    public String getSeason() {
        return season;
    }

    public StyleStatus getStatus() {
        return status;
    }

    public int getReadiness() {
        return readiness;
    }

    public LocalDate getLaunchDate() {
        return launchDate;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public long getVersion() {
        return version;
    }

    void applyResolvedMilestone(boolean criticalBlockersRemain, Instant now) {
        readiness = Math.min(100, readiness + 17);
        status = ReadinessService.statusFor(readiness, criticalBlockersRemain);
        updatedAt = now;
    }
}
