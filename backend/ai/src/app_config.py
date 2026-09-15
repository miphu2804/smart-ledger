from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ServerSettings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8001


class LogSettings(BaseModel):
    level: str = "INFO"


class PostgresSettings(BaseModel):
    url: str | None = None


class RedisSettings(BaseModel):
    url: str | None = None


class QdrantSettings(BaseModel):
    url: str | None = None


class LitellmSettings(BaseModel):
    url: str | None = None


class LangfuseSettings(BaseModel):
    public_key: str | None = None
    secret_key: str | None = None
    host: str | None = None


class AppConfig(BaseSettings):
    app_title: str = "SmartLedger AI"
    server: ServerSettings = Field(default_factory=ServerSettings)
    log: LogSettings = Field(default_factory=LogSettings)
    postgres: PostgresSettings = Field(default_factory=PostgresSettings)
    redis: RedisSettings = Field(default_factory=RedisSettings)
    qdrant: QdrantSettings = Field(default_factory=QdrantSettings)
    litellm: LitellmSettings = Field(default_factory=LitellmSettings)
    langfuse: LangfuseSettings = Field(default_factory=LangfuseSettings)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_nested_delimiter="__",
        extra="ignore",
    )


app_config = AppConfig()
