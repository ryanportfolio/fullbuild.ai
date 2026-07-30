# syntax=docker/dockerfile:1.7
FROM maven:3.9.16-eclipse-temurin-21 AS build
WORKDIR /workspace

COPY showcase/threadline/backend/pom.xml ./pom.xml
RUN --mount=type=cache,target=/root/.m2 mvn --batch-mode dependency:go-offline

COPY showcase/threadline/backend/src ./src
RUN --mount=type=cache,target=/root/.m2 mvn --batch-mode verify

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

COPY --from=build --chown=10001:10001 /workspace/target/threadline-api-0.1.0-SNAPSHOT.jar /app/threadline-api.jar

USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/threadline-api.jar"]
