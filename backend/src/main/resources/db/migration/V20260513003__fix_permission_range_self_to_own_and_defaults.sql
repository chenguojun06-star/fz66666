UPDATE t_user SET permission_range = 'own' WHERE permission_range = 'self';

UPDATE t_organization_unit SET owner_type = 'INTERNAL' WHERE node_name = '本厂' AND owner_type = 'EXTERNAL';

UPDATE t_user SET employment_status = 'normal' WHERE employment_status IS NULL OR employment_status = '';
UPDATE t_user SET gender = 'unknown' WHERE gender IS NULL OR gender = '';
UPDATE t_user SET hire_date = DATE(create_time) WHERE hire_date IS NULL AND create_time IS NOT NULL;

UPDATE t_user SET permission_range = 'own' WHERE permission_range IS NULL OR permission_range = '';
