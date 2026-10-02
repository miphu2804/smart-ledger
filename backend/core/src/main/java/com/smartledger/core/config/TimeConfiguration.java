package com.smartledger.core.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.std.StdScalarSerializer;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class TimeConfiguration {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @Bean
    Jackson2ObjectMapperBuilderCustomizer vietnamTimestampDisplay() {
        return builder -> builder.serializers(new VietnamTimestampSerializer());
    }

    private static final class VietnamTimestampSerializer extends StdScalarSerializer<OffsetDateTime> {
        private VietnamTimestampSerializer() {
            super(OffsetDateTime.class);
        }

        @Override
        public void serialize(OffsetDateTime value, JsonGenerator generator, SerializerProvider provider)
                throws IOException {
            generator.writeString(value.atZoneSameInstant(BUSINESS_ZONE)
                    .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        }
    }
}
