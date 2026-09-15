CREATE TABLE IF NOT EXISTS t_user (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64),
    password VARCHAR(255),
    real_name VARCHAR(64),
    phone VARCHAR(32),
    email VARCHAR(128),
    avatar VARCHAR(255),
    role VARCHAR(64),
    tenant_id BIGINT DEFAULT NULL,
    factory_id VARCHAR(64),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    permission_range VARCHAR(20),
    is_tenant_owner INT DEFAULT 0,
    is_super_admin INT DEFAULT 0,
    created_by VARCHAR(64),
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_role (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64),
    code VARCHAR(64),
    description VARCHAR(255),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_tenant (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128),
    code VARCHAR(64),
    contact_person VARCHAR(64),
    contact_phone VARCHAR(32),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    tenant_type VARCHAR(32),
    max_users INT DEFAULT 50,
    current_users INT DEFAULT 0,
    expire_date DATE,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_factory (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128),
    factory_type VARCHAR(32),
    contact_person VARCHAR(64),
    contact_phone VARCHAR(32),
    address VARCHAR(255),
    tenant_id BIGINT DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_organization_unit (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128),
    parent_id VARCHAR(64),
    org_type VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_style_info (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    style_no VARCHAR(64),
    style_name VARCHAR(128),
    season VARCHAR(32),
    "year" VARCHAR(16),
    brand VARCHAR(64),
    category VARCHAR(64),
    sub_category VARCHAR(64),
    designer VARCHAR(64),
    pattern_maker VARCHAR(64),
    description VARCHAR(4000),
    cover_image VARCHAR(255),
    status VARCHAR(32),
    sample_status VARCHAR(32),
    sample_progress INT DEFAULT 0,
    sample_review_status VARCHAR(32),
    sample_review_comment VARCHAR(500),
    sample_reviewer VARCHAR(64),
    sample_review_time TIMESTAMP,
    sample_completed_time TIMESTAMP,
    production_status VARCHAR(32),
    production_progress INT DEFAULT 0,
    is_scrapped INT DEFAULT 0,
    scrap_reason VARCHAR(500),
    scrapped_at TIMESTAMP,
    scrapped_by VARCHAR(64),
    description_locked INT DEFAULT 0,
    description_return_comment VARCHAR(500),
    description_return_by VARCHAR(64),
    source_type VARCHAR(32),
    source_id VARCHAR(64),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_production_order (
    id VARCHAR(64) PRIMARY KEY,
    order_no VARCHAR(64),
    qr_code VARCHAR(255),
    style_id VARCHAR(64),
    style_no VARCHAR(64),
    style_name VARCHAR(128),
    factory_id VARCHAR(64),
    factory_name VARCHAR(128),
    factory_type VARCHAR(32),
    factory_contact_person VARCHAR(64),
    factory_contact_phone VARCHAR(32),
    color VARCHAR(64),
    size VARCHAR(64),
    sku VARCHAR(64),
    skc VARCHAR(64),
    order_quantity INT,
    completed_quantity INT DEFAULT 0,
    production_progress INT DEFAULT 0,
    material_arrival_rate INT DEFAULT 0,
    status VARCHAR(32),
    urgency_level VARCHAR(16),
    plate_type VARCHAR(32),
    merchandiser VARCHAR(64),
    customer_id VARCHAR(64),
    customer_name VARCHAR(128),
    company VARCHAR(128),
    product_category VARCHAR(64),
    pattern_maker VARCHAR(64),
    order_details VARCHAR(4000),
    progress_workflow_json VARCHAR(4000),
    progress_workflow_locked INT DEFAULT 0,
    progress_workflow_locked_at TIMESTAMP,
    progress_workflow_locked_by VARCHAR(64),
    progress_workflow_locked_by_name VARCHAR(64),
    transfer_log_json VARCHAR(4000),
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    expected_ship_date DATE,
    order_biz_type VARCHAR(32),
    source_biz_type VARCHAR(32),
    pushed_to_order INT DEFAULT 0,
    pricing_mode VARCHAR(32),
    scatter_pricing_mode VARCHAR(32),
    scatter_cutting_unit_price DECIMAL(15,2),
    factory_unit_price DECIMAL(15,2),
    org_unit_id VARCHAR(64),
    parent_org_unit_id VARCHAR(64),
    parent_org_unit_name VARCHAR(128),
    org_path VARCHAR(255),
    procurement_manually_completed INT DEFAULT 0,
    procurement_confirmed_by VARCHAR(64),
    procurement_confirmed_by_name VARCHAR(64),
    procurement_confirmed_at TIMESTAMP,
    procurement_confirm_remark VARCHAR(500),
    is_quick_response INT DEFAULT 0,
    standard_delivery_days INT,
    actual_delivery_days INT,
    delivery_sla_status VARCHAR(32),
    created_by_id VARCHAR(64),
    created_by_name VARCHAR(64),
    remarks VARCHAR(500),
    node_operations VARCHAR(4000),
    version INT DEFAULT 1,
    sku_auto_generate INT DEFAULT 0,
    sales_channel VARCHAR(64),
    customer_contact VARCHAR(64),
    customer_phone VARCHAR(32),
    customer_address VARCHAR(255),
    urge_count INT DEFAULT 0,
    last_urge_time TIMESTAMP,
    order_unit_price DECIMAL(15,2),
    order_unit_price_type VARCHAR(32),
    procurement_budget_hours INT,
    cutting_budget_hours INT,
    secondary_process_budget_hours INT,
    car_sewing_budget_hours INT,
    ironing_budget_hours INT,
    packaging_budget_hours INT,
    quality_budget_hours INT,
    warehousing_budget_hours INT,
    material_cost DECIMAL(15,2),
    total_cost DECIMAL(15,2),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_scan_record (
    id VARCHAR(64) PRIMARY KEY,
    scan_code VARCHAR(255),
    request_id VARCHAR(64),
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    style_id VARCHAR(64),
    style_no VARCHAR(64),
    color VARCHAR(64),
    size VARCHAR(64),
    quantity INT,
    unit_price DECIMAL(15,2),
    total_amount DECIMAL(15,2),
    process_code VARCHAR(64),
    progress_stage VARCHAR(100),
    process_name VARCHAR(128),
    operator_id VARCHAR(64),
    operator_name VARCHAR(64),
    scan_time TIMESTAMP,
    scan_type VARCHAR(32),
    scan_result VARCHAR(32),
    remark VARCHAR(500),
    scan_ip VARCHAR(64),
    cutting_bundle_id VARCHAR(64),
    cutting_bundle_no VARCHAR(64),
    cutting_bundle_qr_code VARCHAR(100),
    settlement_status VARCHAR(32),
    payroll_settlement_id VARCHAR(64),
    receive_time TIMESTAMP,
    confirm_time TIMESTAMP,
    scan_mode VARCHAR(32),
    sku_completed_count INT,
    sku_total_count INT,
    process_unit_price DECIMAL(15,2),
    scan_cost DECIMAL(15,2),
    delegate_target_type VARCHAR(32),
    delegate_target_id VARCHAR(64),
    delegate_target_name VARCHAR(128),
    actual_operator_id VARCHAR(64),
    actual_operator_name VARCHAR(64),
    current_progress_stage VARCHAR(100),
    progress_node_unit_prices VARCHAR(4000),
    cumulative_scan_count INT,
    total_scan_count INT,
    progress_percentage INT,
    total_piece_cost DECIMAL(15,2),
    average_piece_cost DECIMAL(15,2),
    assignment_id VARCHAR(64),
    assigned_operator_name VARCHAR(64),
    tenant_id BIGINT DEFAULT NULL,
    factory_id VARCHAR(64),
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_material_purchase (
    id VARCHAR(64) PRIMARY KEY,
    purchase_no VARCHAR(64),
    material_id VARCHAR(64),
    material_code VARCHAR(64),
    material_name VARCHAR(128),
    material_type VARCHAR(64),
    specifications VARCHAR(255),
    unit VARCHAR(32),
    purchase_quantity DECIMAL(18,2),
    conversion_rate DECIMAL(18,2),
    arrived_quantity INT,
    inbound_record_id VARCHAR(64),
    supplier_id VARCHAR(64),
    supplier_name VARCHAR(128),
    supplier_contact_person VARCHAR(64),
    supplier_contact_phone VARCHAR(64),
    unit_price DECIMAL(15,2),
    total_amount DECIMAL(15,2),
    receiver_id VARCHAR(64),
    receiver_name VARCHAR(64),
    received_time TIMESTAMP,
    remark VARCHAR(500),
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    style_id VARCHAR(64),
    style_no VARCHAR(64),
    style_name VARCHAR(128),
    style_cover VARCHAR(255),
    color VARCHAR(64),
    size VARCHAR(64),
    size_usage_map VARCHAR(1000),
    return_confirmed INT,
    return_quantity INT,
    return_confirmer_id VARCHAR(64),
    return_confirmer_name VARCHAR(64),
    return_confirm_time TIMESTAMP,
    status VARCHAR(64),
    creator_id VARCHAR(64),
    creator_name VARCHAR(64),
    updater_id VARCHAR(64),
    updater_name VARCHAR(64),
    expected_arrival_date TIMESTAMP,
    actual_arrival_date TIMESTAMP,
    expected_ship_date DATE,
    source_type VARCHAR(64),
    pattern_production_id VARCHAR(64),
    factory_name VARCHAR(128),
    factory_type VARCHAR(64),
    order_biz_type VARCHAR(64),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    evidence_image_urls VARCHAR(1000),
    fabric_composition VARCHAR(255),
    fabric_width VARCHAR(64),
    fabric_weight VARCHAR(64),
    invoice_urls VARCHAR(1000),
    audit_status VARCHAR(50) DEFAULT 'none',
    audit_reason VARCHAR(500),
    audit_time TIMESTAMP,
    audit_operator_id VARCHAR(50),
    audit_operator_name VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS t_material_stock (
    id VARCHAR(64) PRIMARY KEY,
    material_id VARCHAR(64),
    material_code VARCHAR(64),
    material_name VARCHAR(128),
    material_type VARCHAR(64),
    specifications VARCHAR(255),
    unit VARCHAR(32),
    color VARCHAR(64),
    size VARCHAR(64),
    supplier_name VARCHAR(128),
    supplier_id VARCHAR(64),
    supplier_contact_person VARCHAR(64),
    supplier_contact_phone VARCHAR(64),
    fabric_width VARCHAR(64),
    fabric_weight VARCHAR(64),
    fabric_composition VARCHAR(255),
    quantity INT DEFAULT 0,
    locked_quantity INT DEFAULT 0,
    location VARCHAR(128),
    warehouse_area_id VARCHAR(64) DEFAULT NULL,
    warehouse_area_name VARCHAR(128) DEFAULT NULL,
    unit_price DECIMAL(15,2),
    conversion_rate DECIMAL(18,2),
    total_value DECIMAL(15,2),
    last_inbound_date TIMESTAMP DEFAULT NULL,
    last_outbound_date TIMESTAMP DEFAULT NULL,
    safety_stock INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    version INT DEFAULT 0,
    tenant_id BIGINT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_product_warehousing (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    style_id VARCHAR(64),
    style_no VARCHAR(64),
    style_name VARCHAR(128),
    color VARCHAR(64),
    size VARCHAR(64),
    warehousing_quantity INT,
    qualified_quantity INT,
    warehousing_type VARCHAR(32),
    warehouse VARCHAR(64),
    quality_status VARCHAR(32),
    inspector_id VARCHAR(64),
    inspector_name VARCHAR(64),
    inspection_type VARCHAR(32),
    sample_size INT,
    accept_number INT,
    reject_number INT,
    warehousing_no VARCHAR(64),
    factory_name VARCHAR(128),
    factory_type VARCHAR(32),
    order_biz_type VARCHAR(32),
    org_unit_id VARCHAR(64),
    parent_org_unit_id VARCHAR(64),
    parent_org_unit_name VARCHAR(128),
    org_path VARCHAR(255),
    scan_code VARCHAR(255),
    cutting_quantity INT,
    repair_remark VARCHAR(500),
    control_chart_type VARCHAR(32),
    control_chart_data VARCHAR(4000),
    inspector_cert_no VARCHAR(64),
    warehousing_start_time TIMESTAMP,
    warehousing_end_time TIMESTAMP,
    warehousing_operator_id VARCHAR(64),
    warehousing_operator_name VARCHAR(64),
    cutting_bundle_qr_code VARCHAR(100),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_cutting_bundle (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    style_no VARCHAR(64),
    color VARCHAR(64),
    size VARCHAR(64),
    bed_no VARCHAR(64),
    layer_count INT,
    quantity_per_layer INT,
    total_quantity INT,
    qr_code VARCHAR(255),
    status VARCHAR(32),
    task_id VARCHAR(64),
    tenant_id BIGINT DEFAULT NULL,
    factory_id VARCHAR(64),
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_cutting_task (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    style_no VARCHAR(64),
    task_no VARCHAR(64),
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_payroll_settlement (
    id VARCHAR(64) PRIMARY KEY,
    settlement_no VARCHAR(64),
    period VARCHAR(32),
    status VARCHAR(32),
    total_amount DECIMAL(15,2),
    settled_at TIMESTAMP,
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_payroll_settlement_item (
    id VARCHAR(64) PRIMARY KEY,
    settlement_id VARCHAR(64),
    scan_record_id VARCHAR(64),
    operator_id VARCHAR(64),
    operator_name VARCHAR(64),
    process_name VARCHAR(128),
    quantity INT,
    unit_price DECIMAL(15,2),
    amount DECIMAL(15,2),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_material_reconciliation (
    id VARCHAR(64) PRIMARY KEY,
    reconciliation_no VARCHAR(64),
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    factory_id VARCHAR(64),
    factory_name VARCHAR(128),
    status VARCHAR(32),
    total_amount DECIMAL(15,2),
    settled_amount DECIMAL(15,2),
    paid_at TIMESTAMP,
    remark VARCHAR(500),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_shipment_reconciliation (
    id VARCHAR(64) PRIMARY KEY,
    reconciliation_no VARCHAR(64),
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    factory_id VARCHAR(64),
    factory_name VARCHAR(128),
    status VARCHAR(32),
    total_amount DECIMAL(15,2),
    settled_amount DECIMAL(15,2),
    paid_at TIMESTAMP,
    remark VARCHAR(500),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_wage_payment (
    id VARCHAR(64) PRIMARY KEY,
    payment_no VARCHAR(64),
    biz_type VARCHAR(32),
    biz_id VARCHAR(64),
    amount DECIMAL(15,2),
    status VARCHAR(32),
    payment_method VARCHAR(32),
    proof_url VARCHAR(255),
    payment_remark VARCHAR(500),
    account_id VARCHAR(64),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_payable (
    id VARCHAR(64) PRIMARY KEY,
    payable_no VARCHAR(64),
    biz_type VARCHAR(32),
    biz_id VARCHAR(64),
    amount DECIMAL(15,2),
    paid_amount DECIMAL(15,2),
    status VARCHAR(32),
    factory_id VARCHAR(64),
    factory_name VARCHAR(128),
    order_no VARCHAR(64),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_receivable (
    id VARCHAR(64) PRIMARY KEY,
    receivable_no VARCHAR(64),
    amount DECIMAL(15,2),
    received_amount DECIMAL(15,2),
    status VARCHAR(32),
    bill_aggregation_id VARCHAR(64),
    customer_id VARCHAR(64),
    customer_name VARCHAR(128),
    order_no VARCHAR(64),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_bill_aggregation (
    id VARCHAR(64) PRIMARY KEY,
    bill_no VARCHAR(64),
    source_type VARCHAR(32),
    source_id VARCHAR(64),
    total_amount DECIMAL(15,2),
    settled_amount DECIMAL(15,2),
    status VARCHAR(32),
    settled_at TIMESTAMP,
    settled_by_id VARCHAR(64),
    settled_by_name VARCHAR(64),
    remark VARCHAR(500),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_expense_reimbursement (
    id VARCHAR(64) PRIMARY KEY,
    reimbursement_no VARCHAR(64),
    applicant_id VARCHAR(64),
    applicant_name VARCHAR(64),
    amount DECIMAL(15,2),
    status VARCHAR(32),
    payment_time TIMESTAMP,
    payment_by VARCHAR(64),
    approval_remark VARCHAR(500),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_payment_account (
    id VARCHAR(64) PRIMARY KEY,
    account_name VARCHAR(128),
    account_no VARCHAR(64),
    bank_name VARCHAR(128),
    balance DECIMAL(15,2),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_factory_shipment (
    id VARCHAR(64) PRIMARY KEY,
    shipment_no VARCHAR(64),
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    style_no VARCHAR(64),
    style_name VARCHAR(128),
    factory_id VARCHAR(64),
    factory_name VARCHAR(128),
    ship_quantity INT,
    ship_time TIMESTAMP,
    shipped_by VARCHAR(64),
    shipped_by_name VARCHAR(64),
    tracking_no VARCHAR(64),
    express_company VARCHAR(64),
    ship_method VARCHAR(32),
    receive_status VARCHAR(32),
    receive_time TIMESTAMP,
    received_by VARCHAR(64),
    received_by_name VARCHAR(64),
    received_quantity INT,
    remark VARCHAR(500),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_pattern_production (
    id VARCHAR(64) PRIMARY KEY,
    style_id VARCHAR(64),
    style_no VARCHAR(64),
    color VARCHAR(64),
    status VARCHAR(32),
    progress_nodes VARCHAR(4000),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_product_sku (
    id VARCHAR(64) PRIMARY KEY,
    style_id VARCHAR(64),
    style_no VARCHAR(64),
    color VARCHAR(64),
    size VARCHAR(64),
    skc VARCHAR(64),
    stock_quantity INT DEFAULT 0,
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_style_bom (
    id VARCHAR(64) PRIMARY KEY,
    style_id VARCHAR(64),
    style_no VARCHAR(64),
    material_name VARCHAR(128),
    material_code VARCHAR(64),
    material_type VARCHAR(64),
    specifications VARCHAR(255),
    unit VARCHAR(32),
    unit_usage DECIMAL(15,4),
    unit_price DECIMAL(15,2),
    total_price DECIMAL(15,2),
    supplier_name VARCHAR(128),
    remark VARCHAR(500),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_style_quotation (
    id VARCHAR(64) PRIMARY KEY,
    style_id VARCHAR(64),
    style_no VARCHAR(64),
    material_cost DECIMAL(15,2),
    process_cost DECIMAL(15,2),
    other_cost DECIMAL(15,2),
    total_cost DECIMAL(15,2),
    factory_unit_price DECIMAL(15,2),
    currency VARCHAR(16),
    version INT,
    is_locked INT DEFAULT 0,
    standard_other_cost DECIMAL(15,2),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_template_library (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128),
    type VARCHAR(32),
    category VARCHAR(64),
    content VARCHAR(4000),
    status VARCHAR(32),
    locked INT DEFAULT 0,
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_production_process_tracking (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    cutting_bundle_id VARCHAR(64),
    process_code VARCHAR(64),
    process_name VARCHAR(128),
    progress_stage VARCHAR(100),
    status VARCHAR(32),
    scan_count INT DEFAULT 0,
    total_count INT DEFAULT 0,
    process_unit_price DECIMAL(15,2),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_ai_job_run_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT,
    job_name VARCHAR(128),
    method_name VARCHAR(128),
    start_time TIMESTAMP,
    duration_ms BIGINT,
    status VARCHAR(32),
    tenant_count INT,
    result_summary VARCHAR(4000),
    error_message VARCHAR(4000),
    created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS t_dict (
    id VARCHAR(64) PRIMARY KEY,
    dict_type VARCHAR(64),
    dict_label VARCHAR(128),
    dict_value VARCHAR(255),
    sort_order INT,
    remark VARCHAR(500),
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_permission (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128),
    code VARCHAR(64),
    type VARCHAR(32),
    parent_id VARCHAR(64),
    sort_order INT,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_role_permission (
    id VARCHAR(64) PRIMARY KEY,
    role_id VARCHAR(64),
    permission_id VARCHAR(64),
    create_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_login_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64),
    username VARCHAR(64),
    login_time TIMESTAMP,
    ip VARCHAR(64),
    user_agent VARCHAR(255),
    status VARCHAR(32),
    message VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS t_operation_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64),
    username VARCHAR(64),
    operation VARCHAR(128),
    method VARCHAR(255),
    params VARCHAR(4000),
    time BIGINT,
    ip VARCHAR(64),
    create_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_change_approval (
    id VARCHAR(64) PRIMARY KEY,
    target_type VARCHAR(32),
    target_id VARCHAR(64),
    change_type VARCHAR(32),
    before_value VARCHAR(4000),
    after_value VARCHAR(4000),
    reason VARCHAR(500),
    status VARCHAR(32),
    approver_id VARCHAR(64),
    approver_name VARCHAR(64),
    approved_at TIMESTAMP,
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_sample_stock (
    id VARCHAR(64) PRIMARY KEY,
    style_id VARCHAR(64),
    style_no VARCHAR(64),
    color VARCHAR(64),
    size VARCHAR(64),
    quantity INT DEFAULT 0,
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_sample_loan (
    id VARCHAR(64) PRIMARY KEY,
    sample_stock_id VARCHAR(64),
    borrower_id VARCHAR(64),
    borrower_name VARCHAR(64),
    quantity INT,
    loan_time TIMESTAMP,
    return_time TIMESTAMP,
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_product_outstock (
    id VARCHAR(64) PRIMARY KEY,
    order_no VARCHAR(64),
    style_no VARCHAR(64),
    color VARCHAR(64),
    size VARCHAR(64),
    quantity INT,
    outstock_type VARCHAR(32),
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_material_inbound (
    id VARCHAR(64) PRIMARY KEY,
    inbound_no VARCHAR(64),
    purchase_id VARCHAR(64),
    material_name VARCHAR(128),
    quantity DECIMAL(18,2),
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_material_picking (
    id VARCHAR(64) PRIMARY KEY,
    picking_no VARCHAR(64),
    purchase_id VARCHAR(64),
    order_id VARCHAR(64),
    quantity DECIMAL(18,2),
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_material_database (
    id VARCHAR(64) PRIMARY KEY,
    material_code VARCHAR(64),
    material_name VARCHAR(128),
    material_type VARCHAR(64),
    specifications VARCHAR(255),
    unit VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_warehouse_location (
    id VARCHAR(64) PRIMARY KEY,
    location_code VARCHAR(64),
    location_name VARCHAR(128),
    warehouse_type VARCHAR(32),
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_inventory_check (
    id VARCHAR(64) PRIMARY KEY,
    check_no VARCHAR(64),
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_customer (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128),
    contact_person VARCHAR(64),
    contact_phone VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL,
    delete_flag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS t_finished_settlement_approval_status (
    id VARCHAR(64) PRIMARY KEY,
    settlement_id VARCHAR(64),
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_product_stock (
    id VARCHAR(64) PRIMARY KEY,
    style_no VARCHAR(64),
    color VARCHAR(64),
    size VARCHAR(64),
    quantity INT DEFAULT 0,
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_process_parent_mapping (
    id VARCHAR(64) PRIMARY KEY,
    process_keyword VARCHAR(128),
    parent_node VARCHAR(64),
    tenant_id BIGINT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_deduction_item (
    id VARCHAR(64) PRIMARY KEY,
    reconciliation_id VARCHAR(64),
    amount DECIMAL(15,2),
    reason VARCHAR(500),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_invoice (
    id VARCHAR(64) PRIMARY KEY,
    invoice_no VARCHAR(64),
    amount DECIMAL(15,2),
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_style_attachment (
    id VARCHAR(64) PRIMARY KEY,
    style_id VARCHAR(64),
    file_name VARCHAR(255),
    file_url VARCHAR(255),
    file_type VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_style_size (
    id VARCHAR(64) PRIMARY KEY,
    style_id VARCHAR(64),
    size_name VARCHAR(32),
    quantity INT,
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_style_process (
    id VARCHAR(64) PRIMARY KEY,
    style_id VARCHAR(64),
    process_name VARCHAR(128),
    difficulty VARCHAR(10),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

-- 核心业务表（多租户隔离验证需要，P0 铁律 4）
CREATE TABLE IF NOT EXISTS t_bundle (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    style_no VARCHAR(64),
    color VARCHAR(64),
    size VARCHAR(64),
    quantity INT,
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_quality_inspection (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64),
    order_no VARCHAR(64),
    style_no VARCHAR(64),
    color VARCHAR(64),
    size VARCHAR(64),
    quantity INT,
    qualified_quantity INT,
    unqualified_quantity INT,
    status VARCHAR(32),
    inspector_id VARCHAR(64),
    inspector_name VARCHAR(64),
    inspection_type VARCHAR(32),
    remark VARCHAR(500),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_factory_info (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128),
    factory_type VARCHAR(32),
    contact_person VARCHAR(64),
    contact_phone VARCHAR(32),
    address VARCHAR(255),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS t_process_definition (
    id VARCHAR(64) PRIMARY KEY,
    process_code VARCHAR(64),
    process_name VARCHAR(128),
    parent_node VARCHAR(64),
    sort_order INT,
    status VARCHAR(32),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);
