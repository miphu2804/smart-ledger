FROM maven:3.9.11-eclipse-temurin-21 AS build

WORKDIR /workspace

# Resolve dependencies before copying source so Docker can reuse this layer.
COPY pom.xml ./
RUN mvn --batch-mode --no-transfer-progress dependency:go-offline

COPY src ./src
RUN mvn --batch-mode --no-transfer-progress -DskipTests package


FROM eclipse-temurin:21-jre-jammy AS runtime

WORKDIR /app

# The API must not run as root inside its container.
RUN groupadd --system --gid 10001 smartledger \
    && useradd --system --uid 10001 --gid smartledger --create-home --home-dir /app smartledger

COPY --from=build --chown=smartledger:smartledger /workspace/target/core-0.0.1-SNAPSHOT.jar /app/app.jar

USER smartledger

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
