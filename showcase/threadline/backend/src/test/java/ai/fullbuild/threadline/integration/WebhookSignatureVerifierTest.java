package ai.fullbuild.threadline.integration;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WebhookSignatureVerifierTest {
    private static final String SECRET = "0123456789abcdef0123456789abcdef";
    private static final Instant NOW = Instant.parse("2026-07-29T16:00:00Z");
    private final WebhookSignatureVerifier verifier =
            new WebhookSignatureVerifier(SECRET, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void acceptsAuthenticPayloadInsideReplayWindow() {
        byte[] body = "{\"type\":\"STYLE_DELTA\"}".getBytes(StandardCharsets.UTF_8);
        String timestamp = Long.toString(NOW.getEpochSecond());
        String signature = "sha256=" + HexFormat.of().formatHex(verifier.sign(timestamp, body));

        verifier.verify(timestamp, signature, body);
    }

    @Test
    void rejectsPayloadMutationUsingConstantTimeComparison() {
        byte[] original = "{\"value\":1}".getBytes(StandardCharsets.UTF_8);
        byte[] changed = "{\"value\":2}".getBytes(StandardCharsets.UTF_8);
        String timestamp = Long.toString(NOW.getEpochSecond());
        String signature = HexFormat.of().formatHex(verifier.sign(timestamp, original));

        assertThatThrownBy(() -> verifier.verify(timestamp, signature, changed))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401");
    }

    @Test
    void rejectsExpiredTimestamp() {
        byte[] body = "{}".getBytes(StandardCharsets.UTF_8);
        String timestamp = Long.toString(NOW.minusSeconds(301).getEpochSecond());
        String signature = HexFormat.of().formatHex(verifier.sign(timestamp, body));

        assertThatThrownBy(() -> verifier.verify(timestamp, signature, body))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401");
    }
}
