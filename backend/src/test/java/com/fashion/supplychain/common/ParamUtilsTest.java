package com.fashion.supplychain.common;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ParamUtilsTest {

    @Test
    void toTrimmedStringShouldDecodeUtf8Bytes() {
        byte[] raw = " 张三 ".getBytes(StandardCharsets.UTF_8);

        String result = ParamUtils.toTrimmedString(raw);

        assertEquals("张三", result);
    }

    @Test
    void toTrimmedStringShouldTreatNullLikeStringsAsNull() {
        assertNull(ParamUtils.toTrimmedString(" null "));
        assertNull(ParamUtils.toTrimmedString(" undefined "));
    }
}
