package com.smartledger.core.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class ImageUploadValidatorTest {

    private final ImageUploadValidator validator = new ImageUploadValidator();

    @Test
    void acceptsAPngAfterInspectingItsBytesAndDimensions() throws IOException {
        byte[] png = image("png", 64, 32);

        ValidatedImage result = validator.validate(png);

        assertThat(result.contentType()).isEqualTo("image/png");
        assertThat(result.width()).isEqualTo(64);
        assertThat(result.height()).isEqualTo(32);
        assertThat(result.sha256()).hasSize(64);
    }

    @Test
    void rejectsAFileThatOnlyPretendsToBePng() {
        byte[] fakePng = new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3};

        assertThatThrownBy(() -> validator.validate(fakePng))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.IMAGE_TYPE_INVALID));
    }

    @Test
    void rejectsFormatsOutsideJpegAndPng() throws IOException {
        assertThatThrownBy(() -> validator.validate(image("gif", 16, 16)))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.IMAGE_TYPE_INVALID));
    }

    @Test
    void rejectsImagesWiderThanTheMvpLimit() throws IOException {
        assertThatThrownBy(() -> validator.validate(image("png", 2049, 1)))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.IMAGE_DIMENSIONS_INVALID));
    }

    @Test
    void rejectsPayloadsLargerThanFiveMegabytesBeforeParsingThem() {
        byte[] tooLarge = new byte[ImageUploadValidator.MAX_IMAGE_BYTES + 1];

        assertThatThrownBy(() -> validator.validate(tooLarge))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.IMAGE_TOO_LARGE));
    }

    private static byte[] image(String format, int width, int height) throws IOException {
        BufferedImage source = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(source, format, output);
        return output.toByteArray();
    }
}
