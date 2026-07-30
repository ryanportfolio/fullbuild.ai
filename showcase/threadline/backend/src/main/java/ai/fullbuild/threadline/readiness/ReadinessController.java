package ai.fullbuild.threadline.readiness;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class ReadinessController {
    private final ReadinessService readiness;

    public ReadinessController(ReadinessService readiness) {
        this.readiness = readiness;
    }

    @GetMapping("/seasons/{season}/readiness")
    ResponseEntity<ReadinessService.CollectionReadiness> season(@PathVariable String season) {
        ReadinessService.CollectionReadiness body = readiness.season(season);
        return ResponseEntity.ok()
                .eTag("\"season-" + body.season() + "-" + body.version() + "\"")
                .cacheControl(CacheControl.noCache())
                .body(body);
    }

    @GetMapping("/styles/{styleId}")
    ResponseEntity<ReadinessService.StyleDetail> style(@PathVariable UUID styleId) {
        ReadinessService.StyleDetail body = readiness.style(styleId);
        return ResponseEntity.ok()
                .eTag("\"style-" + body.id() + "-" + body.version() + "\"")
                .cacheControl(CacheControl.noCache())
                .body(body);
    }

    @PostMapping("/blockers/{blockerId}/resolve")
    ResponseEntity<ReadinessService.ResolutionResult> resolve(
            @PathVariable UUID blockerId,
            @AuthenticationPrincipal Jwt principal
    ) {
        return ResponseEntity.ok(readiness.resolve(blockerId, principal.getSubject()));
    }
}
