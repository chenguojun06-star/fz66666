package com.fashion.supplychain.intelligence.upgrade.phase4;

import com.fashion.supplychain.intelligence.agent.dag.DagGraph;
import com.fashion.supplychain.intelligence.agent.dag.DagNode;
import lombok.Data;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class DagVisualizationService {

    public DagVisualResult visualize(DagGraph graph) {
        if (graph == null) {
            DagVisualResult r = new DagVisualResult();
            r.success = false;
            return r;
        }

        DagVisualResult result = new DagVisualResult();
        result.success = true;
        result.nodes = new ArrayList<>();
        result.edges = new ArrayList<>();
        result.mermaidCode = buildMermaid(graph);

        for (DagNode node : graph.allNodes()) {
            VisualNode vn = new VisualNode();
            vn.id = node.getId();
            vn.label = node.getName() != null ? node.getName() : node.getId();
            vn.status = "pending";
            vn.requiresApproval = isApprovalNode(node);
            result.nodes.add(vn);

            if (node.getDependsOn() != null) {
                for (String dep : node.getDependsOn()) {
                    VisualEdge ve = new VisualEdge();
                    ve.from = dep;
                    ve.to = node.getId();
                    result.edges.add(ve);
                }
            }
        }
        return result;
    }

    private boolean isApprovalNode(DagNode node) {
        String id = node.getId().toLowerCase();
        return id.contains("approve") || id.contains("audit")
                || id.contains("confirm") || id.contains("review");
    }

    private String buildMermaid(DagGraph graph) {
        StringBuilder sb = new StringBuilder();
        sb.append("graph TD\n");
        for (DagNode node : graph.allNodes()) {
            String shape = isApprovalNode(node) ? "{{" : "[";
            String shapeEnd = isApprovalNode(node) ? "}}" : "]";
            String label = node.getName() != null ? node.getName() : node.getId();
            sb.append("  ").append(sanitizeId(node.getId()))
                    .append(shape).append(sanitizeLabel(label)).append(shapeEnd).append("\n");
            if (node.getDependsOn() != null) {
                for (String dep : node.getDependsOn()) {
                    sb.append("  ").append(sanitizeId(dep))
                            .append(" --> ").append(sanitizeId(node.getId())).append("\n");
                }
            }
        }
        return sb.toString();
    }

    private String sanitizeId(String id) {
        return id != null ? id.replaceAll("[^a-zA-Z0-9_]", "_") : "unknown";
    }

    private String sanitizeLabel(String label) {
        if (label == null) return "";
        String s = label.replaceAll("[\"\\[\\]{}|<>]", "");
        return s.substring(0, Math.min(30, s.length()));
    }

    @Data
    public static class DagVisualResult {
        private boolean success;
        private List<VisualNode> nodes;
        private List<VisualEdge> edges;
        private String mermaidCode;
    }

    @Data
    public static class VisualNode {
        private String id;
        private String label;
        private String status;
        private boolean requiresApproval;
    }

    @Data
    public static class VisualEdge {
        private String from;
        private String to;
    }
}
