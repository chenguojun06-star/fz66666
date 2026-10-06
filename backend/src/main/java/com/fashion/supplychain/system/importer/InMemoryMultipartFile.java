package com.fashion.supplychain.system.importer;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import org.springframework.lang.NonNull;
import org.springframework.web.multipart.MultipartFile;

/**
 * 内存态 MultipartFile：智能映射导入把「任意表头的工作簿」归一化成标准模板工作簿后，
 * 以内存字节重新喂给既有导入器，避免落盘临时文件。
 */
public class InMemoryMultipartFile implements MultipartFile {

    private final String name;
    private final String originalFilename;
    private final String contentType;
    private final byte[] bytes;

    public InMemoryMultipartFile(String name, String originalFilename, String contentType, byte[] bytes) {
        this.name = name;
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.bytes = bytes != null ? bytes : new byte[0];
    }

    @Override
    @NonNull
    public String getName() {
        return name;
    }

    @Override
    public String getOriginalFilename() {
        return originalFilename;
    }

    @Override
    public String getContentType() {
        return contentType;
    }

    @Override
    public boolean isEmpty() {
        return bytes.length == 0;
    }

    @Override
    public long getSize() {
        return bytes.length;
    }

    @Override
    public byte[] getBytes() {
        return bytes;
    }

    @Override
    @NonNull
    public InputStream getInputStream() {
        return new ByteArrayInputStream(bytes);
    }

    @Override
    public void transferTo(@NonNull File dest) throws IOException {
        try (FileOutputStream out = new FileOutputStream(dest)) {
            out.write(bytes);
        }
    }
}
