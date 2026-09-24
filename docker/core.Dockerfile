FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /workspace
COPY backend/core/pom.xml ./pom.xml
COPY backend/core/src ./src
RUN mvn --batch-mode --no-transfer-progress -DskipTests package

FROM eclipse-temurin:21-jre

WORKDIR /app
RUN mkdir -p /run/secrets && chown 10001:0 /run/secrets
COPY --from=build --chown=10001:0 /workspace/target/core-0.0.1-SNAPSHOT.jar ./app.jar
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
