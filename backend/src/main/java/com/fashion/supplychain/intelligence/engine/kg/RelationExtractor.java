package com.fashion.supplychain.intelligence.engine.kg;

import java.util.List;

public interface RelationExtractor {
    RelationType getRelationType();
    List<KgRelation> extract(Long tenantId);
}
