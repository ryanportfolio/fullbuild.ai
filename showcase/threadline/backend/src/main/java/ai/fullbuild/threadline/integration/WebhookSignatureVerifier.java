package ai.fullbuild.threadline.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

@Component
public class WebhookSignatureVerifier {
    private static final Duration REPLAY_WINDOW = Duration.ofMinutes(5);
    private static final String ALGORITHM = "HmacSHA256";

    private final byte[] secret;
    private final Clock clock;

    public WebhookSignatureVerifier(@Value("${threadline.webhook.secret}") String secret) {
        this(secret, Clock.systemUTC());
    }

    WebhookSignatureVerifier(String secret, Clock clock) {
        if (secret == null || secret.length() < 32) {
            throw new IllegalArgumentException("Webhook secret must be at least 32 characters");
        }
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.clock = clock;
    }

    public void verify(String timestampHeader, String signatureHeader, byte[] body) {
        Instant timestamp = parseTimestamp(timestampHeader);
        Duration age = Duration.between(timestamp, clock.instant()).abs();
        if (age.compareTo(REPLAY_WINDOW) > 0) {
            throw unauthorized("Webhook timestamp outside replay window");
        }

        String normalizedSignature = signatureHeader.startsWith("sha256=")
                ? signatureHeader.substring("sha256=".length())
                : signatureHeader;
        byte[] supplied;
        try {
            supplied = HexFormat.of().parseHex(normalizedSignature);
        } catch (IllegalArgumentException invalidHex) {
            throw unauthorized("Malformed webhook signature");
        }

        byte[] expected = sign(timestampHeader, body);
        if (!MessageDigest.isEqual(expected, supplied)) {
            throw unauthorized("Invalid webhook signature");
        }
    }

    byte[] sign(String timestampHeader, byte[] body) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret, ALGORITHM));
            mac.update(timestampHeader.getBytes(StandardCharsets.UTF_8));
            mac.update((byte) '.');
            return mac.doFinal(body);
        } catch (GeneralSecurityException unavailable) {
            throw new IllegalStateException("HMAC SHA-256 unavailable", unavailable);
        }
    }

    private Instant parseTimestamp(String header) {
        try {
            return Instant.ofEpochSecond(Long.parseLong(header));
        } catch (RuntimeException invalidTimestamp) {
            throw unauthorized("Malformed webhook timestamp");
        }
    }

    private ResponseStatusException unauthorized(String reason) {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, reason);
    }
}
