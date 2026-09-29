# SmartLedger Core — local setup

Core is a Java 21 / Spring Boot backend. This README covers how to run it locally on Windows, macOS/Linux, in IntelliJ IDEA, or with Docker Compose. For product behavior and API details, see the [documentation index](../../docs/README.md) and [API contracts](../../docs/contracts/api-contracts.md).

## Prerequisites

- JDK 21 for a host/IntelliJ run. The included Maven wrapper downloads the required Maven version; a separate Maven installation is not needed.
- PostgreSQL and an existing `smartledger` database (or use the Compose PostgreSQL service below).
- Firebase project ID and a Firebase service-account JSON file. Keep the JSON outside the repository and do not commit it.

Set these environment variables in the process that launches Core. [`.env.example`](.env.example) is a reference; Spring Boot does not load it automatically.

| Variable | Description |
|---|---|
| `DATABASE_URL` | JDBC URL, for example `jdbc:postgresql://localhost:5432/smartledger` |
| `DATABASE_USERNAME`, `DATABASE_PASSWORD` | PostgreSQL credentials |
| `FIREBASE_PROJECT_ID` | Firebase project used by this backend |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to the service-account JSON **on the machine running Core** |
| `SERVER_PORT` | Optional; defaults to `8080` when running outside Compose |
| `FIREBASE_AUTH_EMULATOR_HOST` | Optional for local Auth Emulator testing, e.g. `127.0.0.1:9099` without `http://` |

Flyway runs committed migrations at startup and JPA validates the resulting schema. Use the same Firebase project ID for the backend and any locally generated test tokens.

## Windows PowerShell

Open PowerShell in `backend/core`, configure the variables above in that terminal (or use an IntelliJ Run Configuration), then run:

```powershell
.\mvnw.cmd spring-boot:run
```

With the default port, open `http://localhost:8080/swagger-ui/index.html` to check that Core started. Press `Ctrl+C` to stop it.

## macOS / Linux

Open a terminal in `backend/core`, export the same variables, then run:

```bash
./mvnw spring-boot:run
```

If the wrapper is not executable, run `chmod +x mvnw` once. Swagger uses the same default URL and port as on Windows.

## IntelliJ IDEA

Open `backend/core` as a Maven project and use JDK 21. Run `com.smartledger.core.SmartLedgerCoreApplication`. In **Run → Edit Configurations**, add the variables from the table to **Environment variables**; setting them in a separate terminal does not automatically pass them to IntelliJ. Start the PostgreSQL database before running the application.

## Docker Compose

Run this from the **repository root** with Docker Desktop/Engine running. Supply `POSTGRES_PASSWORD`, `FIREBASE_PROJECT_ID`, and `FIREBASE_CREDENTIALS_PATH` to Compose (for example via a root-level, uncommitted `.env`). `FIREBASE_CREDENTIALS_PATH` must be an absolute path to the JSON file on the host.

```powershell
docker compose up --build core postgres
```

Compose mounts the service-account JSON read-only and sets its path inside the container. Core listens on container port `8080`; Compose exposes it on host port `8000` by default (`CORE_PORT` changes the host port). Open `http://localhost:8000/swagger-ui/index.html` to check startup. Stop with `Ctrl+C`, then run `docker compose down` from the repository root when finished.

If the Firebase Auth Emulator runs on the host, configure `FIREBASE_AUTH_EMULATOR_HOST` with an address reachable **from the container**; `127.0.0.1` inside Core means the container, not the host.

## Run tests

From `backend/core`:

```powershell
.\mvnw.cmd test
```

On macOS/Linux, use `./mvnw test`. If startup fails, check the PostgreSQL connection, Firebase credentials, and Flyway error in the Core logs.
