package com.fashion.supplychain.production.service.helper;

import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class MaterialPurchaseHelperTest {

    @Test
    void testResolveStatusByArrived() {
        // Assume constants values if not accessible, but they should be public.
        // Or use the helper result to verify logic flow.

        String pending = MaterialPurchaseHelper.resolveStatusByArrived(null, 0, 100);
        assertNotNull(pending); // Should return PENDING (usually 'pending')

        String partial = MaterialPurchaseHelper.resolveStatusByArrived(null, 50, 100);
        assertNotNull(partial);
        assertNotEquals(pending, partial);

        String completed = MaterialPurchaseHelper.resolveStatusByArrived(null, 100, 100);
        assertNotNull(completed);
        assertNotEquals(partial, completed);

        String over = MaterialPurchaseHelper.resolveStatusByArrived(null, 120, 100);
        assertEquals(completed, over);
    }

    @Test
    void testNormalizeMaterialType() {
        // Just checking basic normalization logic
        String fabric = MaterialPurchaseHelper.normalizeMaterialType(MaterialConstants.TYPE_FABRIC_CN);
        assertEquals(MaterialConstants.TYPE_FABRIC, fabric);
    }

    @Test
    void testSplitOptions() {
        List<String> opts = MaterialPurchaseHelper.splitOptions("A, B  C/D");
        assertEquals(4, opts.size());
        assertTrue(opts.contains("a"));
        assertTrue(opts.contains("b"));
        assertTrue(opts.contains("c"));
        assertTrue(opts.contains("d"));
    }

    @Test
    void testRepairReceiverFromRemark() {
        MaterialPurchase p = new MaterialPurchase();
        p.setRemark("Some notes; 领取人：张三 2026-01-01 10:00:00");

        boolean changed = MaterialPurchaseHelper.repairReceiverFromRemark(p);
        assertTrue(changed);
        assertEquals("张三", p.getReceiverName());
        assertNotNull(p.getReceivedTime());
        assertEquals(2026, p.getReceivedTime().getYear());
    }
}
