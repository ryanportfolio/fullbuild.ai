package ai.fullbuild.threadline.integration;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import ai.fullbuild.threadline.readiness.StyleRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/integrations")
public class WebhookController {
    private static final Set<String> SOURCES = Set.of("CENTRIC_PLM", "CLO_3D", "COMPLIANCE");
    private static final int MAX_EVENT_BYTES = 256 * 1024;

    private final WebhookSignatureVerifier signatures;
    private final IdempotencyService idempotency;
    private final IntegrationEventRepository events;
    private final StyleRepository styles;
    private final ObjectMapper json;
    private final Validator validator;
    private final Clock clock;

    public WebhookController(
            WebhookSignatureVerifier signatures,
            IdempotencyService idempotency,
            IntegrationEventRepository events,
            StyleRepository styles,
            ObjectMapper json,
            Validator validator
    ) {
        this.signatures = signatures;
        this.idempotency = idempotency;
        this.events = events;
        this.styles = styles;
        this.json = json;
        this.validator = validator;
        this.clock = Clock.systemUTC();
    }

    @PostMapping("/{source}/events")
    @Transactional
    ResponseEntity<IngestResult> ingest(
            @PathVariable String source,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @RequestHeader("X-Webhook-Timestamp") String timestamp,
            @RequestHeader("X-Webhook-Signature") String signature,
            @RequestHeader("X-Correlation-Id") String correlationId,
            @RequestBody byte[] body
    ) {
        if (body.length > MAX_EVENT_BYTES) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Event payload exceeds 256 KiB");
        }
        validateHeader(idempotencyKey, "Idempotency-Key", 120);
        validateHeader(correlationId, "X-Correlation-Id", 80);
        String normalizedSource = normalizeSource(source);
        signatures.verify(timestamp, signature, body);
        WebhookEventRequest request = parse(body);
        if (!styles.existsById(request.styleId())) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT, "Referenced style does not exist");
        }
        String payloadHash = sha256(body);
        IdempotencyService.Reservation reservation = idempotency.reserve(idempotencyKey, payloadHash);
        if (reservation == IdempotencyService.Reservation.REPLAY) {
            return ResponseEntity.accepted().body(new IngestResult(null, true, "already accepted"));
        }

        IntegrationEventEntity event = IntegrationEventEntity.accepted(
                request.styleId(),
                normalizedSource,
                request.type(),
                request.occurredAt(),
                correlationId,
                clock.instant()
        );
        events.save(event);
        return ResponseEntity.accepted().body(new IngestResult(event.getId(), false, "accepted"));
    }

    @GetMapping("/events")
    List<EventView> events(
            @RequestParam(required = false) Instant cursor,
            @RequestParam(defaultValue = "50") int limit
    ) {
        if (limit < 1 || limit > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 100");
        }
        PageRequest page = PageRequest.of(0, limit);
        List<IntegrationEventEntity> rows = cursor == null
                ? events.findAllByOrderByOccurredAtDesc(page)
                : events.findByOccurredAtLessThanOrderByOccurredAtDesc(cursor, page);
        return rows.stream().map(EventView::from).toList();
    }

    @PostMapping("/events/{eventId}/retry")
    @Transactional
    ResponseEntity<EventView> retry(@PathVariable UUID eventId) {
        IntegrationEventEntity event = events.findById(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        event.queueRetry();
        return ResponseEntity.accepted().body(EventView.from(event));
    }

    private WebhookEventRequest parse(byte[] body) {
        try {
            WebhookEventRequest request = json.readValue(body, WebhookEventRequest.class);
            Set<ConstraintViolation<WebhookEventRequest>> violations = validator.validate(request);
            if (!violations.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, violations.iterator().next().getMessage());
            }
            return request;
        } catch (JacksonException malformed) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Malformed JSON payload");
        }
    }

    private String normalizeSource(String source) {
        String normalized = source.toUpperCase(Locale.ROOT).replace('-', '_');
        if (!SOURCES.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported integration source");
        }
        return normalized;
    }

    private void validateHeader(String value, String name, int maxLength) {
        if (value.isBlank() || value.length() > maxLength) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    name + " must contain between 1 and " + maxLength + " characters"
            );
        }
    }

    private String sha256(byte[] body) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException("SHA-256 unavailable", unavailable);
        }
    }

    record WebhookEventRequest(
            @NotNull(message = "styleId is required") UUID styleId,
            @NotBlank(message = "type is required")
            @Size(max = 80, message = "type must not exceed 80 characters")
            String type,
            @NotNull(message = "occurredAt is required") Instant occurredAt
    ) {}

    record IngestResult(UUID eventId, boolean replayed, String state) {}

    record EventView(
            UUID id,
            UUID styleId,
            String source,
            String type,
            IntegrationState state,
            Instant occurredAt,
            String correlationId,
            int attempt
    ) {
        static EventView from(IntegrationEventEntity event) {
            return new EventView(event.getId(), event.getStyleId(), event.getSource(), event.getType(),
                    event.getState(), event.getOccurredAt(), event.getCorrelationId(), event.getAttempt());
        }
    }
}
