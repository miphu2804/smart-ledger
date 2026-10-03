package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.SaleDraft;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.Calendar;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.type.BasicType;
import org.hibernate.type.SqlTypes;
import org.hibernate.type.descriptor.WrapperOptions;
import org.hibernate.type.descriptor.java.OffsetDateTimeJavaType;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PostgresTimestampMappingTest {
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void offsetDateTimeKeepsUtcMappingWithOrWithoutJdbcTimezone(boolean explicitTimezone) throws Exception {
        var builder = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect")
                .applySetting("hibernate.boot.allow_jdbc_metadata_access", false);
        if (explicitTimezone) {
            builder.applySetting("hibernate.jdbc.time_zone", "UTC");
        }
        var registry = builder.build();
        try {
            var metadata = new MetadataSources(registry)
                    .addAnnotatedClass(Product.class)
                    .addAnnotatedClass(SaleDraft.class)
                    .buildMetadata();
            for (Class<?> entity : new Class<?>[] {Product.class, SaleDraft.class}) {
                var mapping = metadata.getEntityBinding(entity.getName());
                for (String field : new String[] {"createdAt", "updatedAt"}) {
                    var type = (BasicType<?>) mapping.getProperty(field).getType();
                    assertThat(type.getJdbcType().getDefaultSqlTypeCode()).isEqualTo(SqlTypes.TIMESTAMP_UTC);
                }
            }
            var confirmedType = (BasicType<?>) metadata.getEntityBinding(SaleDraft.class.getName())
                    .getProperty("confirmedAt").getType();
            var jdbcType = confirmedType.getJdbcType();
            assertThat(jdbcType.getDefaultSqlTypeCode()).isEqualTo(SqlTypes.TIMESTAMP_UTC);

            var at = OffsetDateTime.parse("2026-10-01T21:30:00+07:00");
            var statement = mock(PreparedStatement.class);
            var options = mock(WrapperOptions.class);
            jdbcType.getBinder(OffsetDateTimeJavaType.INSTANCE).bind(statement, at, 1, options);
            var written = ArgumentCaptor.forClass(Timestamp.class);
            var calendar = ArgumentCaptor.forClass(Calendar.class);
            verify(statement).setTimestamp(eq(1), written.capture(), calendar.capture());
            assertThat(written.getValue().toInstant()).isEqualTo(at.toInstant());
            assertThat(calendar.getValue().getTimeZone().getID()).isEqualTo("UTC");

            var result = mock(ResultSet.class);
            when(result.getTimestamp(eq(1), any(Calendar.class))).thenReturn(written.getValue());
            var read = jdbcType.getExtractor(OffsetDateTimeJavaType.INSTANCE).extract(result, 1, options);
            assertThat(read.toInstant()).isEqualTo(at.toInstant());
            verify(result).getTimestamp(eq(1), calendar.capture());
            assertThat(calendar.getValue().getTimeZone().getID()).isEqualTo("UTC");
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }
}
