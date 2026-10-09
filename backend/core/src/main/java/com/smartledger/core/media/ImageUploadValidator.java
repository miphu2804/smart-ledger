package com.smartledger.core.media;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.springframework.stereotype.Component;

/** Validates a small, known-safe image subset before a future controller sends it to Cloudinary. */
@Component
public class ImageUploadValidator {

    public static final int MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    private static final int MAX_DIMENSION = 2048;
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a};

    public ValidatedImage validate(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new BusinessException(ErrorCode.IMAGE_REQUIRED);
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new BusinessException(ErrorCode.IMAGE_TOO_LARGE);
        }

        String contentType = detectedContentType(bytes);
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw new BusinessException(ErrorCode.IMAGE_TYPE_INVALID);
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
                    throw new BusinessException(ErrorCode.IMAGE_DIMENSIONS_INVALID);
                }
                return new ValidatedImage(bytes, contentType, width, height, sha256(bytes));
            } finally {
                reader.dispose();
            }
        } catch (BusinessException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            throw new BusinessException(ErrorCode.IMAGE_TYPE_INVALID);
        }
    }

    private static String detectedContentType(byte[] bytes) {
        if (isPng(bytes)) {
            return "image/png";
        }
        if (isJpeg(bytes)) {
            return "image/jpeg";
        }
        throw new BusinessException(ErrorCode.IMAGE_TYPE_INVALID);
    }

    private static boolean isPng(byte[] bytes) {
        if (bytes.length < PNG_SIGNATURE.length) {
            return false;
        }
        for (int index = 0; index < PNG_SIGNATURE.length; index++) {
            if (bytes[index] != PNG_SIGNATURE[index]) {
                return false;
            }
        }
        return true;
    }

    private static boolean isJpeg(byte[] bytes) {
        return bytes.length >= 3
                && bytes[0] == (byte) 0xff
                && bytes[1] == (byte) 0xd8
                && bytes[2] == (byte) 0xff;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 must be available in the JRE", exception);
        }
    }
}
