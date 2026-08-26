-- D-153: 供应商标签——区分外发工厂/布行/辅料店等细分类型
ALTER TABLE t_factory
    ADD COLUMN supplier_tag VARCHAR(50) NULL COMMENT '供应商标签: 布行/辅料店/纱线行/五金辅料/其它' AFTER supplier_type;
