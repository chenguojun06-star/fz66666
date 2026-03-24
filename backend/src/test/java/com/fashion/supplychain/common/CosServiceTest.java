package com.fashion.supplychain.common;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class CosServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void upload_localMode_allowsPatternFileExtensions() throws Exception {
        CosService cosService = new CosService();
        ReflectionTestUtils.setField(cosService, "uploadPath", tempDir.toString() + "/");

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "sample.dxf",
                "application/octet-stream",
                "pattern-content".getBytes()
        );

        cosService.upload(1L, "uuid.dxf", file);

        Path savedFile = tempDir.resolve("tenants/1/uuid.dxf");
        assertThat(Files.exists(savedFile)).isTrue();
        assertThat(Files.readString(savedFile)).isEqualTo("pattern-content");
    }
}
