package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.orchestration.OrganizationUnitOrchestrator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrgQueryToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    OrganizationUnitOrchestrator orgOrchestrator;

    @InjectMocks
    OrgQueryTool tool;

    // ───────────────────── tree ─────────────────────

    @Test
    void tree_returnsList() throws Exception {
        OrganizationUnit unit = new OrganizationUnit();
        unit.setId("1");
        unit.setNodeName("总部");
        when(orgOrchestrator.tree()).thenReturn(List.of(unit));

        String result = tool.execute("{\"action\":\"tree\"}");
        JsonNode node = JSON.readTree(result);

        assertEquals("success", node.path("status").asText());
        assertTrue(node.path("data").path("tree").isArray());
        assertEquals("总部", node.path("data").path("tree").get(0).path("nodeName").asText());
    }

    @Test
    void tree_emptyOrg() throws Exception {
        when(orgOrchestrator.tree()).thenReturn(Collections.emptyList());

        String result = tool.execute("{\"action\":\"tree\"}");
        JsonNode node = JSON.readTree(result);

        assertEquals("success", node.path("status").asText());
        assertEquals(0, node.path("data").path("tree").size());
    }

    // ───────────────────── departments ─────────────────────

    @Test
    void departments_returnsList() throws Exception {
        OrganizationUnit dept = new OrganizationUnit();
        dept.setId("2");
        dept.setNodeName("生产部");
        when(orgOrchestrator.departmentOptions()).thenReturn(List.of(dept));

        String result = tool.execute("{\"action\":\"departments\"}");
        JsonNode node = JSON.readTree(result);

        assertEquals("success", node.path("status").asText());
        assertTrue(node.path("data").path("departments").isArray());
        assertEquals("生产部", node.path("data").path("departments").get(0).path("nodeName").asText());
    }

    @Test
    void departments_empty() throws Exception {
        when(orgOrchestrator.departmentOptions()).thenReturn(Collections.emptyList());

        String result = tool.execute("{\"action\":\"departments\"}");
        JsonNode node = JSON.readTree(result);

        assertEquals("success", node.path("status").asText());
        assertEquals(0, node.path("data").path("departments").size());
    }

    // ───────────────────── members ─────────────────────

    @Test
    void members_returnsMap() throws Exception {
        User user = new User();
        user.setId(10L);
        user.setUsername("工人甲");
        Map<String, List<User>> memberMap = Map.of("生产部", List.of(user));
        when(orgOrchestrator.membersByOrgUnit()).thenReturn(memberMap);

        String result = tool.execute("{\"action\":\"members\"}");
        JsonNode node = JSON.readTree(result);

        assertEquals("success", node.path("status").asText());
        assertTrue(node.path("data").path("membersByDept").isObject());
    }

    @Test
    void members_emptyMap() throws Exception {
        when(orgOrchestrator.membersByOrgUnit()).thenReturn(Collections.emptyMap());

        String result = tool.execute("{\"action\":\"members\"}");
        JsonNode node = JSON.readTree(result);

        assertEquals("success", node.path("status").asText());
        assertEquals(0, node.path("data").path("membersByDept").size());
    }

    // ───────────────────── unknown action ─────────────────────

    @Test
    void unknownAction_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"invalid_action\"}");
        JsonNode node = JSON.readTree(result);

        assertEquals("error", node.path("status").asText());
        verify(orgOrchestrator, never()).tree();
    }

    // ───────────────────── missing action ─────────────────────

    @Test
    void missingAction_returnsError() throws Exception {
        String result = tool.execute("{}");
        JsonNode node = JSON.readTree(result);

        assertEquals("error", node.path("status").asText());
    }
}
