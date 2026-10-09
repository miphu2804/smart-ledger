package com.smartledger.core.media;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class MultipartImageReader {

    private final ImageUploadValidator validator;

    public MultipartImageReader(ImageUploadValidator validator) {
        this.validator = validator;
    }

    public ValidatedImage read(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new BusinessException(ErrorCode.IMAGE_REQUIRED);
        }
        try {
            return validator.validate(image.getBytes());
        } catch (IOException exception) {
            throw new BusinessException(ErrorCode.IMAGE_TYPE_INVALID);
        }
    }
}
