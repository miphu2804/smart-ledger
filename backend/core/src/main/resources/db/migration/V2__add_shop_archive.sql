ALTER TABLE shops
    ADD COLUMN archived_at TIMESTAMPTZ;

ALTER TABLE shops
    DROP CONSTRAINT ck_shops_status;

ALTER TABLE shops
    ADD CONSTRAINT ck_shops_status
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'));

ALTER TABLE shops
    ADD CONSTRAINT ck_shops_archived_at
    CHECK (
        (status = 'ARCHIVED' AND archived_at IS NOT NULL)
        OR (status <> 'ARCHIVED' AND archived_at IS NULL)
    );
